/// <reference lib="webworker" />
import type { Address } from 'viem';
import type { ScanWorkerMessage, ScanWorkerRequest } from './types.js';
import {
	MAX_SCAN_DURATION_PER_RESUME_MS,
	MAX_SCAN_REQUESTS_PER_RESUME,
	MAX_CACHED_ADDRESSES,
	readRpcResponseJson,
	scanBudgetExceeded
} from './scan-bounds.mjs';

const EVENT_TOPICS = [
	'0x6da1339ceea6e3dbf7ead04517d05e02f98ab75cd4698142e7eeaa32ea1714b7', // _deposit(address,uint256)
	'0x88e5ac70e9098f9301eb01ed012de050d71fbb15a4ca8849ea39b6cd9967fb15', // _withdrawal(address,uint256)
	'0x4e6ec2477b215d44bbbdd0f5815b8827188f1eb827c01cc00f7f983582322afa', // _mint(address,uint256)
	'0x75708102661b224f589553859758a9aa2f23c5b535123e24c1fb71b3a2514150', // _repay(address,uint256)
	'0x123474edf59004399ee06e11583a4daa254b4d4390ff2cc58b7a35d2598fbbee', // _liquidate(address,uint256)
	'0x807ef32df55d28183834e02e7e2eab62bffb9ef8ba0c2527bde03d9738230e2f', // _flagset(address,bool)
	'0x5751b5f3cc794b20ca3696dc55780ee5d1d424a659bc109e97fa87402562a8e7' // _stabilisePeg(address,uint256,uint256)
] as const;

type RpcLog = { topics?: string[] };
type RpcResponse = { result?: RpcLog[]; error?: { message?: string; code?: number } };
type EtherscanResponse = { status?: string; message?: string; result?: RpcLog[] | string };
type ScanRangeResult = { addresses: Address[]; logsProcessed: number };
const TRACKED_EVENT_TOPICS = new Set<string>(EVENT_TOPICS.map((topic) => topic.toLowerCase()));
const scope = self as DedicatedWorkerGlobalScope;
let paused = false;
let cancelled = false;
let resumeWaiter: (() => void) | undefined;
let activeFetchController: AbortController | undefined;
let lastEtherscanRequestAt: number | undefined;

class RpcHttpError extends Error {
	constructor(readonly status: number, message: string) {
		super(message);
		this.name = 'RpcHttpError';
	}
}

class ScanRangeAddressLimitError extends Error {
	constructor() {
		super(`One block range returned more than ${MAX_CACHED_ADDRESSES.toLocaleString()} unique depositor addresses.`);
		this.name = 'ScanRangeAddressLimitError';
	}
}

function emit(message: ScanWorkerMessage): void { scope.postMessage(message); }

function addDepositors(logs: RpcLog[], addresses: Set<Address>): void {
	for (const log of logs) {
		const signature = log.topics?.[0]?.toLowerCase();
		if (!signature || !TRACKED_EVENT_TOPICS.has(signature)) continue;
		const topic = log.topics?.[1];
		if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) continue;
		const address = `0x${topic.slice(-40).toLowerCase()}` as Address;
		if (addresses.has(address)) continue;
		if (addresses.size >= MAX_CACHED_ADDRESSES) throw new ScanRangeAddressLimitError();
		addresses.add(address);
	}
}

function scanRpcLogs(logs: RpcLog[]): ScanRangeResult {
	const addresses = new Set<Address>();
	addDepositors(logs, addresses);
	return { addresses: [...addresses], logsProcessed: logs.length };
}

async function waitWhilePaused(): Promise<boolean> {
	if (!paused || cancelled) return false;
	await new Promise<void>((resolve) => { resumeWaiter = resolve; });
	return !cancelled;
}

function notifyPause(version: 'v1' | 'v1.1', from: bigint, through: bigint, next: bigint, logsProcessed: number, message = 'Scan paused; the latest completed block range is saved in this browser.'): void {
	emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'paused', message });
}

