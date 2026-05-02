# Contracts Audit Triage

Date: 2026-04-21

This file records automated audit runs and triage for the post-Phase-2
contracts surface.

## Frozen analysis surface

The post-Phase-2 candidate surface for automated analysis is:

- `blockchain/contracts/MarketplacePrimaryUpgradeable.sol`
- `blockchain/contracts/MarketplaceSecondaryERC721.sol`
- `blockchain/contracts/MarketplaceSecondaryERC1155.sol`
- `blockchain/contracts/MarketplaceSecondaryBase.sol`
- `blockchain/contracts/MarketplaceSecondaryPayments.sol`
- `blockchain/contracts/MarketplaceSecondaryListings.sol`
- `blockchain/contracts/MarketplaceSecondaryOffers.sol`
- `blockchain/contracts/MarketplaceSecondaryAuctions.sol`
- `blockchain/contracts/MarketplaceSecondaryERC1155Listings.sol`
- `blockchain/contracts/MarketplaceSecondaryERC1155Offers.sol`
- `blockchain/contracts/MarketplaceSecondaryERC1155Auctions.sol`
- `blockchain/contracts/CollectionFactory.sol`
- `blockchain/contracts/ERC721Collection.sol`
- `blockchain/contracts/ERC1155Collection.sol`
- `blockchain/contracts/ERC721CollectionDeployer.sol`
- `blockchain/contracts/ERC1155CollectionDeployer.sol`

`MarketplaceV2` is retained as a legacy combined compatibility wrapper. It is
not the long-term size-safe secondary-market deployment target.

Generated bundle files under `blockchain/contracts/bundled_contracts` are
reproducibility artifacts. Use them for deploy bytecode reproduction, but filter
them out of source-level static analysis to avoid duplicate findings.

## Slither baseline

Command:

```sh
SLITHER_ALLOW_FINDINGS=1 scripts/run_slither.sh
```

Local run:

- Slither version: `0.11.5`
- Targets:
  - `contracts/MarketplaceSecondaryERC721.sol`
  - `contracts/MarketplaceSecondaryERC1155.sol`
- Import remap: `@openzeppelin/=node_modules/@openzeppelin/`
- Filtered paths: `node_modules|contracts/bundled_contracts|contracts/test`

Observed result:

- Slither completed analysis for both split secondary entrypoints.
- Slither exited non-zero because findings were reported.
- JSON artifacts are written to `/tmp/qbitmarket-contract-slither` by
  default; override with `SLITHER_OUTPUT_DIR=...` when artifacts should be kept
  elsewhere.
- The script exits non-zero when Slither reports findings unless
  `SLITHER_ALLOW_FINDINGS=1` is set for baseline/triage runs.
- Slither's compile step emits code-size warnings for these source entrypoints
  under its unoptimized analysis invocation. The deployment-size gate remains
  the bundled, optimizer/via-IR measurement documented in
  `docs/contract-architecture.md`.

### Initial triage

| Detector | Affected surface | Triage | Follow-up |
| --- | --- | --- | --- |
| `arbitrary-send-eth` | `_transferNative` payout helper | Expected marketplace behavior. Sellers, royalty recipients, bidders, and fee recipient are dynamic recipients by design. | Keep, but ensure all user-facing value-transfer paths stay `nonReentrant` and covered by payout tests. |
| `low-level-calls` | `_transferNative` payout helper | Expected native transfer implementation. Uses call and reverts on failure. | Keep; document as intentional. |
| `timestamp` | listing expiry and auction end-time checks | Expected because listings/offers/auctions are time-bounded. | Keep; future tests should cover boundary timing for expiry and settlement. |
| `reentrancy-events` | payout helpers emit after token/native transfer | Needs review but low immediate risk because public write entrypoints are `nonReentrant` and state changes occur before settlement in buy/accept/settle paths. | Consider moving `PlatformFeePaid` / `RoyaltyPaid` emissions before external transfers only if event semantics remain acceptable. |
| `reentrancy-no-eth` / `reentrancy-benign` | auction custody creation and ERC-20 offer escrow creation | Resolved by targeted regression coverage. Current public write paths are `nonReentrant`; ERC-721 uses `transferFrom`, ERC-1155 receiver callback is pure, and state becomes active only after custody succeeds. | Keep `blockchain/test/MarketplaceSecondaryReentrancy.test.js` in the release test set. |
| `dead-code` | helpers for the opposite secondary standard when analyzing only one split entrypoint | Expected consequence of shared storage/base for two split entrypoints. | Keep unless storage/base is split further; do not remove solely from one entrypoint because `MarketplaceV2` legacy and the other split surface need those helpers. |
| `constable-states` / `uninitialized-state` | counters/mappings for the opposite secondary standard when analyzing only one split entrypoint | Expected consequence of shared storage/base across split standards. These variables are used by the other entrypoint and the legacy combined wrapper. | Keep; storage layout is intentionally centralized in `MarketplaceSecondaryBase`. |

