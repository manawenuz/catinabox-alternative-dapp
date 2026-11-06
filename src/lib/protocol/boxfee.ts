import type { Address, Hash } from 'viem';
import { BaseError } from 'viem';
import { ADDRESSES } from '#lib/chain/config.js';
import { boxFeeAbi, erc20Abi } from '#lib/chain/abis.js';
import { publicClient, walletClient as createWalletClient } from '#lib/chain/clients.js';
import { getInjectedProvider } from '#lib/wallet/wallet-store.svelte.js';

export type BoxFeeState = {
	balance: bigint;
	boxEthBalance: bigint;
	allowance: bigint;
	totalAssets: bigint;
	totalSupply: bigint;
	assetsPerShare: bigint;
	tokenDecimals: number;
	assetDecimals: number;
	blockNumber: bigint;
};

export type BoxFeeAction = 'deposit' | 'mint' | 'withdraw' | 'redeem';

export type BoxFeeProgress = {
	phase: 'approval' | 'action' | 'pending';
	message: string;
	hash?: Hash;
};

export type BoxFeeExecution = { approvalHash?: Hash; hash: Hash; allowanceAfter?: bigint };

function errorMessage(error: unknown): string {
	if (error instanceof BaseError) return error.shortMessage;
	return error instanceof Error ? error.message : 'The boxFEE transaction was rejected.';
}

export async function readBoxFeeState(account: Address): Promise<BoxFeeState> {
	const blockNumber = await publicClient.getBlockNumber();
	const [balance, boxEthBalance, allowance, totalAssets, totalSupply, tokenDecimals, asset, assetDecimals] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, ADDRESSES.boxFee], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'totalAssets', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'totalSupply', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'decimals', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'asset', blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'decimals', blockNumber })
	]);
	if (asset.toLowerCase() !== ADDRESSES.boxEth.toLowerCase()) throw new Error('The deployed boxFEE asset does not match the configured boxETH contract.');
	if (tokenDecimals !== assetDecimals) throw new Error('boxFEE and boxETH decimals do not match the deployed 1:1 entrypoint assumptions.');
	const oneShare = 10n ** BigInt(tokenDecimals);
	const assetsPerShare = await publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'convertToAssets', args: [oneShare], blockNumber });
	return { balance, boxEthBalance, allowance, totalAssets, totalSupply, assetsPerShare, tokenDecimals: Number(tokenDecimals), assetDecimals: Number(assetDecimals), blockNumber };
}

function boxFeeCall(action: BoxFeeAction, amount: bigint, account: Address) {
	if (action === 'deposit') return { functionName: 'deposit' as const, args: [amount, account] as const };
	if (action === 'mint') return { functionName: 'mint' as const, args: [amount, account] as const };
	if (action === 'withdraw') return { functionName: 'withdraw' as const, args: [amount, account, account] as const };
	return { functionName: 'redeem' as const, args: [amount, account, account] as const };
}

export async function simulateBoxFeeAction(action: BoxFeeAction, amount: bigint, account: Address): Promise<{ gasEstimate: bigint }> {
	const call = boxFeeCall(action, amount, account);
	try {
		await publicClient.simulateContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, ...call, account });
		const gasEstimate = await publicClient.estimateContractGas({ address: ADDRESSES.boxFee, abi: boxFeeAbi, ...call, account });
		return { gasEstimate };
	} catch (error) {
		throw new Error(errorMessage(error));
	}
}

async function approveExactly(amount: bigint, account: Address, onProgress?: (progress: BoxFeeProgress) => void): Promise<Hash> {
	const wallet = createWalletClient(getInjectedProvider(), account);
	onProgress?.({ phase: 'approval', message: 'Confirm the exact boxETH allowance in your wallet.' });
	const { request } = await publicClient.simulateContract({
		address: ADDRESSES.boxEth,
		abi: erc20Abi,
		functionName: 'approve',
		args: [ADDRESSES.boxFee, amount],
		account
	});
	const hash = await wallet.writeContract(request);
	onProgress?.({ phase: 'pending', message: 'boxETH approval sent. Waiting for confirmation.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The boxETH approval transaction reverted.');
	onProgress?.({ phase: 'action', message: 'Approval confirmed. The vault action will be simulated before its wallet prompt.' });
	return hash;
}

export async function writeBoxFeeAction(
	action: BoxFeeAction,
	amount: bigint,
	account: Address,
	onProgress?: (progress: BoxFeeProgress) => void
): Promise<BoxFeeExecution> {
	let approvalHash: Hash | undefined;
	if (action === 'deposit' || action === 'mint') {
		const allowance = await publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, ADDRESSES.boxFee] });
		if (allowance < amount) approvalHash = await approveExactly(amount, account, onProgress);
	}

	const call = boxFeeCall(action, amount, account);
	const simulation = await simulateBoxFeeAction(action, amount, account);
	const wallet = createWalletClient(getInjectedProvider(), account);
	onProgress?.({ phase: 'action', message: 'Confirm the boxFEE vault action in your wallet.' });
	const { request } = await publicClient.simulateContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, ...call, account });
	const hash = await wallet.writeContract({ ...request, gas: simulation.gasEstimate });
	onProgress?.({ phase: 'pending', message: 'Vault transaction sent. Waiting for confirmation.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The boxFEE vault transaction reverted.');
	const allowanceAfter = await publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, ADDRESSES.boxFee] });
	return { approvalHash, hash, allowanceAfter };
}

export async function revokeBoxFeeAllowance(account: Address): Promise<Hash> {
	const wallet = createWalletClient(getInjectedProvider(), account);
	const { request } = await publicClient.simulateContract({
		address: ADDRESSES.boxEth,
		abi: erc20Abi,
		functionName: 'approve',
		args: [ADDRESSES.boxFee, 0n],
		account
	});
	const hash = await wallet.writeContract(request);
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The boxETH allowance revocation transaction reverted.');
	return hash;
}

