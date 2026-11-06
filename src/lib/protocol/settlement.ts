import type { CdpVersion } from '#lib/chain/config.js';
import type { Position, SystemState } from '#lib/chain/reads.js';

export type CdpSettlementProjection = {
	excess: bigint;
	protocolFee: bigint;
	feeShareBps?: bigint;
	pointsAfterSync: bigint;
	owingAfterSync: bigint;
	positionAfterFetch: Position;
	systemAfterFetch: SystemState;
	settled: boolean;
};

export function protocolFeeAmount(
	version: CdpVersion,
	excess: bigint,
	idleFee: bigint,
	totalDebt: bigint,
	totalDeposits: bigint
): bigint {
	if (excess <= 100n) return 0n;
	if (version === 'v1.1') {
		if (totalDebt === 0n) return 0n;
		return (excess * idleFee) / 100n;
	}
	return (excess * idleFee) / 100n + (excess * totalDebt) / (totalDeposits * 4n + 1n);
}

export function projectCdpSettlement(
	version: CdpVersion,
	position: Position,
	system: SystemState,
	contractCollateral: bigint
): CdpSettlementProjection {
	const excess = contractCollateral > system.totalDeposits ? contractCollateral - system.totalDeposits : 0n;
	const syncRuns = excess > 100n && (version === 'v1' || system.totalDebt > 0n);
	const protocolFee = protocolFeeAmount(version, excess, system.idleFee, system.totalDebt, system.totalDeposits);
	let pointsAfterSync = system.totalPoints;
	let systemAfterSync = { ...system };

	if (syncRuns) {
		const totalWeight = version === 'v1' ? system.totalDeposits - system.totalDebt : system.totalDebt;
		if (totalWeight <= 0n || system.pointMultiplier <= 0n) {
			throw new Error('CDP yield synchronization cannot be safely projected from current aggregate state.');
		}
		if (protocolFee > excess) throw new Error('The CDP fee state is outside its expected range.');
		const value = excess - protocolFee;
		pointsAfterSync += (value * system.pointMultiplier) / totalWeight;
		systemAfterSync = {
			...systemAfterSync,
			totalDeposits: systemAfterSync.totalDeposits + value,
			unclaimed: systemAfterSync.unclaimed + value,
			totalPoints: pointsAfterSync
		};
	}

	if (pointsAfterSync < position.lastPoints || system.pointMultiplier <= 0n) {
		throw new Error('The target’s point accounting cannot be projected from this block.');
	}
	let weight: bigint;
	if (version === 'v1.1') {
		weight = position.debt;
	} else {
		if (position.debt > position.deposited) throw new Error('The v1 target has more debt than deposited collateral.');
		weight = position.deposited - position.debt;
	}
	const owingAfterSync = (weight * (pointsAfterSync - position.lastPoints)) / system.pointMultiplier;
	if (owingAfterSync > systemAfterSync.unclaimed) {
		throw new Error('The target’s accrued yield exceeds the CDP’s unclaimed-yield balance.');
	}

	let positionAfterFetch: Position = {
		...position,
		owing: 0n,
		lastPoints: pointsAfterSync
	};
	let systemAfterFetch = { ...systemAfterSync, unclaimed: systemAfterSync.unclaimed - owingAfterSync };
	if (owingAfterSync > 0n) {
		if (position.debt < owingAfterSync || !position.enableRepaying) {
			positionAfterFetch = { ...positionAfterFetch, deposited: position.deposited + owingAfterSync };
		} else {
			positionAfterFetch = { ...positionAfterFetch, debt: position.debt - owingAfterSync };
			systemAfterFetch = {
				...systemAfterFetch,
				totalDeposits: systemAfterFetch.totalDeposits - owingAfterSync,
				totalDebt: systemAfterFetch.totalDebt - owingAfterSync,
			};
		}
	}

	return {
		excess,
		protocolFee,
		feeShareBps: syncRuns && excess > 0n ? (protocolFee * 10_000n) / excess : undefined,
		pointsAfterSync,
		owingAfterSync,
		positionAfterFetch,
		systemAfterFetch,
		settled: syncRuns
	};
}
