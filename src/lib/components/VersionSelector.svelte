<script lang="ts">
	import type { CdpVersion } from '#lib/chain/config.js';

	type Props = { value: CdpVersion; onchange: (version: CdpVersion) => void };
	let { value, onchange }: Props = $props();
</script>

<div class="version-selector" role="group" aria-label="Choose CDP version">
	<button type="button" class:active={value === 'v1'} aria-pressed={value === 'v1'} onclick={() => onchange('v1')}>v1</button>
	<button type="button" class:active={value === 'v1.1'} aria-pressed={value === 'v1.1'} onclick={() => onchange('v1.1')}>v1.1</button>
</div>

<style>
	.version-selector { display: inline-flex; border: 1px solid var(--border); border-radius: 5px; padding: 3px; background: #0d100e; }
	button { min-width: 58px; border: 0; border-radius: 3px; padding: 8px 12px; background: transparent; color: var(--dim); font-family: 'DM Mono', monospace; font-size: 0.74rem; cursor: pointer; }
	button.active { background: #1d2923; color: var(--mint); box-shadow: inset 0 0 0 1px #315342; }
</style>
