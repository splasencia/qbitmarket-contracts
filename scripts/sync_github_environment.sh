#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/sync_github_environment.sh --repo <owner/repo> --env <environment> --file <path/to/.env>

Description:
  Reads a dotenv-style file, keeps only the GitHub Actions environment inputs
  used by this repository, and syncs them to GitHub with `gh`.

  Classification:
  - PRIVATE_KEY -> GitHub Actions environment secret
  - all other supported keys -> GitHub Actions environment variables

Supported keys:
  DEPLOYER_ADDRESS
  PRIVATE_KEY
  RPC_URL
  MARKETPLACE_OWNER_ADDRESS
  MARKETPLACE_V2_OWNER_ADDRESS
  FACTORY_OWNER_ADDRESS
  FEE_RECIPIENT_ADDRESS
  MARKETPLACE_V2_FEE_RECIPIENT_ADDRESS
  MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS
  MARKETPLACE_PLATFORM_FEE_BPS
  MARKETPLACE_V2_PLATFORM_FEE_BPS
  MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS
  EVM_VERSION
EOF
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

unquote() {
  local value="$1"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "$value"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

supports_gh_variable() {
  gh help variable >/dev/null 2>&1
}

set_variable_via_api() {
  local repo="$1"
  local environment="$2"
  local key="$3"
  local value="$4"

  if gh api \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "/repos/${repo}/environments/${environment}/variables/${key}" >/dev/null 2>&1; then
    gh api \
      --method PATCH \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/${repo}/environments/${environment}/variables/${key}" \
      -f name="$key" \
      -f value="$value" >/dev/null
  else
    gh api \
      --method POST \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "/repos/${repo}/environments/${environment}/variables" \
      -f name="$key" \
      -f value="$value" >/dev/null
  fi
}

REPO=""
ENVIRONMENT=""
ENV_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --env)
      ENVIRONMENT="${2:-}"
      shift 2
      ;;
    --file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$REPO" || -z "$ENVIRONMENT" || -z "$ENV_FILE" ]]; then
  usage >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

require_command gh
gh auth status >/dev/null

VARIABLE_KEYS=(
  DEPLOYER_ADDRESS
  RPC_URL
  MARKETPLACE_OWNER_ADDRESS
  MARKETPLACE_V2_OWNER_ADDRESS
  FACTORY_OWNER_ADDRESS
  FEE_RECIPIENT_ADDRESS
  MARKETPLACE_V2_FEE_RECIPIENT_ADDRESS
  MARKETPLACE_V2_SITE_NATIVE_TOKEN_ADDRESS
  MARKETPLACE_PLATFORM_FEE_BPS
  MARKETPLACE_V2_PLATFORM_FEE_BPS
  MARKETPLACE_V2_SITE_NATIVE_TOKEN_FEE_BPS
  EVM_VERSION
)

SECRET_KEYS=(
  PRIVATE_KEY
)

is_supported_key() {
  local key="$1"
  local candidate
  for candidate in "${VARIABLE_KEYS[@]}" "${SECRET_KEYS[@]}"; do
    if [[ "$candidate" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

is_secret_key() {
  local key="$1"
  local candidate
  for candidate in "${SECRET_KEYS[@]}"; do
    if [[ "$candidate" == "$key" ]]; then
      return 0
    fi
  done
  return 1
}

declare -A VALUES=()

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  line="$(trim "$raw_line")"
  [[ -z "$line" ]] && continue
  [[ "$line" == \#* ]] && continue

  if [[ "$line" == export[[:space:]]* ]]; then
    line="${line#export }"
    line="$(trim "$line")"
  fi

  [[ "$line" != *=* ]] && continue

  key="$(trim "${line%%=*}")"
  value="$(trim "${line#*=}")"

  if ! is_supported_key "$key"; then
    continue
  fi

  VALUES["$key"]="$(unquote "$value")"
done < "$ENV_FILE"

for key in "${VARIABLE_KEYS[@]}" "${SECRET_KEYS[@]}"; do
  value="${VALUES[$key]:-}"
  if [[ -z "$value" ]]; then
    continue
  fi

  if is_secret_key "$key"; then
    echo "Setting secret $key in $REPO environment $ENVIRONMENT"
    gh secret set "$key" --repo "$REPO" --env "$ENVIRONMENT" --body "$value"
  else
    echo "Setting variable $key in $REPO environment $ENVIRONMENT"
    if supports_gh_variable; then
      gh variable set "$key" --repo "$REPO" --env "$ENVIRONMENT" --body "$value"
    else
      set_variable_via_api "$REPO" "$ENVIRONMENT" "$key" "$value"
    fi
  fi
done

echo "GitHub environment sync completed for $REPO / $ENVIRONMENT"