### Accepted and resolved Slither findings

Machine-readable policy:

- `docs/slither-accepted-findings.json` is the source of truth for
  accepted or regression-tested Slither detector families.
- `scripts/check_slither_triage.js` fails CI when a Slither report
  contains a detector family or impact that is not listed in that policy file.
- The audit-evidence workflow still uploads the full Slither JSON reports, so
  accepted findings remain visible instead of being filtered out.

Disposition:

- `reentrancy-no-eth` and `reentrancy-benign` are treated as resolved by
  regression tests. `MarketplaceSecondaryReentrancy.test.js` verifies that
  malicious ERC-20, ERC-721, and ERC-1155 callbacks cannot create duplicate
  offer/auction state during escrow or custody transfer.
- `arbitrary-send-eth` and `low-level-calls` are accepted as intentional native
  payout/refund behavior. The marketplace must pay dynamic sellers, bidders,
  royalty recipients, and fee recipients.
- `timestamp` is accepted because listings, offers, and auctions are
  time-bounded product primitives.
- `reentrancy-events` is accepted as informational for now because critical
  state transitions happen before settlement/payout in user-facing write paths,
  and event ordering is preserved unless a separate consumer migration is
  justified.
- `dead-code`, `uninitialized-state`, and `constable-states` are accepted as
  split-entrypoint analysis artifacts caused by the shared secondary storage
  base. The opposite-standard counters, mappings, and helpers are used by the
  other split entrypoint and by the legacy compatibility wrapper.

## Mythril or equivalent

Command:

```sh
scripts/run_mythril.sh
```

Local run:

- Mythril version: `v0.24.8`
- Container image: `mythril/myth`
- Targets:
  - Hardhat artifact bytecode for `MarketplaceSecondaryERC721`
  - Hardhat artifact bytecode for `MarketplaceSecondaryERC1155`
- Profile:
  - `--execution-timeout 60`
  - `--max-depth 32`
  - `-t 2`
  - `--no-onchain-data`
  - `-o json`

Observed result:

- `secondary-erc721`: `success=true`, `issues=0`
- `secondary-erc1155`: `success=true`, `issues=0`
- JSON reports and extracted bytecode are written to
  `/tmp/qbitmarket-contract-mythril` by default; override with
  `MYTHRIL_OUTPUT_DIR=...`.
- The runner uses bytecode from Hardhat artifacts instead of source-level
  compilation. This avoids relying on the Mythril container downloading `solc`
  during analysis.

Triage:

- no Mythril findings were reported in the initial bounded profile
- this does not replace targeted regression tests for the Slither reentrancy
  follow-up, because the profile is intentionally bounded for local
  reproducibility

## Targeted reentrancy regression tests

Command:

```sh
cd blockchain
TMPDIR=/tmp \
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001 \
PRIVATE_KEY_QAN=0x0000000000000000000000000000000000000000000000000000000000000001 \
npx hardhat test test/MarketplaceSecondaryReentrancy.test.js
```

Coverage:

- malicious ERC-20 `transferFrom` attempts to reenter ERC-721 offer creation
  during escrow collection
- malicious ERC-721 `transferFrom` attempts to reenter auction creation during
  custody transfer
- malicious ERC-1155 `safeTransferFrom` attempts to reenter ERC-1155 auction
  creation during custody transfer

Observed result:

- all reentrant calls were blocked by `ReentrancyGuard`
- the outer marketplace operation completed exactly once
- no duplicate offer/auction state was created

Residual note:

- Slither's event-after-transfer warnings remain informational. They are not
  removed by these tests because the project currently preserves event ordering
  unless a separate event-semantics migration is justified.
