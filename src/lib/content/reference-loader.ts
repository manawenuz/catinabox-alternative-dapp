import type { Component } from 'svelte';
import { referenceBySlug, type ReferenceMetadata } from './reference-manifest.js';

type MarkdownModule = { default: Component };

const markdownFiles = import.meta.glob<MarkdownModule>('../../../docs/reference/**/*.md', { eager: true });

export type LoadedReference = {
	metadata: ReferenceMetadata;
	component: Component;
};

export function loadReference(slug: string): LoadedReference | undefined {
	const metadata = referenceBySlug(slug);
	if (!metadata) return undefined;

	const modulePath = `../../../${metadata.file}`;
	const module = markdownFiles[modulePath];
	if (!module) return undefined;

	return { metadata, component: module.default };
}
