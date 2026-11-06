<script lang="ts">
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';
	import '../app.css';

	let { children }: LayoutProps = $props();

	let menuOpen = $state(false);
</script>

<svelte:head>
	<title>Cat in a Box — Independent Docs & Interface</title>
</svelte:head>

<div class="site-shell">
	<header class="topbar">
		<div class="container nav-wrap">
			<a class="brand" href={resolve('/')} aria-label="Cat in a Box home">
				<span class="brand-mark" aria-hidden="true">▣</span>
				<span>cat in a box<span class="brand-dot">.</span></span>
			</a>
			<button
				class="menu-toggle"
				aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span></span><span></span>
			</button>
			<nav class:open={menuOpen} aria-label="Main navigation">
				<a href={resolve('/')} onclick={() => (menuOpen = false)}>Home</a>
				<a href={resolve('/docs/')} onclick={() => (menuOpen = false)}>Docs</a>
				<a class="nav-app" href={resolve('/app/')} onclick={() => (menuOpen = false)}>Open app <span aria-hidden="true">↗</span></a>
			</nav>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

	<footer class="footer">
		<div class="container footer-row">
			<p>Independent interface for Cat-in-a-Box Finance.</p>
			<p>Protocol transactions interact directly with Ethereum contracts.</p>
		</div>
	</footer>
	<aside class="independent-notice" role="note">
		<div class="container notice-row">
			<span class="notice-dot" aria-hidden="true"></span>
			<p><strong>Independent project.</strong> Not affiliated with or endorsed by Cat-in-a-Box Finance.</p>
			<a href="https://github.com/catinaboxfinance" target="_blank" rel="noreferrer">Protocol source <span aria-hidden="true">↗</span></a>
		</div>
	</aside>
</div>

<style>
	.site-shell { min-height: 100vh; display: flex; flex-direction: column; padding-bottom: 46px; }
	main { flex: 1; }
	.topbar { position: relative; z-index: 5; border-bottom: 1px solid var(--border); background: rgb(11 13 12 / 92%); }
	.nav-wrap { min-height: 76px; display: flex; align-items: center; justify-content: space-between; }
	.brand { display: inline-flex; align-items: center; gap: 0.55rem; font-size: 1rem; font-weight: 800; letter-spacing: -0.05em; text-decoration: none; }
	.brand-mark { display: grid; width: 27px; height: 27px; place-items: center; border: 1px solid var(--mint); border-radius: 4px; color: var(--mint); font-size: 1.1rem; }
	.brand-dot { color: var(--mint); }
	nav { display: flex; align-items: center; gap: 2rem; }
	nav a { color: var(--muted); font-size: 0.84rem; font-weight: 700; text-decoration: none; }
	nav a:hover, nav a:focus-visible { color: var(--mint); }
	nav .nav-app { color: var(--mint); }
	.menu-toggle { display: none; }
	.footer { border-top: 1px solid var(--border); padding-block: 22px; }
	.footer-row { display: flex; justify-content: space-between; gap: 1rem; color: var(--dim); font-size: 0.72rem; }
	.footer p { margin: 0; }
	.independent-notice { position: fixed; z-index: 10; right: 0; bottom: 0; left: 0; border-top: 1px solid #23372f; background: #0f1814; }
	.notice-row { display: flex; min-height: 46px; align-items: center; gap: 0.65rem; color: #b9c6bf; font-size: 0.72rem; }
	.notice-row p { flex: 1; margin: 0; }
	.notice-row strong { color: var(--text); }
	.notice-row a { color: var(--mint); text-decoration: none; white-space: nowrap; }
	.notice-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 100%; background: var(--mint); box-shadow: 0 0 12px rgb(64 255 182 / 45%); }
	@media (max-width: 640px) {
		.site-shell { padding-bottom: 0; }
		.independent-notice { position: static; }
		.nav-wrap { min-height: 64px; }
		.menu-toggle { display: flex; width: 40px; height: 40px; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); cursor: pointer; }
		.menu-toggle span { width: 16px; height: 1px; background: var(--text); }
		nav { position: absolute; top: 63px; right: 0; left: 0; display: none; flex-direction: column; align-items: stretch; gap: 0; border-bottom: 1px solid var(--border); padding: 0 16px 8px; background: #0b0d0c; }
		nav.open { display: flex; }
		nav a { padding: 14px 0; border-bottom: 1px solid #1b211e; }
		.footer-row { flex-direction: column; gap: 0.45rem; }
		.notice-row { min-height: 48px; font-size: 0.66rem; }
		.notice-row a { font-size: 0; }
		.notice-row a span { font-size: 0.8rem; }
	}
</style>
