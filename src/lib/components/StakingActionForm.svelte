<script lang="ts">
	import { type Address, type Hash } from 'viem';
	import { ADDRESSES, CHAIN_ID } from '#lib/chain/config.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { formatTokenAmount, parseTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { readStakingState, revokeStakingAllowance, simulateStakingAction, writeStakingAction, type StakingAction, type StakingProgress, type StakingState } from '#lib/protocol/staking.js';
	import TransactionStatus, { type TransactionPhase } from './TransactionStatus.svelte';

	type Props = { account?: Address; onComplete?: () => void | Promise<void> };
	let { account, onComplete }: Props = $props();
	let action = $state<StakingAction>('stake');
	let amountInput = $state('');
	let state = $state<StakingState | null>(null);
	let loading = $state(true);
	let review = $state<{ amount?: bigint; max: bigint; allowanceNeeded: bigint; block: bigint } | null>(null);
	let phase = $state<TransactionPhase>('idle');
	let statusMessage = $state('');
	let transactionHash = $state<Hash>();
	let approvalHash = $state<Hash>();
	let error = $state<string | null>(null);
	let busy = $state(false);
	const boxFeeDecimals = $derived(state?.boxFeeDecimals ?? 18);
	const boxEthDecimals = $derived(state?.boxEthDecimals ?? 18);
	const amount = $derived(parseTokenAmount(amountInput, boxFeeDecimals));
	const canSign = $derived(Boolean(account) && walletState.chainId === CHAIN_ID);

	async function refresh(wallet?: Address) {
		if (!wallet) { state = null; loading = false; return; }
		loading = true;
		try { state = await readStakingState(wallet); error = null; }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to read staking state.'; }
		finally { loading = false; }
	}
	$effect(() => { const wallet = account; void refresh(wallet); });

	const maxAmount = $derived(!state ? 0n : action === 'stake' ? state.boxFeeBalance : action === 'unstake' ? state.stakedBoxFee : 0n);
	function reset() { review = null; phase = 'idle'; statusMessage = ''; error = null; }
	function setAction(next: StakingAction) { action = next; amountInput = ''; reset(); }
	function setMax() { amountInput = formatTokenAmount(maxAmount, boxFeeDecimals, boxFeeDecimals); reset(); }

	async function prepare() {
		reset();
		if (!account) { error = 'Connect a wallet before reviewing a staking transaction.'; return; }
		if (walletState.chainId !== CHAIN_ID) { error = 'Switch the connected wallet to Ethereum mainnet first.'; return; }
		if (action !== 'claim' && (amount === undefined || amount <= 0n)) { error = 'Enter a valid positive boxFEE amount.'; return; }
		busy = true;
		try {
			const fresh = await readStakingState(account);
			state = fresh;
			const max = action === 'stake' ? fresh.boxFeeBalance : action === 'unstake' ? fresh.stakedBoxFee : fresh.pendingBoxEth;
			if (action !== 'claim' && amount! > max) throw new Error(`The current maximum is ${formatTokenAmount(max, fresh.boxFeeDecimals)} boxFEE.`);
			const allowanceNeeded = action === 'stake' && amount! > fresh.boxFeeAllowance ? amount! : 0n;
			review = { amount: action === 'claim' ? undefined : amount, max, allowanceNeeded, block: fresh.blockNumber };
			if (action !== 'stake' || allowanceNeeded === 0n) {
				await simulateStakingAction(action, action === 'claim' ? undefined : amount, account);
			}
			phase = 'review';
			statusMessage = action === 'claim'
				? `Claim uses poke(account). The displayed ${formatTokenAmount(fresh.pendingBoxEth, fresh.boxEthDecimals)} boxETH is already-accounted owing; poke also syncs new rewards before claiming.`
				: allowanceNeeded > 0n ? 'An exact boxFEE approval is needed before the stake call is simulated.' : `Simulation passed at block ${fresh.blockNumber.toLocaleString()}.`;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to prepare this staking transaction.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}

	function onProgress(progress: StakingProgress) {
		phase = progress.phase; statusMessage = progress.message;
		if (progress.hash) {
			if (progress.phase === 'pending' && progress.message.includes('approval')) approvalHash = progress.hash;
			else transactionHash = progress.hash;
		}
	}
	async function confirm() {
		if (!account || !review) return;
		busy = true; error = null; approvalHash = undefined; transactionHash = undefined;
		try {
			const result = await writeStakingAction(action, review.amount, account, onProgress);
			transactionHash = result.hash; approvalHash = result.approvalHash;
			phase = 'success'; statusMessage = action === 'claim' ? 'boxETH rewards claimed through poke.' : `${action} transaction confirmed.`;
			review = null;
			await refresh(account); await onComplete?.();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The staking transaction could not be completed.';
			try { await refresh(account); } catch { /* Preserve the action error. */ }
			phase = 'error'; statusMessage = error;
		} finally { busy = false; }
	}
	async function revoke() {
		if (!account) return;
		busy = true;
		try { const hash = await revokeStakingAllowance(account); transactionHash = hash; phase = 'success'; statusMessage = 'boxFEE staking allowance revoked.'; await refresh(account); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to revoke staking allowance.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}
</script>

<section class="staking panel">
	<header><div><p class="eyebrow">Fee staking · boxFEE collateral</p><h2>Earn boxETH rewards</h2></div><code>{shortenAddress(ADDRESSES.feeStaking)}</code></header>
	<p class="description">The staking contract pays rewards in boxETH. This reward accounting is separate from yield accrued by a CDP position.</p>
	<div class="rewards panel"><div><span>Staked boxFEE</span><strong>{state ? formatTokenAmount(state.stakedBoxFee, state.boxFeeDecimals) : loading ? 'Reading…' : '—'}</strong></div><div><span>Owing boxETH</span><strong>{state ? formatTokenAmount(state.pendingBoxEth, state.boxEthDecimals) : '—'}</strong></div><div><span>Contract unclaimed</span><strong>{state ? formatTokenAmount(state.unclaimedBoxEth, state.boxEthDecimals) : '—'}</strong></div><div><span>Total staked</span><strong>{state ? formatTokenAmount(state.totalStaked, state.boxFeeDecimals) : '—'}</strong></div></div>
	<div class="tabs" role="tablist" aria-label="Fee staking actions">{#each ['stake','unstake','claim'] as choice}<button type="button" role="tab" aria-selected={action === choice} class:active={action === choice} onclick={() => setAction(choice as StakingAction)}>{choice[0].toUpperCase() + choice.slice(1)}</button>{/each}</div>
	{#if action !== 'claim'}<div class="field"><label for="stake-amount">Amount · boxFEE</label><div class="input-wrap"><input id="stake-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" bind:value={amountInput} oninput={reset} disabled={busy}/><span>boxFEE</span><button type="button" onclick={setMax} disabled={!state || busy}>MAX</button></div><small>Available: {formatTokenAmount(maxAmount, boxFeeDecimals)} boxFEE</small></div>{:else}<div class="claim-note"><strong>{state ? formatTokenAmount(state.pendingBoxEth, boxEthDecimals) : '—'} boxETH currently owed</strong><span>Claim calls <code>poke(wallet)</code>. The contract syncs any new rewards before paying your accrued balance.</span></div>{/if}
	{#if review}<div class="review panel"><p class="eyebrow">Transaction review</p><dl><div><dt>Method</dt><dd><code>{action === 'claim' ? 'poke(wallet)' : `${action === 'stake' ? 'deposit' : 'withdraw'}(amount)`}</code></dd></div><div><dt>Contract</dt><dd><code>{ADDRESSES.feeStaking}</code></dd></div>{#if review.amount !== undefined}<div><dt>Amount</dt><dd>{formatTokenAmount(review.amount, boxFeeDecimals, boxFeeDecimals)} boxFEE</dd></div>{/if}{#if action === 'claim'}<div><dt>Current owed</dt><dd>{formatTokenAmount(review.max, boxEthDecimals, boxEthDecimals)} boxETH</dd></div>{/if}{#if review.allowanceNeeded}<div><dt>Separate approval</dt><dd>{formatTokenAmount(review.allowanceNeeded, boxFeeDecimals, boxFeeDecimals)} boxFEE</dd></div>{/if}<div><dt>Preview block</dt><dd>{review.block.toLocaleString()}</dd></div></dl><p class="fine">Reward totals may change before execution. A claim can include recently synced rewards not present in the displayed owing amount.</p><button class="button" type="button" onclick={confirm} disabled={busy || !canSign}>{busy ? 'Waiting…' : `Confirm ${action}`}</button></div>{:else}<button class="button" type="button" onclick={prepare} disabled={busy || !account || walletState.chainId !== CHAIN_ID || (action !== 'claim' && !amountInput)}>{busy ? 'Reading current state…' : `Review ${action}`}</button>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<TransactionStatus {phase} message={statusMessage} hash={transactionHash}/>
	{#if approvalHash}<p class="hashline">Approval: <a href={`https://etherscan.io/tx/${approvalHash}`} target="_blank" rel="noreferrer">{shortenAddress(approvalHash)} ↗</a></p>{/if}
	{#if state && state.boxFeeAllowance > 0n && action === 'stake'}<div class="allowance"><span>Current boxFEE allowance: {formatTokenAmount(state.boxFeeAllowance, boxFeeDecimals, boxFeeDecimals)}</span><button class="button secondary" type="button" onclick={revoke} disabled={busy}>Revoke</button></div>{/if}
</section>

<style>
	.staking { display:grid; gap:16px; padding:20px; }
	header { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
	header h2 { margin:4px 0 0; font-size:1.14rem; letter-spacing:-.04em; }
	header code { color:var(--dim); font-size:.64rem; }
	.description { margin:-7px 0 0; color:var(--muted); font-size:.74rem; line-height:1.55; }
	.rewards { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; padding:11px; }
	.rewards div { display:grid; gap:5px; min-width:0; }
	.rewards span { color:var(--dim); font-size:.6rem; }
	.rewards strong { color:var(--text); font-family:'DM Mono',monospace; font-size:.72rem; overflow-wrap:anywhere; }
	.tabs { display:flex; border-bottom:1px solid var(--border); }
	.tabs button { border:0; border-bottom:2px solid transparent; padding:10px 14px; background:transparent; color:var(--dim); font-size:.72rem; font-weight:700; cursor:pointer; }
	.tabs button.active { border-color:var(--mint); color:var(--mint); }
	.field { display:grid; gap:8px; } .field label,.field small { color:var(--muted); font-size:.69rem; } .field small { color:var(--dim); }
	.input-wrap { display:flex; min-height:54px; align-items:center; gap:9px; border:1px solid var(--border); border-radius:5px; padding:0 9px 0 13px; background:#0d100e; }
	.input-wrap:focus-within { border-color:#4a9c76; } .input-wrap input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--text); font-size:1rem; font-weight:700; } .input-wrap span { color:var(--muted); font-size:.72rem; }
	.input-wrap button { border:1px solid #315342; border-radius:3px; padding:6px 7px; background:#152019; color:var(--mint); font-family:'DM Mono',monospace; font-size:.62rem; cursor:pointer; }
	.claim-note,.fine { border:1px solid #315342; border-radius:5px; padding:11px; background:#101914; color:var(--muted); font-size:.7rem; line-height:1.55; } .claim-note { display:grid; gap:5px; } .claim-note strong { color:var(--mint); } .claim-note code { color:var(--text); }
	.review { display:grid; gap:12px; padding:14px; } .review > .eyebrow { margin:0; }
	dl { display:grid; gap:8px; margin:0; } dl div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:7px; font-size:.67rem; } dt { color:var(--dim); } dd { margin:0; text-align:right; overflow-wrap:anywhere; } dd code { font-size:.62rem; }
	.fine { margin:0; border-color:var(--border); background:transparent; font-size:.67rem; }
	.error { margin:0; color:var(--danger); font-size:.75rem; overflow-wrap:anywhere; } .hashline { margin:0; color:var(--dim); font-size:.68rem; } .hashline a { color:var(--mint); }
	.allowance { display:flex; align-items:center; justify-content:space-between; gap:1rem; border:1px solid #5a4b2c; border-radius:5px; padding:10px; color:#f4d58c; font-size:.67rem; } .allowance .button { min-height:34px; padding:.4rem .6rem; font-size:.67rem; }
	@media(max-width:620px) { .staking { padding:15px; } header { flex-direction:column; } .rewards { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
