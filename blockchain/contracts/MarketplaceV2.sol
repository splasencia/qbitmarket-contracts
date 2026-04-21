// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MarketplaceSecondaryAuctions.sol";
import "./MarketplaceSecondaryERC1155Auctions.sol";

contract MarketplaceV2 is MarketplaceSecondaryAuctions, MarketplaceSecondaryERC1155Auctions {
    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    )
        MarketplaceSecondaryAuctions(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_)
    {}
}
