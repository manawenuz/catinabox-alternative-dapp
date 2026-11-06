import type { Address, Hash } from 'viem';
import { BaseError, formatUnits } from 'viem';
import { ADDRESSES, cdpAddress, type CdpVersion } from '#lib/chain/config.js';
import { cdpAbi, erc20Abi } from '#lib/chain/abis.js';
import { publicClient, walletClient as createWalletClient } from '#lib/chain/clients.js';
import { readPosition, readSystemState, readTokenAllowance, readWalletBalances, type Position, type SystemState, type WalletBalances } from '#lib/chain/reads.js';
import { getInjectedProvider } from '#lib/wallet/wallet-store.svelte.js';
import { projectCdpSettlement, protocolFeeAmount } from './settlement.js';

export type CdpAction = 'deposit' | 'mint' | 'repay' | 'withdraw';

export type CdpSummary = {
	version: CdpVersion;
	position?: Position;
	positionAfterSync?: Position;
	system: SystemState;
	balances?: WalletBalances;
	protocolFeeEstimate: bigint;
	feeShareBps?: bigint;
	repayDebtAfterSync?: bigint;
	projectionError?: string;
};

export type SimulationResult = {
	status: 'ready' | 'rejected';
	gasEstimate?: bigint;
	revertReason?: string;
};

export type CdpExecutionResult = {
	approvalHash?: Hash;
	hash: Hash;
	allowanceAfter?: bigint;
};

export type CdpExecutionProgress = {
	phase: 'approval' | 'action' | 'pending';
	message: string;
	hash?: Hash;
};

const actionFunction = {
	deposit: 'deposit',
	mint: 'mint',
	repay: 'repay',
	withdraw: 'withdraw'
} as const;

function errorMessage(error: unknown): string {
	if (error instanceof BaseError) return error.shortMessage;
	return error instanceof Error ? error.message : 'The contract call was rejected.';
}

export async function readCdpSummary(version: CdpVersion, account?: Address): Promise<CdpSummary> {
	const address = cdpAddress(version);
	const blockNumber = await publicClient.getBlockNumber();
	const [system, position, balances, collateralBalance] = await Promise.all([
		readSystemState(version, blockNumber),
		account ? readPosition(version, account, blockNumber) : Promise.resolve(undefined),
		account ? readWalletBalances(version, account, blockNumber) : Promise.resolve(undefined),
		publicClient.readContract({ address: ADDRESSES.stEth, abi: erc20Abi, functionName: 'balanceOf', args: [address], blockNumber })
	]);
	const protocolFeeEstimate = protocolFeeAmount(version, collateralBalance > system.totalDeposits ? collateralBalance - system.totalDeposits : 0n, system.idleFee, system.totalDebt, system.totalDeposits);
	let feeShareBps: bigint | undefined;
	let positionAfterSync: Position | undefined;
	let repayDebtAfterSync: bigint | undefined;
	let projectionError: string | undefined;
	try {
		const representative = position ?? {
			account: '0x0000000000000000000000000000000000000000' as Address,
			deposited: 0n, debt: 0n, owing: 0n, enableRepaying: false, lastPoints: system.totalPoints
		};
		const projection = projectCdpSettlement(version, representative, system, collateralBalance);
		feeShareBps = projection.feeShareBps;
		if (position) {
			positionAfterSync = projection.positionAfterFetch;
			repayDebtAfterSync = projection.positionAfterFetch.debt;
		}
	} catch (error) {
		projectionError = error instanceof Error ? error.message : 'Unable to project CDP yield settlement.';
	}
	return { version, position, positionAfterSync, system, balances, protocolFeeEstimate, feeShareBps, repayDebtAfterSync, projectionError };
}

export function maximumMint(position: Position, ltv: bigint): bigint {
	const cap = (position.deposited * ltv) / 10_000n;
	return cap > position.debt ? cap - position.debt : 0n;
}

export function maximumWithdraw(position: Position, ltv: bigint): bigint {
	if (ltv === 0n) return 0n;
	const requiredCollateral = (position.debt * 10_000n) / ltv;
	return position.deposited > requiredCollateral ? position.deposited - requiredCollateral : 0n;
}

export function mintingFeeFor(version: CdpVersion, amount: bigint, mintingFeeBps: bigint): bigint {
	return version === 'v1.1' ? ((amount * mintingFeeBps) / 10_000n) * 2n : 0n;
}

