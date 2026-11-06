import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = path.join(projectRoot, 'docs/reference');
const sourceRoot = 'https://docs.catinabox.finance';

const pages = [
	{
		slug: 'intro',
		title: 'Protocol overview',
		sourcePath: '/docs/intro/',
		file: 'intro.md',
		summary: 'Current overview of the stETH-backed CDP system, boxETH debt, version-specific yield accounting, direct resolution, and the difference between contract values and market prices.'
	},
	{
		slug: 'use-cases',
		title: 'Ways to use the protocol',
		sourcePath: '/docs/documents/use-cases/',
		file: 'use-cases.md',
		summary: 'Current paths for borrowing against stETH, repaying and withdrawing, using boxFEE and fee staking, and reviewing permissionless CDP resolution.'
	},
	{
		slug: 'user-guide',
		title: 'Borrower guide',
		sourcePath: '/docs/documents/user-guide/',
		file: 'user-guide.md',
		summary: 'Step-by-step guide to connecting on Ethereum mainnet, choosing a CDP, depositing, borrowing, repaying, withdrawing, checking allowances, and using boxFEE and redemption.'
	},
	{
		slug: 'components',
		title: 'Protocol components',
		sourcePath: '/docs/documents/components/',
		file: 'components.md',
		summary: 'How the v1 and v1.1 CDPs, stETH, boxETH, the PSM, the boxFEE vault, fee staking, and external Uniswap routes fit together.'
	},
	{
		slug: 'asset-valuations',
		title: 'Asset valuation',
		sourcePath: '/docs/documents/asset-valuations/',
		file: 'asset-valuations.md',
		summary: 'Distinguish historical boxETH market prices, direct CDP redemption amounts, and boxFEE vault conversions when keeping transaction records.'
	},
	{
		slug: 'contracts',
		title: 'Contracts and addresses',
		sourcePath: '/docs/documents/contracts/',
		file: 'contracts.md',
		summary: 'Ethereum mainnet addresses configured by the app for the CDPs, tokens, PSM, fee-staking contract, and treasury multisig.'
	},
	{
		slug: 'approvals',
		title: 'Token approvals',
		sourcePath: '/docs/documents/approvals/',
		file: 'approvals.md',
		summary: 'Tokens and spenders used for deposits, repayments, redemptions, boxFEE vault actions, and staking, including residual boxETH allowance behavior.'
	},
	{
		slug: 'admin-controls',
		title: 'Admin controls',
		sourcePath: '/docs/documents/admin-controls/',
		file: 'admin-controls.md',
		summary: 'Current fee setters, mutable PSM recipient, dated mainnet settings, and the difference between admin parameters and the per-position repayment flag.'
	},
	{
		slug: 'resolve',
		title: 'Direct resolution',
		sourcePath: '/docs/guides/resolve/',
		file: 'resolve.md',
		summary: 'How `stabilisePeg` applies boxETH to a target position, calculates friction, caps each call at one quarter of debt, and how the read-only scanner ranks candidates.'
	},
	{
		slug: 'tokenomics',
		title: 'boxFEE and staking',
		sourcePath: '/docs/tokenomics/',
		file: 'tokenomics.md',
		summary: 'Current boxETH-backed vault accounting, boxFEE share conversion, non-standard entrypoint behavior, and boxETH rewards from fee staking.'
	},
	{
		slug: 'v1-1',
		title: 'V1 and v1.1',
		sourcePath: '/docs/v1.1/',
		file: 'v1-1.md',
		summary: 'Compare the two live CDP deployments, including yield distribution weights, fee formulas, mint fees, LTV getters, and independent position state.'
	},
	{
		slug: 'explainer',
		title: 'Explainer video (archive)',
		sourcePath: '/docs/videos/explainer/',
		file: 'videos/explainer.md',
		summary: 'Archived early project explainer. Use the current protocol and contract guides for present-day behavior.',
		mediaUrl: 'https://www.youtube.com/watch?v=dbAxSl0yYc8'
	},
	{
		slug: 'teaser',
		title: 'Teaser video (archive)',
		sourcePath: '/docs/videos/teaser/',
		file: 'videos/teaser.md',
		summary: 'Archived project teaser retained for historical context, not as a current feature or contract guide.',
		mediaUrl: 'https://www.youtube.com/watch?v=WEAE3XyF2x4'
	}
];

const manifestPath = path.join(docsRoot, 'manifest.json');
let existingManifest = [];
try {
	existingManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
	// A new catalog must supply source-check dates before generating its first manifest.
}
const checkedAtBySlug = new Map(existingManifest.map((entry) => [entry.slug, entry.checkedAt]));
const manifest = [];

for (const page of pages) {
	const checkedAt = checkedAtBySlug.get(page.slug);
	if (!checkedAt) throw new Error(`Verify ${page.slug} at its source URL, then add a checkedAt value before regenerating the catalog.`);
	const sourceUrl = new URL(page.sourcePath, sourceRoot).href;
	manifest.push({
		slug: page.slug,
		title: page.title,
		sourceUrl,
		checkedAt,
		summary: page.summary,
		file: `docs/reference/${page.file}`,
		...(page.mediaUrl ? { mediaUrl: page.mediaUrl } : {})
	});
	console.info(`Updated manifest entry ${page.slug}`);
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.info(`Wrote ${manifest.length} source-linked summaries.`);

