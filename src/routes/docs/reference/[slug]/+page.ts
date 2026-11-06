import { referenceEntries } from '#lib/content/reference-manifest.js';

export const prerender = true;

export function entries(): Array<{ slug: string }> {
	return referenceEntries().map(({ slug }) => ({ slug }));
}
