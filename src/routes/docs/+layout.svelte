<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';
	import { docsNavigationSections } from '#lib/content/docs-navigation.js';

	let { children }: LayoutProps = $props();
	let query = $state('');
	let menuOpen = $state(false);
	const sections = docsNavigationSections();
	const filteredSections = $derived.by(() => {
		const term = query.trim().toLocaleLowerCase();
		if (!term) return sections;
		return sections
			.map((section) => ({
				...section,
				links: section.links.filter((link) => `${link.title} ${link.summary} ${link.searchText}`.toLocaleLowerCase().includes(term))
			}))
			.filter((section) => section.links.length > 0);
	});
	const activePath = $derived(page.url.pathname);
	const hasResults = $derived(filteredSections.some((section) => section.links.length > 0));
</script>

<div class="docs-layout container">
	<aside class="docs-sidebar" class:open={menuOpen} aria-label="Documentation navigation">
		<a class="sidebar-title" href={resolve('/docs/')} onclick={() => (menuOpen = false)}>
			<span class="sidebar-mark" aria-hidden="true">▣</span>
			<span><strong>Documentation</strong><small>Current protocol guide</small></span>
		</a>
		<label class="search-label" for="docs-search">Search pages</label>
		<div class="search-wrap">
			<span aria-hidden="true">⌕</span>
			<input id="docs-search" type="search" bind:value={query} placeholder="Search docs…" autocomplete="off" />
			{#if query}<button type="button" aria-label="Clear search" onclick={() => (query = '')}>×</button>{/if}
		</div>
		<nav aria-label="Docs pages">
			{#if hasResults}
				{#each filteredSections as section (section.title)}
					<section class="nav-section">
						<h2>{section.title}</h2>
						{#each section.links as link (link.slug)}
							<a
								href={resolve(link.href)}
								class:active={activePath === resolve(link.href)}
								aria-current={activePath === resolve(link.href) ? 'page' : undefined}
								title={link.summary}
								onclick={() => (menuOpen = false)}
							>{link.title}</a>
						{/each}
					</section>
				{/each}
			{:else}
				<p class="no-results">No pages match “{query}”.</p>
			{/if}
		</nav>
		<div class="sidebar-bottom"><span class="live-dot" aria-hidden="true"></span> Ethereum mainnet · independent docs</div>
	</aside>

	<main class="docs-main">
		<button class="mobile-nav-toggle" type="button" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
			<span aria-hidden="true">☰</span> Browse documentation
			<span class="toggle-arrow" aria-hidden="true">{menuOpen ? '−' : '+'}</span>
		</button>
		{@render children()}
	</main>
</div>

<style>
	.docs-layout { display: grid; grid-template-columns: 256px minmax(0, 1fr); align-items: start; gap: 42px; padding-block: 24px 82px; }
	.docs-sidebar { position: sticky; top: 18px; display: flex; max-height: calc(100vh - 36px); min-height: 600px; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border); padding: 3px 20px 12px 0; }
	.sidebar-title { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; text-decoration: none; }
	.sidebar-title > span:last-child { display: grid; gap: 3px; }
	.sidebar-title strong { font-size: .93rem; letter-spacing: -.035em; }
	.sidebar-title small { color: var(--dim); font-size: .65rem; }
	.sidebar-mark { display: grid; width: 31px; height: 31px; place-items: center; border: 1px solid #315342; border-radius: 5px; color: var(--mint); font-size: 1rem; }
	.search-label { margin-bottom: 6px; color: var(--dim); font-family: 'DM Mono', monospace; font-size: .58rem; letter-spacing: .1em; text-transform: uppercase; }
	.search-wrap { display: flex; min-height: 38px; align-items: center; gap: 7px; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 5px; padding-inline: 9px; background: #0e110f; color: var(--dim); }
	.search-wrap:focus-within { border-color: #4a9c76; }
	.search-wrap > span { font-size: 1.05rem; line-height: 1; }
	.search-wrap input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--text); font-size: .69rem; }
	.search-wrap input::placeholder { color: #68716c; }
	.search-wrap input::-webkit-search-cancel-button { display: none; }
	.search-wrap button { border: 0; padding: 0; background: transparent; color: var(--dim); font-size: 1.1rem; cursor: pointer; }
	.docs-sidebar nav { overflow-y: auto; padding-right: 8px; scrollbar-color: #313a35 transparent; scrollbar-width: thin; }
	.nav-section { display: grid; gap: 3px; margin-bottom: 20px; }
	.nav-section h2 { margin: 0 0 4px 8px; color: var(--dim); font-family: 'DM Mono', monospace; font-size: .57rem; font-weight: 500; letter-spacing: .09em; line-height: 1.4; text-transform: uppercase; }
	.nav-section a { border-radius: 4px; padding: 7px 9px; color: #aeb7b1; font-size: .74rem; line-height: 1.35; text-decoration: none; transition: color 120ms ease, background 120ms ease; }
	.nav-section a:hover { color: var(--text); background: #151b17; }
	.nav-section a.active { background: #13221a; color: var(--mint); font-weight: 700; }
	.no-results { margin: 0; padding: 5px 2px; color: var(--muted); font-size: .72rem; line-height: 1.6; }
	.sidebar-bottom { display: flex; align-items: center; gap: 7px; margin-top: auto; border-top: 1px solid var(--border); padding-top: 13px; color: var(--dim); font-size: .59rem; }
	.live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--mint); }
	.docs-main { min-width: 0; }
	.mobile-nav-toggle { display: none; }
	@media (max-width: 900px) {
		.docs-layout { grid-template-columns: 220px minmax(0, 1fr); gap: 28px; }
		.docs-sidebar { padding-right: 14px; }
	}
	@media (max-width: 720px) {
		.docs-layout { display: flex; flex-direction: column; gap: 15px; padding-block: 15px 50px; }
		.docs-sidebar { display: none; position: static; width: 100%; max-height: none; min-height: 0; border: 1px solid var(--border); border-radius: 7px; padding: 15px; background: var(--surface); }
		.docs-sidebar.open { display: flex; }
		.docs-sidebar nav { max-height: 55vh; }
		.sidebar-title { margin-bottom: 17px; }
		.search-wrap { margin-bottom: 17px; }
		.sidebar-bottom { margin-top: 6px; }
		.mobile-nav-toggle { display: flex; width: 100%; min-height: 42px; align-items: center; gap: 9px; border: 1px solid var(--border); border-radius: 5px; padding: 0 12px; background: var(--surface); color: var(--text); font-size: .72rem; font-weight: 700; cursor: pointer; }
		.toggle-arrow { margin-left: auto; color: var(--mint); font-size: 1.05rem; }
	}
</style>
