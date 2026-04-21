#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOCKCHAIN_DIR="$ROOT_DIR/blockchain"
OUTPUT_DIR="${SLITHER_OUTPUT_DIR:-/tmp/qbitmarket-contracts-v3-slither}"
ALLOW_FINDINGS="${SLITHER_ALLOW_FINDINGS:-0}"

mkdir -p "$OUTPUT_DIR"

if ! command -v slither >/dev/null 2>&1; then
  echo "slither is not installed or not on PATH" >&2
  exit 127
fi

run_slither() {
  local contract_file="$1"
  local output_name="$2"
  local status=0

  (
    cd "$BLOCKCHAIN_DIR"
    TMPDIR="${TMPDIR:-/tmp}" \
      PRIVATE_KEY="${PRIVATE_KEY:-0x0000000000000000000000000000000000000000000000000000000000000001}" \
      PRIVATE_KEY_QAN="${PRIVATE_KEY_QAN:-0x0000000000000000000000000000000000000000000000000000000000000001}" \
      slither "$contract_file" \
        --solc-remaps '@openzeppelin/=node_modules/@openzeppelin/' \
        --filter-paths 'node_modules|contracts/bundled_contracts|contracts/test' \
        --exclude-dependencies \
        --json "$OUTPUT_DIR/$output_name"
  ) || status=$?

  if [[ "$status" -ne 0 ]]; then
    echo "slither reported findings or failed for $contract_file (exit $status)" >&2
  fi

  return "$status"
}

status=0

run_slither contracts/MarketplaceSecondaryERC721.sol secondary-erc721.json || status=1
run_slither contracts/MarketplaceSecondaryERC1155.sol secondary-erc1155.json || status=1

echo "Slither JSON output: $OUTPUT_DIR"

if [[ "$status" -ne 0 && "$ALLOW_FINDINGS" != "1" ]]; then
  echo "Slither completed with findings. Set SLITHER_ALLOW_FINDINGS=1 for baseline/triage runs." >&2
  exit "$status"
fi

exit 0
