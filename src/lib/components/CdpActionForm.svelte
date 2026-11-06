<script lang="ts">
	import { onMount } from 'svelte';
	import { formatUnits, type Address, type Hash } from 'viem';
	import { ADDRESSES, CHAIN_ID, cdpAddress, type CdpVersion } from '#lib/chain/config.js';
	import { readTokenDecimals } from '#lib/chain/reads.js';
	import { formatTokenAmount, parseTokenAmount, shortenAddress } from '#lib/utils/token-amounts.js';
	import { executeCdpAction, maximumMint, maximumWithdraw, mintingFeeFor, readCdpSummary, revokeCdpAllowance, simulateCdpAction, type CdpAction, type CdpExecutionProgress, type CdpSummary } from '#lib/protocol/cdp.js';
	import { walletState } from '#lib/wallet/wallet-store.svelte.js';
	import TransactionStatus, { type TransactionPhase } from './TransactionStatus.svelte';

	type Props = { action: CdpAction; version: CdpVersion; account?: Address; summary: CdpSummary | null; onComplete?: () => void | Promise<void> };
	let { action, version, account, summary, onComplete }: Props = $props();

	type ActionPreview = {
		amount: bigint;
		blockNumber: bigint;
		maxAmount: bigint;
		approvalNeeded: bigint;
		gasEstimate?: bigint;
		mintFee: bigint;
	};

	let amountInput = $state('');
	let decimals = $state(18);
	let latestSummary = $state<CdpSummary | null>(null);
	let preview = $state<ActionPreview | null>(null);
	let phase = $state<TransactionPhase>('idle');
	let statusMessage = $state('');
	let transactionHash = $state<Hash | undefined>();
	let approvalHash = $state<Hash | undefined>();
	let allowanceAfter = $state<bigint | undefined>();
	let actionError = $state<string | null>(null);
	let busy = $state(false);

	const tokenAddress = $derived(action === 'deposit' ? ADDRESSES.stEth : action === 'repay' ? ADDRESSES.boxEth : undefined);
	const tokenSymbol = $derived(action === 'deposit' || action === 'withdraw' ? 'stETH' : 'boxETH');
	const actionLabel = $derived(({ deposit: 'Deposit', mint: 'Borrow', repay: 'Repay', withdraw: 'Withdraw' } as const)[action]);
	const actionMethod = $derived(({ deposit: 'deposit(amount)', mint: 'mint(amount)', repay: 'repay(amount)', withdraw: 'withdraw(amount)' } as const)[action]);
	const amount = $derived(parseTokenAmount(amountInput, decimals));
	const canSign = $derived(Boolean(account) && walletState.chainId === CHAIN_ID);

	onMount(() => {
		if (tokenAddress) {
			void readTokenDecimals(tokenAddress).then((value) => (decimals = value)).catch(() => (decimals = 18));
		}
	});

	$effect(() => {
		latestSummary = summary;
	});

	function resetReview() {
		preview = null;
		phase = 'idle';
		statusMessage = '';
		actionError = null;
	}

	function maximumAmount(source: CdpSummary): bigint {
		const position = source.positionAfterSync ?? source.position;
		const balances = source.balances;
		if (action === 'deposit') return balances?.stEth ?? 0n;
		if (action === 'mint') return position ? maximumMint(position, source.system.ltv) : 0n;
		if (action === 'repay') {
			const balance = balances?.boxEth ?? 0n;
			const debt = source.repayDebtAfterSync ?? 0n;
			return balance < debt ? balance : debt;
		}
		return position ? maximumWithdraw(position, source.system.ltv) : 0n;
	}

	function setMaximum() {
		if (!latestSummary) return;
		amountInput = formatUnits(maximumAmount(latestSummary), decimals);
		resetReview();
	}

	function inputChanged() {
		resetReview();
	}

	async function reviewAction() {
		actionError = null;
		phase = 'idle';
		if (!account) {
			actionError = 'Connect a wallet before reviewing a transaction.';
			return;
		}
		if (walletState.chainId !== CHAIN_ID) {
			actionError = 'Switch the connected wallet to Ethereum mainnet first.';
			return;
		}
		if (amount === undefined || amount <= 0n) {
			actionError = 'Enter a valid amount using the token decimals shown by the contract.';
			return;
		}

		busy = true;
		try {
			const fresh = await readCdpSummary(version, account);
			latestSummary = fresh;
			const maxAmount = maximumAmount(fresh);
			if (amount > maxAmount) {
				throw new Error(`The current maximum is ${formatTokenAmount(maxAmount, decimals, decimals)} ${tokenSymbol}. Refresh the position before trying again.`);
			}

			let approvalNeeded = 0n;
			if (tokenAddress) {
				const allowance = action === 'deposit' ? fresh.balances?.stEthAllowance ?? 0n : fresh.balances?.boxEthAllowance ?? 0n;
				if (allowance < amount) approvalNeeded = amount;
			}

			let gasEstimate: bigint | undefined;
			if (approvalNeeded === 0n) {
				const simulation = await simulateCdpAction(version, action, amount, account);
				if (simulation.status !== 'ready') throw new Error(simulation.revertReason || 'This transaction did not pass simulation.');
				gasEstimate = simulation.gasEstimate;
			}

			const mintFee = action === 'mint' ? mintingFeeFor(version, amount, fresh.system.mintingFee) : 0n;
			preview = { amount, blockNumber: fresh.system.blockNumber, maxAmount, approvalNeeded, gasEstimate, mintFee };
			phase = 'review';
			statusMessage = approvalNeeded > 0n
				? `The wallet needs an exact ${tokenSymbol} approval first. The CDP call will be simulated after approval and before its wallet prompt.`
				: `Simulation passed at block ${fresh.system.blockNumber.toLocaleString()}. Review the contract call and confirm in your wallet.`;
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Unable to prepare this transaction.';
			phase = 'error';
			statusMessage = actionError;
		} finally {
			busy = false;
		}
	}

	function onExecutionProgress(progress: CdpExecutionProgress) {
		phase = progress.phase;
		statusMessage = progress.message;
		if (progress.hash) {
			if (progress.message.startsWith('Token approval sent')) approvalHash = progress.hash;
			else transactionHash = progress.hash;
		}
	}

	async function confirmAction() {
		if (!preview || !account) return;
		busy = true;
		actionError = null;
		transactionHash = undefined;
		approvalHash = undefined;
		allowanceAfter = undefined;
		try {
			const result = await executeCdpAction(version, action, preview.amount, account, onExecutionProgress);
			transactionHash = result.hash;
			approvalHash = result.approvalHash;
			allowanceAfter = result.allowanceAfter;
			phase = 'success';
			statusMessage = result.approvalHash
				? `${tokenSymbol} approval confirmed and ${actionLabel.toLowerCase()} confirmed.`
				: `${actionLabel} confirmed.`;
			preview = null;
			await onComplete?.();
		} catch (error) {
			if (tokenAddress && account) {
				try {
					const current = await readCdpSummary(version, account);
					allowanceAfter = action === 'deposit' ? current.balances?.stEthAllowance : current.balances?.boxEthAllowance;
				} catch {
					// Preserve the transaction error when the allowance read also fails.
				}
			}
			actionError = error instanceof Error ? error.message : 'The transaction could not be completed.';
			phase = 'error';
			statusMessage = actionError;
		} finally {
			busy = false;
		}
	}

	async function revokeAllowance() {
		if (!account || (action !== 'repay' && action !== 'deposit')) return;
		busy = true;
		phase = 'action';
		approvalHash = undefined;
		statusMessage = `Confirm the ${tokenSymbol} allowance revocation in your wallet.`;
		try {
			const hash = await revokeCdpAllowance(version, action, account);
			transactionHash = hash;
			phase = 'success';
			statusMessage = 'Allowance revoked.';
			allowanceAfter = 0n;
			await onComplete?.();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'Unable to revoke this allowance.';
			phase = 'error';
			statusMessage = actionError;
		} finally {
			busy = false;
		}
	}
