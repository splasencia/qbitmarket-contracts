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
| `PaymentTokenFactory` | deployment address book and env sync | Yes for token creation/discovery | Creates self-service ERC-20 payment tokens accepted by secondary marketplaces when the marketplace `paymentTokenFactory` is configured |

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
- Mainnet-like deployments should use a Safe or equivalent admin contract as
  the default owner by setting `SAFE_OWNER_ADDRESS` and
  `REQUIRE_CONTRACT_OWNER_CODE=true`. A solo admin may start with a 1-of-1 or
  1-of-2 Safe for key rotation/recovery, while significant-funds mainnet should
  move to 2-of-3 or stronger. Role-specific owner variables should only
  override that default when a role intentionally has a different Safe/admin
  contract.
- Secondary payment-token policy is hybrid:
  - native-token payments require no allowlist
  - ERC-20s created by the trusted `PaymentTokenFactory` are accepted
    permissionlessly by configured secondary marketplaces
  - external ERC-20s require owner allowlisting on every active secondary
    marketplace before users should list, bid, or buy with them

## Safe Operations

R8 Safe/admin-contract ownership is the required governance model for the
first public rollout. R7 timelock is intentionally deferred until before
mainnet with significant funds, so Safe operations must carry the review and
recordkeeping discipline that timelock would later enforce mechanically.

Use this checklist for every sensitive owner/admin action:

1. Classify the operation.
   - Critical: proxy upgrades, owner transfers, marketplace address changes,
     payment-token factory changes, fee recipient changes, pausing/unpausing,
     or any change that can redirect assets or administrative authority.
   - High: platform fee changes, site-native payment-token changes, external
     ERC-20 allowlist changes, collection-factory target changes, or deployer
     wiring changes.
   - Routine: metadata-only publication, verification manifest publication, or
     read-only operational checks.
2. Write the intent before proposing the Safe transaction.
   - Contract name and address.
   - Function and arguments.
   - Expected on-chain state before execution.
   - Expected on-chain state after execution.
   - User-visible or operational impact.
3. Verify calldata.
   - Use the verified ABI for the exact target contract.
   - Confirm the target address is the active contract for that role.
   - Confirm no proxy admin, implementation, or deployer address is being used
     as a user-facing spender/operator by mistake.
   - For ERC-20 operations, confirm whether the token is factory-created,
     verified external, or untrusted external.
4. Simulate or dry-run when available.
   - Prefer Safe transaction simulation or a fork/local dry-run for critical
     and high operations.
   - If simulation is unavailable, perform a read-only precheck and document
     why simulation was skipped.
5. Collect Safe approval.
   - For 1-of-1 or 1-of-2 solo-admin Safe setups, review the calldata from a
     clean device/session before signing.
   - For thresholds greater than 1, a second signer should independently check
     the target address, function, arguments, and expected impact.
6. Execute and verify.
   - Save the Safe transaction hash and final execution transaction hash.
   - Read the changed on-chain value after execution.
   - Confirm the value matches the expected post-state.
   - For deployment operations, confirm the verification manifest records the
     relevant `ownerVerification` or post-deploy configuration entry.
7. Record the change.
   - Add the operation to release notes or the operational change log.
   - Include target contract, function, arguments, signer/approver context,
     transaction hash, and verification result.
   - If the action affects users, update Help, UI copy, or status docs in the
     same release.

Sensitive-operation quick reference:

| Operation | Contract(s) | Required checks |
| --- | --- | --- |
| Change platform fee | Marketplace contracts | New bps <= `MAX_PLATFORM_FEE_BPS`; UI/admin copy reflects the new fee |
| Change fee recipient | Marketplace contracts | New recipient is expected treasury/Safe-controlled account |
| Set payment-token factory | Secondary marketplaces | Factory address is trusted, deployed, and matches frontend/indexer env |
| Allowlist external ERC-20 | Secondary marketplaces | Token reviewed as external/verified; allowlist applied to every active secondary marketplace |
| Set site-native token | Secondary marketplaces | Token is factory-created or already allowlisted; fee bps reviewed |
| Upgrade primary proxy | `ProxyAdmin` | Implementation verified; storage layout reviewed; proxy target and initializer calldata checked |
| Transfer ownership | Ownable/ProxyAdmin contracts | New owner is Safe/admin contract; `acceptOwnership()` completed for Ownable2Step |
| Pause/unpause | Marketplace/collection contracts | Scope and user impact documented; post-state verified |

