// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

abstract contract MarketplaceSecondaryBase is Ownable, Pausable, ReentrancyGuard, IERC1155Receiver {
    uint96 public constant MAX_BPS = 10_000;

    struct Listing {
        address seller;
        address collection;
        uint256 tokenId;
        address paymentToken;
        uint256 price;
        bool active;
        uint256 expiresAt;
    }

    struct Offer {
        address bidder;
        address collection;
        uint256 tokenId;
        address paymentToken;
        uint256 amount;
        bool active;
        uint256 expiresAt;
    }

    struct ERC1155Offer {
        address bidder;
        address collection;
        uint256 tokenId;
        uint256 tokenAmount;
        address paymentToken;
        uint256 amount;
        bool active;
        uint256 expiresAt;
    }

    struct Auction {
        address seller;
        address collection;
        uint256 tokenId;
        address paymentToken;
        uint256 reservePrice;
        uint256 minBidIncrement;
        address highestBidder;
        uint256 highestBidAmount;
        uint256 endTime;
        bool active;
    }

    struct ERC1155Listing {
        address seller;
        address collection;
        uint256 tokenId;
        uint256 amount;
        address paymentToken;
        uint256 price;
        bool active;
        uint256 expiresAt;
    }

    struct ERC1155Auction {
        address seller;
        address collection;
        uint256 tokenId;
        uint256 amount;
        address paymentToken;
        uint256 reservePrice;
        uint256 minBidIncrement;
        address highestBidder;
        uint256 highestBidAmount;
        uint256 endTime;
        bool active;
    }

    address public feeRecipient;
    uint96 public platformFeeBps;
    address public siteNativePaymentToken;
    uint96 public siteNativePaymentTokenFeeBps;
    uint256 public nextListingId = 1;
    uint256 public nextOfferId = 1;
    uint256 public nextERC1155OfferId = 1;
    uint256 public nextAuctionId = 1;
    uint256 public nextERC1155ListingId = 1;
    uint256 public nextERC1155AuctionId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Offer) public offers;
    mapping(uint256 => ERC1155Offer) public erc1155Offers;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => ERC1155Listing) public erc1155Listings;
    mapping(uint256 => ERC1155Auction) public erc1155Auctions;
    mapping(address => mapping(uint256 => uint256)) public activeListingIdByAsset;
    mapping(address => mapping(uint256 => uint256)) public activeAuctionIdByAsset;
    mapping(address => mapping(uint256 => mapping(address => uint256))) public activeERC1155ListingIdByAssetAndSeller;
    mapping(address => mapping(uint256 => mapping(address => uint256))) public activeERC1155AuctionIdByAssetAndSeller;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        address paymentToken,
        uint256 price
    );
    event ListingUpdated(uint256 indexed listingId, address paymentToken, uint256 price);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ListingInvalidated(uint256 indexed listingId, address indexed previousSeller);
    event ListingPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed collection,
        uint256 tokenId,
        address seller,
        address paymentToken,
        uint256 price
    );
    event ERC1155ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price
    );
    event ERC1155ListingUpdated(
        uint256 indexed listingId,
        uint256 amount,
        address paymentToken,
        uint256 price
    );
    event ERC1155ListingCancelled(uint256 indexed listingId, address indexed seller);
    event ERC1155ListingInvalidated(uint256 indexed listingId, address indexed previousSeller);
    event ERC1155ListingPurchased(
        uint256 indexed listingId,
        address indexed buyer,
        address indexed collection,
        uint256 tokenId,
        address seller,
        uint256 amount,
        address paymentToken,
        uint256 price
    );
    event ERC1155AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint256 endTime
    );
    event ERC1155AuctionBidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        address paymentToken,
        uint256 amount
    );
    event ERC1155AuctionCancelled(uint256 indexed auctionId, address indexed seller);
    event ERC1155AuctionSettled(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 finalPrice
    );
    event OfferCreated(
        uint256 indexed offerId,
        address indexed bidder,
        address indexed collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount
    );
    event OfferCancelled(uint256 indexed offerId, address indexed bidder);
    event OfferAccepted(
        uint256 indexed offerId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount
    );
    event ERC1155OfferCreated(
        uint256 indexed offerId,
        address indexed bidder,
        address indexed collection,
        uint256 tokenId,
        uint256 tokenAmount,
        address paymentToken,
        uint256 amount
    );
    event ERC1155OfferCancelled(uint256 indexed offerId, address indexed bidder);
    event ERC1155OfferAccepted(
        uint256 indexed offerId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        uint256 tokenAmount,
        address paymentToken,
        uint256 amount
    );
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed collection,
        uint256 tokenId,
        address paymentToken,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint256 endTime
    );
    event AuctionBidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        address paymentToken,
        uint256 amount
    );
    event AuctionCancelled(uint256 indexed auctionId, address indexed seller);
    event AuctionSettled(
        uint256 indexed auctionId,
        address indexed seller,
        address indexed buyer,
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount
    );
    event PlatformFeePaid(uint256 amount, address indexed recipient, address indexed paymentToken);
    event RoyaltyPaid(uint256 amount, address indexed recipient, address indexed paymentToken);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PlatformFeeUpdated(uint96 previousFeeBps, uint96 newFeeBps);
    event SiteNativePaymentTokenUpdated(address indexed previousToken, address indexed newToken);
    event SiteNativePaymentTokenFeeUpdated(uint96 previousFeeBps, uint96 newFeeBps);

    constructor(address initialOwner_, address initialFeeRecipient_, uint96 initialPlatformFeeBps_) {
        require(initialOwner_ != address(0), "bad owner");
        require(initialFeeRecipient_ != address(0), "bad fee recipient");
        require(initialPlatformFeeBps_ <= MAX_BPS, "fee high");

        feeRecipient = initialFeeRecipient_;
        platformFeeBps = initialPlatformFeeBps_;
        siteNativePaymentTokenFeeBps = initialPlatformFeeBps_;
        transferOwnership(initialOwner_);

        emit FeeRecipientUpdated(address(0), initialFeeRecipient_);
        emit PlatformFeeUpdated(0, initialPlatformFeeBps_);
        emit SiteNativePaymentTokenFeeUpdated(0, initialPlatformFeeBps_);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function setFeeRecipient(address newFeeRecipient) external onlyOwner {
        require(newFeeRecipient != address(0), "bad fee recipient");

        address previousRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(previousRecipient, newFeeRecipient);
    }

    function setPlatformFeeBps(uint96 newPlatformFeeBps) external onlyOwner {
        require(newPlatformFeeBps <= MAX_BPS, "fee high");
        require(newPlatformFeeBps >= siteNativePaymentTokenFeeBps, "below native fee");

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

    function _deactivateListing(uint256 listingId, Listing storage listing) internal {
        listing.active = false;

        if (activeListingIdByAsset[listing.collection][listing.tokenId] == listingId) {
            activeListingIdByAsset[listing.collection][listing.tokenId] = 0;
        }
    }

    function _invalidateListing(uint256 listingId, Listing storage listing) internal {
        _deactivateListing(listingId, listing);
        emit ListingInvalidated(listingId, listing.seller);
    }

    function _deactivateERC1155Listing(uint256 listingId, ERC1155Listing storage listing) internal {
        listing.active = false;

        if (
            activeERC1155ListingIdByAssetAndSeller[listing.collection][listing.tokenId][listing.seller] == listingId
        ) {
            activeERC1155ListingIdByAssetAndSeller[listing.collection][listing.tokenId][listing.seller] = 0;
        }
    }

    function _invalidateERC1155Listing(uint256 listingId, ERC1155Listing storage listing) internal {
        _deactivateERC1155Listing(listingId, listing);
        emit ERC1155ListingInvalidated(listingId, listing.seller);
    }

    function _deactivateOffer(Offer storage offer) internal {
        offer.active = false;
    }

    function _deactivateERC1155Offer(ERC1155Offer storage offer) internal {
        offer.active = false;
    }

    function _deactivateAuction(uint256 auctionId, Auction storage auction) internal {
        auction.active = false;

        if (activeAuctionIdByAsset[auction.collection][auction.tokenId] == auctionId) {
            activeAuctionIdByAsset[auction.collection][auction.tokenId] = 0;
        }
    }

    function _deactivateERC1155Auction(uint256 auctionId, ERC1155Auction storage auction) internal {
        auction.active = false;

        if (
            activeERC1155AuctionIdByAssetAndSeller[auction.collection][auction.tokenId][auction.seller] == auctionId
        ) {
            activeERC1155AuctionIdByAssetAndSeller[auction.collection][auction.tokenId][auction.seller] = 0;
        }
    }

    function _hasActiveAuction(address collection, uint256 tokenId) internal view returns (bool) {
        uint256 auctionId = activeAuctionIdByAsset[collection][tokenId];
        if (auctionId == 0) {
            return false;
        }

        return auctions[auctionId].active;
    }

    function _hasActiveERC1155Auction(address collection, uint256 tokenId, address seller) internal view returns (bool) {
        uint256 auctionId = activeERC1155AuctionIdByAssetAndSeller[collection][tokenId][seller];
        if (auctionId == 0) {
            return false;
        }

        return erc1155Auctions[auctionId].active;
    }

    function _resolveExpiresAt(uint256 durationSeconds) internal view returns (uint256) {
        if (durationSeconds == 0) {
            return 0;
        }

        return block.timestamp + durationSeconds;
    }

    function _isExpired(uint256 expiresAt) internal view returns (bool) {
        return expiresAt != 0 && block.timestamp >= expiresAt;
    }

    function _currentOwner(address collection, uint256 tokenId) internal view returns (address) {
        try IERC721(collection).ownerOf(tokenId) returns (address owner_) {
            return owner_;
        } catch {
            return address(0);
        }
    }

    function _currentBalance1155(
        address collection,
        address owner_,
        uint256 tokenId
    ) internal view returns (uint256) {
        try IERC1155(collection).balanceOf(owner_, tokenId) returns (uint256 balance_) {
            return balance_;
        } catch {
            return 0;
        }
    }

    function _isApprovedSeller(
        address seller,
        address collection,
        uint256 tokenId
    ) internal view returns (bool) {
        try IERC721(collection).getApproved(tokenId) returns (address approved) {
            if (approved == address(this)) {
                return true;
            }
        } catch {}

        try IERC721(collection).isApprovedForAll(seller, address(this)) returns (bool isApproved) {
            return isApproved;
        } catch {
            return false;
        }
    }

    function _isApprovedSeller1155(address seller, address collection) internal view returns (bool) {
        try IERC1155(collection).isApprovedForAll(seller, address(this)) returns (bool isApproved) {
            return isApproved;
        } catch {
            return false;
        }
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

}
