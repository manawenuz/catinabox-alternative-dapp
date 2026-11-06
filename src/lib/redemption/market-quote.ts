import { concatHex, numberToHex, parseAbi, type Address, type Hex } from 'viem';
import { ADDRESSES } from '#lib/chain/config.js';
import { publicClient } from '#lib/chain/clients.js';

const FACTORY: Address = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
const QUOTER_V2: Address = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const WETH: Address = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const FEE_TIERS = [100, 500, 3000, 10000] as const;
const Q192 = 1n << 192n;

const factoryAbi = parseAbi(['function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)']);
const poolAbi = parseAbi([
	'function token0() view returns (address)',
	'function token1() view returns (address)',
	'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
]);
const quoterAbi = parseAbi([
	'function quoteExactOutputSingle((address tokenIn,address tokenOut,uint256 amount,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountIn,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
	'function quoteExactOutput(bytes path,uint256 amountOut) returns (uint256 amountIn,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)'
]);

type PoolInfo = { address: Address; token0: Address; token1: Address; sqrtPriceX96: bigint };
type Route = { tokens: Address[]; fees: number[]; pools: PoolInfo[] };
export type ExactOutputQuote = { amountIn: bigint; gasEstimate: bigint; route: Address[]; priceImpactBps: bigint };
const routeCache = new Map<string, Promise<Route[]>>();

function routeCacheKey(blockNumber: bigint): string { return blockNumber.toString(); }

async function readPool(tokenA: Address, tokenB: Address, fee: number, blockNumber: bigint): Promise<PoolInfo | undefined> {
	try {
		const poolAddress = await publicClient.readContract({ address: FACTORY, abi: factoryAbi, functionName: 'getPool', args: [tokenA, tokenB, fee], blockNumber });
		if (poolAddress === '0x0000000000000000000000000000000000000000') return undefined;
		const [token0, token1, slot0] = await Promise.all([
			publicClient.readContract({ address: poolAddress, abi: poolAbi, functionName: 'token0', blockNumber }),
			publicClient.readContract({ address: poolAddress, abi: poolAbi, functionName: 'token1', blockNumber }),
			publicClient.readContract({ address: poolAddress, abi: poolAbi, functionName: 'slot0', blockNumber })
		]);
		return { address: poolAddress, token0, token1, sqrtPriceX96: slot0[0] };
	} catch { return undefined; }
}

async function discoverRoutes(blockNumber: bigint): Promise<Route[]> {
	const direct: Array<Route | undefined> = await Promise.all(FEE_TIERS.map(async (fee): Promise<Route | undefined> => {
		const pool = await readPool(ADDRESSES.boxEth, ADDRESSES.stEth, fee, blockNumber);
		return pool ? { tokens: [ADDRESSES.boxEth, ADDRESSES.stEth], fees: [fee], pools: [pool] } : undefined;
	}));
	const toWeth = await Promise.all(FEE_TIERS.map(async (fee) => ({ fee, pool: await readPool(ADDRESSES.boxEth, WETH, fee, blockNumber) })));
	const fromWeth = await Promise.all(FEE_TIERS.map(async (fee) => ({ fee, pool: await readPool(WETH, ADDRESSES.stEth, fee, blockNumber) })));
	const routed: Route[] = [];
	for (const first of toWeth) for (const second of fromWeth) {
		if (first.pool && second.pool) routed.push({ tokens: [ADDRESSES.boxEth, WETH, ADDRESSES.stEth], fees: [first.fee, second.fee], pools: [first.pool, second.pool] });
	}
	return [...direct.filter((route): route is Route => route !== undefined), ...routed];
}

function routesAt(blockNumber: bigint): Promise<Route[]> {
	const key = routeCacheKey(blockNumber);
	let promise = routeCache.get(key);
	if (!promise) {
		promise = discoverRoutes(blockNumber);
		routeCache.set(key, promise);
		if (routeCache.size > 4) routeCache.delete(routeCache.keys().next().value!);
	}
	return promise;
}

function encodeExactOutputPath(route: Route): Hex {
	let path: Hex = route.tokens[0];
	for (let index = 0; index < route.fees.length; index += 1) {
		path = concatHex([path, numberToHex(route.fees[index], { size: 3 }), route.tokens[index + 1]]);
	}
	return path;
}

