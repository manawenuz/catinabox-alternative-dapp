<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatTokenAmount, parseTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { createRedemptionScanner } from '#lib/redemption/scanner.js';
	import { clearScan } from '#lib/redemption/cache.js';
	import { rankCandidates } from '#lib/redemption/ranking.js';
	import { calculateFrictionFee } from '#lib/protocol/redemption.js';
	import type { Candidate, RedemptionEstimate, ScanProgress } from '#lib/redemption/types.js';
	import type { CandidateDiscovery } from '#lib/redemption/scanner.js';
	import { ETHERSCAN_API_KEY, type CdpVersion } from '#lib/chain/config.js';

	type Props = { onSelect: (candidate: Candidate, amount: bigint) => void };
	type SortKey = 'target' | 'debt' | 'maxRedeem' | 'frictionFee' | 'totalBoxEth' | 'stEthOut' | 'best';
	type DisplayRow = {
		candidate: Candidate;
		requestedAmount?: bigint;
		frictionFee?: bigint;
		totalBoxEth?: bigint;
		stEthOut?: bigint;
		estimate?: RedemptionEstimate;
	};
	let { onSelect }: Props = $props();
	const scanner = createRedemptionScanner();
	let versions = $state<CdpVersion[]>(['v1', 'v1.1']);
	let progress = $state<Partial<Record<CdpVersion, ScanProgress>>>({});
	let estimates = $state<RedemptionEstimate[]>([]);
	let amountInput = $state('');
	let comparisonAmount = $state<bigint>();
	let sortKey = $state<SortKey>('maxRedeem');
	let sortDirection = $state<'asc' | 'desc'>('desc');
	let isRunning = $state(false);
	let isRanking = $state(false);
	let error = $state<string | null>(null);
	let rankingProgress = $state({ completed: 0, total: 0 });
	let discovery = $state<CandidateDiscovery | null>(null);
	let stopping = $state(false);
	let operationController: AbortController | undefined;
	let runNumber = 0;
	const usesEtherscan = Boolean(ETHERSCAN_API_KEY);
	const requestedAmount = $derived(parseTokenAmount(amountInput, 18));
	const allSelectedComplete = $derived(versions.length > 0 && versions.every((version) => progress[version]?.status === 'complete'));
	const rows = $derived.by(() => {
		let result: DisplayRow[];
		if (comparisonAmount !== undefined) {
			result = estimates.map((estimate) => ({
				candidate: estimate.candidate,
				requestedAmount: estimate.redeemAmount,
				frictionFee: estimate.frictionFee,
				totalBoxEth: estimate.totalBoxEth,
				stEthOut: estimate.stEthOut,
				estimate
			}));
		} else {
			result = (discovery?.candidates ?? []).map((candidate) => {
				const amount = requestedAmount !== undefined && requestedAmount > 0n && candidate.maxRedeem >= requestedAmount ? requestedAmount : undefined;
				const frictionFee = amount === undefined ? undefined : calculateFrictionFee(amount, candidate.debt, candidate.deposited);
				return {
					candidate,
					requestedAmount: amount,
					frictionFee,
					totalBoxEth: frictionFee === undefined || amount === undefined ? undefined : amount + frictionFee,
					stEthOut: amount
				};
			});
		}
		if (sortKey === 'best') return sortDirection === 'desc' ? result : result.reverse();
		return result.sort(compareRows);
	});
	onDestroy(() => { operationController?.abort(); scanner.cancel(); });

	function compareOptional(left?: bigint, right?: bigint): number {
		if (left === undefined) return right === undefined ? 0 : 1;
		if (right === undefined) return -1;
		return left === right ? 0 : left < right ? -1 : 1;
	}
	function compareRows(left: DisplayRow, right: DisplayRow): number {
		let result = 0;
		let missingValue = false;
		if (sortKey === 'target') {
			result = left.candidate.version.localeCompare(right.candidate.version) || left.candidate.address.localeCompare(right.candidate.address);
		} else if (sortKey === 'debt') {
			result = compareOptional(left.candidate.debt, right.candidate.debt);
		} else if (sortKey === 'maxRedeem') {
			result = compareOptional(left.candidate.maxRedeem, right.candidate.maxRedeem);
		} else if (sortKey === 'frictionFee') {
			missingValue = left.frictionFee === undefined || right.frictionFee === undefined;
			result = compareOptional(left.frictionFee, right.frictionFee);
		} else if (sortKey === 'totalBoxEth') {
			missingValue = left.totalBoxEth === undefined || right.totalBoxEth === undefined;
			result = compareOptional(left.totalBoxEth, right.totalBoxEth);
		} else if (sortKey === 'stEthOut') {
			missingValue = left.stEthOut === undefined || right.stEthOut === undefined;
			result = compareOptional(left.stEthOut, right.stEthOut);
		}
		if (result !== 0) return missingValue ? result : sortDirection === 'asc' ? result : -result;
		if (left.candidate.maxRedeem !== right.candidate.maxRedeem) return left.candidate.maxRedeem > right.candidate.maxRedeem ? -1 : 1;
		return left.candidate.address.localeCompare(right.candidate.address);
	}
	function sortIndicator(key: SortKey): string { return sortKey !== key ? '' : sortDirection === 'asc' ? ' ↑' : ' ↓'; }
	function sortAria(key: SortKey): 'none' | 'ascending' | 'descending' { return sortKey !== key ? 'none' : sortDirection === 'asc' ? 'ascending' : 'descending'; }
	function toggleSort(key: SortKey) {
		if (sortKey === key) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		else { sortKey = key; sortDirection = key === 'target' ? 'asc' : 'desc'; }
	}

	async function startScan() {
		if (isRunning || isRanking) return;
		if (!versions.length) { error = 'Select at least one CDP version.'; return; }
		error = null; estimates = []; comparisonAmount = undefined; progress = {}; discovery = null; isRunning = true; isRanking = false;
		sortKey = 'maxRedeem'; sortDirection = 'desc';
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

	async function compareAmount() {
		if (isRunning || isRanking) return;
		const amount = requestedAmount;
		if (amount === undefined || amount <= 0n) { error = 'Enter a valid positive boxETH amount with no more than 18 decimal places.'; return; }
		if (!discovery) { error = 'Scan or resume history before comparing redemption targets.'; return; }
		error = null; estimates = []; comparisonAmount = undefined;
		const eligibleCount = discovery.candidates.filter((candidate) => candidate.maxRedeem >= amount).length;
		if (!eligibleCount) { comparisonAmount = amount; sortKey = 'maxRedeem'; sortDirection = 'desc'; return; }
		isRanking = true; stopping = false; rankingProgress = { completed: 0, total: eligibleCount };
		const thisRun = ++runNumber;
		const isCurrentRun = () => runNumber === thisRun;
		const controller = new AbortController();
		operationController = controller;
		try {
			const ranked = await rankCandidates(discovery.candidates, walletState.account ?? undefined, amount, ({ completed, total }) => {
				if (isCurrentRun() && !controller.signal.aborted) rankingProgress = { completed, total };
			}, controller.signal);
			if (!isCurrentRun() || controller.signal.aborted) return;
			estimates = ranked;
			comparisonAmount = amount;
			sortKey = 'best'; sortDirection = 'desc';
		} catch (cause) {
			if (isCurrentRun() && !controller.signal.aborted) error = cause instanceof Error ? cause.message : 'Unable to compare redemption targets.';
		} finally {
			if (isCurrentRun()) {
				if (operationController === controller) operationController = undefined;
				isRanking = false; stopping = false;
			}
		}
	}

	function editAmount(value: string) {
		amountInput = value;
		estimates = [];
		comparisonAmount = undefined;
		error = null;
		sortKey = 'maxRedeem'; sortDirection = 'desc';
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
			comparisonAmount = undefined;
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
		if (estimate.marketCostStEth !== undefined) {
			const quoteOnlyNet = estimate.stEthOut - estimate.marketCostStEth;
			return `${quoteOnlyNet >= 0n ? '+' : ''}${formatTokenAmount(quoteOnlyNet, 18)} stETH after quote`;
		}
		return 'Estimate unavailable';
	}
	function amountDescription(row: DisplayRow): string {
		if (row.estimate?.netEstimateStEth !== undefined) {
			return `Market ${formatTokenAmount(row.estimate.marketCostStEth ?? 0n,18,8)} stETH · gas ${formatTokenAmount(row.estimate.gasCostStEth ?? 0n,18,8)} stETH · block ${row.estimate.quoteBlock?.toLocaleString() ?? '—'}`;
		}
		if (row.estimate?.marketCostStEth !== undefined) return `Market quote ${formatTokenAmount(row.estimate.marketCostStEth,18,8)} stETH; gas unavailable`;
		if (row.estimate) return row.estimate.profitabilityNote ?? 'Market quote or gas estimate unavailable';
		if (requestedAmount !== undefined && requestedAmount > 0n && row.requestedAmount === undefined) return 'Max redeem is below this amount';
		if (row.requestedAmount !== undefined) return 'Compare this amount for market and gas estimates';
		return 'Enter an amount to compare';
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
	<div class="comparison-controls">
		<label for="compare-amount">Amount you want to redeem · boxETH</label>
		<div class="amount-entry"><input id="compare-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="off" placeholder="0.00" value={amountInput} oninput={(event) => editAmount(event.currentTarget.value)} disabled={isRunning || isRanking}/><button class="button" type="button" onclick={compareAmount} disabled={!discovery || isRunning || isRanking}>Find best for this amount</button></div>
		<small>Every target is compared at this exact amount. Targets whose Max redeem is lower are skipped. You can change the amount and compare the cached positions again.</small>
	</div>
	{#each ['v1','v1.1'] as version}
		{@const item = progress[version as CdpVersion]}
		{#if item}<div class="progress"><div><strong>{version}</strong><span>{item.status} · {item.candidateCount.toLocaleString()} historical addresses · {item.logsProcessed.toLocaleString()} logs this run</span></div><small>Block {item.nextBlock.toLocaleString()} / {item.throughBlock.toLocaleString()}</small><div class="track"><i style={`width:${item.throughBlock > item.fromBlock ? Math.max(0, Math.min(100, Number((item.nextBlock - item.fromBlock) * 10000n / (item.throughBlock - item.fromBlock + 1n)) / 100)) : 100}%`}></i></div>{#if item.message}<p class="progress-message" class:warning={item.status === 'paused' || item.status === 'error'} role={item.status === 'error' ? 'alert' : 'status'}>{item.message}</p>{/if}</div>{/if}
	{/each}
	{#if isRanking}<p class="ranking-status">Comparing {rankingProgress.completed.toLocaleString()} / {rankingProgress.total.toLocaleString()} targets for {comparisonAmount !== undefined ? formatTokenAmount(comparisonAmount,18,8) : amountInput} boxETH…</p>{/if}
	{#if discovery && discovery.failedReads > 0}<p class="warning" role="status">{discovery.failedReads.toLocaleString()} of {discovery.addressesChecked.toLocaleString()} position reads failed at the pinned block. Valid candidates remain available; repeat the scan after RPC rate limits clear to refresh the rest.</p>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	{#if comparisonAmount !== undefined && discovery && discovery.candidates.length > 0 && estimates.length === 0 && !isRanking}
		<p class="empty" role="status">No scanned target can handle {formatTokenAmount(comparisonAmount,18,8)} boxETH in one call. The contract caps each redemption at 25% of the target’s settled debt.</p>
	{/if}
	{#if discovery && discovery.candidates.length > 0 && !(comparisonAmount !== undefined && estimates.length === 0 && !isRanking)}
		<div class="table-wrap"><table><thead><tr>
			<th aria-sort={sortAria('target')}><button class="sort" type="button" onclick={() => toggleSort('target')}>CDP / target{sortIndicator('target')}</button></th>
			<th aria-sort={sortAria('debt')}><button class="sort" type="button" onclick={() => toggleSort('debt')}>Debt{sortIndicator('debt')}</button></th>
			<th aria-sort={sortAria('maxRedeem')}><button class="sort" type="button" onclick={() => toggleSort('maxRedeem')}>Max redeem{sortIndicator('maxRedeem')}</button></th>
			<th aria-sort={sortAria('frictionFee')}><button class="sort" type="button" onclick={() => toggleSort('frictionFee')}>Friction fee{sortIndicator('frictionFee')}</button></th>
			<th aria-sort={sortAria('totalBoxEth')}><button class="sort" type="button" onclick={() => toggleSort('totalBoxEth')}>Total boxETH{sortIndicator('totalBoxEth')}</button></th>
			<th aria-sort={sortAria('stEthOut')}><button class="sort" type="button" onclick={() => toggleSort('stEthOut')}>stETH out{sortIndicator('stEthOut')}</button></th>
			<th aria-sort={sortAria('best')}><button class="sort" type="button" onclick={() => toggleSort('best')}>Best return{sortIndicator('best')}</button></th>
			<th></th>
		</tr></thead><tbody>
			{#each rows as row (`${row.candidate.version}-${row.candidate.address}`)}
				<tr><td><strong>{row.candidate.version}</strong><a href={`https://etherscan.io/address/${row.candidate.address}`} target="_blank" rel="noreferrer">{shortenAddress(row.candidate.address)} ↗</a></td>
					<td>{formatTokenAmount(row.candidate.debt,18)}<small>boxETH</small></td>
					<td>{formatTokenAmount(row.candidate.maxRedeem,18)}<small>boxETH</small></td>
					<td>{row.frictionFee === undefined ? '—' : formatTokenAmount(row.frictionFee,18)}<small>{row.frictionFee === undefined ? 'enter an eligible amount' : 'boxETH'}</small></td>
					<td>{row.totalBoxEth === undefined ? '—' : formatTokenAmount(row.totalBoxEth,18)}<small>{row.totalBoxEth === undefined ? 'requested amount + fee' : 'boxETH spent'}</small></td>
					<td>{row.stEthOut === undefined ? '—' : formatTokenAmount(row.stEthOut,18)}<small>stETH received</small></td>
					<td><strong class:available={row.estimate?.profitability === 'estimated'}>{row.estimate ? estimateLabel(row.estimate) : row.requestedAmount !== undefined ? 'Ready to compare' : 'Not eligible'}</strong><small>{amountDescription(row)}</small></td>
					<td><button class="select" type="button" onclick={() => row.requestedAmount !== undefined && onSelect(row.candidate, row.requestedAmount)} disabled={row.requestedAmount === undefined || isRunning || isRanking}>Choose</button></td>
				</tr>
			{/each}
		</tbody></table></div>
	{:else if allSelectedComplete && discovery && !discovery.candidates.length && !isRanking}
		<p class="empty">{discovery.failedReads > 0 ? 'No active target was confirmed among the successful reads. Some positions could not be refreshed, so this is not a complete zero-position result.' : 'No active target positions were found in the scanned histories.'} You can still enter a target address below.</p>
	{/if}
	<p class="disclaimer">Rows include confirmed positions even when your wallet lacks boxETH. The CDP sends the same nominal amount of stETH that you redeem; Total boxETH includes the requested burn and friction fee. Best return uses the live quote and estimated redemption gas when available, otherwise it compares market quote only or the lower boxETH requirement. Choosing a target opens a fresh review before signing.</p>
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
	.comparison-controls { display:grid; gap:7px; border:1px solid var(--border); border-radius:5px; padding:11px; background:#101311; }
	.comparison-controls > label { color:var(--muted); font-size:.69rem; }
	.amount-entry { display:flex; gap:8px; }
	.amount-entry input { min-width:0; flex:1; min-height:40px; border:1px solid var(--border); border-radius:4px; padding:0 10px; background:#0d100e; color:var(--text); font-family:'DM Mono',monospace; font-size:.8rem; }
	.amount-entry input:focus { border-color:#4a9c76; outline:0; }
	.amount-entry .button { min-height:40px; padding:.45rem .75rem; font-size:.68rem; }
	.comparison-controls small { color:var(--dim); font-size:.62rem; line-height:1.45; }
	fieldset { display:flex; gap:15px; margin:0; border:1px solid var(--border); border-radius:5px; padding:7px 10px 9px; }
	legend { padding-inline:4px; color:var(--dim); font-size:.6rem; }
	fieldset label { display:flex; align-items:center; gap:5px; color:var(--muted); font-size:.68rem; cursor:pointer; }
	input[type=checkbox] { accent-color:var(--mint); }
	.buttons { display:flex; gap:7px; }
	.buttons .button { min-height:38px; padding:.5rem .75rem; font-size:.71rem; }
	.ranking-label { align-self:center; color:var(--muted); font-size:.68rem; }
	.progress { display:grid; gap:6px; border:1px solid var(--border); border-radius:5px; padding:10px; }
	.progress-message { margin:0; color:var(--muted); font-size:.64rem; line-height:1.45; }
	.progress > div:first-child { display:flex; justify-content:space-between; gap:1rem; color:var(--muted); font-size:.65rem; }
	.progress strong { color:var(--mint); } .progress small { color:var(--dim); font-family:'DM Mono',monospace; font-size:.59rem; }
	.track { height:4px; border-radius:4px; background:#252b28; overflow:hidden; } .track i { display:block; height:100%; background:var(--mint); }
	.ranking-status { margin:0; color:var(--muted); font-size:.68rem; }
	.table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:5px; }
	table { width:100%; border-collapse:collapse; min-width:1060px; font-size:.65rem; }
	th { padding:9px 8px; color:var(--dim); font-weight:500; text-align:left; background:#101311; }
	.sort { border:0; padding:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
	.sort:hover,.sort:focus-visible { color:var(--mint); }
	td { border-top:1px solid var(--border); padding:9px 8px; vertical-align:top; white-space:nowrap; }
	td:first-child { display:grid; gap:4px; } td:first-child a { color:var(--muted); font-family:'DM Mono',monospace; font-size:.61rem; text-decoration:none; }
	td strong { color:var(--text); font-weight:600; } td strong.available { color:var(--mint); }
	td small { display:block; margin-top:3px; color:var(--dim); font-size:.58rem; }
	.select { border:1px solid #315342; border-radius:4px; padding:6px 8px; background:#152019; color:var(--mint); font-size:.63rem; cursor:pointer; }
	.error { margin:0; color:var(--danger); font-size:.72rem; overflow-wrap:anywhere; }
	.warning { margin:0; border:1px solid #5a4b2c; border-radius:5px; padding:10px; background:#19160e; color:#c9bb91; font-size:.67rem; line-height:1.5; }
	@media(max-width:620px) { .header,.controls { align-items:flex-start; flex-direction:column; } .buttons { width:100%; } .buttons .button { flex:1; } .amount-entry { flex-direction:column; } .progress > div:first-child { flex-direction:column; gap:4px; } }
</style>
