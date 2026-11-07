import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { calculateFrictionFee, quoteStabilisePeg } from '#lib/protocol/redemption.js';
import type { Candidate, RedemptionEstimate } from './types.js';

export type RankingProgress = { completed: number; total: number; estimate?: RedemptionEstimate };

function relativeRate(estimate: RedemptionEstimate): bigint {
	return estimate.totalBoxEth > 0n ? (estimate.stEthOut * 10n ** 18n) / estimate.totalBoxEth : 0n;
}

function compareBestAvailable(left: RedemptionEstimate, right: RedemptionEstimate): number {
	const leftTier = left.netEstimateStEth !== undefined ? 0 : left.marketCostStEth !== undefined ? 1 : 2;
	const rightTier = right.netEstimateStEth !== undefined ? 0 : right.marketCostStEth !== undefined ? 1 : 2;
	if (leftTier !== rightTier) return leftTier - rightTier;

	if (leftTier === 0) {
		if (left.netEstimateStEth !== right.netEstimateStEth) return left.netEstimateStEth! > right.netEstimateStEth! ? -1 : 1;
	} else if (leftTier === 1) {
		const leftGrossNet = left.stEthOut - left.marketCostStEth!;
		const rightGrossNet = right.stEthOut - right.marketCostStEth!;
		if (leftGrossNet !== rightGrossNet) return leftGrossNet > rightGrossNet ? -1 : 1;
	} else if (left.totalBoxEth !== right.totalBoxEth) {
		return left.totalBoxEth < right.totalBoxEth ? -1 : 1;
	}

	if (left.candidate.maxRedeem !== right.candidate.maxRedeem) {
		return left.candidate.maxRedeem > right.candidate.maxRedeem ? -1 : 1;
	}
	return left.candidate.address.localeCompare(right.candidate.address);
}

export async function rankCandidates(
	candidates: Candidate[],
	account: Address | undefined,
	requestedAmount: bigint,
	onProgress?: (progress: RankingProgress) => void,
	signal?: AbortSignal
): Promise<RedemptionEstimate[]> {
	if (requestedAmount <= 0n) throw new Error('Enter a positive boxETH redemption amount.');
	const eligible = candidates.filter((candidate) => candidate.maxRedeem >= requestedAmount);
	const pending = [...eligible];
	const estimates: RedemptionEstimate[] = [];
	let completed = 0;
	const workers = Array.from({ length: Math.min(4, pending.length) }, async () => {
		while (pending.length && !signal?.aborted) {
			const candidate = pending.shift();
			if (!candidate) return;
			let estimate: RedemptionEstimate;
			try { estimate = await quoteStabilisePeg(candidate.version, candidate.address, requestedAmount, account, signal); }
			catch (error) {
				const fee = calculateFrictionFee(requestedAmount, candidate.debt, candidate.deposited);
				estimate = { candidate, redeemAmount: requestedAmount, frictionFee: fee, totalBoxEth: requestedAmount + fee, stEthOut: requestedAmount, profitability: 'unavailable', profitabilityNote: error instanceof Error ? error.message : 'The current target could not be refreshed.' };
			}
			if (signal?.aborted) return;
			estimates.push(estimate);
			completed += 1;
			onProgress?.({ completed, total: eligible.length, estimate });
		}
	});
	await Promise.all(workers);
	return estimates.sort(compareBestAvailable);
}

export function formatCandidateRank(estimate: RedemptionEstimate): string {
	const perBoxEth = relativeRate(estimate);
	return `${formatUnits(perBoxEth, 18)} stETH / boxETH spent`;
}
