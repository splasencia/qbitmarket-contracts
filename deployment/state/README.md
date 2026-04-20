# Deployment State

Per-environment deployment state is stored under:

- `deployment/state/dev/`
- `deployment/state/preview/`
- `deployment/state/prd/`

The public workflow is expected to publish at least:

- `deployment/state/<env>/address-book.yml`
- `deployment/state/<env>/verification-manifest.json`

Those files are the main public outputs used to document deployed addresses and
support later verification.