async function getRpcLogs(rpcUrl: string, address: Address, fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]> {
	const controller = new AbortController();
	activeFetchController = controller;
	const timeout = setTimeout(() => controller.abort(), 25_000);
	try {
		const response = await fetch(rpcUrl, {
			method: 'POST', signal: controller.signal,
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
				params: [{ address, fromBlock: `0x${fromBlock.toString(16)}`, toBlock: `0x${toBlock.toString(16)}`, topics: [EVENT_TOPICS] }]
			})
		});
		if (!response.ok) {
			let detail = '';
			try {
				const body = await readRpcResponseJson(response, controller.signal) as RpcResponse;
				if (typeof body.error?.message === 'string') detail = `: ${body.error.message}`;
			} catch {
				// Keep the HTTP status when an intermediary returns a non-JSON error page.
			}
			throw new RpcHttpError(response.status, `RPC returned HTTP ${response.status}${detail || '.'}`);
		}
		const body = await readRpcResponseJson(response, controller.signal) as RpcResponse;
		if (body.error) throw new Error(body.error.message || `RPC error ${body.error.code ?? 'unknown'}.`);
		if (!Array.isArray(body.result)) throw new Error('RPC returned an invalid eth_getLogs response.');
		return body.result;
	} catch (error) {
		controller.abort();
		throw error;
	} finally {
		clearTimeout(timeout);
		if (activeFetchController === controller) activeFetchController = undefined;
	}
}

function etherscanMessage(body: EtherscanResponse): string {
	return [body.message, typeof body.result === 'string' ? body.result : undefined]
		.filter((message): message is string => Boolean(message?.trim()))
		.map((message) => message.trim())
		.filter((message, index, messages) => messages.indexOf(message) === index)
		.join(': ');
}

async function waitForEtherscanSlot(prepareRequest: () => Promise<void>): Promise<void> {
	const remaining = lastEtherscanRequestAt === undefined ? 0 : Math.ceil(400 - (performance.now() - lastEtherscanRequestAt));
	if (remaining > 0) await new Promise<void>((resolve) => setTimeout(resolve, remaining));
	if (cancelled) throw new Error('Scan cancelled.');
	await prepareRequest();
	if (cancelled) throw new Error('Scan cancelled.');
	lastEtherscanRequestAt = performance.now();
}

