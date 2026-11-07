# Repository instructions

## IPFS publishing

- Always publish the static site to Pinata's public IPFS network as well as the local Kubo node. Use `scripts/publish-ipfs.sh`; it uploads the entire `build/` directory and prints the Pinata CID and app link.
- Keep `PINATA_API_KEY`, `PINATA_API_SECRET`, and `PINATA_JWT` in the ignored root `.env` file. The publish script uses the JWT; never put Pinata credentials in `VITE_` variables, client code, or committed files.
- Keep `VITE_ETHERSCAN_API_KEY` in the local `.env` when publishing so the static scanner continues to use Etherscan. This key is public in the built app by design.
