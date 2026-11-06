<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Cat in a Box — Read the protocol. Use the protocol.</title>
	<meta name="description" content="A community-built, independent documentation catalog and interface for Cat-in-a-Box Finance." />
</svelte:head>

<section class="hero container">
	<p class="eyebrow">Independent docs & interface · Ethereum mainnet</p>
	<div class="hero-copy">
		<h1>Read the protocol.<br /><span>Use the protocol.</span></h1>
		<p class="lede">A clear, source-linked guide to Cat-in-a-Box Finance and an independent interface for its deployed contracts.</p>
		<div class="actions">
			<a class="button" href={resolve('/app/')}>Open the app <span aria-hidden="true">↗</span></a>
			<a class="button secondary" href={resolve('/docs/')}>Explore documentation <span aria-hidden="true">→</span></a>
		</div>
	</div>
	<div class="hero-bottom">
		<div><span class="status"></span>Connected directly to Ethereum</div>
		<div>Open source <span class="slash">/</span> Self-custodial <span class="slash">/</span> No account required</div>
	</div>
</section>

<section class="paths container" aria-label="Explore">
	<a class="path-card panel" href={resolve('/docs/')}>
		<div class="card-index">01 <span>REFERENCE LIBRARY</span></div>
		<h2>Start with the docs</h2>
		<p>Browse source-linked summaries of the project docs, alongside a separate guide to deployed contract behavior.</p>
		<span class="card-link">Browse documentation <span aria-hidden="true">→</span></span>
	</a>
	<a class="path-card panel" href={resolve('/app/')}>
		<div class="card-index">02 <span>PROTOCOL INTERFACE</span></div>
		<h2>Manage a position</h2>
		<p>Read v1 and v1.1 contract state, connect a wallet, and review actions before signing transactions directly on Ethereum.</p>
		<span class="card-link">Open interface <span aria-hidden="true">→</span></span>
	</a>
</section>

<section class="note container">
	<span class="note-symbol" aria-hidden="true">i</span>
	<p>The interface is a separate community project. Check contract addresses, fees, and transaction details before signing.</p>
	<a href={resolve('/docs/deployed-behavior/')}>How it works <span aria-hidden="true">↗</span></a>
</section>

<style>
	.hero { display: flex; min-height: 560px; flex-direction: column; justify-content: space-between; padding-block: 76px 30px; }
	.hero-copy { max-width: 760px; margin-block: 50px 60px; }
	h1 { margin: 0; font-size: clamp(3.5rem, 8.5vw, 7rem); font-weight: 700; letter-spacing: -0.085em; line-height: 0.99; }
	h1 span { color: var(--mint); }
	.lede { max-width: 550px; margin: 1.7rem 0 0; color: var(--muted); font-size: clamp(1rem, 2vw, 1.2rem); line-height: 1.65; }
	.actions { display: flex; flex-wrap: wrap; gap: 0.8rem; margin-top: 2rem; }
	.hero-bottom { display: flex; justify-content: space-between; gap: 1rem; border-top: 1px solid var(--border); padding-top: 18px; color: var(--dim); font-family: 'DM Mono', monospace; font-size: 0.66rem; letter-spacing: 0.06em; text-transform: uppercase; }
	.hero-bottom > div:first-child { display: flex; align-items: center; gap: 0.6rem; }
	.status { width: 7px; height: 7px; border-radius: 50%; background: var(--mint); box-shadow: 0 0 10px rgb(64 255 182 / 55%); }
	.slash { margin-inline: 0.55rem; color: var(--mint); }
	.paths { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding-bottom: 44px; }
	.path-card { display: flex; min-height: 270px; flex-direction: column; align-items: flex-start; padding: 26px; text-decoration: none; transition: border-color 140ms ease, background 140ms ease; }
	.path-card:hover { border-color: #3c725b; background: #151c18; color: var(--text); }
	.card-index { display: flex; width: 100%; justify-content: space-between; color: var(--mint); font-family: 'DM Mono', monospace; font-size: 0.7rem; }
	.card-index span { color: var(--dim); letter-spacing: 0.08em; }
	h2 { margin: 2.6rem 0 0; font-size: 1.45rem; letter-spacing: -0.04em; }
	.path-card p { max-width: 490px; margin: 0.7rem 0 1.8rem; color: var(--muted); font-size: 0.88rem; line-height: 1.7; }
	.card-link { margin-top: auto; color: var(--mint); font-size: 0.82rem; font-weight: 800; }
	.note { display: flex; align-items: center; gap: 0.8rem; border-top: 1px solid var(--border); padding-block: 20px 42px; color: var(--muted); font-size: 0.8rem; }
	.note-symbol { display: grid; width: 20px; height: 20px; flex: 0 0 auto; place-items: center; border: 1px solid var(--mint); border-radius: 50%; color: var(--mint); font-family: serif; font-size: 0.8rem; }
	.note p { flex: 1; margin: 0; }
	.note a { color: var(--mint); font-size: 0.76rem; text-decoration: none; white-space: nowrap; }
	@media (max-width: 680px) {
		.hero { min-height: 490px; padding-top: 54px; }
		.hero-copy { margin-block: 54px 48px; }
		h1 { font-size: clamp(3.15rem, 13vw, 5.2rem); }
		.hero-bottom { flex-direction: column; gap: 0.65rem; font-size: 0.59rem; }
		.paths { grid-template-columns: 1fr; }
		.path-card { min-height: 240px; }
		.note { flex-wrap: wrap; }
		.note p { flex-basis: calc(100% - 40px); }
		.note a { margin-left: 28px; }
	}
</style>
