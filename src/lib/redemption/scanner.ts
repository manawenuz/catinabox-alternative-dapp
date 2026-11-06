import type { Address } from 'viem';
import { ADDRESSES, MAINNET_RPC_URL, cdpAddress, DEPLOYMENT_BLOCKS, type CdpVersion } from '#lib/chain/config.js';
import { erc20Abi } from '#lib/chain/abis.js';
import { publicClient } from '#lib/chain/clients.js';
import { readPosition, readSystemState } from '#lib/chain/reads.js';
import { projectCdpSettlement } from '#lib/protocol/settlement.js';
import { readScan, saveScanProgress } from './cache.js';
import type { Candidate, ScanProgress, ScanWorkerMessage } from './types.js';

type ProgressCallback = (progress: ScanProgress) => void;

export type CandidateDiscovery = {
	candidates: Candidate[];
	addressesChecked: number;
	failedReads: number;
};

export type RedemptionScanner = {
	start(versions: CdpVersion[], onProgress: ProgressCallback): Promise<CandidateDiscovery>;
	pause(): void;
	resume(): void;
	cancel(): void;
	get status(): 'idle' | 'running' | 'paused' | 'cancelled';
};

export function createRedemptionScanner(): RedemptionScanner {
	let activeWorker: Worker | undefined;
	let stopped = false;
	let currentStatus: 'idle' | 'running' | 'paused' | 'cancelled' = 'idle';

	async function runVersion(version: CdpVersion, throughBlock: bigint, onProgress: ProgressCallback): Promise<void> {
		const cached = await readScan(version);
		if (stopped) return;
		let fromBlock = BigInt(cached.nextBlock);
		if (fromBlock < DEPLOYMENT_BLOCKS[version] || fromBlock > throughBlock + 1n) fromBlock = DEPLOYMENT_BLOCKS[version];
		await new Promise<void>((resolve, reject) => {
			if (stopped) { resolve(); return; }
			const worker = new Worker(new URL('./scan.worker.ts', import.meta.url), { type: 'module' });
			activeWorker = worker;
			let saving = Promise.resolve();
			let finished = false;
			const finish = (error?: Error) => {
				if (finished) return;
				finished = true;
				worker.terminate();
				if (activeWorker === worker) activeWorker = undefined;
				if (error) reject(error); else resolve();
			};
			worker.onmessage = (event: MessageEvent<ScanWorkerMessage>) => {
				if (finished) return;
				const message = event.data;
				if (message.type === 'error') {
					currentStatus = 'idle';
					onProgress({ version, fromBlock, throughBlock, nextBlock: fromBlock, logsProcessed: 0, candidateCount: cached.addresses.length, status: 'error', message: message.message });
					finish(new Error(message.message));
					return;
				}
				saving = saving.then(async () => {
					if (finished) return;
					const record = await saveScanProgress(version, message.addresses, BigInt(message.nextBlock), BigInt(message.throughBlock));
					currentStatus = message.status === 'paused' ? 'paused' : message.status === 'cancelled' ? 'cancelled' : 'running';
					onProgress({
						version, fromBlock: BigInt(message.fromBlock), throughBlock: BigInt(message.throughBlock),
						nextBlock: BigInt(message.nextBlock), logsProcessed: message.logsProcessed,
						candidateCount: record.addresses.length, status: message.status, message: message.message
					});
					if (message.status === 'complete' || message.status === 'cancelled') finish();
				}).catch((error: unknown) => finish(error instanceof Error ? error : new Error('Unable to persist the scan checkpoint.')));
			};
			worker.onerror = (event) => finish(new Error(event.message || 'The scan worker stopped unexpectedly.'));
			worker.postMessage({
				type: 'start', version, address: cdpAddress(version), rpcUrl: MAINNET_RPC_URL,
				fromBlock: fromBlock.toString(), throughBlock: throughBlock.toString(), initialChunk: 2_000
			});
			if (stopped) worker.postMessage({ type: 'cancel' });
		});
	}

	async function loadActiveCandidates(versions: CdpVersion[], snapshotBlock: bigint): Promise<CandidateDiscovery> {
		const candidates: Candidate[] = [];
		let addressesChecked = 0;
		let failedReads = 0;
		for (const version of versions) {
			if (stopped) break;
			const record = await readScan(version);
			const addresses = record.addresses as Address[];
			if (!addresses.length) continue;
			const [system, contractCollateral] = await Promise.all([
				readSystemState(version, snapshotBlock),
				publicClient.readContract({ address: ADDRESSES.stEth, abi: erc20Abi, functionName: 'balanceOf', args: [cdpAddress(version)], blockNumber: snapshotBlock })
			]);
			for (let i = 0; i < addresses.length; i += 20) {
				if (stopped) break;
				const batch = addresses.slice(i, i + 20);
				const results = await Promise.all(batch.map(async (address) => {
					if (stopped) return { address, candidate: undefined, failed: false };
					try {
						const position = await readPosition(version, address, snapshotBlock);
						const projection = projectCdpSettlement(version, position, system, contractCollateral);
						const settled = projection.positionAfterFetch;
						if (settled.debt <= 0n || settled.deposited <= 0n || settled.debt / 4n <= 0n) {
							return { address, candidate: undefined, failed: false };
						}
					const tenth = 10n ** 17n;
					const feePerToken = tenth - (tenth * settled.debt) / settled.deposited;
					return {
						address,
						candidate: { version, address, deposited: settled.deposited, debt: settled.debt, maxRedeem: settled.debt / 4n, feePerToken, snapshotBlock } satisfies Candidate,
						failed: false
					};
					} catch {
						return { address, candidate: undefined, failed: true };
					}
				}));
			if (stopped) break;
			addressesChecked += batch.length;
			failedReads += results.filter((result) => result.failed).length;
			candidates.push(...results.flatMap((result) => result.candidate ? [result.candidate] : []));
			}
		}
		return { candidates, addressesChecked, failedReads };
	}

	return {
		async start(versions, onProgress) {
			if (!versions.length) throw new Error('Select at least one CDP version to scan.');
			if (activeWorker) throw new Error('A redemption history scan is already running.');
			stopped = false; currentStatus = 'running';
			const throughBlock = await publicClient.getBlockNumber();
			for (const version of versions) {
				if (stopped) break;
				await runVersion(version, throughBlock, onProgress);
			}
			if (stopped) return { candidates: [], addressesChecked: 0, failedReads: 0 };
			const snapshotBlock = await publicClient.getBlockNumber();
			const result = await loadActiveCandidates(versions, snapshotBlock);
			currentStatus = stopped ? 'cancelled' : 'idle';
			return result;
		},
		pause() { if (activeWorker) { currentStatus = 'paused'; activeWorker.postMessage({ type: 'pause' }); } },
		resume() { if (activeWorker) { currentStatus = 'running'; activeWorker.postMessage({ type: 'resume' }); } },
		cancel() { stopped = true; currentStatus = 'cancelled'; activeWorker?.postMessage({ type: 'cancel' }); },
		get status() { return currentStatus; }
	};
}
