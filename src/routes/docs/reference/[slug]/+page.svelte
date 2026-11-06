<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { loadReference } from '#lib/content/reference-loader.js';

	const reference = $derived(loadReference(page.params.slug));
	const checkedDate = $derived(reference ? new Date(reference.metadata.checkedAt).toLocaleDateString('en', { dateStyle: 'long' }) : '');
</script>

<svelte:head>
	<title>{reference ? `${reference.metadata.title} — Documentation catalog` : 'Page not found — Documentation catalog'}</title>
	{#if reference}<meta name="description" content={reference.metadata.summary} />{/if}
</svelte:head>

{#if reference}
	{@const ReferenceComponent = reference.component}
	<section class="container reference-page">
		<div class="crumbs">
			<a href={resolve('/docs/')}>← Documentation</a>
			<a href={reference.metadata.sourceUrl} target="_blank" rel="noreferrer">Open published page ↗</a>
		</div>
		<div class="source-note panel">
			<div>
				<p class="eyebrow">Independent summary</p>
				<p class="source-line">Published source: <a href={reference.metadata.sourceUrl} target="_blank" rel="noreferrer">{reference.metadata.sourceUrl}</a></p>
			</div>
			<p class="checked">Link checked<br /><span>{checkedDate}</span></p>
		</div>
		<article class="prose">
			<ReferenceComponent />
		</article>
		<div class="original-link"><a class="button secondary" href={reference.metadata.sourceUrl} target="_blank" rel="noreferrer">Open original page <span aria-hidden="true">↗</span></a></div>
	</section>
{:else}
	<section class="container reference-page"><h1>Page not found</h1><p>Choose another entry from the <a href={resolve('/docs/')}>documentation catalog</a>.</p></section>
{/if}

<style>
	.reference-page { max-width: 920px; padding-block: 28px 86px; }
	.crumbs { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 22px; font-size: 0.75rem; }
	.crumbs a { color: var(--mint); text-decoration: none; }
	.source-note { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 38px; padding: 16px 18px; }
	.source-line { max-width: 690px; margin: 5px 0 0; overflow-wrap: anywhere; color: var(--muted); font-size: 0.72rem; }
	.source-line a { color: var(--text); }
	.checked { margin: 0; color: var(--dim); font-family: 'DM Mono', monospace; font-size: 0.61rem; letter-spacing: 0.04em; line-height: 1.6; text-align: right; text-transform: uppercase; white-space: nowrap; }
	.checked span { color: var(--muted); }
	.prose { color: #d5d9d6; font-size: 0.95rem; line-height: 1.8; }
	.prose :global(h1) { margin: 0 0 1.5rem; color: var(--text); font-size: clamp(2.4rem, 6vw, 4rem); letter-spacing: -0.075em; line-height: 1.05; }
	.prose :global(h2) { margin: 2rem 0 0.7rem; color: var(--text); font-size: 1.35rem; letter-spacing: -0.04em; }
	.prose :global(p) { margin: 0.8rem 0; }
	.prose :global(blockquote) { margin: 0 0 1rem; border-left: 2px solid var(--mint); padding: 0.1rem 0 0.1rem 1rem; color: var(--muted); font-size: 0.78rem; }
	.prose :global(blockquote p) { margin: 0.2rem 0; }
	.prose :global(a) { color: var(--mint); }
	.original-link { margin-top: 34px; border-top: 1px solid var(--border); padding-top: 24px; }
	@media (max-width: 640px) {
		.source-note { align-items: flex-start; flex-direction: column; }
		.checked { text-align: left; }
	}
</style>
