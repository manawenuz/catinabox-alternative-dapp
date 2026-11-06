import { referenceEntries } from './reference-manifest.js';

export type DocsNavigationLink = {
	slug: string;
	title: string;
	summary: string;
	searchText: string;
	href: string;
};

export type DocsNavigationSection = {
	title: string;
	links: DocsNavigationLink[];
};

const references = new Map(referenceEntries().map((entry) => [entry.slug, entry]));
const referenceMarkdown = import.meta.glob<string>('../../../docs/reference/**/*.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});
const deployedMarkdown = import.meta.glob<string>('../../../docs/deployed-behavior.md', {
	eager: true,
	query: '?raw',
	import: 'default'
});

export function normalizeDocsSearchText(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/gi, ' ')
		.toLocaleLowerCase();
}

function searchableText(markdown: string): string {
	const plainText = markdown
		.replace(/<!--[\s\S]*?-->/g, ' ')
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
		.replace(/https?:\/\/\S+/g, ' ');
	return normalizeDocsSearchText(plainText);
}

function reference(slug: string): DocsNavigationLink | undefined {
	const entry = references.get(slug);
	if (!entry) return undefined;
	return {
		slug: entry.slug,
		title: entry.title,
		summary: entry.summary,
		searchText: searchableText(referenceMarkdown[`../../../${entry.file}`] ?? ''),
		href: `/docs/reference/${entry.slug}/`
	};
}

const deployedBehavior: DocsNavigationLink = {
	slug: 'deployed-behavior',
	title: 'Deployed behavior',
	summary: 'Version-specific yield fees, boxFEE accounting, staking rewards, redemption, and a block-stamped mainnet snapshot.',
	searchText: searchableText(deployedMarkdown['../../../docs/deployed-behavior.md'] ?? ''),
	href: '/docs/deployed-behavior/'
};

export function docsNavigationSections(): DocsNavigationSection[] {
	const definitions: Array<{ title: string; slugs: string[] }> = [
		{ title: 'Start here', slugs: ['intro', 'use-cases'] },
		{ title: 'Using the app', slugs: ['user-guide', 'approvals'] },
		{ title: 'Protocol behavior', slugs: ['components', 'v1-1', 'deployed-behavior'] },
		{ title: 'Resolution', slugs: ['resolve'] },
		{ title: 'Tokens and records', slugs: ['tokenomics', 'asset-valuations'] },
		{ title: 'Reference', slugs: ['contracts', 'admin-controls'] },
		{ title: 'Video archive', slugs: ['explainer', 'teaser'] }
	];

	return definitions
		.map((section) => ({
			title: section.title,
			links: section.slugs
				.map((slug) => (slug === 'deployed-behavior' ? deployedBehavior : reference(slug)))
				.filter((link): link is DocsNavigationLink => link !== undefined)
		}))
		.filter((section) => section.links.length > 0);
}
