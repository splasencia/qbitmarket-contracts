// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface ILazyMintCollection {
    function owner() external view returns (address);

    function mintLazy(
        address to,
        uint256,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion,
        bytes32[] calldata proof
    ) external;
}

contract Marketplace is Ownable2Step, Pausable, ReentrancyGuard {
    uint96 public constant MAX_BPS = 10_000;
    uint96 public constant MAX_PLATFORM_FEE_BPS = 0;
    uint96 public constant MAX_COMBINED_FEE_BPS = 0;

    address public feeRecipient;
    uint96 public platformFeeBps;

    event ItemPurchased(address indexed collection, address indexed buyer, uint256 indexed tokenId, uint256 price);
    event PlatformFeePaid(uint256 amount, address indexed recipient);
    event RoyaltyPaid(uint256 amount, address indexed recipient);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PlatformFeeUpdated(uint96 previousFeeBps, uint96 newFeeBps);

    constructor(address initialOwner_, address initialFeeRecipient_, uint96 initialPlatformFeeBps_) {
        require(initialOwner_ != address(0), "Marketplace: invalid owner");
        require(initialFeeRecipient_ != address(0), "Marketplace: invalid fee recipient");
        require(initialPlatformFeeBps_ == 0, "Marketplace: fees disabled");

        feeRecipient = initialFeeRecipient_;
        platformFeeBps = initialPlatformFeeBps_;
        _transferOwnership(initialOwner_);

        emit FeeRecipientUpdated(address(0), initialFeeRecipient_);
        emit PlatformFeeUpdated(0, initialPlatformFeeBps_);
    }

    function buyLazyMint(
        address collection,
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion,
        bytes32[] calldata proof
    ) external payable whenNotPaused nonReentrant {
        require(collection != address(0), "Marketplace: invalid collection");
        require(price > 0, "Marketplace: invalid price");
        require(msg.value == price, "Marketplace: incorrect payment");

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        ) = _quotePayout(collection, tokenId, price);

        ILazyMintCollection(collection).mintLazy(msg.sender, tokenId, tokenURI_, price, rootVersion, proof);

        if (platformFeeAmount > 0) {
            _transferNative(feeRecipient, platformFeeAmount);
            emit PlatformFeePaid(platformFeeAmount, feeRecipient);
        }

        if (royaltyAmount > 0) {
            _transferNative(royaltyRecipient_, royaltyAmount);
            emit RoyaltyPaid(royaltyAmount, royaltyRecipient_);
        }

        if (sellerProceeds > 0) {
            _transferNative(seller, sellerProceeds);
        }

        emit ItemPurchased(collection, msg.sender, tokenId, price);
    }

    function quotePayout(
        address collection,
        uint256 tokenId,
        uint256 salePrice
    )
        external
        view
        returns (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        )
    {
        return _quotePayout(collection, tokenId, salePrice);
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "Marketplace: invalid fee recipient");

        address previousRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(previousRecipient, newFeeRecipient);
    }

    function setPlatformFeeBps(uint96 newPlatformFeeBps) external onlyOwner {
        require(newPlatformFeeBps == 0, "Marketplace: fees disabled");

        uint96 previousFeeBps = platformFeeBps;
        platformFeeBps = newPlatformFeeBps;

        emit PlatformFeeUpdated(previousFeeBps, newPlatformFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _quotePayout(
        address collection,
        uint256,
        uint256 salePrice
    )
        internal
        view
        returns (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        )
    {
        require(collection != address(0), "Marketplace: invalid collection");

        seller = ILazyMintCollection(collection).owner();
        require(seller != address(0), "Marketplace: invalid seller");

        // qbitmarket is a non-commercial QANPlatform testnet demo. Platform
        // fees and royalties are intentionally disabled for every sale path.
        platformFeeAmount = 0;
        royaltyRecipient_ = address(0);
        royaltyAmount = 0;
        sellerProceeds = salePrice;
    }

    function _transferNative(address recipient, uint256 amount) internal {
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Marketplace: native transfer failed");
    }
}
