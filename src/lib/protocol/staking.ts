import type { Address, Hash } from 'viem';
import { BaseError } from 'viem';
import { ADDRESSES } from '#lib/chain/config.js';
import { erc20Abi, feeStakingAbi } from '#lib/chain/abis.js';
import { publicClient, walletClient as createWalletClient } from '#lib/chain/clients.js';
import { getInjectedProvider } from '#lib/wallet/wallet-store.svelte.js';

export type StakingState = {
	stakedBoxFee: bigint;
	pendingBoxEth: bigint;
	totalStaked: bigint;
	unclaimedBoxEth: bigint;
	boxFeeBalance: bigint;
	boxFeeAllowance: bigint;
	boxFeeDecimals: number;
	boxEthDecimals: number;
	blockNumber: bigint;
};

export type StakingAction = 'stake' | 'unstake' | 'claim';

export type StakingProgress = {
	phase: 'approval' | 'action' | 'pending';
	message: string;
	hash?: Hash;
};

export type StakingExecution = { approvalHash?: Hash; hash: Hash };

function errorMessage(error: unknown): string {
	if (error instanceof BaseError) return error.shortMessage;
	return error instanceof Error ? error.message : 'The staking transaction was rejected.';
}

export async function readStakingState(account: Address): Promise<StakingState> {
	const blockNumber = await publicClient.getBlockNumber();
	const [stakedBoxFee, pendingBoxEth, totalStaked, unclaimedBoxEth, boxFeeBalance, boxFeeAllowance, boxFeeDecimals, boxEthDecimals, collateral, rewardsToken] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'deposited', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'Owing', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'totaldeposits', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'unclaimed', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: erc20Abi, functionName: 'allowance', args: [account, ADDRESSES.feeStaking], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: erc20Abi, functionName: 'decimals', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'decimals', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'collateral', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'rewardsToken', blockNumber })
	]);
	if (collateral.toLowerCase() !== ADDRESSES.boxFee.toLowerCase()) throw new Error('The staking collateral does not match the configured boxFEE contract.');
	if (rewardsToken.toLowerCase() !== ADDRESSES.boxEth.toLowerCase()) throw new Error('The staking rewards token does not match the configured boxETH contract.');
	return { stakedBoxFee, pendingBoxEth, totalStaked, unclaimedBoxEth, boxFeeBalance, boxFeeAllowance, boxFeeDecimals: Number(boxFeeDecimals), boxEthDecimals: Number(boxEthDecimals), blockNumber };
}

async function approveExactly(amount: bigint, account: Address, onProgress?: (progress: StakingProgress) => void): Promise<Hash> {
	const wallet = createWalletClient(getInjectedProvider(), account);
	onProgress?.({ phase: 'approval', message: 'Confirm the exact boxFEE allowance in your wallet.' });
	const { request } = await publicClient.simulateContract({
		address: ADDRESSES.boxFee,
		abi: erc20Abi,
		functionName: 'approve',
		args: [ADDRESSES.feeStaking, amount],
		account
	});
	const hash = await wallet.writeContract(request);
	onProgress?.({ phase: 'pending', message: 'boxFEE approval sent. Waiting for confirmation.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The boxFEE approval transaction reverted.');
	onProgress?.({ phase: 'action', message: 'Approval confirmed. The stake action will be simulated before its wallet prompt.' });
	return hash;
}

export async function simulateStakingAction(action: StakingAction, amount: bigint | undefined, account: Address): Promise<bigint> {
	try {
		if (action === 'claim') {
			const call = { address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'poke' as const, args: [account] as const, account };
			await publicClient.simulateContract(call);
			return await publicClient.estimateContractGas(call);
		}
		if (amount === undefined || amount <= 0n) throw new Error('Enter a positive boxFEE amount.');
		if (action === 'stake') {
			const call = { address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'deposit' as const, args: [amount] as const, account };
			await publicClient.simulateContract(call);
			return await publicClient.estimateContractGas(call);
		}
		const call = { address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'withdraw' as const, args: [amount] as const, account };
		await publicClient.simulateContract(call);
		return await publicClient.estimateContractGas(call);
	} catch (error) { throw new Error(errorMessage(error)); }
}

export async function writeStakingAction(
	action: StakingAction,
	amount: bigint | undefined,
	account: Address,
	onProgress?: (progress: StakingProgress) => void
): Promise<StakingExecution> {
	let approvalHash: Hash | undefined;
	if (action === 'stake') {
		if (amount === undefined || amount <= 0n) throw new Error('Enter a positive boxFEE amount to stake.');
		const allowance = await publicClient.readContract({ address: ADDRESSES.boxFee, abi: erc20Abi, functionName: 'allowance', args: [account, ADDRESSES.feeStaking] });
		if (allowance < amount) approvalHash = await approveExactly(amount, account, onProgress);
	}

	try {
		const gas = await simulateStakingAction(action, amount, account);
		const wallet = createWalletClient(getInjectedProvider(), account);
		onProgress?.({ phase: 'action', message: `Confirm the ${action} transaction in your wallet.` });
		let hash: Hash;
		if (action === 'claim') {
			const { request } = await publicClient.simulateContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'poke', args: [account], account });
			hash = await wallet.writeContract({ ...request, gas });
		} else if (action === 'stake') {
			const { request } = await publicClient.simulateContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'deposit', args: [amount!], account });
			hash = await wallet.writeContract({ ...request, gas });
		} else {
			const { request } = await publicClient.simulateContract({ address: ADDRESSES.feeStaking, abi: feeStakingAbi, functionName: 'withdraw', args: [amount!], account });
			hash = await wallet.writeContract({ ...request, gas });
		}
		onProgress?.({ phase: 'pending', message: 'Staking transaction sent. Waiting for confirmation.', hash });
		const receipt = await publicClient.waitForTransactionReceipt({ hash });
		if (receipt.status !== 'success') throw new Error('The fee-staking transaction reverted.');
		return { approvalHash, hash };
	} catch (error) {
		throw new Error(errorMessage(error));
	}
}

export async function revokeStakingAllowance(account: Address): Promise<Hash> {
	const wallet = createWalletClient(getInjectedProvider(), account);
	const { request } = await publicClient.simulateContract({
		address: ADDRESSES.boxFee,
		abi: erc20Abi,
		functionName: 'approve',
		args: [ADDRESSES.feeStaking, 0n],
		account
	});
	const hash = await wallet.writeContract(request);
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The staking allowance revocation transaction reverted.');
	return hash;
}
