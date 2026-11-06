<script lang="ts">
	import { onMount } from 'svelte';
	import { connectWallet, disconnectWallet, refreshWalletState, walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { shortenAddress } from '#lib/utils/token-amounts.js';

	let localError = $state<string | null>(null);

	onMount(() => {
		void refreshWalletState();
	});

	async function connect() {
		localError = null;
		try {
			await connectWallet();
		} catch (error) {
			localError = error instanceof Error ? error.message : 'Wallet connection failed.';
		}
	}
</script>

{#if walletState.account}
	<div class="wallet-control">
		<span class="account mono" title={walletState.account}>{shortenAddress(walletState.account)}</span>
		<button class="disconnect" type="button" onclick={disconnectWallet}>Disconnect</button>
	</div>
{:else}
	<button class="connect" type="button" onclick={connect} disabled={walletState.connecting}>
		{walletState.connecting ? 'Connecting…' : 'Connect wallet'}
	</button>
{/if}

{#if localError || walletState.error}
	<p class="wallet-error" role="status">{localError ?? walletState.error}</p>
{/if}

<style>
	.wallet-control { display: inline-flex; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 5px; padding: 5px 7px 5px 11px; background: var(--surface); }
	.account { color: var(--text); font-size: 0.73rem; }
	.connect { min-height: 42px; border: 1px solid var(--mint); border-radius: 5px; padding: 0.65rem 0.95rem; background: var(--mint); color: #06120d; font-size: 0.82rem; font-weight: 800; cursor: pointer; }
	.connect:disabled { opacity: 0.55; cursor: progress; }
	.disconnect { border: 1px solid var(--border); border-radius: 4px; padding: 0.45rem 0.65rem; background: #1b211e; color: var(--muted); font-size: 0.7rem; cursor: pointer; }
	.disconnect:hover { border-color: var(--mint); color: var(--mint); }
	.wallet-error { margin: 7px 0 0; color: var(--danger); font-size: 0.72rem; }
</style>
