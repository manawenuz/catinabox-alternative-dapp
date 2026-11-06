import type { Address } from 'viem';
import { ADDRESSES, cdpAddress, type CdpVersion } from './config';
import { cdpAbi, erc20Abi } from './abis';
import { publicClient } from './clients';

export type Position = {
	account: Address;
	deposited: bigint;
	debt: bigint;
	owing: bigint;
	enableRepaying: boolean;
	lastPoints: bigint;
};

export type SystemState = {
	ltv: bigint;
	idleFee: bigint;
	totalDeposits: bigint;
	totalDebt: bigint;
	unclaimed: bigint;
	mintingFee: bigint;
	blockNumber: bigint;
	totalPoints: bigint;
	pointMultiplier: bigint;
};

export type WalletBalances = {
	stEth: bigint;
	boxEth: bigint;
	boxFee: bigint;
	stEthAllowance: bigint;
	boxEthAllowance: bigint;
};

export async function readPosition(version: CdpVersion, account: Address, pinnedBlock?: bigint): Promise<Position> {
	const address = cdpAddress(version);
	const blockNumber = pinnedBlock ?? await publicClient.getBlockNumber();
	const [deposited, debt, owing, enableRepaying, lastPoints] = await Promise.all([
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'deposited', args: [account], blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'debt', args: [account], blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'Owing', args: [account], blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'enableRepaying', args: [account], blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'lastPoints', args: [account], blockNumber })
	]);
	return { account, deposited, debt, owing, enableRepaying, lastPoints };
}

export async function readSystemState(version: CdpVersion, pinnedBlock?: bigint): Promise<SystemState> {
	const address = cdpAddress(version);
	const blockNumber = pinnedBlock ?? await publicClient.getBlockNumber();
	const keys = await Promise.all([
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'ltv', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'idleFee', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'totaldeposits', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'totalDebt', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'unclaimed', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'totalPoints', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'pointMultiplier', blockNumber }),
		version === 'v1.1'
			? publicClient.readContract({ address, abi: cdpAbi, functionName: 'mintingFee', blockNumber })
			: Promise.resolve(0n)
	]);
	return {
		ltv: keys[0],
		idleFee: keys[1],
		totalDeposits: keys[2],
		totalDebt: keys[3],
		unclaimed: keys[4],
		mintingFee: keys[7],
		blockNumber,
		totalPoints: keys[5],
		pointMultiplier: keys[6]
	};
}

export async function readWalletBalances(version: CdpVersion, account: Address, pinnedBlock?: bigint): Promise<WalletBalances> {
	const cdp = cdpAddress(version);
	const blockNumber = pinnedBlock ?? await publicClient.getBlockNumber();
	const [stEth, boxEth, boxFee, stEthAllowance, boxEthAllowance] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.stEth, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxFee, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.stEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdp], blockNumber }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdp], blockNumber })
	]);
	return { stEth, boxEth, boxFee, stEthAllowance, boxEthAllowance };
}

export async function readTokenDecimals(address: Address): Promise<number> {
	return Number(await publicClient.readContract({ address, abi: erc20Abi, functionName: 'decimals' }));
}

export async function readTokenAllowance(token: Address, owner: Address, spender: Address): Promise<bigint> {
	return publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [owner, spender] });
}
