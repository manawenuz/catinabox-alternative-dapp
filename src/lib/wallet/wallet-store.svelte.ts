import { isAddress, type Address, type EIP1193Provider } from 'viem';
import { CHAIN_ID } from '#lib/chain/config.js';

export type WalletState = {
	account: Address | null;
	chainId: number | null;
	connecting: boolean;
	error: string | null;
};

export const walletState = $state<WalletState>({
	account: null,
	chainId: null,
	connecting: false,
	error: null
});

type Eip1193ProviderWithEvents = EIP1193Provider & {
	on?: (event: string, listener: (...args: unknown[]) => void) => void;
	removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
	interface Window {
		ethereum?: Eip1193ProviderWithEvents;
	}
}

let activeProvider: Eip1193ProviderWithEvents | undefined;

function injectedProvider(): Eip1193ProviderWithEvents | undefined {
	return typeof window === 'undefined' ? undefined : window.ethereum;
}

function setAccount(accounts: unknown): void {
	const first = Array.isArray(accounts) ? accounts[0] : undefined;
	walletState.account = typeof first === 'string' && isAddress(first) ? first : null;
}

function setChain(chain: unknown): void {
	try {
		walletState.chainId = typeof chain === 'string' ? Number(BigInt(chain)) : null;
	} catch {
		walletState.chainId = null;
	}
}

function onAccountsChanged(accounts: unknown): void {
	setAccount(accounts);
	walletState.error = null;
}

function onChainChanged(chain: unknown): void {
	setChain(chain);
	walletState.error = null;
}

function onDisconnect(): void {
	walletState.account = null;
	walletState.chainId = null;
}

function attachListeners(provider: Eip1193ProviderWithEvents): void {
	if (activeProvider === provider) return;
	if (activeProvider?.removeListener) {
		activeProvider.removeListener('accountsChanged', onAccountsChanged);
		activeProvider.removeListener('chainChanged', onChainChanged);
		activeProvider.removeListener('disconnect', onDisconnect);
	}
	provider.on?.('accountsChanged', onAccountsChanged);
	provider.on?.('chainChanged', onChainChanged);
	provider.on?.('disconnect', onDisconnect);
	activeProvider = provider;
}

export function getInjectedProvider(): Eip1193ProviderWithEvents {
	const provider = injectedProvider();
	if (!provider) throw new Error('No injected wallet was found. Install a browser wallet to continue.');
	return provider;
}

export async function refreshWalletState(): Promise<void> {
	const provider = injectedProvider();
	if (!provider) return;
	attachListeners(provider);
	try {
		const [accounts, chainId] = await Promise.all([
			provider.request({ method: 'eth_accounts' }),
			provider.request({ method: 'eth_chainId' })
		]);
		setAccount(accounts);
		setChain(chainId);
	} catch (error) {
		walletState.error = error instanceof Error ? error.message : 'Unable to read the wallet connection.';
	}
}

export async function connectWallet(): Promise<{ account: Address; chainId: number }> {
	const provider = getInjectedProvider();
	walletState.connecting = true;
	walletState.error = null;
	try {
		attachListeners(provider);
		const [accounts, chainId] = await Promise.all([
			provider.request({ method: 'eth_requestAccounts' }),
			provider.request({ method: 'eth_chainId' })
		]);
		setAccount(accounts);
		setChain(chainId);
		if (!walletState.account || walletState.chainId === null) throw new Error('The wallet did not return an account and network.');
		return { account: walletState.account, chainId: walletState.chainId };
	} catch (error) {
		walletState.error = error instanceof Error ? error.message : 'Wallet connection was not completed.';
		throw error;
	} finally {
		walletState.connecting = false;
	}
}

export function disconnectWallet(): void {
	if (activeProvider?.removeListener) {
		activeProvider.removeListener('accountsChanged', onAccountsChanged);
		activeProvider.removeListener('chainChanged', onChainChanged);
		activeProvider.removeListener('disconnect', onDisconnect);
	}
	activeProvider = undefined;
	walletState.account = null;
	walletState.chainId = null;
	walletState.error = null;
}

export async function switchToMainnet(): Promise<void> {
	const provider = getInjectedProvider();
	await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }] });
	await refreshWalletState();
}
