<script lang="ts">
	import { resolve } from '$app/paths';
	import { readCdpSummary, type CdpAction, type CdpSummary } from '#lib/protocol/cdp.js';
	import { CHAIN_ID, type CdpVersion } from '#lib/chain/config.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { formatBasisPoints } from '#lib/utils/token-amounts.js';
	import WalletButton from '#lib/components/WalletButton.svelte';
	import NetworkNotice from '#lib/components/NetworkNotice.svelte';
	import VersionSelector from '#lib/components/VersionSelector.svelte';
	import PositionSummary from '#lib/components/PositionSummary.svelte';
	import CdpActionForm from '#lib/components/CdpActionForm.svelte';
	import BoxFeeActionForm from '#lib/components/BoxFeeActionForm.svelte';
	import StakingActionForm from '#lib/components/StakingActionForm.svelte';
	import RedemptionScanner from '#lib/components/RedemptionScanner.svelte';
	import RedemptionForm from '#lib/components/RedemptionForm.svelte';
	import type { Candidate } from '#lib/redemption/types.js';

	type AppAction = CdpAction | 'boxfee' | 'redeem';
	type ActionTab = { id: AppAction; label: string };
	const tabs: ActionTab[] = [
		{ id: 'deposit', label: 'Deposit' },
		{ id: 'mint', label: 'Borrow' },
		{ id: 'repay', label: 'Repay' },
		{ id: 'withdraw', label: 'Withdraw' },
		{ id: 'boxfee', label: 'boxFEE' },
		{ id: 'redeem', label: 'Redeem' }
	];

	let version = $state<CdpVersion>('v1.1');
	let activeAction = $state<AppAction>('deposit');
	let summary = $state<CdpSummary | null>(null);
	let loading = $state(true);
	let readError = $state<string | null>(null);
	let refreshCount = 0;
	let redemptionSelection = $state<{ candidate: Candidate; amount: bigint } | undefined>();

	async function loadSummary(selectedVersion: CdpVersion, account?: `0x${string}`) {
		const request = ++refreshCount;
		loading = true;
		readError = null;
		try {
			const next = await readCdpSummary(selectedVersion, account);
			if (request === refreshCount) summary = next;
		} catch (error) {
			if (request === refreshCount) {
				readError = error instanceof Error ? error.message : 'Unable to read protocol data from the configured RPC.';
				summary = null;
			}
		} finally {
			if (request === refreshCount) loading = false;
		}
	}

	async function refresh() {
		await loadSummary(version, walletState.account ?? undefined);
	}

	$effect(() => {
		const selectedVersion = version;
		const account = walletState.account ?? undefined;
		void loadSummary(selectedVersion, account);
	});

	function selectVersion(next: CdpVersion) {
		version = next;
		if (redemptionSelection && redemptionSelection.candidate.version !== next) redemptionSelection = undefined;
	}

	function selectRedemption(candidate: Candidate, amount: bigint) {
		version = candidate.version;
		redemptionSelection = { candidate, amount };
		activeAction = 'redeem';
	}
</script>

<svelte:head>
	<title>Protocol app — Cat in a Box</title>
	<meta name="description" content="Independent interface for Cat-in-a-Box CDP positions, boxFEE and staking." />
</svelte:head>

