// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MarketplaceSecondaryAuctions.sol";

contract MarketplaceSecondaryERC721 is MarketplaceSecondaryAuctions {
    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryAuctions(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}
}
