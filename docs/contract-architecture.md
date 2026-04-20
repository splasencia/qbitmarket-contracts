# Contract Architecture

## Overview

qbitmarket currently exposes several marketplace-related contracts. The current
public direction is intentionally incremental:

- keep legacy deployed contracts available while they remain active
- introduce an upgradeable primary-market surface first
- keep collection contracts non-upgradeable in the current phase
- preserve a reproducible deployment and verification story

## Main contract surfaces

- `Marketplace.sol`
  - legacy primary-market contract
- `MarketplaceV2.sol`
  - legacy secondary-market contract
- `MarketplacePrimaryUpgradeable.sol`
  - upgradeable primary-market implementation used for the current proxy rollout
- `CollectionFactory.sol`
  - creates ERC-721 and ERC-1155 collections
- `ERC721Collection.sol`
  - ERC-721 collection contract with marketplace rotation support
- `ERC1155Collection.sol`
  - ERC-1155 collection contract
- `PaymentTokenFactory.sol`
  - creates user ERC-20 payment tokens

## Upgrade model

The current public upgrade model for the new primary-market rollout uses:

- `TransparentUpgradeableProxy`
- `ProxyAdmin`
- initializer-based setup in `MarketplacePrimaryUpgradeable`

This provides:

- a stable proxy address for the primary-market surface
- a separately managed upgrade authority
- explicit deployment and verification artifacts for implementation, proxy, and admin

## Collections

Collections remain non-upgradeable in the current public model.

For ERC-721 collections:

- new collections can be configured to point at the chosen marketplace target
- existing collections can rotate marketplace access through `setMarketplace(...)`

For ERC-1155 collections:

- the current deployment model remains constructor-based and non-upgradeable

## Deployment source of truth

The source of truth for public deployment is the custom deployment pipeline under
`deployment/`.

The public deploy and verification path is based on:

- bundled Solidity sources
- `solc`
- the custom `ethers` deployment flow in `deployment/app/deploy.js`

The bundled sources are generated deployment artifacts, not the primary source
of manual development.

## Public verification

Public verification relies on publishing enough information to reproduce the
deployed contracts, including:

- Solidity sources
- bundled deployment sources when used by the target chain flow
- compiler settings
- deployed addresses
- constructor arguments
- initializer calldata for proxy deployments
- verification manifests produced by the deployment pipeline
