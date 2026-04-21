// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MarketplaceSecondaryERC1155Auctions.sol";

contract MarketplaceSecondaryERC1155 is MarketplaceSecondaryERC1155Auctions {
    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryPayments(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}
}
