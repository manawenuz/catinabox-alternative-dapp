<script lang="ts">
	import type { Hash } from 'viem';

	export type TransactionPhase = 'idle' | 'review' | 'approval' | 'action' | 'pending' | 'success' | 'error';
	type Props = { phase: TransactionPhase; message?: string; hash?: Hash };
	let { phase, message, hash }: Props = $props();

	const labels: Record<TransactionPhase, string> = {
		idle: '',
		review: 'Review required',
		approval: 'Approval',
		action: 'Action',
		pending: 'Transaction pending',
		success: 'Confirmed',
		error: 'Action failed'
	};
</script>

{#if phase !== 'idle'}
	<div class="transaction-status" class:good={phase === 'success'} class:bad={phase === 'error'} role="status">
		<span class="phase mono">{labels[phase]}</span>
		<span class="message">{message}</span>
		{#if hash}<a href={`https://etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>{/if}
	</div>
{/if}

<style>
	.transaction-status { display: grid; gap: 5px; border: 1px solid #375243; border-radius: 5px; padding: 11px 12px; background: #101914; }
	.phase { color: var(--mint); font-size: 0.63rem; letter-spacing: 0.08em; text-transform: uppercase; }
	.message { color: var(--muted); font-size: 0.75rem; line-height: 1.5; overflow-wrap: anywhere; }
	.transaction-status a { color: var(--mint); font-size: 0.71rem; }
	.transaction-status.bad { border-color: #70403d; background: #1b1110; }
	.transaction-status.bad .phase { color: var(--danger); }
	.transaction-status.good { border-color: #375243; }
</style>
