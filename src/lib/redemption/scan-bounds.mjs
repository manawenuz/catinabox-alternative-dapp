export const MAX_RPC_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_CACHED_ADDRESSES = 10_000;
export const MAX_SCAN_REQUESTS_PER_RESUME = 1_000;
export const MAX_SCAN_DURATION_PER_RESUME_MS = 5 * 60 * 1_000;

/**
 * Bound work toward an RPC-provided chain height during one continuous scan session.
 * @param {number} requests
 * @param {number} startedAt
 * @param {number} [now]
 * @returns {boolean}
 */
export function scanBudgetExceeded(requests, startedAt, now = performance.now()) {
	return requests >= MAX_SCAN_REQUESTS_PER_RESUME || now - startedAt >= MAX_SCAN_DURATION_PER_RESUME_MS;
}

/**
 * Read and parse an RPC response with a byte budget that applies to streamed data.
 * @param {Response} response
 * @param {AbortSignal} signal
 * @param {number} [maxBytes]
 * @param {string} [provider]
 * @returns {Promise<unknown>}
 */
export async function readRpcResponseJson(response, signal, maxBytes = MAX_RPC_RESPONSE_BYTES, provider = 'RPC') {
	const body = response.body;
	if (!body) throw new Error(`${provider} returned an empty response body.`);

	const contentLength = response.headers.get('content-length');
	const declaredSize = contentLength && /^\d+$/.test(contentLength) ? Number(contentLength) : undefined;
	if (declaredSize !== undefined && declaredSize > maxBytes) {
		void body.cancel().catch(() => {});
		throw responseLimitError(maxBytes, provider);
	}

	const reader = body.getReader();
	let bytes = new Uint8Array(Math.min(maxBytes, declaredSize ?? 1_024));
	let bytesRead = 0;
	const cancelOnAbort = () => { void reader.cancel().catch(() => {}); };
	signal.addEventListener('abort', cancelOnAbort, { once: true });

	try {
		while (true) {
			throwIfAborted(signal, provider);
			const { done, value } = await reader.read();
			throwIfAborted(signal, provider);
			if (done) break;
			const nextBytesRead = bytesRead + value.byteLength;
			if (nextBytesRead > maxBytes) throw responseLimitError(maxBytes, provider);
			if (nextBytesRead > bytes.byteLength) {
				let capacity = Math.max(1, bytes.byteLength);
				while (capacity < nextBytesRead) capacity = Math.min(maxBytes, capacity * 2);
				const expanded = new Uint8Array(capacity);
				expanded.set(bytes.subarray(0, bytesRead));
				bytes = expanded;
			}
			bytes.set(value, bytesRead);
			bytesRead = nextBytesRead;
		}
	} catch (error) {
		void reader.cancel(error).catch(() => {});
		throw error;
	} finally {
		signal.removeEventListener('abort', cancelOnAbort);
		reader.releaseLock();
	}

	return JSON.parse(new TextDecoder().decode(bytes.subarray(0, bytesRead)));
}

/**
 * Merge persisted scan addresses while refusing unsafe growth instead of truncating history.
 * @param {string[]} existing
 * @param {string[]} incoming
 * @returns {string[]}
 */
export function mergeScanAddresses(existing, incoming) {
	const addresses = new Set(existing.map((address) => address.toLowerCase()));
	for (const address of incoming) {
		const normalized = address.toLowerCase();
		if (addresses.has(normalized)) continue;
		if (addresses.size >= MAX_CACHED_ADDRESSES) throw scanAddressLimitError();
		addresses.add(normalized);
	}
	return [...addresses];
}

/** @returns {Error} */
export function scanAddressLimitError() {
	return new Error(`Saved redemption history is at or would exceed the ${MAX_CACHED_ADDRESSES}-address safety limit. The last completed block checkpoint is preserved. Clear saved history to restart, or enter a target address manually.`);
}

/**
 * @param {AbortSignal} signal
 * @param {string} provider
 * @returns {void}
 */
function throwIfAborted(signal, provider) {
	if (!signal.aborted) return;
	throw signal.reason instanceof Error ? signal.reason : new Error(`The ${provider} response read was aborted.`);
}

/** @param {number} maxBytes @param {string} provider @returns {Error} */
function responseLimitError(maxBytes, provider) {
	return new Error(`${provider} response exceeded the ${maxBytes}-byte safety limit.`);
}
