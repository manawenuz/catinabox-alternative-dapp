<script lang="ts">
	import { resolve } from '$app/paths';
	import { referenceEntries } from '#lib/content/reference-manifest.js';

	const entries = referenceEntries();
</script>

<svelte:head>
	<title>Documentation catalog — Cat in a Box</title>
	<meta name="description" content="Source-linked summaries of the published Cat-in-a-Box documentation and a guide to deployed fund locations, liquidity, and contract behavior." />
</svelte:head>

<section class="container docs-page">
	<p class="eyebrow">Docs / Reference library</p>
	<div class="heading-row">
		<div>
			<h1>Documentation</h1>
			<p class="intro">Browse concise summaries of the published project docs, or open the original page for its full wording and figures.</p>
		</div>
		<a class="button secondary" href={resolve('/docs/deployed-behavior/')}>Deployed behavior <span aria-hidden="true">↗</span></a>
	</div>

	<article class="behavior panel">
		<div class="behavior-icon" aria-hidden="true">↗</div>
		<div>
			<p class="eyebrow">Live contract reference</p>
			<h2>What the deployed code does</h2>
			<p>Review where protocol assets sit, current Uniswap liquidity, fee accounting, boxFEE backing, staking rewards, and boxETH-to-stETH resolution against deployed contracts.</p>
		</div>
		<a class="card-link" href={resolve('/docs/deployed-behavior/')}>Read the guide <span aria-hidden="true">→</span></a>
	</article>

	<div class="list-header">
		<h2>Published pages</h2>
		<span>{entries.length} source links</span>
	</div>
	<div class="entry-list">
		{#each entries as entry, index (entry.slug)}
			<a class="entry panel" href={resolve(`/docs/reference/${entry.slug}/`)}>
				<span class="entry-index">{String(index + 1).padStart(2, '0')}</span>
				<span class="entry-main">
					<strong>{entry.title}</strong>
					<span>{entry.summary}</span>
				</span>
				<span class="entry-arrow" aria-hidden="true">↗</span>
			</a>
		{/each}
	</div>
	<p class="catalog-note">Each local entry is an original summary. Full text, illustrations, and media remain on the <a href="https://docs.catinabox.finance" target="_blank" rel="noreferrer">published documentation site</a>.</p>
</section>

<style>
	.docs-page { padding-block: 54px 80px; }
	h1 { margin: 0; font-size: clamp(2.8rem, 7vw, 4.6rem); letter-spacing: -0.075em; line-height: 1; }
	.heading-row { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; margin-top: 20px; }
	.intro { max-width: 650px; margin: 1rem 0 0; color: var(--muted); line-height: 1.7; }
	.behavior { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 18px; margin-top: 48px; padding: 24px; }
	.behavior-icon { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid #3e584b; border-radius: 6px; color: var(--mint); font-size: 1.1rem; }
	.behavior h2 { margin: 0.35rem 0; font-size: 1.2rem; }
	.behavior p:not(.eyebrow) { margin: 0; color: var(--muted); font-size: 0.83rem; line-height: 1.6; }
	.card-link { color: var(--mint); font-size: 0.8rem; font-weight: 800; text-decoration: none; white-space: nowrap; }
	.list-header { display: flex; align-items: baseline; justify-content: space-between; margin: 44px 0 12px; }
	.list-header h2 { margin: 0; font-size: 1.1rem; }
	.list-header span { color: var(--dim); font-family: 'DM Mono', monospace; font-size: 0.68rem; text-transform: uppercase; }
	.entry-list { display: grid; gap: 8px; }
	.entry { display: grid; grid-template-columns: 38px minmax(0, 1fr) 20px; align-items: start; gap: 13px; padding: 16px; text-decoration: none; transition: border-color 120ms ease, background 120ms ease; }
	.entry:hover { border-color: #3c725b; background: #151c18; color: var(--text); }
	.entry-index { padding-top: 2px; color: var(--mint); font-family: 'DM Mono', monospace; font-size: 0.72rem; }
	.entry-main { display: grid; gap: 5px; }
	.entry-main strong { font-size: 0.9rem; }
	.entry-main > span { color: var(--muted); font-size: 0.78rem; line-height: 1.6; }
	.entry-arrow { color: var(--dim); }
	.catalog-note { margin: 20px 0 0; color: var(--dim); font-size: 0.76rem; line-height: 1.6; }
	.catalog-note a { color: var(--mint); }
	@media (max-width: 720px) {
		.heading-row { flex-direction: column; align-items: flex-start; gap: 1.3rem; }
		.behavior { grid-template-columns: auto minmax(0, 1fr); }
		.behavior .card-link { grid-column: 2; }
	}
</style>
