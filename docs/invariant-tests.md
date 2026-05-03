# Contracts Invariant Tests

This document explains the behavioral rules covered by the focused invariant
test suite. The goal is to make the public audit evidence readable: each rule
below states what must remain true, why it matters, and which test checks it.

Automated invariant tests are not a formal proof and do not replace external
review. They are regression evidence for high-risk marketplace behavior.

## Test Entry Point

Run the focused suite from the public contracts repository:

```sh
cd blockchain
TMPDIR=/tmp \
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001 \
PRIVATE_KEY_QAN=0x0000000000000000000000000000000000000000000000000000000000000001 \
npx hardhat test test/MarketplaceSecondaryInvariants.test.js
```

Run the lifecycle edge-case suite when reviewing the marketplace state-machine
guards:

```sh
cd blockchain
TMPDIR=/tmp \
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001 \
PRIVATE_KEY_QAN=0x0000000000000000000000000000000000000000000000000000000000000001 \
npx hardhat test test/MarketplaceSecondaryLifecycleEdges.test.js
```

The full public Hardhat release suite should also pass:

```sh
cd blockchain
TMPDIR=/tmp \
PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001 \
PRIVATE_KEY_QAN=0x0000000000000000000000000000000000000000000000000000000000000001 \
npx hardhat test
```

## Invariant Summary

| Invariant | Why it matters | Current check |
| --- | --- | --- |
| Native offer escrow is conserved | Native offers must not leave ETH stuck in the marketplace after cancellation or acceptance | Fuzzed ERC-721 and ERC-1155 offer amount matrices assert marketplace ETH balance returns to zero |
| Native auction escrow tracks only the current high bid | Outbid bidders must be refunded and only the latest winning bid should remain escrowed | Fuzzed ERC-721 and ERC-1155 auction matrices assert marketplace ETH balance equals the current high bid after replacement bids |
| Native auction settlement clears escrow | Settlement must transfer the asset and distribute all escrowed ETH | ERC-721 and ERC-1155 auction settlement paths assert marketplace ETH balance returns to zero |
| Factory ERC-20s are accepted without per-token allowlisting | User-created payment tokens should work permissionlessly when created by the trusted factory | Factory-created token matrix creates offers while `allowedPaymentTokens(token) == false` |
| External ERC-20s are blocked until allowlisted | Arbitrary ERC-20s should not be accepted silently | External ERC-20 offer creation reverts before allowlisting and succeeds after owner allowlisting |
| ERC-20 offer escrow clears on cancellation and settlement | Escrowed ERC-20s should not remain trapped after normal lifecycle exits | Factory-created ERC-20 offers assert marketplace token balance returns to zero after cancellation and acceptance |
| Primary platform fee is capped | Primary marketplace owner cannot configure a platform fee above the documented cap | Fuzzed bps values accept `0..1000` and reject values above `MAX_PLATFORM_FEE_BPS` |
| Secondary platform fee is capped | Secondary marketplace owner cannot configure a standard fee above the documented cap | Fuzzed bps values accept `0..1000` and reject values above `MAX_PLATFORM_FEE_BPS` |
| Site-native discount fee cannot exceed standard fee | The product discount must remain a discount, not a hidden surcharge | Secondary fee matrix rejects standard fee below the site-native fee and rejects site-native fee above the standard fee |

## Coverage Shape

The current suite uses deterministic fuzz-style matrices instead of pure random
inputs. This keeps CI reproducible while still exercising multiple value ranges
and state transitions:

- small, medium, and larger native escrow amounts
- ERC-721 and ERC-1155 offer cancellation
- ERC-721 and ERC-1155 offer acceptance
- ERC-721 and ERC-1155 auction bids, replacement bids, and settlement
- factory-created ERC-20s
- external ERC-20s before and after allowlisting
- allowed and rejected fee basis-point values

The invariant suite intentionally focuses on high-value rules rather than
duplicating all scenario tests. The companion lifecycle suite covers the main
state-machine edge cases:

- unauthorized or invalid ERC-721 listing creation and updates
- cancelled, expired, already executed, underpaid, overpaid, self-purchase,
  approval-revoked, and ownership-lost ERC-721 listing purchases
- native payout failure when a fee recipient rejects ETH, with listing state and
  NFT ownership preserved by revert semantics
- cancelled, expired, reused, self, unauthorized, and unapproved ERC-721 offers
- ERC-20 offer creation failures for insufficient allowance or balance
- ERC-1155 listing amount, balance, approval, payment, and double-execution
  checks
- ERC-1155 offer amount, cancellation, expiry, reuse, self, and approval checks
- ERC-721 and ERC-1155 auction reserve, increment, payment, cancellation,
  early-settlement, and double-settlement checks
- pause behavior: critical create/buy/accept/auction actions revert while
  cancellations remain available so users can clear stale intent

Other scenario tests still cover invalidation, reentrancy, upgradeability,
collection ownership, and collection deployer initialization.

## Current Boundaries

These tests do not currently provide exhaustive symbolic or property-based
coverage over all possible call sequences. Known boundaries:

- no randomized multi-actor sequence generator yet
- no invariant harness that runs across hundreds or thousands of arbitrary call
  sequences
- no Foundry or Echidna stateful property runner yet
- no formal storage-layout proof for future upgrades
- no mainnet-fork behavior for unusual ERC-20s such as fee-on-transfer,
  rebasing, blacklistable, or pausable tokens

## Recommended Next Level Before Mainnet

Before a mainnet release with significant funds, add a dedicated property-based
runner. The most useful next step is Foundry invariant testing or Echidna,
focused on:

- escrow conservation across arbitrary sequences of create, cancel, buy,
  accept, bid, outbid, settle, pause, and expiry operations
- no active listing/auction pointer references an inactive or impossible state
- ERC-1155 balances never allow settlement of more units than were escrowed or
  approved
- payment-token policy never accepts an external ERC-20 unless allowlisted
- factory-created tokens remain accepted only while the trusted factory is
  configured
- fee and royalty sums never exceed sale price or documented caps
- owner/admin operations cannot bypass pause, fee, or token-policy constraints

Foundry is the preferred first addition if the team wants fast Solidity-native
invariants in CI. Echidna is useful when we want longer-running stateful fuzz
campaigns and minimized counterexamples as release artifacts. Either would
complement, not replace, the current Hardhat suite.
