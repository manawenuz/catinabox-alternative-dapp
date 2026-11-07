import type { Address } from 'viem';
import type { CdpVersion } from '#lib/chain/config.js';

export type ScanStatus = 'running' | 'paused' | 'cancelled' | 'complete' | 'error';
export type ScanPauseReason = 'user' | 'provider-request-limit' | 'time-limit' | 'provider-request-and-time-limit';

export type ScanProgress = {
	version: CdpVersion;
	fromBlock: bigint;
	throughBlock: bigint;
	nextBlock: bigint;
	logsProcessed: number;
	candidateCount: number;
	status: ScanStatus;
	message?: string;
	pauseReason?: ScanPauseReason;
};

export type Candidate = {
	version: CdpVersion;
	address: Address;
	deposited: bigint;
	debt: bigint;
	maxRedeem: bigint;
	feePerToken: bigint;
	snapshotBlock: bigint;
};

export type RedemptionEstimate = {
	candidate: Candidate;
	redeemAmount: bigint;
	frictionFee: bigint;
	totalBoxEth: bigint;
	stEthOut: bigint;
	marketCostStEth?: bigint;
	gasCostStEth?: bigint;
	netEstimateStEth?: bigint;
	quoteBlock?: bigint;
	route?: Address[];
	priceImpactBps?: bigint;
	quoteGas?: bigint;
	transactionGas?: bigint;
	walletBoxEthBalance?: bigint;
	boxEthAllowance?: bigint;
	psmRecipient?: Address;
	profitability: 'estimated' | 'unavailable';
	profitabilityNote?: string;
};

export type CachedScan = {
	key: string;
	chainId: number;
	contract: Address;
	version: CdpVersion;
	addresses: string[];
	nextBlock: string;
	throughBlock: string;
	updatedAt: number;
};

export type ScanWorkerRequest =
	| { type: 'start'; version: CdpVersion; address: Address; rpcUrl: string; etherscanApiKey?: string; fromBlock: string; throughBlock: string; initialChunk?: number }
	| { type: 'pause' }
	| { type: 'resume' }
	| { type: 'cancel' };

export type ScanWorkerMessage =
	| { type: 'progress'; version: CdpVersion; fromBlock: string; throughBlock: string; nextBlock: string; logsProcessed: number; addresses: Address[]; status: 'running' | 'paused' | 'cancelled' | 'complete'; message?: string; pauseReason?: ScanPauseReason }
	| { type: 'error'; version: CdpVersion; message: string };