async function getEtherscanLogs(
	apiKey: string,
	address: Address,
	fromBlock: bigint,
	toBlock: bigint,
	prepareRequest: () => Promise<void>
): Promise<ScanRangeResult> {
	const addresses = new Set<Address>();
	let logsProcessed = 0;
	for (let page = 1; ; page += 1) {
		await waitForEtherscanSlot(prepareRequest);
		const controller = new AbortController();
		activeFetchController = controller;
		const timeout = setTimeout(() => controller.abort(), 25_000);
		try {
			const query = new URLSearchParams({
				chainid: '1', module: 'logs', action: 'getLogs',
				fromBlock: fromBlock.toString(), toBlock: toBlock.toString(),
				address, page: page.toString(), offset: '1000', apikey: apiKey
			});
			const response = await fetch(`https://api.etherscan.io/v2/api?${query.toString()}`, { signal: controller.signal });
			if (!response.ok) {
				let detail = '';
				try {
					const body = await readRpcResponseJson(response, controller.signal, undefined, 'Etherscan') as EtherscanResponse;
					detail = etherscanMessage(body);
				} catch {
					// Keep the HTTP status when an intermediary returns a non-JSON error page.
				}
				throw new Error(`Etherscan returned HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
			}
			const body = await readRpcResponseJson(response, controller.signal, undefined, 'Etherscan') as EtherscanResponse;
			const message = etherscanMessage(body);
			if (body.status === '1' && Array.isArray(body.result)) {
				logsProcessed += body.result.length;
				addDepositors(body.result, addresses);
				if (body.result.length === 1_000) continue;
				return { addresses: [...addresses], logsProcessed };
			}
			if (body.status === '0' && /no records found/i.test(message)) return { addresses: [...addresses], logsProcessed };
			throw new Error(`Etherscan API error: ${message || 'Invalid logs response.'}`);
		} catch (error) {
			controller.abort();
			throw error;
		} finally {
			clearTimeout(timeout);
			if (activeFetchController === controller) activeFetchController = undefined;
		}
	}
}

async function run(start: Extract<ScanWorkerRequest, { type: 'start' }>): Promise<void> {
	const version = start.version;
	const from = BigInt(start.fromBlock);
	const through = BigInt(start.throughBlock);
	let next = from;
	let range = Math.max(1, start.initialChunk ?? 2_000);
	let logsProcessed = 0;
	let requestsThisResume = 0;
	let resumeStartedAt = performance.now();
	lastEtherscanRequestAt = undefined;
	if (next > through) {
		emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'complete' });
		return;
	}
	while (next <= through) {
		if (await waitWhilePaused()) {
			requestsThisResume = 0;
			resumeStartedAt = performance.now();
		}
		if (cancelled) {
			emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'cancelled', message: 'Scan stopped. Resume later from the saved checkpoint.' });
			return;
		}
		if (scanBudgetExceeded(requestsThisResume, resumeStartedAt)) {
			paused = true;
			const minutes = MAX_SCAN_DURATION_PER_RESUME_MS / 60_000;
			notifyPause(version, from, through, next, logsProcessed, `Scan paused after ${MAX_SCAN_REQUESTS_PER_RESUME} provider requests or ${minutes} minutes to protect this browser. Resume to continue.`);
			const resumed = await waitWhilePaused();
			if (cancelled) {
				emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'cancelled', message: 'Scan stopped. Resume later from the saved checkpoint.' });
				return;
			}
			if (resumed) {
				requestsThisResume = 0;
				resumeStartedAt = performance.now();
			}
			continue;
		}
		const end = next + BigInt(range - 1) > through ? through : next + BigInt(range - 1);
		let result: ScanRangeResult;
		try {
			if (start.etherscanApiKey) {
				result = await getEtherscanLogs(start.etherscanApiKey, start.address, next, end, async () => {
					if (paused) {
						notifyPause(version, from, through, next, logsProcessed);
						const resumed = await waitWhilePaused();
						if (cancelled) throw new Error('Scan cancelled.');
						if (resumed) { requestsThisResume = 0; resumeStartedAt = performance.now(); }
					}
					if (scanBudgetExceeded(requestsThisResume, resumeStartedAt)) {
						paused = true;
						const minutes = MAX_SCAN_DURATION_PER_RESUME_MS / 60_000;
						notifyPause(version, from, through, next, logsProcessed, `Scan paused after ${MAX_SCAN_REQUESTS_PER_RESUME} provider requests or ${minutes} minutes to protect this browser. Resume to continue.`);
						const resumed = await waitWhilePaused();
						if (cancelled) throw new Error('Scan cancelled.');
						if (resumed) { requestsThisResume = 0; resumeStartedAt = performance.now(); }
					}
					if (cancelled) throw new Error('Scan cancelled.');
					requestsThisResume += 1;
				});
			} else {
				requestsThisResume += 1;
				result = scanRpcLogs(await getRpcLogs(start.rpcUrl, start.address, next, end));
			}
		} catch (error) {
			if (cancelled) {
				emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'cancelled', message: 'Scan stopped. Resume later from the saved checkpoint.' });
				return;
			}
			const shouldReduceRange = range > 1 && (error instanceof ScanRangeAddressLimitError || (!start.etherscanApiKey && !(error instanceof RpcHttpError && (error.status === 401 || error.status === 403))));
			if (shouldReduceRange) {
				range = Math.max(1, Math.floor(range / 2));
				continue;
			}
			throw new Error(`Could not scan block ${next.toString()}: ${error instanceof Error ? error.message : 'RPC request failed.'}`);
		}
		logsProcessed += result.logsProcessed;
		next = end + 1n;
		if (result.logsProcessed >= 8_000) range = Math.max(1, Math.floor(range / 2));
		else if (result.logsProcessed < 300) range = Math.min(10_000, range * 2);
		const status = cancelled ? 'cancelled' : next > through ? 'complete' : paused ? 'paused' : 'running';
		emit({
			type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(),
			logsProcessed, addresses: result.addresses, status,
			message: status === 'paused' ? 'Scan paused; the latest completed block range is saved in this browser.' : undefined
		});
		if (cancelled) return;
	}
}

scope.addEventListener('message', (event: MessageEvent<ScanWorkerRequest>) => {
	const request = event.data;
	if (request.type === 'pause') { paused = true; return; }
	if (request.type === 'resume') { paused = false; resumeWaiter?.(); resumeWaiter = undefined; return; }
	if (request.type === 'cancel') { cancelled = true; paused = false; activeFetchController?.abort(); resumeWaiter?.(); resumeWaiter = undefined; return; }
	paused = false; cancelled = false; lastEtherscanRequestAt = undefined;
	void run(request).catch((error: unknown) => {
		emit({ type: 'error', version: request.version, message: error instanceof Error ? error.message : 'The browser scan failed.' });
	});
});

export {};