export async function simulateCdpAction(
	version: CdpVersion,
	action: CdpAction,
	amount: bigint,
	account: Address
): Promise<SimulationResult> {
	const address = cdpAddress(version);
	const functionName = actionFunction[action];
	try {
		await publicClient.simulateContract({
			address,
			abi: cdpAbi,
			functionName,
			args: [amount],
			account
		});
		const gasEstimate = await publicClient.estimateContractGas({
			address,
			abi: cdpAbi,
			functionName,
			args: [amount],
			account
		});
		return { status: 'ready', gasEstimate };
	} catch (error) {
		return { status: 'rejected', revertReason: errorMessage(error) };
	}
}

async function approveExactly(
	token: Address,
	spender: Address,
	amount: bigint,
	account: Address,
	onProgress?: (progress: CdpExecutionProgress) => void
): Promise<Hash> {
	const provider = getInjectedProvider();
	const wallet = createWalletClient(provider, account);
	onProgress?.({ phase: 'approval', message: 'Approve the exact token allowance shown in the review in your wallet.' });
	const { request } = await publicClient.simulateContract({
		address: token,
		abi: erc20Abi,
		functionName: 'approve',
		args: [spender, amount],
		account
	});
	const hash = await wallet.writeContract(request);
	onProgress?.({ phase: 'pending', message: 'Token approval sent. Waiting for confirmation before the CDP call.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The token approval transaction reverted.');
	onProgress?.({ phase: 'action', message: 'Approval confirmed. The CDP call will be simulated before its wallet prompt.' });
	return hash;
}

export async function executeCdpAction(
	version: CdpVersion,
	action: CdpAction,
	amount: bigint,
	account: Address,
	onProgress?: (progress: CdpExecutionProgress) => void
): Promise<CdpExecutionResult> {
	const cdp = cdpAddress(version);
	if (action === 'repay') await assertCurrentRepayAmount(version, account, amount);
	const token = action === 'deposit' ? ADDRESSES.stEth : action === 'repay' ? ADDRESSES.boxEth : undefined;
	let approvalHash: Hash | undefined;
	if (token) {
		const allowance = await readTokenAllowance(token, account, cdp);
		if (allowance < amount) approvalHash = await approveExactly(token, cdp, amount, account, onProgress);
	}
	if (action === 'repay') await assertCurrentRepayAmount(version, account, amount);

	const simulation = await simulateCdpAction(version, action, amount, account);
	if (simulation.status !== 'ready') throw new Error(simulation.revertReason || 'The action did not pass simulation.');
	const provider = getInjectedProvider();
	const wallet = createWalletClient(provider, account);
	onProgress?.({ phase: 'action', message: 'Confirm the selected CDP operation in your wallet.' });
	const { request } = await publicClient.simulateContract({
		address: cdp,
		abi: cdpAbi,
		functionName: actionFunction[action],
		args: [amount],
		account
	});
	const hash = await wallet.writeContract(request);
	onProgress?.({ phase: 'pending', message: 'CDP transaction sent. Waiting for confirmation.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The CDP transaction reverted.');
	const allowanceAfter = token ? await readTokenAllowance(token, account, cdp) : undefined;
	return { approvalHash, hash, allowanceAfter };
}

async function assertCurrentRepayAmount(version: CdpVersion, account: Address, amount: bigint): Promise<void> {
	const fresh = await readCdpSummary(version, account);
	const maxRepay = fresh.repayDebtAfterSync;
	if (maxRepay === undefined) throw new Error('Current yield accounting makes the repayment cap unclear. Refresh the page and review the amount again.');
	if (amount > maxRepay) {
		throw new Error(`Yield settlement changed the current repayable debt. The current cap is ${formatUnits(maxRepay, 18)} boxETH; reduce the amount and review again.`);
	}
}

export async function revokeCdpAllowance(version: CdpVersion, action: CdpAction, account: Address): Promise<Hash> {
	const token = action === 'deposit' ? ADDRESSES.stEth : action === 'repay' ? ADDRESSES.boxEth : undefined;
	if (!token) throw new Error('This action does not use a token allowance.');
	const cdp = cdpAddress(version);
	const provider = getInjectedProvider();
	const wallet = createWalletClient(provider, account);
	const { request } = await publicClient.simulateContract({
		address: token,
		abi: erc20Abi,
		functionName: 'approve',
		args: [cdp, 0n],
		account
	});
	const hash = await wallet.writeContract(request);
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The allowance revoke transaction reverted.');
	return hash;
}
