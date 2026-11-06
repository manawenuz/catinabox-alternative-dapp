import type { Address } from 'viem';

export type CdpVersion = 'v1' | 'v1.1';

export const CHAIN_ID = 1;
export const CHAIN_NAME = 'Ethereum Mainnet';
export const MAINNET_RPC_URL = import.meta.env.VITE_MAINNET_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com';

export const ADDRESSES: Record<'v1Cdp' | 'v11Cdp' | 'boxEth' | 'stEth' | 'boxFee' | 'feeStaking' | 'psm' | 'treasury', Address> = {
	v1Cdp: '0x7f0A0C7149a46Bf943cCd412da687144b49C6014',
	v11Cdp: '0x6ffD098E92B606b2947b89A08911C00ca06890FA',
	boxEth: '0x7690202e2C2297bcD03664e31116d1dFfE7e3B73',
	stEth: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
	boxFee: '0xE4B91fAf8810F8895772E7cA065D4CB889120f94',
	feeStaking: '0x320c871b6f7721083604FfdD8070E64c1d3c5d7C',
	psm: '0x24146D1B3339Cf76b455dC42e71Ea5Cdff4aE0d7',
	treasury: '0x98e6475C01D018Ae78c02ef48738f687538226Af'
};

export const DEPLOYMENT_BLOCKS: Record<CdpVersion, bigint> = {
	v1: 16_698_129n,
	'v1.1': 17_342_085n
};

export const TOKEN_METADATA = {
	boxETH: { address: ADDRESSES.boxEth, symbol: 'boxETH', name: 'Cat-in-a-Box Ether', decimals: 18 },
	stETH: { address: ADDRESSES.stEth, symbol: 'stETH', name: 'Lido staked Ether', decimals: 18 },
	boxFEE: { address: ADDRESSES.boxFee, symbol: 'boxFEE', name: 'Cat-in-a-Box Fee Token', decimals: 18 }
} as const;

export function cdpAddress(version: CdpVersion): Address {
	return version === 'v1' ? ADDRESSES.v1Cdp : ADDRESSES.v11Cdp;
}

export function versionLabel(version: CdpVersion): string {
	return version === 'v1' ? 'v1' : 'v1.1';
}
