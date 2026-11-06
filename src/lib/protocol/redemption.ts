import { formatUnits, parseEventLogs, type Address, type Hash } from 'viem';
import { ADDRESSES, cdpAddress, type CdpVersion } from '#lib/chain/config.js';
import { cdpAbi, erc20Abi } from '#lib/chain/abis.js';
import { publicClient, walletClient as createWalletClient } from '#lib/chain/clients.js';
import { readPosition, readSystemState } from '#lib/chain/reads.js';
import { projectCdpSettlement } from './settlement.js';
import { getInjectedProvider } from '#lib/wallet/wallet-store.svelte.js';
import { quoteBoxEthCostInStEth, quoteWethCostInStEth } from '#lib/redemption/market-quote.js';
import type { Candidate, RedemptionEstimate } from '#lib/redemption/types.js';

export type RedemptionProgress = { phase: 'approval' | 'action' | 'pending'; message: string; hash?: Hash };
export type RedemptionReceipt = {
	stage: 'complete';
	approvalHash?: Hash;
	hash: Hash;
	allowanceAfter: bigint;
	boxEthBurned: bigint;
	frictionFeePaid: bigint;
	stEthTransferred: bigint;
	stEthTransferObserved: boolean;
	gasUsed: bigint;
	positionAfter: { deposited: bigint; debt: bigint };
	actualTarget: Address;
	actualPsmRecipient?: Address;
};
export type ApprovalReview = { stage: 'approval-review'; approvalHash: Hash; allowanceAfter: bigint; estimate: RedemptionEstimate };
export type RedemptionExecution = RedemptionReceipt | ApprovalReview;

export function calculateFrictionFee(amount: bigint, debt: bigint, deposited: bigint): bigint {
	if (amount < 0n || debt < 0n || deposited <= 0n) throw new Error('A redemption fee requires a positive target collateral balance.');
	const tenth = amount / 10n;
	return tenth - (tenth * debt) / deposited;
}

function assertNotAborted(signal?: AbortSignal): void {
	if (signal?.aborted) throw new DOMException('The operation was stopped.', 'AbortError');
}

function candidateFrom(version: CdpVersion, target: Address, deposited: bigint, debt: bigint, feePerToken: bigint, block: bigint): Candidate {
	return { version, address: target, deposited, debt, maxRedeem: debt / 4n, feePerToken, snapshotBlock: block };
}

async function projectTargetAfterSync(version: CdpVersion, target: Address, blockNumber: bigint) {
	const contract = cdpAddress(version);
	const [position, system, contractCollateral] = await Promise.all([
		readPosition(version, target, blockNumber),
		readSystemState(version, blockNumber),
		publicClient.readContract({ address: ADDRESSES.stEth, abi: erc20Abi, functionName: 'balanceOf', args: [contract], blockNumber })
	]);
	const projection = projectCdpSettlement(version, position, system, contractCollateral);
	const deposited = projection.positionAfterFetch.deposited;
	const debt = projection.positionAfterFetch.debt;
	const tenth = 10n ** 17n;
	const feePerToken = deposited > 0n ? tenth - (tenth * debt) / deposited : tenth;
	return { deposited, debt, feePerToken };
}

export async function readRedemptionCandidate(version: CdpVersion, target: Address, blockNumber?: bigint): Promise<Candidate> {
	const snapshotBlock = blockNumber ?? await publicClient.getBlockNumber();
	const position = await projectTargetAfterSync(version, target, snapshotBlock);
	if (position.debt <= 0n || position.deposited <= 0n || position.debt / 4n <= 0n) throw new Error('This target has no active redeemable debt in the selected CDP after yield settlement.');
	return candidateFrom(version, target, position.deposited, position.debt, position.feePerToken, snapshotBlock);
}

