import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { calculateFrictionFee, quoteStabilisePeg } from '#lib/protocol/redemption.js';
import type { Candidate, RedemptionEstimate } from './types.js';

export type RankingProgress = { completed: number; total: number; estimate?: RedemptionEstimate };

function relativeRate(estimate: RedemptionEstimate): bigint {
	return estimate.totalBoxEth > 0n ? (estimate.stEthOut * 10n ** 18n) / estimate.totalBoxEth : 0n;
}

export async function rankCandidates(
	candidates: Candidate[],
	account: Address | undefined,
	onProgress?: (progress: RankingProgress) => void,
	signal?: AbortSignal
): Promise<RedemptionEstimate[]> {
	const pending = [...candidates];
	const estimates: RedemptionEstimate[] = [];
	let completed = 0;
	const workers = Array.from({ length: Math.min(4, pending.length) }, async () => {
		while (pending.length && !signal?.aborted) {
			const candidate = pending.shift();
			if (!candidate) return;
			const amount = candidate.maxRedeem;
			let estimate: RedemptionEstimate;
			try { estimate = await quoteStabilisePeg(candidate.version, candidate.address, amount, account, signal); }
			catch (error) {
				const fee = calculateFrictionFee(amount, candidate.debt, candidate.deposited);
				estimate = { candidate, redeemAmount: amount, frictionFee: fee, totalBoxEth: amount + fee, stEthOut: amount, profitability: 'unavailable', profitabilityNote: error instanceof Error ? error.message : 'The current target could not be refreshed.' };
			}
			if (signal?.aborted) return;
			estimates.push(estimate);
			completed += 1;
			onProgress?.({ completed, total: candidates.length, estimate });
		}
	});
	await Promise.all(workers);
	return estimates.sort((left, right) => {
		if (left.profitability === 'estimated' && right.profitability !== 'estimated') return -1;
		if (right.profitability === 'estimated' && left.profitability !== 'estimated') return 1;
		if (left.profitability === 'estimated' && right.profitability === 'estimated' && left.netEstimateStEth !== right.netEstimateStEth) return (right.netEstimateStEth ?? 0n) > (left.netEstimateStEth ?? 0n) ? 1 : -1;
		const leftRate = relativeRate(left);
		const rightRate = relativeRate(right);
		if (leftRate !== rightRate) return rightRate > leftRate ? 1 : -1;
		return left.candidate.address.localeCompare(right.candidate.address);
	});
}

export function formatCandidateRank(estimate: RedemptionEstimate): string {
	const perBoxEth = relativeRate(estimate);
	return `${formatUnits(perBoxEth, 18)} stETH / boxETH spent`;
}
