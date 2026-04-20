// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ERC1155Collection.sol";

contract ERC1155CollectionDeployer {
    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        collection = address(
            new ERC1155Collection(
                name_,
                symbol_,
                initialOwner_,
                contractURI_,
                royaltyRecipient_,
                royaltyBps_
            )
        );
    }
}