export async function quoteStabilisePeg(
	version: CdpVersion,
	target: Address,
	requestedAmount: bigint,
	account?: Address,
	signal?: AbortSignal
): Promise<RedemptionEstimate> {
	if (requestedAmount <= 0n) throw new Error('Enter a positive boxETH redemption amount.');
	assertNotAborted(signal);
	const address = cdpAddress(version);
	const blockNumber = await publicClient.getBlockNumber();
	assertNotAborted(signal);
	const candidate = await readRedemptionCandidate(version, target, blockNumber);
	assertNotAborted(signal);
	const maxRedeem = candidate.maxRedeem;
	if (requestedAmount > maxRedeem) throw new Error(`The on-chain call caps redemption at 25% of current debt: ${formatUnits(maxRedeem, 18)} boxETH.`);
	const [boxEthDecimals, psmRecipient] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'decimals', blockNumber }),
		publicClient.readContract({ address, abi: cdpAbi, functionName: 'psm', blockNumber })
	]);
	assertNotAborted(signal);
	const frictionFee = calculateFrictionFee(requestedAmount, candidate.debt, candidate.deposited);
	const totalBoxEth = requestedAmount + frictionFee;
	const estimate: RedemptionEstimate = {
		candidate, redeemAmount: requestedAmount, frictionFee, totalBoxEth,
		stEthOut: requestedAmount, quoteBlock: blockNumber, psmRecipient, profitability: 'unavailable',
		profitabilityNote: 'A connected wallet, on-chain market quote, and usable gas estimate are required for a net estimate.'
	};
	if (Number(boxEthDecimals) !== 18) {
		estimate.profitabilityNote = `The deployed boxETH token has ${boxEthDecimals} decimals; the app's confirmed amount formatter expects 18.`;
		return estimate;
	}
	const quote = await quoteBoxEthCostInStEth(totalBoxEth, blockNumber, signal);
	assertNotAborted(signal);
	if (quote) {
		estimate.marketCostStEth = quote.amountIn;
		estimate.route = quote.route;
		estimate.priceImpactBps = quote.priceImpactBps;
		estimate.quoteGas = quote.gasEstimate;
	}
	if (!account) {
		estimate.profitabilityNote = quote ? 'Market quote is available; connect a wallet to estimate this transaction’s gas.' : 'No usable Uniswap v3 route was found for the required boxETH amount.';
		return estimate;
	}
	try {
		const [balance, allowance] = await Promise.all([
			publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'balanceOf', args: [account], blockNumber }),
			publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, address], blockNumber })
		]);
		assertNotAborted(signal);
		estimate.walletBoxEthBalance = balance;
		estimate.boxEthAllowance = allowance;
		if (balance < totalBoxEth || allowance < totalBoxEth) throw new Error('A full gas simulation needs the exact boxETH balance and allowance in place.');
		const transactionGas = await publicClient.estimateContractGas({ address, abi: cdpAbi, functionName: 'stabilisePeg', args: [requestedAmount, target], account, blockNumber });
		assertNotAborted(signal);
		estimate.transactionGas = transactionGas;
		if (!quote) throw new Error('No usable Uniswap v3 quote route was found.');
		const gasPrice = await publicClient.getGasPrice();
		assertNotAborted(signal);
		const wethForGas = (transactionGas * gasPrice);
		const gasQuote = await quoteWethCostInStEth(wethForGas, blockNumber, signal);
		assertNotAborted(signal);
		if (!gasQuote) throw new Error('A stETH-to-WETH quote was unavailable for the estimated gas cost.');
		estimate.gasCostStEth = gasQuote.amountIn;
		estimate.netEstimateStEth = requestedAmount - quote.amountIn - gasQuote.amountIn;
		estimate.profitability = 'estimated';
		estimate.profitabilityNote = 'Indicative net stETH after the on-chain boxETH quote and estimated redemption gas. It excludes gas for any separate transaction used to acquire boxETH; the quote, gas price, target state, and execution price can change.';
	} catch (error) {
		estimate.profitability = 'unavailable';
		estimate.profitabilityNote = error instanceof Error ? error.message : 'Gas or market route could not be estimated.';
	}
	return estimate;
}

function changedSinceReview(before: RedemptionEstimate, after: RedemptionEstimate): boolean {
	return before.candidate.debt !== after.candidate.debt || before.candidate.deposited !== after.candidate.deposited ||
		before.redeemAmount !== after.redeemAmount || before.frictionFee !== after.frictionFee || before.totalBoxEth !== after.totalBoxEth ||
		before.psmRecipient?.toLowerCase() !== after.psmRecipient?.toLowerCase();
}

function amountMoved(before: bigint | undefined, after: bigint | undefined, maximumBps: bigint): boolean {
	if (before === undefined || after === undefined) return before !== after;
	const difference = before > after ? before - after : after - before;
	return difference * 10_000n / (before || 1n) > maximumBps;
}

function changedQuoteSinceReview(before: RedemptionEstimate, after: RedemptionEstimate): boolean {
	return before.profitability !== after.profitability ||
		amountMoved(before.marketCostStEth, after.marketCostStEth, 50n) ||
		amountMoved(before.gasCostStEth, after.gasCostStEth, 100n);
}

