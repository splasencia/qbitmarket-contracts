// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ILazyMintCollectionUpgradeable {
    function owner() external view returns (address);

    function mintLazy(
        address to,
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion,
        bytes32[] calldata proof
    ) external;
}

/// @dev The proxy imports are kept here intentionally so the custom solc-based
/// deployment pipeline can compile and deploy the OpenZeppelin proxy artifacts
/// alongside the implementation from a single target file.
contract MarketplacePrimaryUpgradeable is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    uint96 public constant MAX_BPS = 10_000;
    uint96 public constant MAX_PLATFORM_FEE_BPS = 1_000;
    uint96 public constant MAX_COMBINED_FEE_BPS = 5_000;

    address public feeRecipient;
    uint96 public platformFeeBps;

    event ItemPurchased(address indexed collection, address indexed buyer, uint256 indexed tokenId, uint256 price);
    event PlatformFeePaid(uint256 amount, address indexed recipient);
    event RoyaltyPaid(uint256 amount, address indexed recipient);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PlatformFeeUpdated(uint96 previousFeeBps, uint96 newFeeBps);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address initialOwner_, address initialFeeRecipient_, uint96 initialPlatformFeeBps_)
        external
        initializer
    {
        require(initialOwner_ != address(0), "MarketplacePrimaryUpgradeable: invalid owner");
        require(initialFeeRecipient_ != address(0), "MarketplacePrimaryUpgradeable: invalid fee recipient");
        require(initialPlatformFeeBps_ <= MAX_PLATFORM_FEE_BPS, "MarketplacePrimaryUpgradeable: fee too high");

        __Ownable_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        feeRecipient = initialFeeRecipient_;
        platformFeeBps = initialPlatformFeeBps_;
        transferOwnership(initialOwner_);

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
        require(collection != address(0), "MarketplacePrimaryUpgradeable: invalid collection");
        require(price > 0, "MarketplacePrimaryUpgradeable: invalid price");
        require(msg.value == price, "MarketplacePrimaryUpgradeable: incorrect payment");

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        ) = _quotePayout(collection, tokenId, price);

        ILazyMintCollectionUpgradeable(collection).mintLazy(msg.sender, tokenId, tokenURI_, price, rootVersion, proof);

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
        require(newFeeRecipient != address(0), "MarketplacePrimaryUpgradeable: invalid fee recipient");

        address previousRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(previousRecipient, newFeeRecipient);
    }

    function setPlatformFeeBps(uint96 newPlatformFeeBps) external onlyOwner {
        require(newPlatformFeeBps <= MAX_PLATFORM_FEE_BPS, "MarketplacePrimaryUpgradeable: fee too high");

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

    function version() external pure returns (uint256) {
        return 1;
    }

    function _quotePayout(
        address collection,
        uint256 tokenId,
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
        require(collection != address(0), "MarketplacePrimaryUpgradeable: invalid collection");

        seller = ILazyMintCollectionUpgradeable(collection).owner();
        require(seller != address(0), "MarketplacePrimaryUpgradeable: invalid seller");

        platformFeeAmount = (salePrice * platformFeeBps) / MAX_BPS;

        if (_supportsInterface(collection, type(IERC2981).interfaceId)) {
            try IERC2981(collection).royaltyInfo(tokenId, salePrice) returns (
                address resolvedRecipient,
                uint256 resolvedAmount
            ) {
                if (resolvedRecipient != address(0) && resolvedAmount > 0) {
                    royaltyRecipient_ = resolvedRecipient;
                    royaltyAmount = resolvedAmount;
                }
            } catch {}
        }

        require(
            platformFeeAmount + royaltyAmount <= salePrice,
            "MarketplacePrimaryUpgradeable: payout exceeds sale price"
        );
        require(
            platformFeeAmount + royaltyAmount <= (salePrice * MAX_COMBINED_FEE_BPS) / MAX_BPS,
            "MarketplacePrimaryUpgradeable: combined fees too high"
        );
        sellerProceeds = salePrice - platformFeeAmount - royaltyAmount;
    }

    function _supportsInterface(address account, bytes4 interfaceId) internal view returns (bool) {
        if (account.code.length == 0) {
            return false;
        }

        try IERC165(account).supportsInterface(interfaceId) returns (bool supported) {
            return supported;
        } catch {
            return false;
        }
    }

    function _transferNative(address recipient, uint256 amount) internal {
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "MarketplacePrimaryUpgradeable: native transfer failed");
    }

    uint256[49] private __gap;
}
