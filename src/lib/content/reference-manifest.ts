import manifestJson from '../../../docs/reference/manifest.json';

export type ReferenceMetadata = {
	slug: string;
	title: string;
	sourceUrl: string;
	checkedAt: string;
	summary: string;
	file: string;
	mediaUrl?: string;
};

const manifest = manifestJson as ReferenceMetadata[];

export function referenceEntries(): ReferenceMetadata[] {
	return manifest;
}

export function referenceBySlug(slug: string): ReferenceMetadata | undefined {
	return manifest.find((entry) => entry.slug === slug);
}