</script>

<section class="action-form panel">
	<div class="form-heading">
		<div>
			<p class="eyebrow">CDP action · {version}</p>
			<h2>{actionLabel} {tokenSymbol}</h2>
		</div>
		<span class="contract mono">{shortenAddress(cdpAddress(version))}</span>
	</div>
	<p class="description">
		{#if action === 'deposit'}Add stETH collateral to the selected CDP.{/if}
		{#if action === 'mint'}Borrow boxETH against your deposited stETH. v1.1 may add a fee to debt.{/if}
		{#if action === 'repay'}Burn boxETH to reduce debt. The CDP clamps repayment to current debt.{/if}
		{#if action === 'withdraw'}Withdraw available stETH while meeting the contract's current collateral check.{/if}
	</p>

	<div class="amount-field">
		<label for="cdp-amount">Amount</label>
		<div class="input-wrap">
			<input id="cdp-amount" type="number" min="0" step="any" inputmode="decimal" placeholder="0.00" bind:value={amountInput} oninput={inputChanged} disabled={busy} />
			<span>{tokenSymbol}</span>
			<button type="button" onclick={setMaximum} disabled={!latestSummary || busy}>MAX</button>
		</div>
		<div class="field-meta">
			<span>{action === 'deposit' ? 'Wallet balance' : action === 'repay' ? 'Available / owed' : action === 'mint' ? 'Borrow capacity' : 'Withdrawable'}</span>
			<strong>{latestSummary ? formatTokenAmount(maximumAmount(latestSummary), decimals) : '—'} {tokenSymbol}</strong>
		</div>
	</div>

	{#if action === 'repay'}
		<div class="allowance-note" role="note">
			<strong>Allowance behavior:</strong> boxETH repayment uses the deployed <code>burnFrom</code> method, which can leave its allowance in place after the burn. Any remainder is shown after execution and can be revoked here.
		</div>
	{/if}

	{#if action === 'mint' && latestSummary?.system.mintingFee}
		<div class="info-row"><span>v1.1 mint fee (live)</span><strong>{version === 'v1.1' ? `${formatTokenAmount(latestSummary.system.mintingFee, 2)}% per fee leg` : 'Not used in v1'}</strong></div>
	{/if}

	{#if preview}
		<div class="review panel">
			<div class="review-title"><span class="eyebrow">Review transaction</span><button type="button" class="edit" onclick={resetReview} disabled={busy}>Edit amount</button></div>
			<dl>
				<div><dt>Method</dt><dd><code>{actionMethod}</code></dd></div>
				<div><dt>Contract</dt><dd><code>{cdpAddress(version)}</code></dd></div>
				<div><dt>Requested amount</dt><dd>{formatTokenAmount(preview.amount, decimals, decimals)} {tokenSymbol}</dd></div>
				{#if action === 'mint' && preview.mintFee > 0n}
					<div><dt>Additional v1.1 debt</dt><dd>{formatTokenAmount(preview.mintFee, decimals, decimals)} boxETH</dd></div>
				{/if}
				{#if preview.approvalNeeded > 0n}
					<div><dt>Separate approval</dt><dd>{formatTokenAmount(preview.approvalNeeded, decimals, decimals)} {tokenSymbol}</dd></div>
				{/if}
				{#if preview.gasEstimate !== undefined}
					<div><dt>Estimated gas</dt><dd>{preview.gasEstimate.toLocaleString()}</dd></div>
				{/if}
				<div><dt>Preview block</dt><dd>{preview.blockNumber.toLocaleString()}</dd></div>
			</dl>
			<p class="review-note">Wallet prompts show the actual token and contract call. State may change between this preview and inclusion.</p>
			<button class="button" type="button" onclick={confirmAction} disabled={busy || !canSign}>{busy ? 'Waiting…' : `Confirm ${actionLabel.toLowerCase()}`}</button>
		</div>
	{:else}
		<button class="button" type="button" onclick={reviewAction} disabled={busy || !amountInput || !account || walletState.chainId !== CHAIN_ID}>{busy ? 'Loading current state…' : `Review ${actionLabel.toLowerCase()}`}</button>
	{/if}

	{#if actionError}<p class="error" role="alert">{actionError}</p>{/if}
	<TransactionStatus {phase} message={statusMessage} hash={transactionHash} />
	{#if approvalHash}<p class="approval-link">Approval transaction: <a href={`https://etherscan.io/tx/${approvalHash}`} target="_blank" rel="noreferrer">{shortenAddress(approvalHash)} ↗</a></p>{/if}

	{#if allowanceAfter !== undefined && allowanceAfter > 0n && (action === 'repay' || action === 'deposit')}
		<div class="residual-allowance" role="status">
			<p><strong>Remaining {tokenSymbol} allowance:</strong> {formatTokenAmount(allowanceAfter, decimals, decimals)} {tokenSymbol}</p>
			<button class="button secondary" type="button" onclick={revokeAllowance} disabled={busy}>Revoke allowance</button>
		</div>
	{/if}
</section>

<style>
	.action-form { display: grid; gap: 17px; padding: 20px; }
	.form-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
	.form-heading h2 { margin: 4px 0 0; font-size: 1.18rem; letter-spacing: -0.045em; }
	.contract { margin-top: 2px; color: var(--dim); font-size: 0.63rem; }
	.description { margin: -8px 0 0; color: var(--muted); font-size: 0.77rem; line-height: 1.55; }
	.amount-field { display: grid; gap: 9px; }
	.amount-field label { color: var(--muted); font-size: 0.74rem; }
	.input-wrap { display: flex; min-height: 58px; align-items: center; gap: 10px; border: 1px solid var(--border); border-radius: 5px; padding: 0 9px 0 14px; background: #0d100e; }
	.input-wrap:focus-within { border-color: #4a9c76; }
	.input-wrap input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--text); font-size: 1.15rem; font-weight: 700; }
	.input-wrap input::-webkit-inner-spin-button, .input-wrap input::-webkit-outer-spin-button { appearance: none; margin: 0; }
	.input-wrap > span { color: var(--muted); font-size: 0.73rem; }
	.input-wrap > button { border: 1px solid #315342; border-radius: 3px; padding: 6px 7px; background: #152019; color: var(--mint); font-family: 'DM Mono', monospace; font-size: 0.62rem; cursor: pointer; }
	.input-wrap > button:disabled { opacity: 0.4; }
	.field-meta { display: flex; justify-content: space-between; gap: 1rem; color: var(--dim); font-size: 0.67rem; }
	.field-meta strong { color: var(--muted); font-weight: 600; }
	.allowance-note { border: 1px solid #5a4b2c; border-radius: 5px; padding: 10px 11px; background: #19160e; color: #c9bb91; font-size: 0.68rem; line-height: 1.6; }
	.allowance-note strong { color: #f4d58c; }
	.allowance-note code { color: #f4d58c; }
	.info-row { display: flex; justify-content: space-between; gap: 1rem; border: 1px solid var(--border); border-radius: 5px; padding: 10px 11px; color: var(--muted); font-size: 0.68rem; }
	.info-row strong { color: var(--text); }
	.review { display: grid; gap: 12px; padding: 14px; }
	.review-title { display: flex; align-items: center; justify-content: space-between; }
	.edit { border: 0; padding: 4px; background: transparent; color: var(--mint); font-size: 0.69rem; cursor: pointer; }
	dl { display: grid; gap: 7px; margin: 0; }
	dl div { display: flex; justify-content: space-between; gap: 1rem; font-size: 0.69rem; }
	dt { color: var(--muted); }
	dd { margin: 0; color: var(--text); text-align: right; overflow-wrap: anywhere; }
	dd code { color: #c3d1c9; font-size: 0.61rem; }
	.review-note { margin: 0; color: var(--dim); font-size: 0.66rem; line-height: 1.55; }
	.button { width: 100%; }
	.error { margin: -6px 0 0; color: var(--danger); font-size: 0.73rem; line-height: 1.5; }
	.approval-link { margin: -9px 0 0; color: var(--muted); font-size: 0.68rem; }
	.approval-link a { color: var(--mint); }
	.residual-allowance { display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid #5a4b2c; border-radius: 5px; padding: 11px; background: #19160e; }
	.residual-allowance p { margin: 0; color: #e9d399; font-size: 0.69rem; line-height: 1.5; }
	.residual-allowance .button { width: auto; min-height: 36px; padding: 0.45rem 0.65rem; font-size: 0.68rem; }
	@media (max-width: 480px) { .action-form { padding: 15px; } .residual-allowance { align-items: stretch; flex-direction: column; } }
</style>
