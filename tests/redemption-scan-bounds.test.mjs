import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MAX_CACHED_ADDRESSES,
	mergeScanAddresses,
	readRpcResponseJson,
	scanBudgetExceeded
} from '../src/lib/redemption/scan-bounds.mjs';

test('reads a normal RPC JSON response within the byte limit', async () => {
	const response = new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: [{ topics: [] }] }));

	assert.deepEqual(await readRpcResponseJson(response, new AbortController().signal), {
		jsonrpc: '2.0', id: 1, result: [{ topics: [] }]
	});
});

test('a small response does not allocate the full response safety budget', async () => {
	const response = new Response('{"result":[]}');
	const allocations = [];
	const NativeUint8Array = globalThis.Uint8Array;
	globalThis.Uint8Array = new Proxy(NativeUint8Array, {
		construct(target, args, newTarget) {
			if (typeof args[0] === 'number') allocations.push(args[0]);
			return Reflect.construct(target, args, newTarget);
		}
	});
	try {
		await readRpcResponseJson(response, new AbortController().signal);
	} finally {
		globalThis.Uint8Array = NativeUint8Array;
	}

	assert.ok(allocations.every((length) => length < 4_096));
});

test('rejects a chunked RPC body above the byte limit without Content-Length', async () => {
	const response = new Response(new ReadableStream({
		start(controller) {
			controller.enqueue(new Uint8Array([123, 34, 120, 34, 58, 49]));
			controller.close();
		}
	}));

	await assert.rejects(readRpcResponseJson(response, new AbortController().signal, 5), /5-byte safety limit/);
});

test('rejects an RPC response whose declared size is already over the byte limit', async () => {
	let streamCancelled = false;
	const response = new Response(new ReadableStream({
		start(controller) { controller.enqueue(new Uint8Array([123])); },
		cancel() { streamCancelled = true; }
	}), { headers: { 'content-length': '6' } });

	await assert.rejects(readRpcResponseJson(response, new AbortController().signal, 5), /5-byte safety limit/);
	assert.equal(streamCancelled, true);
});

test('aborting after headers cancels a stalled RPC body read', async () => {
	let streamCancelled = false;
	const response = new Response(new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","result":['));
		},
		cancel() { streamCancelled = true; }
	}));
	const controller = new AbortController();
	const pendingRead = readRpcResponseJson(response, controller.signal);

	controller.abort();

	await assert.rejects(pendingRead, (error) => error.name === 'AbortError');
	assert.equal(streamCancelled, true);
});

test('merges case-insensitive address duplicates at the limit', () => {
	const existing = Array.from({ length: MAX_CACHED_ADDRESSES }, (_, index) => `0x${index.toString(16)}`);

	assert.equal(mergeScanAddresses(existing, [existing[0].toUpperCase()]).length, MAX_CACHED_ADDRESSES);
});

test('rejects accumulated addresses beyond the safety limit instead of truncating', () => {
	const existing = Array.from({ length: MAX_CACHED_ADDRESSES }, (_, index) => `0x${index.toString(16)}`);

	assert.throws(() => mergeScanAddresses(existing, ['0x100000']), /10000-address safety limit/);
});

test('bounds RPC-driven scan work per user resume by request count and elapsed time', () => {
	assert.equal(scanBudgetExceeded(999, 1_000, 1_000), false);
	assert.equal(scanBudgetExceeded(1_000, 1_000, 1_000), true);
	assert.equal(scanBudgetExceeded(0, 1_000, 300_999), false);
	assert.equal(scanBudgetExceeded(0, 1_000, 301_000), true);
});
