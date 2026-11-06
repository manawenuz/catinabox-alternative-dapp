<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import DocsArticle from '#lib/components/DocsArticle.svelte';
	import { loadReference } from '#lib/content/reference-loader.js';

	const reference = $derived(loadReference(page.params.slug));
</script>

{#if reference}
	<DocsArticle
		article={reference.component}
		title={reference.metadata.title}
		summary={reference.metadata.summary}
		sourceUrl={reference.metadata.sourceUrl}
		checkedAt={reference.metadata.checkedAt}
	/>
{:else}
	<section class="not-found">
		<p class="eyebrow">Documentation</p>
		<h1>Page not found</h1>
		<p>Choose another guide from the <a href={resolve('/docs/')}>documentation home</a>.</p>
	</section>
{/if}

<style>
	.not-found { padding: 36px 0; }
	.not-found h1 { margin: 10px 0; font-size: clamp(2.3rem, 6vw, 3.8rem); letter-spacing: -.07em; }
	.not-found p:not(.eyebrow) { color: var(--muted); font-size: .82rem; }
	.not-found a { color: var(--mint); }
</style>