<section class="container app-page">
	<div class="app-title-row">
		<div>
			<p class="eyebrow">Protocol interface / Ethereum mainnet</p>
			<h1>Manage your position.</h1>
			<p class="lede">Read deployed state and review each transaction before it reaches your wallet.</p>
		</div>
		<div class="app-controls">
			<VersionSelector value={version} onchange={selectVersion} />
			<WalletButton />
		</div>
	</div>

	<NetworkNotice />

	{#if readError}
		<div class="rpc-error panel" role="alert">
			<strong>Could not read mainnet state.</strong>
			<p>{readError}</p>
			<button class="button secondary" type="button" onclick={refresh}>Retry</button>
		</div>
	{/if}

	<section class="overview panel">
		<div class="overview-toolbar">
			<div class="selected-version"><span class="version-dot"></span><span>{version} CDP</span><span class="address mono">{version === 'v1' ? '0x7f0A…C6014' : '0x6ffD…890FA'}</span></div>
			<button class="refresh" type="button" onclick={refresh} disabled={loading} aria-label="Refresh contract data">{loading ? 'Loading…' : '↻ Refresh'}</button>
		</div>
		<PositionSummary {summary} {loading} />
	</section>

	<div class="app-main-grid">
		<section class="actions-section">
			<div class="section-heading">
				<div><p class="eyebrow">Your actions</p><h2>Interact with the protocol</h2></div>
				<a href="https://app.uniswap.org/swap?inputCurrency=0x7690202e2C2297bcD03664e31116d1dFfE7e3B73&outputCurrency=0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" target="_blank" rel="noreferrer">Open Uniswap ↗</a>
			</div>

			<div class="action-tabs" role="tablist" aria-label="Protocol actions">
				{#each tabs as tab (tab.id)}
					<button type="button" role="tab" aria-selected={activeAction === tab.id} class:active={activeAction === tab.id} onclick={() => (activeAction = tab.id)}>{tab.label}</button>
				{/each}
			</div>

			{#if activeAction === 'deposit' || activeAction === 'mint' || activeAction === 'repay' || activeAction === 'withdraw'}
				{#key `${version}-${activeAction}-${walletState.account ?? 'disconnected'}-${walletState.chainId ?? 'unknown'}`}
					<CdpActionForm action={activeAction} {version} account={walletState.account ?? undefined} {summary} onComplete={refresh} />
				{/key}
			{:else if activeAction === 'boxfee'}
				{#key `${activeAction}-${walletState.account ?? 'disconnected'}-${walletState.chainId ?? 'unknown'}`}
					<div class="boxfee-group">
						<BoxFeeActionForm account={walletState.account ?? undefined} onComplete={refresh} />
						<StakingActionForm account={walletState.account ?? undefined} onComplete={refresh} />
					</div>
				{/key}
			{:else}
				<div class="redemption-flow">
					{#key `${walletState.account ?? 'disconnected'}-${walletState.chainId ?? 'unknown'}`}
						<RedemptionScanner onSelect={selectRedemption} />
					{/key}
					{#key `${version}-${walletState.account ?? 'disconnected'}-${walletState.chainId ?? 'unknown'}`}
						<RedemptionForm {version} account={walletState.account ?? undefined} selection={redemptionSelection} onComplete={refresh} />
					{/key}
				</div>
			{/if}
		</section>

		<aside class="side-column">
				<div class="side-card panel">
				<div class="side-card-head"><p class="eyebrow">Current CDP</p><span>{summary ? formatBasisPoints(summary.system.ltv) : '—'}</span></div>
				<h3>Collateral ratio setting</h3>
				<p>This value comes from the selected contract’s live <code>ltv()</code> getter. The version label does not assume an LTV.</p>
				{#if summary}<div class="side-meta">Read at block {summary.system.blockNumber.toLocaleString()}</div>{/if}
			</div>
			<div class="side-card panel">
				<p class="eyebrow">Before signing</p>
				<h3>Confirm the contract and amount.</h3>
				<ul>
					<li>Each write is simulated before its wallet prompt.</li>
					<li>Token approvals are separate transactions and request only the needed amount.</li>
					<li>For reads, the RPC URL is public configuration and needs no API key.</li>
				</ul>
				<a href={resolve('/docs/deployed-behavior/')}>Read deployed behavior →</a>
			</div>
			<div class="side-card external panel">
				<p class="eyebrow">Market</p>
				<h3>boxETH ↔ stETH</h3>
				<p>Open a market quote in Uniswap. Market prices and liquidity are external to the CDP conversion values.</p>
				<a href="https://app.uniswap.org/swap?inputCurrency=0x7690202e2C2297bcD03664e31116d1dFfE7e3B73&outputCurrency=0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84" target="_blank" rel="noreferrer">Uniswap ↗</a>
			</div>
		</aside>
	</div>

	{#if walletState.account && walletState.chainId === CHAIN_ID}
		<p class="connected-foot mono">WALLET CONNECTED · TRANSACTIONS REQUIRE A SEPARATE WALLET SIGNATURE</p>
	{/if}
</section>

<style>
	.app-page { padding-block: 40px 82px; }
	.app-title-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; margin-bottom: 25px; }
	h1 { margin: 9px 0 7px; font-size: clamp(2.4rem, 6vw, 4.4rem); letter-spacing: -0.08em; line-height: 1; }
	.lede { margin: 0; color: var(--muted); font-size: 0.9rem; }
	.app-controls { display: flex; align-items: center; gap: 12px; }
	.overview { display: grid; gap: 17px; margin-top: 15px; padding: 18px; }
	.overview-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--border); padding-bottom: 13px; }
	.selected-version { display: inline-flex; align-items: center; gap: 8px; font-size: 0.76rem; font-weight: 800; }
	.version-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); }
	.address { margin-left: 4px; color: var(--dim); font-size: 0.66rem; font-weight: 400; }
	.refresh { border: 0; padding: 4px 0; background: transparent; color: var(--mint); font-size: 0.7rem; cursor: pointer; }
	.refresh:disabled { color: var(--dim); cursor: progress; }
	.app-main-grid { display: grid; grid-template-columns: minmax(0, 1.75fr) minmax(270px, 0.85fr); align-items: start; gap: 18px; margin-top: 30px; }
	.actions-section { min-width: 0; }
	.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-bottom: 12px; }
	.section-heading h2 { margin: 4px 0 0; font-size: 1.12rem; letter-spacing: -0.04em; }
	.section-heading a, .side-card > a { color: var(--mint); font-size: 0.72rem; text-decoration: none; white-space: nowrap; }
	.action-tabs { display: flex; overflow-x: auto; gap: 3px; margin-bottom: 10px; border-bottom: 1px solid var(--border); scrollbar-width: thin; }
	.action-tabs button { position: relative; flex: 0 0 auto; border: 0; padding: 12px 13px 11px; background: transparent; color: var(--dim); font-size: 0.75rem; font-weight: 700; cursor: pointer; }
	.action-tabs button.active { color: var(--mint); }
	.action-tabs button.active::after { position: absolute; right: 10px; bottom: -1px; left: 10px; height: 2px; background: var(--mint); content: ''; }
	.side-column { display: grid; gap: 10px; }
	.side-card { padding: 16px; }
	.side-card h3 { margin: 8px 0; font-size: 0.91rem; letter-spacing: -0.04em; }
	.side-card p:not(.eyebrow) { margin: 0; color: var(--muted); font-size: 0.72rem; line-height: 1.6; }
	.side-card code { color: #c2d8cc; font-size: 0.68rem; }
	.side-card-head { display: flex; justify-content: space-between; align-items: center; }
	.side-card-head span { color: var(--mint); font-family: 'DM Mono', monospace; font-size: 0.75rem; }
	.side-meta { margin-top: 12px; color: var(--dim); font-family: 'DM Mono', monospace; font-size: 0.62rem; }
	.side-card ul { display: grid; gap: 8px; margin: 12px 0; padding-left: 15px; color: var(--muted); font-size: 0.69rem; line-height: 1.5; }
	.side-card li::marker { color: var(--mint); }
	.side-card.external { border-color: #315342; background: #111914; }
	.boxfee-group { display:grid; gap:14px; }
	.redemption-flow { display:grid; gap:14px; }
	.rpc-error { margin-top: 14px; padding: 16px; border-color: #70403d; color: var(--text); }
	.rpc-error p { margin: 6px 0 13px; color: var(--muted); font-size: 0.76rem; overflow-wrap: anywhere; }
	.rpc-error .button { min-height: 36px; padding: 0.4rem 0.75rem; font-size: 0.7rem; }
	.connected-foot { margin: 24px 0 0; color: var(--dim); font-size: 0.6rem; letter-spacing: 0.1em; text-align: center; }
	@media (max-width: 900px) { .app-main-grid { grid-template-columns: minmax(0, 1fr); } .side-column { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (max-width: 720px) { .app-title-row { align-items: flex-start; flex-direction: column; gap: 18px; } .app-controls { width: 100%; justify-content: space-between; } .side-column { grid-template-columns: 1fr; } .overview { padding: 13px; } .app-page { padding-top: 30px; } }
	@media (max-width: 640px) {
		.action-tabs { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); overflow: visible; gap: 0; }
		.action-tabs button { min-width: 0; padding-inline: 2px; font-size: 0.7rem; white-space: nowrap; }
		.action-tabs button.active::after { right: 2px; left: 2px; }
	}
</style>
