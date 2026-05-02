// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ERC721Collection.sol";

contract ERC721CollectionDeployer {
    address private immutable _initializer;
    address public factory;

    event FactoryInitialized(address indexed factory);

    constructor() {
        _initializer = msg.sender;
    }

    /// @notice Binds this deployer to its factory once, restricted to the account that deployed it.
    function initFactory(address factory_) external {
        require(msg.sender == _initializer, "ERC721CollectionDeployer: only initializer");
        require(factory == address(0), "ERC721CollectionDeployer: factory already set");
        require(factory_ != address(0), "ERC721CollectionDeployer: invalid factory");
        require(factory_.code.length > 0, "ERC721CollectionDeployer: invalid factory");
        factory = factory_;
        emit FactoryInitialized(factory_);
    }

    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        address initialMarketplace_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        require(factory != address(0) && msg.sender == factory, "ERC721CollectionDeployer: only factory");
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
