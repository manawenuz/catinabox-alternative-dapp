<script lang="ts">
	import { formatUnits, type Address, type Hash } from 'viem';
	import { ADDRESSES, CHAIN_ID } from '#lib/chain/config.js';
	import { boxFeeAbi } from '#lib/chain/abis.js';
	import { publicClient } from '#lib/chain/clients.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import { formatTokenAmount, parseTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { readBoxFeeState, revokeBoxFeeAllowance, simulateBoxFeeAction, writeBoxFeeAction, type BoxFeeAction, type BoxFeeProgress, type BoxFeeState } from '#lib/protocol/boxfee.js';
	import TransactionStatus, { type TransactionPhase } from './TransactionStatus.svelte';

	type Props = { account?: Address; onComplete?: () => void | Promise<void> };
	let { account, onComplete }: Props = $props();
	const choices: { id: BoxFeeAction; label: string; token: string }[] = [
		{ id: 'deposit', label: 'Mint', token: 'boxETH' },
		{ id: 'redeem', label: 'Burn', token: 'boxFEE' }
	];
	let action = $state<BoxFeeAction>('deposit');
	let amountInput = $state('');
	let state = $state<BoxFeeState | null>(null);
	let loading = $state(true);
	let preview = $state<{ amount: bigint; max: bigint; boxEthAmount: bigint; shareAmount: bigint; approvalNeeded: bigint; gas?: bigint; block: bigint } | null>(null);
	let liveRedeemEstimate = $state<{ shares: bigint; assets: bigint; block: bigint } | undefined>();
	let liveEstimateStatus = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let liveEstimateTimer: ReturnType<typeof setTimeout> | undefined;
	let liveEstimateRequest = 0;
	let phase = $state<TransactionPhase>('idle');
	let statusMessage = $state('');
	let transactionHash = $state<Hash>();
	let approvalHash = $state<Hash>();
	let allowanceAfter = $state<bigint>();
	let error = $state<string | null>(null);
	let busy = $state(false);
	const selected = $derived(choices.find((choice) => choice.id === action)!);
	const inputDecimals = $derived(selected.token === 'boxETH' ? state?.assetDecimals ?? 18 : state?.tokenDecimals ?? 18);
	const amount = $derived(parseTokenAmount(amountInput, inputDecimals));
	const amountExceedsAvailable = $derived(Boolean(state && amount !== undefined && amount > maxAmount(state)));
	const methodSignature = $derived(action === 'deposit' ? 'deposit(assets, receiver)' : action === 'mint' ? 'mint(shares, receiver)' : action === 'withdraw' ? 'withdraw(assets, receiver, owner)' : 'redeem(shares, receiver, owner)');
	const canSign = $derived(Boolean(account) && walletState.chainId === CHAIN_ID);
	$effect(() => { const wallet = account; void refreshFor(wallet); });
	async function refreshFor(wallet?: Address) {
		if (!wallet) { clearLiveRedeemEstimate(); state = null; loading = false; return; }
		loading = true;
		try { state = await readBoxFeeState(wallet); error = null; scheduleLiveRedeemEstimate(); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to read boxFEE vault state.'; }
		finally { loading = false; }
	}

	function maxAmount(source: BoxFeeState): bigint {
		if (action === 'deposit') return source.boxEthBalance;
		if (action === 'mint') return source.boxEthBalance;
		if (action === 'redeem') return source.balance;
		return source.assetsPerShare * source.balance / (10n ** BigInt(source.tokenDecimals));
	}

	function reset() { preview = null; phase = 'idle'; statusMessage = ''; error = null; }
	function clearLiveRedeemEstimate() {
		if (liveEstimateTimer) clearTimeout(liveEstimateTimer);
		liveEstimateTimer = undefined;
		liveEstimateRequest += 1;
		liveRedeemEstimate = undefined;
		liveEstimateStatus = 'idle';
	}
	function scheduleLiveRedeemEstimate(value = amountInput) {
		clearLiveRedeemEstimate();
		if (action !== 'redeem' || !state) return;
		const shares = parseTokenAmount(value, state.tokenDecimals);
		if (shares === undefined || shares <= 0n) return;
		const block = state.blockNumber;
		const request = liveEstimateRequest;
		liveEstimateStatus = 'loading';
		liveEstimateTimer = setTimeout(() => {
			void publicClient.readContract({
				address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'previewRedeem', args: [shares], blockNumber: block
			}).then((assets) => {
				if (request !== liveEstimateRequest) return;
				liveRedeemEstimate = { shares, assets, block };
				liveEstimateStatus = 'ready';
			}).catch(() => {
				if (request !== liveEstimateRequest) return;
				liveEstimateStatus = 'error';
			});
		}, 250);
	}
	function updateAmount(value: string) { amountInput = value; reset(); scheduleLiveRedeemEstimate(value); }
	function changeAction(next: BoxFeeAction) { clearLiveRedeemEstimate(); action = next; amountInput = ''; reset(); }
	function setMax() { if (!state) return; amountInput = formatUnits(maxAmount(state), inputDecimals); reset(); scheduleLiveRedeemEstimate(); }

	async function review() {
		reset();
		if (!account) { error = 'Connect a wallet before reviewing a vault transaction.'; return; }
		if (walletState.chainId !== CHAIN_ID) { error = 'Switch the connected wallet to Ethereum mainnet first.'; return; }
		if (amount === undefined || amount <= 0n) { error = 'Enter a valid positive amount.'; return; }
		busy = true;
		try {
			const fresh = await readBoxFeeState(account);
			state = fresh;
			const max = maxAmount(fresh);
			if (amount > max) throw new Error(`The current maximum is ${formatTokenAmount(max, selected.token === 'boxETH' ? fresh.assetDecimals : fresh.tokenDecimals)} ${selected.token}.`);
			let boxEthAmount = 0n;
			let shareAmount = 0n;
			let approvalNeeded = 0n;
			if (action === 'deposit' || action === 'mint') {
				// The deployed deposit/mint methods transfer and issue the same nominal amount.
				boxEthAmount = amount;
				shareAmount = amount;
				if (fresh.allowance < amount) approvalNeeded = amount;
			} else if (action === 'withdraw') {
				boxEthAmount = amount;
				shareAmount = await publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'previewWithdraw', args: [amount], blockNumber: fresh.blockNumber });
			} else {
				shareAmount = amount;
				boxEthAmount = await publicClient.readContract({ address: ADDRESSES.boxFee, abi: boxFeeAbi, functionName: 'previewRedeem', args: [amount], blockNumber: fresh.blockNumber });
			}
			let gas: bigint | undefined;
			if (!approvalNeeded) gas = (await simulateBoxFeeAction(action, amount, account)).gasEstimate;
			preview = { amount, max, boxEthAmount, shareAmount, approvalNeeded, gas, block: fresh.blockNumber };
			phase = 'review';
			statusMessage = approvalNeeded > 0n ? 'An exact boxETH approval is needed. The vault call will be simulated after approval.' : `Simulation passed at block ${fresh.blockNumber.toLocaleString()}.`;
		} catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to prepare this vault transaction.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}

	function onProgress(progress: BoxFeeProgress) {
		phase = progress.phase;
		statusMessage = progress.message;
		if (progress.hash) {
			if (progress.phase === 'pending' && progress.message.includes('approval')) approvalHash = progress.hash;
			else transactionHash = progress.hash;
		}
	}

	async function confirm() {
		if (!account || !preview) return;
		busy = true; error = null; transactionHash = undefined; approvalHash = undefined; allowanceAfter = undefined;
		try {
			const result = await writeBoxFeeAction(action, preview.amount, account, onProgress);
			transactionHash = result.hash; approvalHash = result.approvalHash; allowanceAfter = result.allowanceAfter;
			phase = 'success'; statusMessage = `${selected.label} transaction confirmed.`;
			preview = null;
			await refreshFor(account); await onComplete?.();
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'The vault transaction could not be completed.';
			try { const latest = await readBoxFeeState(account); state = latest; allowanceAfter = latest.allowance; } catch { /* Keep the transaction error visible. */ }
			phase = 'error'; statusMessage = error;
		} finally { busy = false; }
	}

	async function revoke() {
		if (!account) return;
		busy = true; error = null;
		try { const hash = await revokeBoxFeeAllowance(account); transactionHash = hash; allowanceAfter = 0n; phase = 'success'; statusMessage = 'boxETH allowance revoked.'; await refreshFor(account); }
		catch (cause) { error = cause instanceof Error ? cause.message : 'Unable to revoke the allowance.'; phase = 'error'; statusMessage = error; }
		finally { busy = false; }
	}
