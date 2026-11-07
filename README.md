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

The default read endpoint is `https://ethereum-rpc.publicnode.com`. The anonymous PublicNode endpoint may deny historical log queries with HTTP 403. Ordinary contract reads, quotes, and wallet-related reads continue to use the configured RPC. To build with another Ethereum mainnet JSON-RPC endpoint:

```sh
VITE_MAINNET_RPC_URL=https://your-public-mainnet-rpc.example npm run build
```

The endpoint is compiled into client code and is visible to every site visitor. Never put a private key or a credential your provider considers secret in this variable. If a provider requires a token, use a client-safe token with origin and quota restrictions, or proxy requests through your own server. The wallet is requested only for transaction signing; historical scanning uses the configured RPC in the browser and keeps its address/checkpoint cache in IndexedDB.

### Etherscan history scans

To use Etherscan API V2 for historical redemption logs, set `VITE_ETHERSCAN_API_KEY` when building the static app:

```sh
VITE_ETHERSCAN_API_KEY=your-etherscan-api-key npm run build
```

This is public client configuration: the key is included in the built JavaScript and visible to site visitors, who share its quota. Do not use a key whose exposure or shared quota is unacceptable. Etherscan's [free API plan](https://etherscan.io/apis) currently allows 3 calls per second and up to 100,000 calls per day, and requires attribution. The scanner spaces requests by at least 400 ms in each browser worker and displays a “Powered by Etherscan.io APIs” link when the key is configured; separate visitors still share the same key limits.

Without `VITE_ETHERSCAN_API_KEY`, the scanner falls back to `VITE_MAINNET_RPC_URL`, which must permit archive `eth_getLogs` queries from the CDP deployment blocks. See the [Etherscan V2 event logs endpoint](https://docs.etherscan.io/api-reference/endpoint/getlogs-address-topics) for API details.

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

The script rebuilds with an empty `BASE_PATH`, starts the `ipfs/kubo:v0.43.1` container, pins `build/` locally, uploads the site to Pinata, and prints both app links. Kubo's admin API and local gateway are bound to `127.0.0.1`; the IPFS peer ports use TCP and UDP 4001. The node repository is kept in the Docker volume `catinabox-ipfs_kubo-data`, so restarting the container preserves its pins. `docker compose -f compose.ipfs.yaml down` stops the node without deleting that volume; adding `-v` deletes the repository and its pins.

The publish script reads `VITE_ETHERSCAN_API_KEY` and `PINATA_JWT` from the ignored root `.env`, builds with an empty `BASE_PATH`, uploads the complete static `build/` directory to Pinata's public IPFS network, and keeps a local Kubo pin as a second copy. The Pinata CID is the public deployment CID and may differ from the local Kubo CID because the importers can create different DAGs. The script prints the `inbrowser.link` app URL and the local gateway URL. Pinata folder uploads use its public upload API; the JWT is sent only by the local publish script, never by the browser app.

Start from `.env.example` to configure the build. Keep the Pinata API key, secret, and JWT in `.env`; do not use a `VITE_` prefix for them. The `.env` file is git-ignored.

## Documentation

`/docs/` is a searchable, sidebar-based wiki with full current-behavior guides for using the app, the v1 and v1.1 CDPs, approvals, boxFEE, staking, resolution, contract addresses, and valuation records. Articles are based on the current app and deployed-behavior analysis; links to the original site are retained as historical background. `docs/deployed-behavior.md` contains the contract formulas and block-stamped Ethereum snapshots.

Refresh article titles, summaries, and source-link metadata in the manifest with:

```sh
npm run reference:build
```

The catalog command does not overwrite article Markdown. Publishing through `./scripts/publish-ipfs.sh` builds and pins a new CID on Pinata and the local Kubo node. IPFS CIDs are immutable, so every updated build has a new gateway URL; the old CID continues to serve its previous content.

## Redemption history search

The scan is opt-in and runs in a browser Web Worker. It reads the v1 and v1.1 event histories from their configured deployment blocks to a pinned latest block, using Etherscan API V2 when `VITE_ETHERSCAN_API_KEY` is configured or JSON-RPC otherwise. RPC ranges shrink when a provider rejects an oversized query. Discovered addresses and the next block are saved in local IndexedDB. If the RPC fallback returns HTTP 401 or 403, the scan stops and displays the provider's response instead of retrying smaller ranges. Each response is limited to 8 MiB and each version can cache up to 10,000 unique addresses. The worker pauses after 1,000 provider requests or five minutes, and you can resume it. A scan that reaches the address limit stops without advancing past the last saved block; clear saved history to restart or enter a target address manually. Active positions are read again at one block before ranking. Provider rate limits can require pausing and resuming.

Profitability is labeled estimated only when a Uniswap v3 route, connected-wallet gas estimate, and stETH conversion for gas are all available. The app does not execute swaps. Redemption itself has no minimum-output parameter; the form shows the exact target position, projected sync/fetch settlement, fee, required boxETH, and stETH transfer estimate before signing.

## Project boundaries

This source tree does not configure a Git remote, publish a Pages deployment, or deploy to Vercel. The Pages workflow takes effect after the project is placed in a repository with Pages configured and an authorized maintainer pushes to the configured branch or runs it manually. The IPFS publishing script keeps public and local pins on Pinata and Kubo respectively.
