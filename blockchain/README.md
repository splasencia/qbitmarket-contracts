# Published Contract Sources

This directory contains:

- canonical Solidity contract sources under `contracts/`
- generated ABI outputs under `contracts/abis/`
- generated bundled deployment artifacts under `contracts/bundled_contracts/`

The bundled sources are included because the public deployment pipeline uses
them for the real QAN deployment and verification flow. They are generated
artifacts, not the primary source for manual editing.
