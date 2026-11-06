/// <reference lib="webworker" />
import type { Address } from 'viem';
import type { ScanWorkerMessage, ScanWorkerRequest } from './types.js';
import {
	MAX_SCAN_DURATION_PER_RESUME_MS,
	MAX_SCAN_REQUESTS_PER_RESUME,
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
const scope = self as DedicatedWorkerGlobalScope;
let paused = false;
let cancelled = false;
let resumeWaiter: (() => void) | undefined;
let activeFetchController: AbortController | undefined;

function emit(message: ScanWorkerMessage): void { scope.postMessage(message); }

async function waitWhilePaused(): Promise<boolean> {
	if (!paused || cancelled) return false;
	await new Promise<void>((resolve) => { resumeWaiter = resolve; });
	return !cancelled;
}

function notifyPause(version: 'v1' | 'v1.1', from: bigint, through: bigint, next: bigint, logsProcessed: number, message = 'Scan paused; the latest completed block range is saved in this browser.'): void {
	emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'paused', message });
}

async function getLogs(rpcUrl: string, address: Address, fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]> {
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
		if (!response.ok) throw new Error(`RPC returned HTTP ${response.status}.`);
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

async function run(start: Extract<ScanWorkerRequest, { type: 'start' }>): Promise<void> {
	const version = start.version;
	const from = BigInt(start.fromBlock);
	const through = BigInt(start.throughBlock);
	let next = from;
	let range = Math.max(1, start.initialChunk ?? 2_000);
	let logsProcessed = 0;
	let requestsThisResume = 0;
	let resumeStartedAt = performance.now();
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
			notifyPause(version, from, through, next, logsProcessed, `Scan paused after ${MAX_SCAN_REQUESTS_PER_RESUME} RPC ranges or ${minutes} minutes to protect this browser. Resume to continue.`);
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
		let logs: RpcLog[];
		try {
			requestsThisResume += 1;
			logs = await getLogs(start.rpcUrl, start.address, next, end);
		} catch (error) {
			if (cancelled) {
				emit({ type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(), logsProcessed, addresses: [], status: 'cancelled', message: 'Scan stopped. Resume later from the saved checkpoint.' });
				return;
			}
			if (range > 1) {
				range = Math.max(1, Math.floor(range / 2));
				continue;
			}
			throw new Error(`Could not scan block ${next.toString()}: ${error instanceof Error ? error.message : 'RPC request failed.'}`);
		}
		const found = new Set<Address>();
		for (const log of logs) {
			const topic = log.topics?.[1];
			if (topic && /^0x[0-9a-fA-F]{64}$/.test(topic)) found.add(`0x${topic.slice(-40)}` as Address);
		}
		logsProcessed += logs.length;
		next = end + 1n;
		if (logs.length >= 8_000) range = Math.max(1, Math.floor(range / 2));
		else if (logs.length < 300) range = Math.min(10_000, range * 2);
		const status = cancelled ? 'cancelled' : next > through ? 'complete' : paused ? 'paused' : 'running';
		emit({
			type: 'progress', version, fromBlock: from.toString(), throughBlock: through.toString(), nextBlock: next.toString(),
			logsProcessed, addresses: [...found], status,
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
	paused = false; cancelled = false;
	void run(request).catch((error: unknown) => {
		emit({ type: 'error', version: request.version, message: error instanceof Error ? error.message : 'The browser scan failed.' });
	});
});

export {};
