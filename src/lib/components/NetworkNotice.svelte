<script lang="ts">
	import { switchToMainnet, walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { CHAIN_ID, CHAIN_NAME } from '#lib/chain/config.js';

	let error = $state<string | null>(null);
	let switching = $state(false);

	async function switchNetwork() {
		error = null;
		switching = true;
		try {
			await switchToMainnet();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to switch networks from this wallet.';
		} finally {
			switching = false;
		}
	}
</script>

{#if walletState.account && walletState.chainId !== CHAIN_ID}
	<aside class="network-warning" role="status">
		<span><strong>Wrong network.</strong> This interface reads Ethereum mainnet contracts.</span>
		<button type="button" onclick={switchNetwork} disabled={switching}>{switching ? 'Switching…' : `Switch to ${CHAIN_NAME}`}</button>
		{#if error}<span class="error">{error}</span>{/if}
	</aside>
{:else if !walletState.account}
	<aside class="network-info" role="note">Read-only contract data is from {CHAIN_NAME}. Connect a wallet to prepare transactions.</aside>
{/if}

<style>
	.network-warning, .network-info { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; border: 1px solid #64522a; border-radius: 6px; padding: 11px 13px; background: #19160e; color: #e9d399; font-size: 0.75rem; line-height: 1.5; }
	.network-warning button { flex: 0 0 auto; border: 1px solid #a78339; border-radius: 4px; padding: 7px 9px; background: transparent; color: #f4d58c; font-size: 0.72rem; cursor: pointer; }
	.network-warning button:disabled { opacity: 0.5; }
	.network-info { border-color: var(--border); background: var(--surface); color: var(--muted); }
	.error { flex-basis: 100%; color: var(--danger); }
	@media (max-width: 600px) { .network-warning { align-items: flex-start; flex-direction: column; } }
</style>
