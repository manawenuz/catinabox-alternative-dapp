<script lang="ts">
	import { resolve } from '$app/paths';
	import { docsNavigationSections } from '#lib/content/docs-navigation.js';

	const sections = docsNavigationSections();
	const featured = [
		{
			label: 'Start here',
			title: 'Borrower guide',
			summary: 'Connect, choose a CDP, deposit stETH, borrow boxETH, and review an action before signing.',
			href: '/docs/reference/user-guide/'
		},
		{
			label: 'Understand the contracts',
			title: 'V1 and v1.1',
			summary: 'Compare their yield weights, fee formulas, mint fees, and separate position state.',
			href: '/docs/reference/v1-1/'
		},
		{
			label: 'Resolver workflow',
			title: 'Direct resolution',
			summary: 'Learn the debt cap, friction calculation, target effects, and scanner limits.',
			href: '/docs/reference/resolve/'
		}
	];
</script>

<svelte:head>
	<title>Documentation — Cat in a Box</title>
	<meta name="description" content="Practical documentation for the current Cat-in-a-Box app and deployed Ethereum contracts." />
</svelte:head>

<div class="docs-home">
	<section class="welcome">
		<p class="eyebrow">Docs / Current behavior</p>
		<h1>Cat-in-a-Box<br />documentation</h1>
		<p class="welcome-copy">Practical guides to the current app and deployed Ethereum contracts, organized by the task you want to complete.</p>
		<div class="welcome-actions">
			<a class="button" href={resolve('/app/')}>Open the app <span aria-hidden="true">↗</span></a>
			<a class="text-link" href={resolve('/docs/deployed-behavior/')}>Read deployed behavior <span aria-hidden="true">→</span></a>
		</div>
	</section>

	<aside class="freshness-note" role="note">
		<span class="note-mark" aria-hidden="true">i</span>
		<p>These articles describe current contract behavior reviewed on <strong>6 November 2026</strong>. Any block snapshot is dated, mutable settings are read live by the app, and market values come from external markets.</p>
	</aside>

	<section class="featured-grid" aria-label="Suggested reading">
		{#each featured as item (item.href)}
			<a class="featured panel" href={resolve(item.href)}>
				<span class="eyebrow">{item.label}</span>
				<strong>{item.title}</strong>
				<span class="featured-summary">{item.summary}</span>
				<span class="featured-arrow" aria-hidden="true">↗</span>
			</a>
		{/each}
	</section>

	<div class="article-groups">
		{#each sections as section (section.title)}
			<section class="article-group">
				<header>
					<h2>{section.title}</h2>
					<span>{section.links.length} {section.links.length === 1 ? 'page' : 'pages'}</span>
				</header>
				<div class="article-list">
					{#each section.links as link (link.slug)}
						<a class="article-link" href={resolve(link.href)}>
							<span><strong>{link.title}</strong><small>{link.summary}</small></span>
							<span class="article-arrow" aria-hidden="true">→</span>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</div>

	<p class="independence-note">Community-maintained reference for an independent interface. Original project pages are linked from the relevant articles for historical context.</p>
</div>

<style>
	.docs-home { width: min(100%, 1010px); padding: 5px 0 25px; }
	.welcome { padding: 11px 0 27px; }
	.welcome h1 { margin: 13px 0; font-size: clamp(2.7rem, 7vw, 4.7rem); letter-spacing: -.08em; line-height: .99; }
	.welcome-copy { max-width: 650px; margin: 0; color: var(--muted); font-size: .98rem; line-height: 1.7; }
	.welcome-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 14px 22px; margin-top: 23px; }
	.welcome-actions .button { min-height: 42px; font-size: .75rem; }
	.text-link { color: var(--mint); font-size: .75rem; font-weight: 700; text-decoration: none; }
	.freshness-note { display: flex; align-items: flex-start; gap: 11px; border: 1px solid #34483b; border-radius: 6px; padding: 13px 15px; background: #101713; }
	.note-mark { display: grid; width: 20px; height: 20px; flex: 0 0 auto; place-items: center; border: 1px solid #49785f; border-radius: 50%; color: var(--mint); font-family: Georgia, serif; font-size: .8rem; font-style: italic; }
	.freshness-note p { margin: 0; color: #b3c0b8; font-size: .71rem; line-height: 1.65; }
	.freshness-note strong { color: var(--text); }
	.featured-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; margin-top: 17px; }
	.featured { position: relative; display: grid; min-height: 150px; align-content: start; gap: 9px; padding: 16px; text-decoration: none; transition: border-color 120ms ease, background 120ms ease; }
	.featured:hover { border-color: #3c725b; background: #151c18; color: var(--text); }
	.featured .eyebrow { font-size: .58rem; }
	.featured > strong { padding-right: 16px; font-size: .92rem; letter-spacing: -.03em; }
	.featured-summary { color: var(--muted); font-size: .68rem; line-height: 1.55; }
	.featured-arrow { position: absolute; top: 15px; right: 15px; color: var(--mint); }
	.article-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 28px 18px; margin-top: 38px; }
	.article-group { min-width: 0; }
	.article-group > header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
	.article-group h2 { margin: 0; font-size: .98rem; letter-spacing: -.035em; }
	.article-group > header > span { color: var(--dim); font-family: 'DM Mono', monospace; font-size: .56rem; text-transform: uppercase; white-space: nowrap; }
	.article-list { display: grid; gap: 6px; }
	.article-link { display: grid; grid-template-columns: minmax(0, 1fr) 15px; align-items: center; gap: 11px; border: 1px solid var(--border); border-radius: 5px; padding: 11px 12px; background: var(--surface); text-decoration: none; transition: border-color 120ms ease, background 120ms ease; }
	.article-link:hover { border-color: #3c725b; background: #151c18; color: var(--text); }
	.article-link > span:first-child { display: grid; gap: 4px; }
	.article-link strong { font-size: .72rem; }
	.article-link small { color: var(--muted); font-size: .63rem; line-height: 1.5; }
	.article-arrow { color: var(--mint); font-size: .75rem; }
	.independence-note { margin: 25px 0 0; color: var(--dim); font-size: .65rem; line-height: 1.6; }
	@media (max-width: 850px) { .featured-grid { grid-template-columns: 1fr; } .featured { min-height: 0; } }
	@media (max-width: 640px) { .article-groups { grid-template-columns: 1fr; gap: 24px; margin-top: 27px; } .welcome h1 { font-size: clamp(2.5rem, 14vw, 3.8rem); } }
</style>
