# qbitmarket-contracts

Public contracts and deployment repository for qbitmarket.

This repository publishes the smart-contract, deployment, and verification
material for qbitmarket. It is intended to make contract sources, deployment
inputs, and verification artifacts easier to review publicly without exposing
unrelated application code or secrets.

The public documentation in this repository is intentionally scoped to:

- contract surfaces and deployment model
- public deployment and upgrade mechanics
- verification and reproducibility inputs

Internal implementation tracking, detailed work logs, and private consumer
integration details are intentionally omitted.

## Included

- `blockchain/`
  - Solidity contracts
  - generated ABI files
  - generated `bundled_contracts` artifacts used by the QAN deploy path
- `deployment/`
  - real deployment container
  - bundling scripts
  - deployment and verification-manifest tooling
- `docs/`
  - concise public-facing contract and verification documentation
- `.github/workflows/`
  - contracts CI
  - manual contracts operations workflow

## Not Included

- frontend or backend application code outside contract verification scope
- secrets, private keys, or real environment files
- production deployment state files
- local dependency directories and build outputs

## Recommended Public Release Practice

For each intended environment deploy:

1. run the manual contracts operations workflow
2. publish the resulting address book and verification manifest
3. tag the release used for the deploy
4. keep the bundled sources and compiler settings aligned with the manifest

## Layout

- [blockchain/README.md](./blockchain/README.md)
- [deployment/README](./deployment/README)
- [docs/contract-architecture.md](./docs/contract-architecture.md)
- [docs/publication-model.md](./docs/publication-model.md)
- [docs/public-notes.md](./docs/public-notes.md)
