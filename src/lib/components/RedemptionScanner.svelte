<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { createRedemptionScanner } from '#lib/redemption/scanner.js';
	import { clearScan } from '#lib/redemption/cache.js';
	import { rankCandidates } from '#lib/redemption/ranking.js';
	import type { Candidate, RedemptionEstimate, ScanProgress } from '#lib/redemption/types.js';
	import type { CandidateDiscovery } from '#lib/redemption/scanner.js';
	import { ETHERSCAN_API_KEY, type CdpVersion } from '#lib/chain/config.js';

	type Props = { onSelect: (candidate: Candidate, amount: bigint) => void };
	let { onSelect }: Props = $props();
	const scanner = createRedemptionScanner();
	let versions = $state<CdpVersion[]>(['v1', 'v1.1']);
	let progress = $state<Partial<Record<CdpVersion, ScanProgress>>>({});
	let estimates = $state<RedemptionEstimate[]>([]);
	let isRunning = $state(false);
	let isRanking = $state(false);
	let error = $state<string | null>(null);
	let rankingProgress = $state({ completed: 0, total: 0 });
	let discovery = $state<CandidateDiscovery | null>(null);
	let stopping = $state(false);
	let operationController: AbortController | undefined;
	let runNumber = 0;
	const usesEtherscan = Boolean(ETHERSCAN_API_KEY);
	const allSelectedComplete = $derived(versions.length > 0 && versions.every((version) => progress[version]?.status === 'complete'));
	onDestroy(() => { operationController?.abort(); scanner.cancel(); });

	async function startScan() {
		if (isRunning || isRanking) return;
		if (!versions.length) { error = 'Select at least one CDP version.'; return; }
		error = null; estimates = []; progress = {}; discovery = null; isRunning = true; isRanking = false;
		stopping = false;
		const thisRun = ++runNumber;
		const isCurrentRun = () => runNumber === thisRun;
		const controller = new AbortController();
		operationController = controller;
		try {
			const result = await scanner.start(versions, (update) => {
				if (isCurrentRun() && !controller.signal.aborted) progress = { ...progress, [update.version]: update };
			});
			if (!isCurrentRun() || controller.signal.aborted) return;
			discovery = result;
			isRunning = false;
			if (scanner.status === 'cancelled') return;
			if (!discovery.candidates.length) return;
			isRanking = true;
			rankingProgress = { completed: 0, total: discovery.candidates.length };
			estimates = await rankCandidates(discovery.candidates, walletState.account ?? undefined, ({ completed, total, estimate }) => {
				if (!isCurrentRun() || controller.signal.aborted) return;
				rankingProgress = { completed, total };
				if (estimate) estimates = [...estimates, estimate].sort((left, right) => {
					if (left.profitability === 'estimated' && right.profitability !== 'estimated') return -1;
					if (right.profitability === 'estimated' && left.profitability !== 'estimated') return 1;
					const a = left.netEstimateStEth ?? 0n; const b = right.netEstimateStEth ?? 0n;
					if (left.profitability === 'estimated' && a !== b) return a > b ? -1 : 1;
					const rateA = left.totalBoxEth ? left.stEthOut * 10n ** 18n / left.totalBoxEth : 0n;
					const rateB = right.totalBoxEth ? right.stEthOut * 10n ** 18n / right.totalBoxEth : 0n;
					return rateA === rateB ? 0 : rateA > rateB ? -1 : 1;
				});
			}, controller.signal);
		} catch (cause) {
			if (isCurrentRun() && !controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Unable to scan CDP history.';
		}
		finally {
			if (isCurrentRun()) {
				if (operationController === controller) operationController = undefined;
				isRunning = false; isRanking = false; stopping = false;
			}
		}
	}

	function togglePause() {
		if (scanner.status === 'paused') scanner.resume();
		else scanner.pause();
	}
	async function clearHistory() {
		if (isRunning || isRanking || !versions.length) return;
		const selectedVersions = [...versions];
		if (!window.confirm(`Clear saved redemption history for ${selectedVersions.join(' and ')} in this browser? This removes cached addresses and checkpoints.`)) return;
		try {
			await Promise.all(selectedVersions.map((version) => clearScan(version)));
			progress = {};
			estimates = [];
			discovery = null;
			rankingProgress = { completed: 0, total: 0 };
			error = null;
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Unable to clear the saved redemption history.';
		}
	}
	function cancel() {
		if (!operationController || stopping) return;
		stopping = true;
		operationController.abort();
		scanner.cancel();
	}
	function estimateLabel(estimate: RedemptionEstimate): string {
		if (estimate.profitability === 'estimated' && estimate.netEstimateStEth !== undefined) return `${estimate.netEstimateStEth >= 0n ? '+' : ''}${formatTokenAmount(estimate.netEstimateStEth, 18)} stETH est.`;
		return 'Profit unavailable';
	}
</script>

<section class="scanner panel">
	<div class="header"><div><p class="eyebrow">Browser based discovery</p><h2>Find live redemption targets</h2></div><span class="privacy mono">READ ONLY · USER STARTED</span></div>
	<p class="description">Search both CDP histories from their verified deployment blocks. The scan queries Ethereum logs in your browser and stores addresses and checkpoints only in this browser. {usesEtherscan ? 'This build uses Etherscan for historical logs; its API key is public and its quota is shared by site visitors.' : 'Without an Etherscan key, the configured RPC must allow archive log access; some public RPCs deny these requests or throttle long searches.'}</p>
	{#if usesEtherscan}<p class="attribution"><a href="https://etherscan.io/apis" target="_blank" rel="noreferrer">Powered by Etherscan.io APIs ↗</a></p>{/if}
	<div class="controls">
		<fieldset><legend>CDP versions</legend><label><input type="checkbox" value="v1" bind:group={versions} disabled={isRunning || isRanking}/> v1</label><label><input type="checkbox" value="v1.1" bind:group={versions} disabled={isRunning || isRanking}/> v1.1</label></fieldset>
		<div class="buttons">{#if stopping}<span class="ranking-label">Stopping…</span><button class="button secondary" type="button" disabled>Stopping</button>{:else if isRanking}<span class="ranking-label">Ranking…</span><button class="button secondary" type="button" onclick={cancel}>Stop</button>{:else if isRunning}<button class="button secondary" type="button" onclick={togglePause}>{scanner.status === 'paused' ? 'Resume' : 'Pause'}</button><button class="button secondary" type="button" onclick={cancel}>Stop</button>{:else}<button class="button" type="button" onclick={startScan}>Scan / resume</button><button class="button secondary" type="button" onclick={clearHistory} disabled={!versions.length}>Clear saved history</button>{/if}</div>
	</div>
	{#each ['v1','v1.1'] as version}
		{@const item = progress[version as CdpVersion]}
		{#if item}<div class="progress"><div><strong>{version}</strong><span>{item.status} · {item.candidateCount.toLocaleString()} historical addresses · {item.logsProcessed.toLocaleString()} logs this run</span></div><small>Block {item.nextBlock.toLocaleString()} / {item.throughBlock.toLocaleString()}</small><div class="track"><i style={`width:${item.throughBlock > item.fromBlock ? Math.max(0, Math.min(100, Number((item.nextBlock - item.fromBlock) * 10000n / (item.throughBlock - item.fromBlock + 1n)) / 100)) : 100}%`}></i></div></div>{/if}
	{/each}
	{#if isRanking}<p class="ranking-status">Checking {rankingProgress.completed.toLocaleString()} / {rankingProgress.total.toLocaleString()} active positions for available quotes…</p>{/if}
	{#if discovery && discovery.failedReads > 0}<p class="warning" role="status">{discovery.failedReads.toLocaleString()} of {discovery.addressesChecked.toLocaleString()} position reads failed at the pinned block. Valid candidates remain available; repeat the scan after RPC rate limits clear to refresh the rest.</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if estimates.length}
		<div class="table-wrap"><table><thead><tr><th>CDP / target</th><th>Debt</th><th>Max redeem</th><th>Friction</th><th>Estimate</th><th></th></tr></thead><tbody>
			{#each estimates as estimate (`${estimate.candidate.version}-${estimate.candidate.address}`)}
				<tr><td><strong>{estimate.candidate.version}</strong><a href={`https://etherscan.io/address/${estimate.candidate.address}`} target="_blank" rel="noreferrer">{shortenAddress(estimate.candidate.address)} ↗</a></td><td>{formatTokenAmount(estimate.candidate.debt,18)}<small>boxETH</small></td><td>{formatTokenAmount(estimate.candidate.maxRedeem,18)}<small>boxETH</small></td><td>{formatTokenAmount(estimate.frictionFee,18)}<small>boxETH at ranked size</small></td><td><strong class:available={estimate.profitability === 'estimated'}>{estimateLabel(estimate)}</strong><small>{estimate.profitability === 'estimated' ? `quote block ${estimate.quoteBlock?.toLocaleString() ?? '—'}` : 'ranked by friction-adjusted rate'}</small></td><td><button class="select" type="button" onclick={() => onSelect(estimate.candidate, estimate.redeemAmount)}>Choose</button></td></tr>
			{/each}
		</tbody></table></div>
	{:else if allSelectedComplete && discovery && !isRanking}
		<p class="empty">{discovery.failedReads > 0 ? 'No active target was confirmed among the successful reads. Some positions could not be refreshed, so this is not a complete zero-position result.' : 'No active target positions were found in the scanned histories.'} You can still enter a target address below.</p>
	{/if}
	<p class="disclaimer">Rows include confirmed active positions even when the connected wallet has no boxETH. Profit estimates appear only when the wallet can cover the full amount and current allowance and an on-chain Uniswap quote and gas estimate are available. Otherwise rows are ordered by the friction-adjusted redemption rate, not labeled profitable. Choosing a target triggers a fresh position read.</p>
</section>

<style>
	.scanner { display:grid; gap:15px; padding:18px; }
	.header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
	.header h2 { margin:4px 0 0; font-size:1.05rem; letter-spacing:-.04em; }
	.privacy { color:var(--dim); font-size:.58rem; letter-spacing:.07em; }
	.description,.disclaimer,.empty { margin:-7px 0 0; color:var(--muted); font-size:.71rem; line-height:1.55; }
	.attribution { margin:-9px 0 0; font-size:.63rem; }
	.attribution a { color:var(--mint); text-decoration:none; }
	.controls { display:flex; align-items:flex-end; justify-content:space-between; gap:1rem; }
	fieldset { display:flex; gap:15px; margin:0; border:1px solid var(--border); border-radius:5px; padding:7px 10px 9px; }
	legend { padding-inline:4px; color:var(--dim); font-size:.6rem; }
	fieldset label { display:flex; align-items:center; gap:5px; color:var(--muted); font-size:.68rem; cursor:pointer; }
	input[type=checkbox] { accent-color:var(--mint); }
	.buttons { display:flex; gap:7px; }
	.buttons .button { min-height:38px; padding:.5rem .75rem; font-size:.71rem; }
	.ranking-label { align-self:center; color:var(--muted); font-size:.68rem; }
	.progress { display:grid; gap:6px; border:1px solid var(--border); border-radius:5px; padding:10px; }
	.progress > div:first-child { display:flex; justify-content:space-between; gap:1rem; color:var(--muted); font-size:.65rem; }
	.progress strong { color:var(--mint); } .progress small { color:var(--dim); font-family:'DM Mono',monospace; font-size:.59rem; }
	.track { height:4px; border-radius:4px; background:#252b28; overflow:hidden; } .track i { display:block; height:100%; background:var(--mint); }
	.ranking-status { margin:0; color:var(--muted); font-size:.68rem; }
	.table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:5px; }
	table { width:100%; border-collapse:collapse; min-width:750px; font-size:.65rem; }
	th { padding:9px 8px; color:var(--dim); font-weight:500; text-align:left; background:#101311; }
	td { border-top:1px solid var(--border); padding:9px 8px; vertical-align:top; white-space:nowrap; }
	td:first-child { display:grid; gap:4px; } td:first-child a { color:var(--muted); font-family:'DM Mono',monospace; font-size:.61rem; text-decoration:none; }
	td strong { color:var(--text); font-weight:600; } td strong.available { color:var(--mint); }
	td small { display:block; margin-top:3px; color:var(--dim); font-size:.58rem; }
	.select { border:1px solid #315342; border-radius:4px; padding:6px 8px; background:#152019; color:var(--mint); font-size:.63rem; cursor:pointer; }
	.error { margin:0; color:var(--danger); font-size:.72rem; overflow-wrap:anywhere; }
	.warning { margin:0; border:1px solid #5a4b2c; border-radius:5px; padding:10px; background:#19160e; color:#c9bb91; font-size:.67rem; line-height:1.5; }
	@media(max-width:620px) { .header,.controls { align-items:flex-start; flex-direction:column; } .buttons { width:100%; } .buttons .button { flex:1; } .progress > div:first-child { flex-direction:column; gap:4px; } }
</style>
