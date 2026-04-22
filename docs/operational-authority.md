# Contracts Operational Authority

This document describes the public operational authority model for contracts.
It is intentionally address-template oriented until externally relevant
deployments are published from the public contracts repository.

## Address Roles

Primary-market proxy rollout:

| Role | Address source | User-facing? | Purpose |
| --- | --- | --- | --- |
| Primary proxy | `MarketplacePrimaryProxy` in the deployment address book and verification manifest | Yes | Stable address used by the site and wallets for primary-market calls after migration |
| Primary implementation | `MarketplacePrimaryImplementation` in the deployment address book and verification manifest | No | Logic contract verified for transparency; users must not approve or transact against it directly |
| Primary proxy admin | `MarketplacePrimaryProxyAdmin` in the deployment address book and verification manifest | No | OpenZeppelin `ProxyAdmin` used for implementation upgrades |
| Primary owner | `owner()` on the proxy address | No direct spending role | Owns marketplace config, pause/unpause, fee recipient, and fee bps changes |
| ProxyAdmin owner | `owner()` on the `ProxyAdmin` address | No direct spending role | Owns upgrade execution authority |

Secondary-market split rollout:

| Role | Address source | User-facing? | Purpose |
| --- | --- | --- | --- |
| `MarketplaceSecondaryERC721` | deployment address book and env sync | Yes | ERC-721 listings, offers, auctions, and ERC-721 operator approvals |
| `MarketplaceSecondaryERC1155` | deployment address book and env sync | Yes | ERC-1155 listings, offers, auctions, and ERC-1155 operator approvals |
| Legacy `MarketplaceV2` | legacy env/address book | Yes during mixed rollout | Existing secondary-market data until frontend/indexer migration is complete |

## Authority Boundaries

- User-facing marketplace calls must use proxy/split marketplace addresses, not
  implementation or admin addresses.
- Wallet spender/operator approvals must target the active marketplace address
  for the token standard:
  - ERC-721 secondary approvals target `MarketplaceSecondaryERC721`.
  - ERC-1155 secondary approvals target `MarketplaceSecondaryERC1155`.
  - primary lazy-mint purchases do not require token operator approval.
- Upgrade authority lives on `ProxyAdmin`, not on the proxy implementation ABI.
- Marketplace config authority lives on `owner()` for the marketplace contract
  reached through the proxy.
- Collection migration authority remains collection-local: each ERC-721
  collection owner can call `setMarketplace(...)`.

## Upgrade Discovery

The primary proxy uses OpenZeppelin Transparent Proxy semantics.

Public observers should use:

- `Upgraded(address indexed implementation)` emitted by the proxy for
  implementation changes.
- `AdminChanged(address previousAdmin, address newAdmin)` emitted by the proxy
  if proxy admin changes.
- `OwnershipTransferred(address previousOwner, address newOwner)` emitted by
  `ProxyAdmin` for upgrade-authority ownership changes.
- `OwnershipTransferred(address previousOwner, address newOwner)` emitted by
  the marketplace implementation through the proxy for marketplace config
  authority changes.
- `version()` on the proxy address with the implementation ABI to read the
  current marketplace implementation version.
- the public verification manifest for constructor args, initializer calldata,
  implementation address, proxy address, admin address, deploy block, source
  identity, and compiler settings.

Upgrade history should be reconstructed by combining:

1. the deployment/verification manifest for the initial proxy stack
2. proxy `Upgraded` events
3. proxy `AdminChanged` events
4. `ProxyAdmin` ownership events
5. marketplace `version()` reads at the proxy address
6. public release notes or audit-evidence artifacts for the exact source commit

## Publication Requirements

Before a public release is treated as operationally transparent, publish:

- proxy, implementation, and `ProxyAdmin` addresses
- proxy/admin/implementation verification manifest entries
- the owner address or governance mechanism for marketplace config authority
- the owner address or governance mechanism for `ProxyAdmin` upgrade authority
- the active frontend/indexer env keys that resolve to user-facing marketplace
  addresses
- audit-evidence artifacts for the commit used to publish/deploy the contracts

Do not publish private keys, raw env files, RPC credentials, admin tokens, or
secret-management instructions.

## Emergency Procedures

Pause authority:

- Call `pause()` through the proxy address using the implementation ABI.
- Confirm affected write calls revert with the paused-state error.
- Communicate whether existing collections are affected or whether mitigation is
  marketplace-only.

Upgrade authority:

- Deploy and verify the new implementation.
- Review storage layout and initializer/reinitializer requirements.
- Execute `ProxyAdmin.upgrade(...)` or `upgradeAndCall(...)` from the
  `ProxyAdmin` owner.
- Confirm the proxy emits `Upgraded`.
- Confirm `version()` and key read/write paths through the proxy.
- Publish updated verification and audit-evidence artifacts.
