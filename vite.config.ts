import adapter from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

const configuredBase = process.env.BASE_PATH?.trim() ?? '';
const base = configuredBase ? `/${configuredBase.replace(/^\/+|\/+$/g, '')}` : '';

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({ pages: 'build', assets: 'build', strict: true }),
			paths: { base, relative: true },
			prerender: { entries: ['*'], handleHttpError: 'warn' },
			preprocess: [mdsvex({ extensions: ['.md'] }), vitePreprocess()],
			extensions: ['.svelte', '.md']
		})
	]
});
