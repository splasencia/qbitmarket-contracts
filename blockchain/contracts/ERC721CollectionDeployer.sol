// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ERC721Collection.sol";

contract ERC721CollectionDeployer {
    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        address initialMarketplace_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        collection = address(
            new ERC721Collection(
                name_,
                symbol_,
                initialOwner_,
                initialMarketplace_,
                contractURI_,
                royaltyRecipient_,
                royaltyBps_
            )
        );
    }
}