function spotInputForOutput(route: Route, outputAmount: bigint): bigint {
	let needed = outputAmount;
	for (let index = 0; index < route.pools.length; index += 1) {
		const pool = route.pools[index];
		const tokenOut = route.tokens[index];
		const tokenIn = route.tokens[index + 1];
		const priceX192 = pool.sqrtPriceX96 * pool.sqrtPriceX96;
		const token0ToToken1 = tokenIn.toLowerCase() === pool.token0.toLowerCase() && tokenOut.toLowerCase() === pool.token1.toLowerCase();
		const numerator = token0ToToken1 ? priceX192 : Q192;
		const denominator = token0ToToken1 ? Q192 : priceX192;
		if (numerator === 0n) return 0n;
		needed = (needed * denominator) / numerator;
	}
	return needed;
}

async function quoteExactOutput(route: Route, amountOut: bigint, blockNumber: bigint, signal?: AbortSignal): Promise<ExactOutputQuote | undefined> {
	if (signal?.aborted) return undefined;
	try {
		let amountIn: bigint;
		let gasEstimate: bigint;
		if (route.fees.length === 1) {
			const result = await publicClient.readContract({
				address: QUOTER_V2, abi: quoterAbi, functionName: 'quoteExactOutputSingle',
				args: [{ tokenIn: route.tokens[1], tokenOut: route.tokens[0], amount: amountOut, fee: route.fees[0], sqrtPriceLimitX96: 0n }], blockNumber
			});
			amountIn = result[0]; gasEstimate = result[3];
		} else {
			const result = await publicClient.readContract({ address: QUOTER_V2, abi: quoterAbi, functionName: 'quoteExactOutput', args: [encodeExactOutputPath(route), amountOut], blockNumber });
			amountIn = result[0]; gasEstimate = result[3];
		}
		if (signal?.aborted) return undefined;
		const spotInput = spotInputForOutput(route, amountOut);
		const priceImpactBps = spotInput > 0n && amountIn > spotInput ? ((amountIn - spotInput) * 10_000n) / spotInput : 0n;
		return { amountIn, gasEstimate, route: [...route.tokens].reverse(), priceImpactBps };
	} catch { return undefined; }
}

export async function quoteBoxEthCostInStEth(boxEthAmount: bigint, blockNumber?: bigint, signal?: AbortSignal): Promise<ExactOutputQuote | undefined> {
	if (boxEthAmount <= 0n) return undefined;
	if (signal?.aborted) return undefined;
	const pinnedBlock = blockNumber ?? await publicClient.getBlockNumber();
	if (signal?.aborted) return undefined;
	const routes = await routesAt(pinnedBlock);
	if (signal?.aborted) return undefined;
	const quotes = await Promise.all(routes.map((route) => quoteExactOutput(route, boxEthAmount, pinnedBlock, signal)));
	if (signal?.aborted) return undefined;
	return quotes.filter((quote): quote is ExactOutputQuote => quote !== undefined).sort((left, right) => left.amountIn < right.amountIn ? -1 : left.amountIn > right.amountIn ? 1 : 0)[0];
}

export async function quoteWethCostInStEth(wethAmount: bigint, blockNumber: bigint, signal?: AbortSignal): Promise<ExactOutputQuote | undefined> {
	if (wethAmount <= 0n) return { amountIn: 0n, gasEstimate: 0n, route: [], priceImpactBps: 0n };
	if (signal?.aborted) return undefined;
	const pools = await Promise.all(FEE_TIERS.map((fee) => readPool(WETH, ADDRESSES.stEth, fee, blockNumber)));
	if (signal?.aborted) return undefined;
	const routes: Route[] = pools.flatMap((pool, index) => pool ? [{ tokens: [WETH, ADDRESSES.stEth], fees: [FEE_TIERS[index]], pools: [pool] }] : []);
	const quotes = await Promise.all(routes.map((route) => quoteExactOutput(route, wethAmount, blockNumber, signal)));
	if (signal?.aborted) return undefined;
	return quotes.filter((quote): quote is ExactOutputQuote => quote !== undefined).sort((left, right) => left.amountIn < right.amountIn ? -1 : left.amountIn > right.amountIn ? 1 : 0)[0];
}