## Fee Operations

Secondary marketplace fees intentionally support two tiers:

- Standard fee: `platformFeeBps`, used for native payments and regular
  supported ERC-20 payment tokens.
- Site-native discount fee: `siteNativePaymentTokenFeeBps`, used only when the
  payment token equals the configured `siteNativePaymentToken`.

This discount is a product incentive, not a hidden fallback path. Before
configuring or changing it:

1. Confirm the site-native token address is factory-created or already
   allowlisted as an approved external ERC-20.
2. Confirm `siteNativePaymentTokenFeeBps <= platformFeeBps`.
3. Confirm the frontend env sync includes:
   - `NEXT_PUBLIC_SITE_NATIVE_PAYMENT_TOKEN_ADDRESS`
   - `NEXT_PUBLIC_SITE_NATIVE_PAYMENT_TOKEN_FEE_BPS`
   - optional symbol/logo keys when available
4. Confirm Help and action forms describe the site token as receiving a reduced
   marketplace fee.
5. Record the Safe transaction, post-change fee reads, and env/updateEnv run in
   the release notes or operational change log.

## Payment Token Operations

Secondary marketplaces distinguish three payment-token sources:

| Source | On-chain condition | UI treatment | Operator action |
| --- | --- | --- | --- |
| Native token | `paymentToken == address(0)` | Native/default currency | No payment-token allowlist action |
| User-created factory ERC-20 | `PaymentTokenFactory.creatorByPaymentToken(token) != address(0)` on the trusted factory configured in the marketplace | User-created or unverified token | No admin approval required for basic use |
| External/official ERC-20 | Not native and not registered by the trusted factory | Verified/official only after review | Allowlist on each active secondary marketplace and update the curated UI token list |

Use this runbook before promoting an external ERC-20 to verified/official
status or using it as the site-native fee-discount token.

1. Verify the token contract address on the target chain.
   - Confirm the address is a contract.
   - Confirm `name()`, `symbol()`, `decimals()`, and `totalSupply()` match the
     expected project/operator record.
   - Review whether the token has mint, pause, blacklist, fee-on-transfer, or
     upgrade authority that could affect marketplace settlement.
2. Verify whether it is factory-created.
   - Read `creatorByPaymentToken(token)` on the trusted `PaymentTokenFactory`.
   - If the result is non-zero, the token is already accepted by secondary
     marketplaces that have `paymentTokenFactory` configured. Promotion to
     verified/official is a UI/catalog decision, not a required allowlist step.
   - If the result is zero, treat it as external and continue.
3. Confirm marketplace configuration.
   - Read `paymentTokenFactory()` on `MarketplaceSecondaryERC721`,
     `MarketplaceSecondaryERC1155`, and legacy `MarketplaceV2` if it remains
     active.
   - The value should match the trusted `PaymentTokenFactory` address or be
     intentionally unset only for deployments that do not support factory
     tokens yet.
4. Allowlist external tokens before user-facing enablement.
   - Call `setPaymentTokenAllowed(token, true)` on each active secondary
     marketplace that should accept the token.
   - Verify `allowedPaymentTokens(token) == true` on each target marketplace.
   - For deployments, seed the same addresses through
     `MARKETPLACE_V2_ALLOWED_PAYMENT_TOKENS` so newly deployed secondary
     marketplaces start with the intended external-token policy.
5. Configure site-native fee-discount token only after acceptance.
   - If the site-native token is factory-created, configure
     `paymentTokenFactory` first.
   - If the site-native token is external, allowlist it first.
   - Then call `setSiteNativePaymentToken(...)` or
     `setSiteNativePaymentTokenConfig(...)`.
6. Update frontend catalog and labels.
   - Add verified/official external ERC-20s to `NEXT_PUBLIC_VALID_ERC20_TOKENS`
     or the environment-managed equivalent for the release.
   - Keep factory-created user tokens discoverable through
     `PaymentTokenFactory` and label them as user-created unless separately
     promoted.
   - Keep arbitrary manual ERC-20 entry labeled as external and requiring
     verification.
7. Record the decision.
   - Save the token address, source classification, reviewer, marketplace
     allowlist transactions, and UI catalog change in the release notes or
     operational change log.
   - If the token is removed later, call `setPaymentTokenAllowed(token, false)`
     on every active secondary marketplace and remove it from the curated UI
     catalog.

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
