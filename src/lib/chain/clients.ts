import { createPublicClient, createWalletClient, custom, http, type Address, type EIP1193Provider } from 'viem';
import { mainnet } from 'viem/chains';
import { MAINNET_RPC_URL } from './config';

export const publicClient = createPublicClient({
	chain: mainnet,
	transport: http(MAINNET_RPC_URL, { timeout: 20_000, retryCount: 2 })
});

export function walletClient(provider: EIP1193Provider, account?: Address) {
	return createWalletClient({
		account,
		chain: mainnet,
		transport: custom(provider)
	});
}
