import { formatUnits, parseUnits } from 'viem';

export function parseTokenAmount(value: string, decimals: number): bigint | undefined {
	const trimmed = value.trim();
	if (!trimmed || !/^\d+(\.\d*)?$/.test(trimmed)) return undefined;
	const fraction = trimmed.split('.')[1] ?? '';
	if (fraction.length > decimals) return undefined;
	try {
		return parseUnits(trimmed, decimals);
	} catch {
		return undefined;
	}
}

export function formatTokenAmount(value: bigint, decimals: number, maxFraction = 4): string {
	const formatted = formatUnits(value, decimals);
	const [whole, fraction = ''] = formatted.split('.');
	const clipped = fraction.slice(0, maxFraction).replace(/0+$/, '');
	return clipped ? `${whole}.${clipped}` : whole;
}

export function formatBasisPoints(value: bigint, fractionDigits = 2): string {
	const scale = 10n ** BigInt(fractionDigits);
	const scaled = (value * scale) / 100n;
	const whole = scaled / scale;
	const remainder = (scaled % scale).toString().padStart(fractionDigits, '0').replace(/0+$/, '');
	return remainder ? `${whole}.${remainder}%` : `${whole}%`;
}

export function shortenAddress(address: string, prefix = 6, suffix = 4): string {
	return address.length > prefix + suffix + 3 ? `${address.slice(0, prefix)}…${address.slice(-suffix)}` : address;
}
