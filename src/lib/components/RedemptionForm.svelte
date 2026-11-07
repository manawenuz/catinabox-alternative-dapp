<script lang="ts">
	import { formatUnits, isAddress, type Address, type Hash } from 'viem';
	import { ADDRESSES, CHAIN_ID, cdpAddress, type CdpVersion } from '#lib/chain/config.js';
	import { erc20Abi } from '#lib/chain/abis.js';
	import { publicClient } from '#lib/chain/clients.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { onDestroy } from 'svelte';
	import { formatTokenAmount, parseTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { executeRedemption, quoteStabilisePeg, readRedemptionCandidate, revokeRedemptionAllowance, type RedemptionProgress, type RedemptionReceipt } from '#lib/protocol/redemption.js';
	import type { Candidate, RedemptionEstimate } from '#lib/redemption/types.js';
	import TransactionStatus, { type TransactionPhase } from './TransactionStatus.svelte';

	type Selection = { candidate: Candidate; amount: bigint } | undefined;
	type Props = { version: CdpVersion; account?: Address; selection?: Selection; onComplete?: () => void | Promise<void> };
	let { version, account, selection, onComplete }: Props = $props();
	let targetInput = $state('');
	let amountInput = $state('');
	let estimate = $state<RedemptionEstimate | null>(null);
	let result = $state<RedemptionReceipt | null>(null);
	let phase = $state<TransactionPhase>('idle');
	let statusMessage = $state('');
	let transactionHash = $state<Hash>();
	let approvalHash = $state<Hash>();
	let allowanceAfter = $state<bigint>();
	let error = $state<string | null>(null);
	let busy = $state(false);
	let allowanceReadId = 0;
	const amount = $derived(parseTokenAmount(amountInput, 18));
	const target = $derived(isAddress(targetInput.trim()) ? targetInput.trim() as Address : undefined);
	const isThirdParty = $derived(Boolean(account && target && account.toLowerCase() !== target.toLowerCase()));
	const canSign = $derived(Boolean(account) && walletState.chainId === CHAIN_ID);

	$effect(() => {
		const currentAccount = account;
		const currentVersion = version;
		const requestId = ++allowanceReadId;
		estimate = null; result = null; phase = 'idle'; statusMessage = ''; error = null;
		transactionHash = undefined; approvalHash = undefined; allowanceAfter = undefined;
		if (!currentAccount) return;
		void publicClient.readContract({
			address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance',
			args: [currentAccount, cdpAddress(currentVersion)]
		}).then((allowance) => {
			if (requestId === allowanceReadId) allowanceAfter = allowance;
		}).catch(() => {
			if (requestId === allowanceReadId) allowanceAfter = undefined;
		});
		return () => { if (requestId === allowanceReadId) allowanceReadId += 1; };
	});
	$effect(() => {
		if (selection) {
			targetInput = selection.candidate.address;
			amountInput = formatUnits(selection.amount, 18);
			reset();
		}
	});
	$effect(() => {
		if (!targetInput && account) targetInput = account;
	});
	onDestroy(() => { allowanceReadId += 1; });

	function reset() { estimate = null; result = null; phase = 'idle'; statusMessage = ''; error = null; transactionHash = undefined; approvalHash = undefined; }
	function editTarget(value: string) { targetInput = value; reset(); }
	function editAmount(value: string) { amountInput = value; reset(); }
	async function setMax() {
		if (!target) { error = 'Enter a valid target address first.'; return; }
		busy = true; error = null;
		try {
			const candidate = await readRedemptionCandidate(version, target);
			amountInput = formatUnits(candidate.maxRedeem, 18); reset();
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to read the current target debt.'; }
		finally { busy = false; }
	}

	async function review() {
		reset();
		if (!target) { error = 'Enter a valid Ethereum target address.'; return; }
		if (amount === undefined || amount <= 0n) { error = 'Enter a valid positive boxETH amount.'; return; }
		busy = true;
		try {
			estimate = await quoteStabilisePeg(version, target, amount, account);
			allowanceAfter = estimate.boxEthAllowance;
			phase = 'review';
			statusMessage = `Target position refreshed at block ${estimate.candidate.snapshotBlock.toLocaleString()}.`;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to review this redemption.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}

	function onProgress(progress: RedemptionProgress) {
		phase = progress.phase; statusMessage = progress.message;
		if (progress.hash) {
			if (progress.phase === 'pending' && progress.message.toLowerCase().includes('approval')) approvalHash = progress.hash;
			else transactionHash = progress.hash;
		}
	}
	async function confirm() {
		if (!account || !target || !amount || !estimate) return;
		busy = true; error = null; result = null; transactionHash = undefined;
		try {
			const execution = await executeRedemption(version, amount, target, account, estimate, onProgress);
			if (execution.stage === 'approval-review') {
				approvalHash = execution.approvalHash;
				allowanceAfter = execution.allowanceAfter;
				estimate = execution.estimate;
				phase = 'review';
				statusMessage = 'Exact boxETH approval confirmed. The target, market quote, and gas estimate were refreshed. Review them and confirm redemption separately.';
				return;
			}
			result = execution;
			transactionHash = result.hash; allowanceAfter = result.allowanceAfter;
			estimate = null;
			phase = 'success'; statusMessage = 'The redemption transaction is confirmed. Actual event values and post-transaction position are shown below.';
			await onComplete?.();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The redemption could not be completed.';
			try { allowanceAfter = await publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdpAddress(version)] }); } catch { /* Keep the transaction error visible. */ }
			phase = 'error'; statusMessage = error;
		} finally { busy = false; }
	}
	async function revokeAllowance() {
		if (!account) return;
		busy = true; error = null;
		try { const hash = await revokeRedemptionAllowance(version, account); transactionHash = hash; allowanceAfter = 0n; estimate = null; phase = 'success'; statusMessage = 'boxETH allowance revoked.'; }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to revoke the boxETH allowance.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}
