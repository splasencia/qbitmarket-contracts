// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC721CollectionDeployer {
    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        address initialMarketplace_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection);
}

interface IERC1155CollectionDeployer {
    function deploy(
        string calldata name_,
        string calldata symbol_,
        address initialOwner_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection);
}

contract CollectionFactory is Ownable {
    uint8 public constant STANDARD_UNKNOWN = 0;
    uint8 public constant STANDARD_ERC721 = 1;
    uint8 public constant STANDARD_ERC1155 = 2;

    address public marketplace;
    address public erc721CollectionDeployer;
    address public erc1155CollectionDeployer;

    address[] private _allCollections;
    address[] private _allERC1155Collections;

    mapping(address => address[]) private _collectionsByCreator;
    mapping(address => address[]) private _erc1155CollectionsByCreator;
    mapping(address => address) public creatorByCollection;
    mapping(address => uint8) public collectionStandardByAddress;

    event MarketplaceUpdated(address indexed previousMarketplace, address indexed newMarketplace);
    event ERC721CollectionDeployerUpdated(address indexed previousDeployer, address indexed newDeployer);
    event ERC1155CollectionDeployerUpdated(address indexed previousDeployer, address indexed newDeployer);
    event CollectionCreated(
        address indexed creator,
        address indexed collection,
        address indexed collectionOwner,
        string name,
        string symbol
    );
    event CollectionCreatedDetailed(
        address indexed creator,
        address indexed collection,
        address indexed collectionOwner,
        uint8 standard,
        address marketplaceTarget,
        string name,
        string symbol
    );
    event ERC1155CollectionCreated(
        address indexed creator,
        address indexed collection,
        address indexed collectionOwner,
        string name,
        string symbol
    );

    constructor(
        address initialOwner_,
        address initialMarketplace_,
        address initialERC721CollectionDeployer_,
        address initialERC1155CollectionDeployer_
    ) {
        require(initialOwner_ != address(0), "CollectionFactory: invalid owner");
        require(initialMarketplace_ != address(0), "CollectionFactory: invalid marketplace");
        require(initialERC721CollectionDeployer_ != address(0), "CollectionFactory: invalid ERC721 deployer");
        require(initialERC1155CollectionDeployer_ != address(0), "CollectionFactory: invalid ERC1155 deployer");

        marketplace = initialMarketplace_;
        erc721CollectionDeployer = initialERC721CollectionDeployer_;
        erc1155CollectionDeployer = initialERC1155CollectionDeployer_;
        transferOwnership(initialOwner_);

        emit MarketplaceUpdated(address(0), initialMarketplace_);
        emit ERC721CollectionDeployerUpdated(address(0), initialERC721CollectionDeployer_);
        emit ERC1155CollectionDeployerUpdated(address(0), initialERC1155CollectionDeployer_);
    }

    function createCollection(
        string calldata name_,
        string calldata symbol_,
        address collectionOwner_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        require(collectionOwner_ != address(0), "CollectionFactory: invalid collection owner");

        collection = IERC721CollectionDeployer(erc721CollectionDeployer).deploy(
            name_,
            symbol_,
            collectionOwner_,
            marketplace,
            contractURI_,
            royaltyRecipient_,
            royaltyBps_
        );

        _allCollections.push(collection);
        _collectionsByCreator[msg.sender].push(collection);
        creatorByCollection[collection] = msg.sender;
        collectionStandardByAddress[collection] = STANDARD_ERC721;

        emit CollectionCreated(msg.sender, collection, collectionOwner_, name_, symbol_);
        emit CollectionCreatedDetailed(
            msg.sender,
            collection,
            collectionOwner_,
            STANDARD_ERC721,
            marketplace,
            name_,
            symbol_
        );
    }

    function createERC1155Collection(
        string calldata name_,
        string calldata symbol_,
        address collectionOwner_,
        string calldata contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) external returns (address collection) {
        require(collectionOwner_ != address(0), "CollectionFactory: invalid collection owner");

        collection = IERC1155CollectionDeployer(erc1155CollectionDeployer).deploy(
            name_,
            symbol_,
            collectionOwner_,
            contractURI_,
            royaltyRecipient_,
            royaltyBps_
        );

        _allERC1155Collections.push(collection);
        _erc1155CollectionsByCreator[msg.sender].push(collection);
        creatorByCollection[collection] = msg.sender;
        collectionStandardByAddress[collection] = STANDARD_ERC1155;

        emit ERC1155CollectionCreated(msg.sender, collection, collectionOwner_, name_, symbol_);
        emit CollectionCreatedDetailed(
            msg.sender,
            collection,
            collectionOwner_,
            STANDARD_ERC1155,
            address(0),
            name_,
            symbol_
        );
    }

    function setMarketplace(address newMarketplace) external onlyOwner {
        require(newMarketplace != address(0), "CollectionFactory: invalid marketplace");

        address previousMarketplace = marketplace;
        marketplace = newMarketplace;

        emit MarketplaceUpdated(previousMarketplace, newMarketplace);
    }

    function setERC721CollectionDeployer(address newDeployer) external onlyOwner {
        require(newDeployer != address(0), "CollectionFactory: invalid ERC721 deployer");

        address previousDeployer = erc721CollectionDeployer;
        erc721CollectionDeployer = newDeployer;

        emit ERC721CollectionDeployerUpdated(previousDeployer, newDeployer);
    }

    function setERC1155CollectionDeployer(address newDeployer) external onlyOwner {
        require(newDeployer != address(0), "CollectionFactory: invalid ERC1155 deployer");

        address previousDeployer = erc1155CollectionDeployer;
        erc1155CollectionDeployer = newDeployer;

        emit ERC1155CollectionDeployerUpdated(previousDeployer, newDeployer);
    }

    function allCollectionsLength() external view returns (uint256) {
        return _allCollections.length;
    }

    function allCollections(uint256 index) external view returns (address) {
        return _allCollections[index];
    }

    function collectionsByCreator(address creator) external view returns (address[] memory) {
        return _collectionsByCreator[creator];
    }

    function allERC1155CollectionsLength() external view returns (uint256) {
        return _allERC1155Collections.length;
    }

    function allERC1155Collections(uint256 index) external view returns (address) {
        return _allERC1155Collections[index];
    }

    function erc1155CollectionsByCreator(address creator) external view returns (address[] memory) {
        return _erc1155CollectionsByCreator[creator];
    }
}
