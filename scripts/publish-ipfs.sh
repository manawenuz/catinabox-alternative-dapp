#!/bin/sh
set -eu

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/compose.ipfs.yaml"

cd "$PROJECT_ROOT"

# An empty BASE_PATH makes the generated links resolve from the IPFS CID root.
BASE_PATH= npm run build

docker compose -f "$COMPOSE_FILE" up -d --force-recreate --wait

CID="$(docker compose -f "$COMPOSE_FILE" exec -T kubo ipfs add -Q -r --cid-version=1 /export)"
docker compose -f "$COMPOSE_FILE" exec -T kubo ipfs pin add --recursive "$CID" >/dev/null

printf '\nPinned site on the local Kubo node.\n'
printf 'CID: %s\n' "$CID"
printf 'Local gateway: http://127.0.0.1:8080/ipfs/%s/\n' "$CID"
printf 'Public gateway: https://dweb.link/ipfs/%s/\n' "$CID"
printf '\nThe local pin is available while this Docker node is online. Add a remote pin for durable public availability.\n'
