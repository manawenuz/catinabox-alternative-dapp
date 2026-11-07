#!/bin/sh
set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/compose.ipfs.yaml"

cd "$PROJECT_ROOT"

# Keep remote credentials out of the browser build; only the Etherscan VITE key is public.
if [ -f "$PROJECT_ROOT/.env" ]; then
	. "$PROJECT_ROOT/.env"
fi
if [ -z "${PINATA_JWT:-}" ]; then
	echo "PINATA_JWT is required in the project .env to publish this site." >&2
	exit 1
fi
export VITE_ETHERSCAN_API_KEY

# An empty BASE_PATH makes the generated links resolve from the IPFS CID root.
BASE_PATH= npm run build

docker compose -f "$COMPOSE_FILE" up -d --force-recreate --wait

LOCAL_CID="$(docker compose -f "$COMPOSE_FILE" exec -T kubo ipfs add -Q -r --cid-version=1 /export)"
docker compose -f "$COMPOSE_FILE" exec -T kubo ipfs pin add --recursive "$LOCAL_CID" >/dev/null
PINATA_CID="$(PINATA_JWT="$PINATA_JWT" node "$PROJECT_ROOT/scripts/pinata-upload.mjs" "$PROJECT_ROOT/build")"

printf '\nPublished the static site to Pinata and pinned a local Kubo copy.\n'
printf 'Pinata CID: %s\n' "$PINATA_CID"
printf 'Public app: https://%s.ipfs.inbrowser.link/app/\n' "$PINATA_CID"
printf 'Local Kubo CID: %s\n' "$LOCAL_CID"
printf 'Local app: http://127.0.0.1:8080/ipfs/%s/app/\n' "$LOCAL_CID"