</script>

<section class="redemption panel">
	<header><div><p class="eyebrow">Peg stabilisation</p><h2>Redeem boxETH for stETH</h2></div><code>{shortenAddress(cdpAddress(version))}</code></header>
	<p class="description">Choose an active target in the selected CDP. The contract reduces that target’s debt and collateral by the amount processed, then transfers the same nominal amount of stETH to your wallet.</p>
	<div class="target-field"><label for="redeem-target">Target depositor</label><input id="redeem-target" type="text" spellcheck="false" autocomplete="off" placeholder="0x…" value={targetInput} oninput={(event) => editTarget(event.currentTarget.value)} disabled={busy}/>{#if isThirdParty}<p class="third-party"><strong>Permissionless redemption:</strong> you do not need this depositor’s approval. This redemption is expected to reduce {shortenAddress(target!)}’s CDP debt and collateral by the amount processed.</p>{:else if account && target}<p class="your-target">Using your own CDP as the target. Redemption is permissionless and reduces this position’s debt and collateral.</p>{/if}</div>
	<div class="amount-field"><label for="redeem-amount">Requested redemption · boxETH</label><div class="input-wrap"><input id="redeem-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" value={amountInput} oninput={(event) => editAmount(event.currentTarget.value)} disabled={busy}/><span>boxETH</span><button type="button" onclick={setMax} disabled={busy || !target}>MAX</button></div><small>The contract processes no more than 25% of the target’s current debt in one call.</small></div>
	<p class="warning"><strong>Allowance behavior:</strong> this CDP’s boxETH <code>burnFrom</code> can leave a residual allowance after redemption. When approval is needed, this interface requests only the exact amount required; existing and residual allowances remain until revoked.</p>
	{#if allowanceAfter !== undefined}<p class="allowance-note">Current allowance for this CDP: {formatTokenAmount(allowanceAfter,18,18)} boxETH.</p>{/if}
	{#if estimate}<div class="estimate panel"><div class="estimate-head"><p class="eyebrow">Fresh estimate</p><button class="link-button" type="button" onclick={review} disabled={busy}>Refresh</button></div>
		<div class="trade-summary" aria-label="Estimated redemption amount"><div><span>Total boxETH you spend</span><strong>{formatTokenAmount(estimate.totalBoxEth,18,8)} boxETH</strong><small>{formatTokenAmount(estimate.redeemAmount,18,8)} requested + {formatTokenAmount(estimate.frictionFee,18,8)} fee</small></div><span class="trade-arrow" aria-hidden="true">→</span><div><span>stETH you receive</span><strong>{formatTokenAmount(estimate.stEthOut,18,8)} stETH</strong><small>Expected transfer; not guaranteed by a minimum-output setting</small></div></div>
		<dl><div><dt>Target debt / collateral after settlement</dt><dd>{formatTokenAmount(estimate.candidate.debt,18,8)} / {formatTokenAmount(estimate.candidate.deposited,18,8)} boxETH / stETH</dd></div><div><dt>Maximum this call</dt><dd>{formatTokenAmount(estimate.candidate.maxRedeem,18,8)} boxETH</dd></div><div><dt>BoxETH burned</dt><dd>{formatTokenAmount(estimate.redeemAmount,18,8)} boxETH</dd></div><div><dt>Friction fee</dt><dd>{formatTokenAmount(estimate.frictionFee,18,8)} boxETH</dd></div>{#if estimate.psmRecipient}<div><dt>Live fee recipient (PSM)</dt><dd><a href={`https://etherscan.io/address/${estimate.psmRecipient}`} target="_blank" rel="noreferrer"><code>{estimate.psmRecipient}</code> ↗</a></dd></div>{/if}<div><dt>Total boxETH required</dt><dd>{formatTokenAmount(estimate.totalBoxEth,18,8)} boxETH</dd></div>{#if estimate.walletBoxEthBalance !== undefined}<div><dt>Wallet boxETH / current allowance</dt><dd>{formatTokenAmount(estimate.walletBoxEthBalance,18,8)} / {formatTokenAmount(estimate.boxEthAllowance ?? 0n,18,8)}</dd></div><div><dt>Exact approval needed</dt><dd>{(estimate.boxEthAllowance ?? 0n) < estimate.totalBoxEth ? `${formatTokenAmount(estimate.totalBoxEth,18,8)} boxETH` : 'None'}</dd></div>{/if}<div><dt>stETH transferred by CDP</dt><dd>{formatTokenAmount(estimate.stEthOut,18,8)} stETH</dd></div><div><dt>Target change if executed</dt><dd>−{formatTokenAmount(estimate.redeemAmount,18,8)} debt · −{formatTokenAmount(estimate.redeemAmount,18,8)} collateral</dd></div>{#if estimate.marketCostStEth !== undefined}<div><dt>Market cost for total boxETH</dt><dd>{formatTokenAmount(estimate.marketCostStEth,18,8)} stETH</dd></div><div><dt>Market route</dt><dd>{estimate.route?.map((address) => shortenAddress(address)).join(' → ')}</dd></div><div><dt>Quote impact vs spot incl. fees</dt><dd>{formatTokenAmount(estimate.priceImpactBps ?? 0n,2)}%</dd></div>{/if}{#if estimate.transactionGas !== undefined}<div><dt>Estimated stabilisePeg gas</dt><dd>{estimate.transactionGas.toLocaleString()}</dd></div>{/if}{#if estimate.gasCostStEth !== undefined}<div><dt>Estimated redemption gas cost</dt><dd>{formatTokenAmount(estimate.gasCostStEth,18,8)} stETH</dd></div>{/if}{#if estimate.netEstimateStEth !== undefined}<div><dt>Indicative net before swap gas</dt><dd class:positive={estimate.netEstimateStEth >= 0n}>{formatTokenAmount(estimate.netEstimateStEth,18,8)} stETH</dd></div>{/if}<div><dt>Position snapshot</dt><dd>Block {estimate.candidate.snapshotBlock.toLocaleString()}</dd></div></dl>
		<p class:good={estimate.profitability === 'estimated'} class="profit-note">{estimate.profitability === 'estimated' ? 'Includes the quoted boxETH acquisition cost and estimated redemption gas. Excludes gas for a separate transaction that acquires boxETH.' : `Profitability unavailable: ${estimate.profitabilityNote ?? 'required quote data is missing.'}`}</p>
		<p class="warning"><strong>No minimum output in contract:</strong> the call has no `minOut` argument. Target state, friction fee, quote, the mutable PSM recipient, and stETH transfer can change before inclusion. Review the wallet calldata and amount carefully.</p>
		<button class="button" type="button" onclick={confirm} disabled={busy || !canSign || (estimate.walletBoxEthBalance !== undefined && estimate.walletBoxEthBalance < estimate.totalBoxEth)}>{busy ? 'Waiting for wallet / receipt…' : 'Confirm redemption'}</button>
	</div>{:else}<button class="button" type="button" onclick={review} disabled={busy || !target || !amountInput}>{busy ? 'Reading target and market…' : 'Review redemption'}</button>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<TransactionStatus {phase} message={statusMessage} hash={transactionHash}/>
	{#if approvalHash}<p class="hashline">Approval transaction: <a href={`https://etherscan.io/tx/${approvalHash}`} target="_blank" rel="noreferrer">{shortenAddress(approvalHash)} ↗</a></p>{/if}
	{#if result}<div class="result panel"><p class="eyebrow">Actual receipt</p><dl><div><dt>Target in event</dt><dd><code>{result.actualTarget}</code></dd></div><div><dt>boxETH burned</dt><dd>{formatTokenAmount(result.boxEthBurned,18,18)}</dd></div><div><dt>Friction fee paid to PSM</dt><dd>{formatTokenAmount(result.frictionFeePaid,18,18)}</dd></div>{#if result.actualPsmRecipient}<div><dt>PSM recipient in boxETH transfer</dt><dd><a href={`https://etherscan.io/address/${result.actualPsmRecipient}`} target="_blank" rel="noreferrer"><code>{result.actualPsmRecipient}</code> ↗</a></dd></div>{/if}<div><dt>stETH transfer to wallet</dt><dd>{result.stEthTransferObserved ? formatTokenAmount(result.stEthTransferred,18,18) : "No matching stETH transfer event"}</dd></div><div><dt>Target debt / collateral after</dt><dd>{formatTokenAmount(result.positionAfter.debt,18,8)} / {formatTokenAmount(result.positionAfter.deposited,18,8)}</dd></div><div><dt>Gas used</dt><dd>{result.gasUsed.toLocaleString()}</dd></div><div><dt>boxETH allowance after</dt><dd>{formatTokenAmount(result.allowanceAfter,18,18)}</dd></div></dl></div>{/if}
	{#if allowanceAfter !== undefined && allowanceAfter > 0n}<div class="residual"><span>Remaining boxETH allowance: {formatTokenAmount(allowanceAfter,18,18)}</span><button class="button secondary" type="button" onclick={revokeAllowance} disabled={busy}>Revoke allowance</button></div>{/if}
</section>

<style>
	.redemption { display:grid; gap:16px; padding:20px; }
	header { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; }
	header h2 { margin:4px 0 0; font-size:1.14rem; letter-spacing:-.04em; } header code { color:var(--dim); font-size:.64rem; }
	.description { margin:-7px 0 0; color:var(--muted); font-size:.74rem; line-height:1.55; }
	.target-field,.amount-field { display:grid; gap:8px; } label { color:var(--muted); font-size:.69rem; }
	.target-field > input { width:100%; min-height:48px; border:1px solid var(--border); border-radius:5px; padding:0 12px; background:#0d100e; color:var(--text); font-family:'DM Mono',monospace; font-size:.78rem; }
	.target-field > input:focus { border-color:#4a9c76; outline:0; }
	.third-party,.your-target { margin:0; border-radius:5px; padding:9px 10px; font-size:.67rem; line-height:1.5; }
	.third-party { border:1px solid #5a4b2c; background:#19160e; color:#c9bb91; } .third-party strong { color:#f4d58c; }
	.your-target { border:1px solid #315342; background:#101914; color:var(--muted); }
	.input-wrap { display:flex; min-height:54px; align-items:center; gap:9px; border:1px solid var(--border); border-radius:5px; padding:0 9px 0 13px; background:#0d100e; }
	.input-wrap:focus-within { border-color:#4a9c76; } .input-wrap input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--text); font-size:1rem; font-weight:700; } .input-wrap span { color:var(--muted); font-size:.72rem; }
	.input-wrap button,.link-button { border:1px solid #315342; border-radius:3px; padding:6px 7px; background:#152019; color:var(--mint); font-family:'DM Mono',monospace; font-size:.62rem; cursor:pointer; } .link-button { border:0; background:transparent; font-family:inherit; }
	.amount-field small { color:var(--dim); font-size:.65rem; }
	.estimate,.result { display:grid; gap:12px; padding:14px; }
	.estimate-head { display:flex; align-items:center; justify-content:space-between; } .estimate-head .eyebrow { margin:0; }
	.trade-summary { display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:12px; border:1px solid #315342; border-radius:5px; padding:13px; background:#101914; }
	.trade-summary > div { display:grid; gap:4px; }
	.trade-summary span { color:var(--muted); font-size:.66rem; }
	.trade-summary strong { color:var(--mint); font-family:'DM Mono',monospace; font-size:.9rem; }
	.trade-summary small { color:var(--dim); font-size:.59rem; line-height:1.45; }
	.trade-summary .trade-arrow { color:var(--mint); font-size:1rem; }
	dl { display:grid; gap:8px; margin:0; } dl div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:7px; font-size:.66rem; } dt { color:var(--dim); } dd { margin:0; text-align:right; overflow-wrap:anywhere; } dd code { font-size:.61rem; }
	.profit-note,.warning { margin:0; border:1px solid #5a4b2c; border-radius:5px; padding:10px; background:#19160e; color:#c9bb91; font-size:.67rem; line-height:1.55; overflow-wrap:anywhere; } .profit-note.good { border-color:#315342; background:#101914; color:var(--mint); }
	.warning strong { color:#f4d58c; } .positive { color:var(--mint); }
	.result > .eyebrow { margin:0; } .result dl { margin-top:1px; }
	.error { margin:0; color:var(--danger); font-size:.74rem; overflow-wrap:anywhere; }
	.hashline { margin:0; color:var(--dim); font-size:.68rem; } .hashline a,.estimate a,.result a { color:var(--mint); text-decoration:none; } .estimate dd code,.result dd code { overflow-wrap:anywhere; font-size:.6rem; }
	.allowance-note { margin:0; color:var(--muted); font-size:.67rem; }
	.residual { display:flex; align-items:center; justify-content:space-between; gap:1rem; border:1px solid #5a4b2c; border-radius:5px; padding:10px; color:#f4d58c; font-size:.67rem; } .residual .button { min-height:34px; padding:.4rem .6rem; font-size:.67rem; }
	@media(max-width:600px) { .redemption { padding:15px; } header { flex-direction:column; } .trade-summary { grid-template-columns:1fr; } .trade-summary .trade-arrow { display:none; } dl div { align-items:flex-start; flex-direction:column; gap:4px; } dd { text-align:left; } }
</style>
