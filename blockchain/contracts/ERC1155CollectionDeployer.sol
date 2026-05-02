// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./ERC1155Collection.sol";

contract ERC1155CollectionDeployer {
    address private immutable _initializer;
    address public factory;

    event FactoryInitialized(address indexed factory);

    constructor() {
        _initializer = msg.sender;
    }

    /// @notice Binds this deployer to its factory once, restricted to the account that deployed it.
    function initFactory(address factory_) external {
        require(msg.sender == _initializer, "ERC1155CollectionDeployer: only initializer");
        require(factory == address(0), "ERC1155CollectionDeployer: factory already set");
        require(factory_ != address(0), "ERC1155CollectionDeployer: invalid factory");
        require(factory_.code.length > 0, "ERC1155CollectionDeployer: invalid factory");
        factory = factory_;
        emit FactoryInitialized(factory_);
    }

    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        require(factory != address(0) && msg.sender == factory, "ERC1155CollectionDeployer: only factory");
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
