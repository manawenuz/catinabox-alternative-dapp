<script lang="ts">
	import { resolve } from '$app/paths';
	import Guide from '../../../../docs/deployed-behavior.md';
</script>

<svelte:head>
	<title>Deployed behavior — Cat in a Box</title>
	<meta name="description" content="A source-linked guide to Cat-in-a-Box fund locations, Uniswap liquidity, fees, boxFEE backing, staking rewards, and direct boxETH-to-stETH redemption." />
</svelte:head>

<section class="container guide-page">
	<a class="back-link" href={resolve('/docs/')}>← Documentation catalog</a>
	<article class="prose"><Guide /></article>
</section>

<style>
	.guide-page { max-width: 920px; padding-block: 28px 90px; }
	.back-link { display: inline-block; margin-bottom: 28px; color: var(--mint); font-size: 0.76rem; text-decoration: none; }
	.prose { color: #d5d9d6; font-size: 0.93rem; line-height: 1.8; }
	.prose :global(h1) { margin: 0 0 1.4rem; color: var(--text); font-size: clamp(2.5rem, 6vw, 4.2rem); letter-spacing: -0.075em; line-height: 1.05; }
	.prose :global(h2) { margin: 2.6rem 0 0.8rem; color: var(--text); font-size: 1.6rem; letter-spacing: -0.05em; }
	.prose :global(h3) { margin: 2rem 0 0.6rem; color: var(--text); font-size: 1.1rem; }
	.prose :global(p) { margin: 0.85rem 0; }
	.prose :global(a) { color: var(--mint); }
	.prose :global(code) { border: 1px solid var(--border); border-radius: 3px; padding: 0.05rem 0.25rem; color: #b7f8d8; background: #101613; font-size: 0.88em; }
	.prose :global(pre) { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; padding: 16px; background: #080b09; line-height: 1.65; }
	.prose :global(pre code) { border: 0; padding: 0; background: transparent; color: #b7f8d8; }
	.prose :global(table) { width: 100%; border-collapse: collapse; margin-block: 1.2rem; font-size: 0.83rem; }
	.prose :global(th), .prose :global(td) { border: 1px solid var(--border); padding: 0.65rem 0.75rem; text-align: left; }
	.prose :global(th) { color: var(--mint); background: #111613; }
	.prose :global(ul) { padding-left: 1.25rem; }
	.prose :global(li) { padding-left: 0.2rem; }
	@media (max-width: 640px) {
		.prose { font-size: 0.87rem; }
		.prose :global(table) { display: block; overflow-x: auto; white-space: nowrap; }
	}
</style>
