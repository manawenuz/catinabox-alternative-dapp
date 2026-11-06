import type { Address } from 'viem';
import { CHAIN_ID, cdpAddress, DEPLOYMENT_BLOCKS, type CdpVersion } from '#lib/chain/config.js';
import type { CachedScan } from './types.js';
import { MAX_CACHED_ADDRESSES, mergeScanAddresses, scanAddressLimitError } from './scan-bounds.mjs';

const DATABASE = 'catinabox-redemption-scan';
const STORE = 'history';
const VERSION = 1;

function cacheKey(version: CdpVersion): string {
	return `${CHAIN_ID}:${cdpAddress(version).toLowerCase()}`;
}

function openDatabase(): Promise<IDBDatabase> {
	if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DATABASE, VERSION);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'key' });
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('Unable to open the local scan cache.'));
	});
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('The local scan cache request failed.'));
	});
}

export function emptyScan(version: CdpVersion): CachedScan {
	return {
		key: cacheKey(version),
		chainId: CHAIN_ID,
		contract: cdpAddress(version),
		version,
		addresses: [],
		nextBlock: DEPLOYMENT_BLOCKS[version].toString(),
		throughBlock: DEPLOYMENT_BLOCKS[version].toString(),
		updatedAt: Date.now()
	};
}

export async function readScan(version: CdpVersion): Promise<CachedScan> {
	const database = await openDatabase();
	try {
		const transaction = database.transaction(STORE, 'readonly');
		const record = await requestResult(transaction.objectStore(STORE).get(cacheKey(version))) as CachedScan | undefined;
		if (record && (!Array.isArray(record.addresses) || record.addresses.length > MAX_CACHED_ADDRESSES)) throw scanAddressLimitError();
		return record ?? emptyScan(version);
	} finally { database.close(); }
}

export async function saveScanProgress(
	version: CdpVersion,
	addresses: Address[],
	nextBlock: bigint,
	throughBlock: bigint
): Promise<CachedScan> {
	const database = await openDatabase();
	try {
		const transaction = database.transaction(STORE, 'readwrite');
		const store = transaction.objectStore(STORE);
		const current = await requestResult(store.get(cacheKey(version))) as CachedScan | undefined;
		if (current && (!Array.isArray(current.addresses) || current.addresses.length > MAX_CACHED_ADDRESSES)) throw scanAddressLimitError();
		const combined = mergeScanAddresses(current?.addresses ?? [], addresses);
		const record: CachedScan = {
			key: cacheKey(version), chainId: CHAIN_ID, contract: cdpAddress(version), version,
			addresses: combined as Address[], nextBlock: nextBlock.toString(),
			throughBlock: throughBlock.toString(), updatedAt: Date.now()
		};
		store.put(record);
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error ?? new Error('Unable to save the scan checkpoint.'));
			transaction.onabort = () => reject(transaction.error ?? new Error('The scan checkpoint was aborted.'));
		});
		return record;
	} finally { database.close(); }
}

export async function clearScan(version: CdpVersion): Promise<void> {
	const database = await openDatabase();
	try {
		const transaction = database.transaction(STORE, 'readwrite');
		transaction.objectStore(STORE).delete(cacheKey(version));
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () => reject(transaction.error ?? new Error('Unable to clear the scan cache.'));
		});
	} finally { database.close(); }
}

export function scanContract(version: CdpVersion): Address {
	return cdpAddress(version);
}
