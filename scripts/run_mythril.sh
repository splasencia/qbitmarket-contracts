#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOCKCHAIN_DIR="$ROOT_DIR/blockchain"
OUTPUT_DIR="${MYTHRIL_OUTPUT_DIR:-/tmp/qbitmarket-contracts-v3-mythril}"
DOCKER_IMAGE="${MYTHRIL_DOCKER_IMAGE:-mythril/myth}"
ALLOW_FINDINGS="${MYTHRIL_ALLOW_FINDINGS:-0}"
SKIP_COMPILE="${MYTHRIL_SKIP_COMPILE:-0}"
EXECUTION_TIMEOUT="${MYTHRIL_EXECUTION_TIMEOUT:-60}"
MAX_DEPTH="${MYTHRIL_MAX_DEPTH:-32}"
TRANSACTION_COUNT="${MYTHRIL_TRANSACTION_COUNT:-2}"

mkdir -p "$OUTPUT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is not installed or not on PATH" >&2
  exit 127
fi

if [[ "$SKIP_COMPILE" != "1" ]]; then
  (
    cd "$BLOCKCHAIN_DIR"
    TMPDIR="${TMPDIR:-/tmp}" \
      PRIVATE_KEY="${PRIVATE_KEY:-0x0000000000000000000000000000000000000000000000000000000000000001}" \
      PRIVATE_KEY_QAN="${PRIVATE_KEY_QAN:-0x0000000000000000000000000000000000000000000000000000000000000001}" \
      npx hardhat compile
  )
fi

extract_bytecode() {
  local artifact_path="$1"
  local output_path="$2"

  node -e "
    const artifact = require(process.argv[1]);
    if (!artifact.bytecode || artifact.bytecode === '0x') {
      throw new Error('Missing creation bytecode in ' + process.argv[1]);
    }
    process.stdout.write(artifact.bytecode);
  " "$artifact_path" > "$output_path"
}

run_mythril() {
  local name="$1"
  local artifact_path="$2"
  local bytecode_file="$OUTPUT_DIR/$name.bytecode"
  local report_file="$OUTPUT_DIR/$name.json"
  local status=0

  extract_bytecode "$artifact_path" "$bytecode_file"

  docker run --rm \
    -v "$OUTPUT_DIR:/analysis" \
    "$DOCKER_IMAGE" analyze \
    -f "/analysis/$name.bytecode" \
    --execution-timeout "$EXECUTION_TIMEOUT" \
    --max-depth "$MAX_DEPTH" \
    -t "$TRANSACTION_COUNT" \
    --no-onchain-data \
    -o json > "$report_file" || status=$?

  if [[ "$status" -ne 0 ]]; then
    echo "mythril failed for $name (exit $status)" >&2
    return "$status"
  fi

  node -e "
    const fs = require('fs');
    const report = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const issues = Array.isArray(report.issues) ? report.issues.length : 0;
    console.log(process.argv[2] + ': success=' + report.success + ', issues=' + issues);
    if (report.success === false || issues > 0) {
      process.exit(1);
    }
  " "$report_file" "$name" || status=$?

  if [[ "$status" -ne 0 ]]; then
    echo "mythril reported findings for $name" >&2
  fi

  return "$status"
}

status=0

run_mythril \
  secondary-erc721 \
  "$BLOCKCHAIN_DIR/artifacts/contracts/MarketplaceSecondaryERC721.sol/MarketplaceSecondaryERC721.json" || status=1

run_mythril \
  secondary-erc1155 \
  "$BLOCKCHAIN_DIR/artifacts/contracts/MarketplaceSecondaryERC1155.sol/MarketplaceSecondaryERC1155.json" || status=1

echo "Mythril output: $OUTPUT_DIR"

if [[ "$status" -ne 0 && "$ALLOW_FINDINGS" != "1" ]]; then
  echo "Mythril completed with findings. Set MYTHRIL_ALLOW_FINDINGS=1 for baseline/triage runs." >&2
  exit "$status"
fi

exit 0