export async function executeRedemption(
	version: CdpVersion,
	amount: bigint,
	target: Address,
	account: Address,
	reviewed: RedemptionEstimate,
	onProgress?: (progress: RedemptionProgress) => void
): Promise<RedemptionExecution> {
	const cdp = cdpAddress(version);
	const fresh = await quoteStabilisePeg(version, target, amount, account);
	if (changedSinceReview(reviewed, fresh)) throw new Error('The target position or friction fee changed since review. Refresh and review the updated redemption before signing.');
	if (changedQuoteSinceReview(reviewed, fresh)) throw new Error('The market or gas estimate changed since review. Refresh the estimate and confirm again.');
	const [balance, initialAllowance] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdp] })
	]);
	if (balance < fresh.totalBoxEth) throw new Error(`The transaction requires ${formatUnits(fresh.totalBoxEth, 18)} boxETH including the friction fee.`);
	let approvalHash: Hash | undefined;
	if (initialAllowance < fresh.totalBoxEth) {
		const wallet = createWalletClient(getInjectedProvider(), account);
		onProgress?.({ phase: 'approval', message: `Confirm an exact ${formatUnits(fresh.totalBoxEth, 18)} boxETH allowance for this CDP.` });
		const { request } = await publicClient.simulateContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'approve', args: [cdp, fresh.totalBoxEth], account });
		approvalHash = await wallet.writeContract(request);
		onProgress?.({ phase: 'pending', message: 'Redemption approval sent; waiting for confirmation.', hash: approvalHash });
		const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
		if (approvalReceipt.status !== 'success') throw new Error('The boxETH approval transaction reverted.');
		const allowanceAfter = await publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdp] });
		const refreshedEstimate = await quoteStabilisePeg(version, target, amount, account);
		if (changedSinceReview(reviewed, refreshedEstimate)) throw new Error('The target position changed during approval. Refresh and review it again; your allowance may remain.');
		return { stage: 'approval-review', approvalHash, allowanceAfter, estimate: refreshedEstimate };
	}
	const afterApproval = await quoteStabilisePeg(version, target, amount, account);
	if (changedSinceReview(reviewed, afterApproval)) throw new Error('The target position changed after approval. Your allowance may remain; refresh the position before continuing.');
	if (changedQuoteSinceReview(reviewed, afterApproval)) throw new Error('The market or gas estimate changed since review. Refresh the estimate and confirm again.');
	const { request } = await publicClient.simulateContract({ address: cdp, abi: cdpAbi, functionName: 'stabilisePeg', args: [amount, target], account });
	const gas = await publicClient.estimateContractGas({ address: cdp, abi: cdpAbi, functionName: 'stabilisePeg', args: [amount, target], account });
	const wallet = createWalletClient(getInjectedProvider(), account);
	onProgress?.({ phase: 'action', message: 'Simulation passed. Confirm stabilisePeg(amount, target) in your wallet.' });
	const hash = await wallet.writeContract({ ...request, gas });
	onProgress?.({ phase: 'pending', message: 'Redemption sent; waiting for on-chain confirmation.', hash });
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The redemption transaction reverted.');
	const pegEvents = parseEventLogs({ abi: cdpAbi, eventName: '_stabilisePeg', logs: receipt.logs, strict: false });
	const pegEvent = pegEvents.find((event) => event.address.toLowerCase() === cdp.toLowerCase());
	if (!pegEvent) throw new Error('Transaction confirmed, but the expected _stabilisePeg event was not found. Check the transaction receipt.');
	const transfers = parseEventLogs({ abi: erc20Abi, eventName: 'Transfer', logs: receipt.logs, strict: false });
	const stEthTransfers = transfers.filter((event) => {
		const args = event.args as unknown as { from?: Address; to?: Address };
		return event.address.toLowerCase() === ADDRESSES.stEth.toLowerCase() && args.from?.toLowerCase() === cdp.toLowerCase() && args.to?.toLowerCase() === account.toLowerCase();
	});
	const stEthTransferred = stEthTransfers.reduce((total, event) => total + ((event.args as unknown as { value?: bigint }).value ?? 0n), 0n);
	const frictionFee = (pegEvent.args as { fee: bigint }).fee;
	const psmTransfer = transfers.find((event) => {
		const args = event.args as unknown as { from?: Address; to?: Address; value?: bigint };
		return event.address.toLowerCase() === ADDRESSES.boxEth.toLowerCase() &&
			args.from?.toLowerCase() === account.toLowerCase() && args.value === frictionFee;
	});
	const [allowanceAfter, positionAfter] = await Promise.all([
		publicClient.readContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'allowance', args: [account, cdp] }),
		readPosition(version, target)
	]);
	return {
		stage: 'complete', approvalHash, hash, allowanceAfter,
		boxEthBurned: (pegEvent.args as { amount: bigint }).amount,
		frictionFeePaid: frictionFee,
		stEthTransferred, stEthTransferObserved: stEthTransfers.length > 0,
		gasUsed: receipt.gasUsed, positionAfter: { deposited: positionAfter.deposited, debt: positionAfter.debt }, actualTarget: (pegEvent.args as { user: Address }).user,
		actualPsmRecipient: psmTransfer ? (psmTransfer.args as unknown as { to?: Address }).to : undefined
	};
}

export async function revokeRedemptionAllowance(version: CdpVersion, account: Address): Promise<Hash> {
	const cdp = cdpAddress(version);
	const wallet = createWalletClient(getInjectedProvider(), account);
	const { request } = await publicClient.simulateContract({ address: ADDRESSES.boxEth, abi: erc20Abi, functionName: 'approve', args: [cdp, 0n], account });
	const hash = await wallet.writeContract(request);
	const receipt = await publicClient.waitForTransactionReceipt({ hash });
	if (receipt.status !== 'success') throw new Error('The redemption allowance revocation transaction reverted.');
	return hash;
}
