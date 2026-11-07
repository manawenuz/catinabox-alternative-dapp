import { readdir, readFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

const jwt = process.env.PINATA_JWT;
const directory = resolve(process.argv[2] ?? 'build');
// Give every part one shared parent path so Pinata imports a single folder.
const uploadRoot = 'catinabox-finance';

if (!jwt) {
	console.error('PINATA_JWT is required to upload the build to Pinata.');
	process.exit(1);
}

const mimeTypes = new Map([
	['.css', 'text/css'], ['.html', 'text/html'], ['.ico', 'image/x-icon'], ['.jpeg', 'image/jpeg'],
	['.jpg', 'image/jpeg'], ['.js', 'text/javascript'], ['.json', 'application/json'], ['.map', 'application/json'],
	['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.txt', 'text/plain'], ['.webp', 'image/webp'],
	['.woff', 'font/woff'], ['.woff2', 'font/woff2'], ['.xml', 'application/xml']
]);

async function collectFiles(path) {
	const entries = await readdir(path, { withFileTypes: true });
	const files = [];
	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		const child = resolve(path, entry.name);
		if (entry.isDirectory()) files.push(...await collectFiles(child));
		else if (entry.isFile()) files.push(child);
		else throw new Error(`Unsupported build entry: ${relative(directory, child)}`);
	}
	return files;
}

async function main() {
	const files = await collectFiles(directory);
	if (!files.length) throw new Error(`No files found in ${directory}.`);
	console.error(`Uploading ${files.length} files from the static build to Pinata.`);

	const form = new FormData();
	form.append('pinataMetadata', JSON.stringify({ name: 'catinabox-finance-static-site' }));
	form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));
	for (const path of files) {
		const filename = `${uploadRoot}/${relative(directory, path).split(sep).join('/')}`;
		const type = mimeTypes.get(extname(filename).toLowerCase()) ?? 'application/octet-stream';
		const contents = await readFile(path);
		form.append('file', new Blob([contents], { type }), filename);
	}

	const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
		method: 'POST',
		headers: { Authorization: `Bearer ${jwt}` },
		body: form,
		signal: AbortSignal.timeout(120_000)
	});
	let payload;
	try {
		payload = await response.json();
	} catch {
		throw new Error(`Pinata returned HTTP ${response.status} with an invalid JSON response.`);
	}
	if (!response.ok) {
		const detail = payload?.error?.details ?? payload?.error ?? payload?.message ?? 'Pinata rejected the upload.';
		const message = typeof detail === 'string' ? detail : JSON.stringify(detail);
		throw new Error(`Pinata returned HTTP ${response.status}: ${message.replaceAll(jwt, '[redacted]')}`);
	}
	if (typeof payload?.IpfsHash !== 'string' || !payload.IpfsHash) {
		throw new Error('Pinata upload succeeded without returning an IPFS CID.');
	}
	console.log(payload.IpfsHash);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Pinata upload failed.');
	process.exitCode = 1;
});
