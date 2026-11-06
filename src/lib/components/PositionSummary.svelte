<script lang="ts">
	import type { CdpSummary } from '#lib/protocol/cdp.js';
	import { formatBasisPoints, formatTokenAmount } from '#lib/utils/token-amounts.js';

	type Props = { summary: CdpSummary | null; loading: boolean };
	let { summary, loading }: Props = $props();
</script>

<section class="summary-block">
	<div class="summary-heading">
		<div>
			<p class="eyebrow">Protocol overview</p>
			<h2>Position & system</h2>
		</div>
		{#if summary}<span class="block mono">Block {summary.system.blockNumber.toLocaleString()}</span>{/if}
	</div>

	{#if loading && !summary}
		<div class="skeleton-grid"><div></div><div></div><div></div><div></div></div>
	{:else if summary}
		<div class="metric-grid">
			<div class="metric panel primary">
				<span>Your stETH deposited</span>
			<strong>{summary.position ? formatTokenAmount(summary.position.deposited, 18) : '—'} <small>stETH</small></strong>
			</div>
			<div class="metric panel primary">
				<span>Your boxETH debt</span>
				<strong>{summary.position ? formatTokenAmount(summary.position.debt, 18) : '—'} <small>boxETH</small></strong>
			</div>
			<div class="metric panel">
				<span>Yield accrued on this position</span>
				<strong>{summary.position ? formatTokenAmount(summary.position.owing, 18) : '—'} <small>stETH</small></strong>
				<em>CDP yield accounting</em>
			</div>
			<div class="metric panel">
				<span>Current position LTV</span>
				<strong>{summary.position && summary.position.deposited > 0n ? formatBasisPoints((summary.position.debt * 10_000n) / summary.position.deposited) : '—'}</strong>
				<em>Calculated from current position values</em>
			</div>
		</div>
		<div class="system-row">
			<div><span>System deposits</span><strong>{formatTokenAmount(summary.system.totalDeposits, 18)} <small>stETH</small></strong></div>
			<div><span>System debt</span><strong>{formatTokenAmount(summary.system.totalDebt, 18)} <small>boxETH</small></strong></div>
			<div><span>Contract LTV</span><strong>{formatBasisPoints(summary.system.ltv)}</strong></div>
			<div><span>Yield fee share of excess · est.</span><strong>{summary.feeShareBps !== undefined ? formatBasisPoints(summary.feeShareBps) : 'Waiting for excess yield'}</strong></div>
		</div>
	{:else}
		<div class="empty panel"><span class="empty-dot"></span><p>Connect to a public Ethereum RPC to load live contract state.</p></div>
	{/if}
	{#if summary?.position}
		<p class="yield-note">Position yield is settled when the CDP processes an action. If auto-repay is enabled, settlement may reduce debt instead of increasing deposited collateral. Staking rewards are shown separately.</p>
	{/if}
	{#if summary?.projectionError}
		<p class="yield-note">Yield settlement preview unavailable: {summary.projectionError} Transaction simulations still check the live contract state before wallet confirmation.</p>
	{/if}
</section>

<style>
	.summary-block { display: grid; gap: 13px; }
	.summary-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; }
	.summary-heading h2 { margin: 4px 0 0; font-size: 1.02rem; letter-spacing: -0.035em; }
	.block { color: var(--dim); font-size: 0.65rem; }
	.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
	.metric { display: grid; min-height: 110px; align-content: space-between; gap: 11px; padding: 14px; }
	.metric > span, .system-row span { color: var(--muted); font-size: 0.7rem; line-height: 1.4; }
	.metric strong { font-size: 1.12rem; letter-spacing: -0.035em; overflow-wrap: anywhere; }
	.metric.primary strong { font-size: 1.3rem; }
	.metric small, .system-row small { color: var(--muted); font-size: 0.63rem; font-weight: 500; letter-spacing: 0; }
	.metric em { color: var(--dim); font-size: 0.62rem; font-style: normal; line-height: 1.4; }
	.system-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; border: 1px solid var(--border); border-radius: 7px; padding: 13px 15px; background: #0e110f; }
	.system-row > div { display: grid; gap: 6px; }
	.system-row strong { color: var(--text); font-size: 0.84rem; letter-spacing: -0.025em; overflow-wrap: anywhere; }
	.yield-note { margin: 0; color: var(--dim); font-size: 0.69rem; line-height: 1.6; }
	.empty { display: flex; align-items: center; gap: 10px; padding: 18px; color: var(--muted); font-size: 0.76rem; }
	.empty p { margin: 0; }
	.empty-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
	.skeleton-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 9px; }
	.skeleton-grid > div { height: 110px; border: 1px solid var(--border); border-radius: 7px; background: linear-gradient(110deg, #111613 8%, #171d19 18%, #111613 33%); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
	@keyframes shimmer { to { background-position-x: -200%; } }
	@media (max-width: 850px) { .metric-grid, .system-row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
	@media (max-width: 480px) { .metric-grid, .system-row { grid-template-columns: 1fr 1fr; } .metric { min-height: 102px; padding: 11px; } .metric strong, .metric.primary strong { font-size: 1rem; } }
</style>
