<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { tick, type Component } from 'svelte';

	type Props = {
		article: Component;
		title: string;
		summary: string;
		eyebrow?: string;
		sourceUrl?: string;
		checkedAt?: string;
	};
	type TocItem = { id: string; label: string; level: number };

	let { article: Article, title, summary, eyebrow = 'Protocol documentation', sourceUrl, checkedAt }: Props = $props();
	let articleElement = $state<HTMLElement | undefined>(undefined);
	let toc = $state<TocItem[]>([]);

	function slugify(value: string): string {
		return value
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLocaleLowerCase()
			.replace(/[^a-z0-9\s-]/g, '')
			.trim()
			.replace(/\s+/g, '-') || 'section';
	}

	async function refreshToc() {
		await tick();
		if (!articleElement) {
			toc = [];
			return;
		}
		const used = new Set<string>();
		toc = Array.from(articleElement.querySelectorAll<HTMLElement>('h2, h3')).map((heading) => {
			const base = slugify(heading.textContent ?? '');
			let id = heading.id || base;
			let suffix = 2;
			while (used.has(id)) id = `${base}-${suffix++}`;
			used.add(id);
			heading.id = id;
			return { id, label: heading.textContent?.trim() || 'Section', level: Number(heading.tagName.slice(1)) };
		});
	}

	afterNavigate(() => {
		void refreshToc();
	});

	const checkedDate = $derived(checkedAt ? new Date(checkedAt).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' }) : '');
</script>

<svelte:head>
	<title>{title} — Cat in a Box documentation</title>
	<meta name="description" content={summary} />
</svelte:head>

<div class="article-page">
	<header class="article-header">
		<p class="eyebrow">{eyebrow}</p>
		<h1>{title}</h1>
		<p class="article-summary">{summary}</p>
		{#if sourceUrl}
			<div class="article-meta">
				<span>Current behavior guide</span>
				<a href={sourceUrl} target="_blank" rel="noreferrer">Original topic page <span aria-hidden="true">↗</span></a>
				{#if checkedDate}<span class="source-date">Source link checked {checkedDate}</span>{/if}
			</div>
		{/if}
	</header>

	{#if toc.length > 1}
		<nav class="article-toc" aria-label="On this page">
			<p>On this page</p>
			<ul>
				{#each toc as item (item.id)}
					<li class:nested={item.level > 2}><a href={`#${item.id}`}>{item.label}</a></li>
				{/each}
			</ul>
		</nav>
	{/if}

	<article bind:this={articleElement} class="prose"><Article /></article>

	<footer class="article-footer">
		<p>Reviewed against the current app and deployed-behavior notes on 6 November 2026.</p>
		{#if sourceUrl}<a href={sourceUrl} target="_blank" rel="noreferrer">Open the original page for historical context ↗</a>{/if}
	</footer>
</div>

<style>
	.article-page { width: min(100%, 980px); padding: 7px 0 28px; }
	.article-header { margin-bottom: 24px; }
	.article-header h1 { margin: 9px 0 11px; color: var(--text); font-size: clamp(2.2rem, 5vw, 3.6rem); letter-spacing: -.075em; line-height: 1.04; }
	.article-summary { max-width: 780px; margin: 0; color: var(--muted); font-size: .94rem; line-height: 1.7; }
	.article-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 15px; margin-top: 16px; border-top: 1px solid var(--border); padding-top: 11px; color: var(--dim); font-size: .66rem; }
	.article-meta a { color: var(--mint); text-decoration: none; }
	.source-date { font-family: 'DM Mono', monospace; font-size: .6rem; }
	.article-toc { margin: 20px 0 30px; border: 1px solid var(--border); border-radius: 6px; padding: 13px 15px; background: var(--surface); }
	.article-toc p { margin: 0 0 8px; color: var(--mint); font-family: 'DM Mono', monospace; font-size: .58rem; letter-spacing: .1em; text-transform: uppercase; }
	.article-toc ul { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 0; padding: 0; list-style: none; }
	.article-toc li.nested { padding-left: 8px; }
	.article-toc a { color: var(--muted); font-size: .68rem; text-decoration: none; }
	.article-toc a:hover { color: var(--mint); }
	.prose { color: #d5d9d6; font-size: .91rem; line-height: 1.8; }
	.prose :global(h2) { margin: 2.5rem 0 .75rem; color: var(--text); font-size: 1.45rem; letter-spacing: -.045em; line-height: 1.2; scroll-margin-top: 25px; }
	.prose :global(h3) { margin: 1.8rem 0 .55rem; color: var(--text); font-size: 1.06rem; letter-spacing: -.025em; scroll-margin-top: 25px; }
	.prose :global(p) { margin: .8rem 0; }
	.prose :global(a) { color: var(--mint); }
	.prose :global(strong) { color: #eef3f0; }
	.prose :global(blockquote) { margin: 1.2rem 0; border-left: 2px solid var(--mint); padding: .1rem 0 .1rem 1rem; color: var(--muted); }
	.prose :global(ul), .prose :global(ol) { padding-left: 1.3rem; }
	.prose :global(li) { margin: .35rem 0; padding-left: .15rem; }
	.prose :global(li::marker) { color: var(--mint); }
	.prose :global(code) { border: 1px solid var(--border); border-radius: 3px; padding: .04rem .25rem; color: #b7f8d8; background: #101613; font-size: .87em; overflow-wrap: anywhere; }
	.prose :global(pre) { overflow-x: auto; border: 1px solid var(--border); border-radius: 6px; padding: 15px; background: #080b09; line-height: 1.65; }
	.prose :global(pre code) { border: 0; padding: 0; background: transparent; color: #b7f8d8; }
	.prose :global(table) { width: 100%; border-collapse: collapse; margin: 1.2rem 0; font-size: .77rem; }
	.prose :global(th), .prose :global(td) { border: 1px solid var(--border); padding: .62rem .68rem; text-align: left; vertical-align: top; }
	.prose :global(th) { color: var(--mint); background: #111613; font-size: .69rem; }
	.prose :global(hr) { margin: 2rem 0; border: 0; border-top: 1px solid var(--border); }
	.article-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px 20px; margin-top: 38px; border-top: 1px solid var(--border); padding-top: 15px; color: var(--dim); font-size: .64rem; line-height: 1.6; }
	.article-footer p { margin: 0; }
	.article-footer a { color: var(--mint); text-decoration: none; }
	@media (max-width: 700px) {
		.article-page { padding-top: 4px; }
		.article-header h1 { font-size: clamp(2rem, 10vw, 2.8rem); }
		.article-summary { font-size: .86rem; }
		.prose { font-size: .86rem; }
		.prose :global(table) { display: block; overflow-x: auto; white-space: nowrap; }
		.article-toc ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
	}
</style>