</script>

<section class="vault panel">
	<header class="heading"><div><p class="eyebrow">boxFEE vault</p><h2>Convert boxETH and boxFEE</h2></div><code>{shortenAddress(ADDRESSES.boxFee)}</code></header>
	<p class="description">Mint boxFEE with boxETH through the deployed 1:1 entrypoint, or burn boxFEE for boxETH using the vault’s current asset/share conversion. This backing value can differ from the market price.</p>
	<div class="conversion panel"><span>1 boxFEE converts to</span><strong>{state ? formatTokenAmount(state.assetsPerShare, state.assetDecimals, 8) : '—'} boxETH</strong><small>convertToAssets · block {state?.blockNumber.toLocaleString() ?? '—'}</small></div>
	<div class="tabs" role="tablist" aria-label="boxFEE actions">
		{#each choices as choice (choice.id)}<button type="button" role="tab" aria-selected={action === choice.id} class:active={action === choice.id} onclick={() => changeAction(choice.id)}>{choice.label}</button>{/each}
	</div>
	<div class="balances"><span>boxETH wallet <strong>{state ? formatTokenAmount(state.boxEthBalance, state.assetDecimals) : loading ? 'Reading…' : '—'}</strong></span><span>boxFEE wallet <strong>{state ? formatTokenAmount(state.balance, state.tokenDecimals) : loading ? 'Reading…' : '—'}</strong></span><span>Vault assets / supply <strong>{state ? `${formatTokenAmount(state.totalAssets, state.assetDecimals)} / ${formatTokenAmount(state.totalSupply, state.tokenDecimals)}` : '—'}</strong></span></div>
	<div class="field"><label for="boxfee-amount">{action === 'mint' || action === 'redeem' ? 'boxFEE shares' : 'boxETH assets'}</label><div class="input-wrap"><input id="boxfee-amount" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="0.00" value={amountInput} oninput={(event) => updateAmount(event.currentTarget.value)} disabled={busy}/><span>{selected.token}</span><button type="button" onclick={setMax} disabled={!state || busy}>MAX</button></div><small>Available for this action: {state ? formatTokenAmount(maxAmount(state), inputDecimals) : '—'} {selected.token}</small></div>
		{#if action === 'redeem' && amountInput.trim()}<div class="live-estimate" aria-live="polite"><div><span>Estimated receive</span>{#if liveEstimateStatus === 'ready' && liveRedeemEstimate && liveRedeemEstimate.shares === amount}<strong>{formatTokenAmount(liveRedeemEstimate.assets, state?.assetDecimals ?? 18, 12)} boxETH</strong>{:else if liveEstimateStatus === 'loading'}<strong class="estimate-muted">Updating…</strong>{:else if liveEstimateStatus === 'error'}<strong class="estimate-muted">Unavailable</strong>{:else}<strong>—</strong>{/if}</div>{#if liveEstimateStatus === 'ready' && liveRedeemEstimate && liveRedeemEstimate.shares === amount}<small>previewRedeem · block {liveRedeemEstimate.block.toLocaleString()}</small>{:else if liveEstimateStatus === 'error'}<small>Could not reach the vault preview. Review will refresh the quote.</small>{/if}{#if amountExceedsAvailable}<small class="amount-warning">This exceeds your wallet balance of {state ? formatTokenAmount(state.balance, state.tokenDecimals, 8) : '—'} boxFEE; the estimate is informational only.</small>{/if}</div>{/if}
	{#if action === 'deposit'}<p class="note">Mint uses the deployed <code>deposit(assets, receiver)</code> entrypoint and issues the same nominal amount of boxFEE.</p>{/if}
		{#if preview}<div class="review panel"><div class="review-head"><p class="eyebrow">Transaction review</p><button class="link-button" onclick={reset} type="button">Edit</button></div><dl><div><dt>Contract method</dt><dd><code>{methodSignature}</code></dd></div><div><dt>BoxETH {action === 'deposit' || action === 'mint' ? 'to deposit' : 'to receive'}</dt><dd>{formatTokenAmount(preview.boxEthAmount, state?.assetDecimals ?? 18, 12)} boxETH</dd></div><div><dt>BoxFEE {action === 'deposit' || action === 'mint' ? 'to issue' : 'to burn'}</dt><dd>{formatTokenAmount(preview.shareAmount, state?.tokenDecimals ?? 18, 12)} boxFEE</dd></div>{#if preview.approvalNeeded}<div><dt>Separate approval</dt><dd>{formatTokenAmount(preview.approvalNeeded, state?.assetDecimals ?? 18, 8)} boxETH</dd></div>{/if}{#if preview.gas}<div><dt>Estimated gas</dt><dd>{preview.gas.toLocaleString()}</dd></div>{/if}<div><dt>Preview block</dt><dd>{preview.block.toLocaleString()}</dd></div></dl><p class="note">Market value and vault redemption value can differ. State may change before inclusion.</p><button class="button" type="button" onclick={confirm} disabled={busy || !canSign}>{busy ? 'Waiting…' : `Confirm ${selected.label.toLowerCase()}`}</button></div>{:else}<button class="button" type="button" onclick={review} disabled={busy || !account || walletState.chainId !== CHAIN_ID || !amountInput || amountExceedsAvailable}>{busy ? 'Reading current state…' : `Review ${selected.label.toLowerCase()}`}</button>{/if}
	{#if error}<p class="error" role="alert">{error}</p>{/if}
	<TransactionStatus {phase} message={statusMessage} hash={transactionHash}/>
	{#if approvalHash}<p class="hashline">Approval: <a href={`https://etherscan.io/tx/${approvalHash}`} target="_blank" rel="noreferrer">{shortenAddress(approvalHash)} ↗</a></p>{/if}
	{#if allowanceAfter && allowanceAfter > 0n}<div class="residual"><span>Remaining boxETH allowance: {formatTokenAmount(allowanceAfter, state?.assetDecimals ?? 18, 8)}</span><button class="button secondary" type="button" onclick={revoke} disabled={busy}>Revoke</button></div>{/if}
</section>

<style>
	.vault { display:grid; gap:16px; padding:20px; }
	.heading,.review-head { display:flex; align-items:flex-start; justify-content:space-between; gap:1rem; }
	.heading h2 { margin:4px 0 0; font-size:1.14rem; letter-spacing:-.04em; }
	.heading code { color:var(--dim); font-size:.64rem; }
	.description,.note { margin:-7px 0 0; color:var(--muted); font-size:.74rem; line-height:1.55; }
	.conversion { display:grid; gap:4px; padding:13px; }
	.conversion span,.conversion small { color:var(--dim); font-size:.65rem; }
	.conversion strong { color:var(--mint); font-family:'DM Mono',monospace; font-size:1.05rem; }
	.live-estimate { display:grid; gap:5px; border:1px solid var(--border); border-radius:5px; padding:10px 12px; background:#0d100e; }
	.live-estimate > div { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; }
	.live-estimate span,.live-estimate small { color:var(--muted); font-size:.68rem; }
	.live-estimate strong { color:var(--mint); font-family:'DM Mono',monospace; font-size:.84rem; text-align:right; }
	.live-estimate .estimate-muted { color:var(--dim); font-family:inherit; font-weight:500; }
	.live-estimate .amount-warning { color:#f4d58c; }
	.tabs { display:flex; overflow-x:auto; border-bottom:1px solid var(--border); }
	.tabs button { border:0; border-bottom:2px solid transparent; padding:10px 13px; background:transparent; color:var(--dim); font-size:.72rem; font-weight:700; cursor:pointer; }
	.tabs button.active { border-color:var(--mint); color:var(--mint); }
	.balances { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; }
	.balances span { display:grid; gap:5px; border:1px solid var(--border); border-radius:5px; padding:10px; color:var(--dim); font-size:.62rem; }
	.balances strong { color:var(--text); font-family:'DM Mono',monospace; font-size:.7rem; font-weight:500; overflow-wrap:anywhere; }
	.field { display:grid; gap:8px; }
	.field label,.field small { color:var(--muted); font-size:.69rem; }
	.field small { color:var(--dim); }
	.input-wrap { display:flex; min-height:54px; align-items:center; gap:9px; border:1px solid var(--border); border-radius:5px; padding:0 9px 0 13px; background:#0d100e; }
	.input-wrap:focus-within { border-color:#4a9c76; }
	.input-wrap input { min-width:0; flex:1; border:0; outline:0; background:transparent; color:var(--text); font-size:1rem; font-weight:700; }
	.input-wrap span { color:var(--muted); font-size:.72rem; }
	.input-wrap button,.link-button { border:1px solid #315342; border-radius:3px; padding:6px 7px; background:#152019; color:var(--mint); font-family:'DM Mono',monospace; font-size:.62rem; cursor:pointer; }
	.link-button { border:0; background:transparent; font-family:inherit; }
	.note { border:1px solid #5a4b2c; border-radius:5px; padding:10px; background:#19160e; color:#c9bb91; }
	.note code { color:#f4d58c; }
	.review { display:grid; gap:12px; padding:14px; }
	.review-head .eyebrow { margin-top:3px; }
	dl { display:grid; gap:8px; margin:0; }
	dl div { display:flex; justify-content:space-between; gap:1rem; border-bottom:1px solid var(--border); padding-bottom:7px; font-size:.67rem; }
	dt { color:var(--dim); } dd { margin:0; color:var(--text); text-align:right; overflow-wrap:anywhere; } dd code { font-size:.62rem; }
	.error { margin:0; color:var(--danger); font-size:.75rem; overflow-wrap:anywhere; }
	.hashline { margin:0; color:var(--dim); font-size:.68rem; } .hashline a { color:var(--mint); }
	.residual { display:flex; align-items:center; justify-content:space-between; gap:.8rem; border:1px solid #5a4b2c; border-radius:5px; padding:10px; color:#f4d58c; font-size:.67rem; }
	.residual .button { min-height:34px; padding:.4rem .6rem; font-size:.67rem; }
	@media(max-width:600px) { .vault { padding:15px; } .balances { grid-template-columns:1fr; } .heading { flex-direction:column; } }
</style>
