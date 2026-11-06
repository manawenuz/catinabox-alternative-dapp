# Cat-in-a-Box independent docs and DApp

A static SvelteKit interface for the deployed Cat-in-a-Box Ethereum contracts. It provides source-linked documentation summaries, an original deployed-behavior guide, CDP actions for v1 and v1.1, boxFEE vault and staking operations, and an optional browser-side history scan for boxETH-to-stETH redemption targets.

This is an independent community interface. It is not affiliated with or endorsed by Cat-in-a-Box Finance. Transactions are sent directly from the connected wallet to the contract addresses in `src/lib/chain/config.ts`; always verify the target, amount, allowance, and wallet calldata before signing.

## Local build

Requires Node.js 22.17 or later.

```sh
npm ci
npm run dev
```

Create and preview the static output:

```sh
npm run build
npm run preview
```

Run the scanner regression suite with `npm test`.

The static artifact is written to `build/`. It contains the home page, all documentation pages, the app, a 404 page, and the scan Web Worker. No server runtime is required.

## Ethereum RPC

The default read endpoint is `https://ethereum-rpc.publicnode.com`. To build with another public Ethereum mainnet JSON-RPC endpoint:

```sh
VITE_MAINNET_RPC_URL=https://your-public-mainnet-rpc.example npm run build
```

The endpoint is compiled into client code and is visible to every site visitor. Do not put a private key or secret credential in this variable. The wallet is requested only for transaction signing; historical scanning uses the configured RPC in the browser and keeps its address/checkpoint cache in IndexedDB.

## GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` builds and publishes from `main` or a manual workflow run. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The workflow reads the Pages base path and passes it to SvelteKit, then uploads only the static `build/` directory.

For a manual project-site build, set the repository path as `BASE_PATH`:

```sh
BASE_PATH=my-repository npm run build
```

For a root site or custom domain, leave `BASE_PATH` unset. Routes are emitted as directories with `index.html`, and `build/404.html` contains links that account for a Pages base path.

## Vercel

Use the static output without a Vercel adapter:

- Framework preset: **Other**
- Build command: `npm ci && npm run build`
- Output directory: `build`
- Root directory: this project

Leave `BASE_PATH` unset for a Vercel project domain or custom domain. `VITE_MAINNET_RPC_URL` can be configured as a build environment variable; it remains public client configuration.

## IPFS

Build with `BASE_PATH` unset, then upload the contents of `build/` as an IPFS directory with `index.html` at its root. The app uses relative asset paths and trailing-slash route output so its client files resolve from an IPFS directory gateway path. The browser-side RPC connection remains necessary for live contract reads, quotes, scans, and writes.

### Publish with Docker

Docker Compose runs a persistent Kubo node and pins the root build directory:

```sh
./scripts/publish-ipfs.sh
```

The script rebuilds with an empty `BASE_PATH`, starts the `ipfs/kubo:v0.43.1` container, pins `build/`, and prints its CID and gateway URLs. Kubo's admin API and local gateway are bound to `127.0.0.1`; the IPFS peer ports use TCP and UDP 4001. The node repository is kept in the Docker volume `catinabox-ipfs_kubo-data`, so restarting the container preserves its pins. `docker compose -f compose.ipfs.yaml down` stops the node without deleting that volume; adding `-v` deletes the repository and its pins.

The printed public gateway URL is a retrieval route, not a remote pin. This pin remains served by this machine's Kubo node, so reliable availability while the machine is offline requires adding a remote pin through a pinning service.

## Documentation

`/docs/` is a searchable, sidebar-based wiki with full current-behavior guides for using the app, the v1 and v1.1 CDPs, approvals, boxFEE, staking, resolution, contract addresses, and valuation records. Articles are based on the current app and deployed-behavior analysis; links to the original site are retained as historical background. `docs/deployed-behavior.md` contains the contract formulas and block-stamped Ethereum snapshots.

Refresh article titles, summaries, and source-link metadata in the manifest with:

```sh
npm run reference:build
```

The catalog command does not overwrite article Markdown. Publishing through `./scripts/publish-ipfs.sh` builds and pins a new root CID on the local Kubo node. IPFS CIDs are immutable, so every updated build has a new gateway URL; the old CID continues to serve its previous content.

## Redemption history search

The scan is opt-in and runs in a browser Web Worker. It reads the v1 and v1.1 event histories from their configured deployment blocks to a pinned latest block, reduces block ranges when an RPC rejects a request, and saves discovered addresses and the next block in local IndexedDB. Each response is limited to 8 MiB and each version can cache up to 10,000 unique addresses. The worker pauses after 1,000 RPC ranges or five minutes, and you can resume it. A scan that reaches the address limit stops without advancing past the last saved block; clear saved history to restart or enter a target address manually. Active positions are read again at one block before ranking. Provider rate limits can require pausing and resuming.

Profitability is labeled estimated only when a Uniswap v3 route, connected-wallet gas estimate, and stETH conversion for gas are all available. The app does not execute swaps. Redemption itself has no minimum-output parameter; the form shows the exact target position, projected sync/fetch settlement, fee, required boxETH, and stETH transfer estimate before signing.

## Project boundaries

This source tree does not configure a Git remote, publish a Pages deployment, or deploy to Vercel. The Pages workflow takes effect after the project is placed in a repository with Pages configured and an authorized maintainer pushes to the configured branch or runs it manually. Docker Kubo provides a local persistent IPFS pin; no remote pinning provider is configured.
