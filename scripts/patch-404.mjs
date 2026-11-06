import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const file = path.resolve('build/404.html');
const configuredBase = (process.env.BASE_PATH ?? '').trim().replace(/^\/+|\/+$/g, '');
const html = await readFile(file, 'utf8');
if (!html.includes('data-base-path=""')) throw new Error('The 404 base-path placeholder was not found.');
const patched = html.replace('data-base-path=""', `data-base-path="${configuredBase ? `/${configuredBase}` : ''}"`);
await writeFile(file, patched, 'utf8');
