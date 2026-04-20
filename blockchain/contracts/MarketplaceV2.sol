// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

contract MarketplaceV2 is Ownable, Pausable, ReentrancyGuard, IERC1155Receiver {
    using SafeERC20 for IERC20;

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

    function createListing(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 price
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        return _createListing(collection, tokenId, paymentToken, price, 0);
    }

    function createListing(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 price,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        return _createListing(collection, tokenId, paymentToken, price, durationSeconds);
    }

    function _createListing(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 price,
        uint256 durationSeconds
    ) internal returns (uint256 listingId) {
        require(collection != address(0), "bad collection");
        require(price > 0, "bad price");
        require(_supportsInterface(collection, type(IERC721).interfaceId), "bad standard");
        _requireSupportedPaymentToken(paymentToken);

        address tokenOwner = _currentOwner(collection, tokenId);
        require(tokenOwner == msg.sender, "not token owner");
        require(_isApprovedSeller(msg.sender, collection, tokenId), "not approved");

        uint256 existingListingId = activeListingIdByAsset[collection][tokenId];
        if (existingListingId != 0) {
            Listing storage existingListing = listings[existingListingId];

            if (existingListing.active) {
                if (
                    _currentOwner(collection, tokenId) == existingListing.seller &&
                    !_isExpired(existingListing.expiresAt)
                ) {
                    revert("listing exists");
                }

                _invalidateListing(existingListingId, existingListing);
            } else {
                activeListingIdByAsset[collection][tokenId] = 0;
            }
        }

        listingId = nextListingId;
        nextListingId = listingId + 1;

        listings[listingId] = Listing({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            paymentToken: paymentToken,
            price: price,
            active: true,
            expiresAt: _resolveExpiresAt(durationSeconds)
        });
        activeListingIdByAsset[collection][tokenId] = listingId;

        emit ListingCreated(listingId, msg.sender, collection, tokenId, paymentToken, price);
    }

    function updateListing(
        uint256 listingId,
        address paymentToken,
        uint256 newPrice
    ) external whenNotPaused nonReentrant {
        _updateListing(listingId, paymentToken, newPrice, 0, true);
    }

    function updateListing(
        uint256 listingId,
        address paymentToken,
        uint256 newPrice,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant {
        _updateListing(listingId, paymentToken, newPrice, durationSeconds, false);
    }

    function _updateListing(
        uint256 listingId,
        address paymentToken,
        uint256 newPrice,
        uint256 durationSeconds,
        bool preserveExistingExpiry
    ) internal {
        require(newPrice > 0, "bad price");
        _requireSupportedPaymentToken(paymentToken);

        Listing storage listing = listings[listingId];
        require(listing.active, "listing off");
        require(!_isExpired(listing.expiresAt), "listing old");
        require(listing.seller == msg.sender, "not seller");
        require(_currentOwner(listing.collection, listing.tokenId) == listing.seller, "seller lost token");
        require(_isApprovedSeller(listing.seller, listing.collection, listing.tokenId), "not approved");

        listing.paymentToken = paymentToken;
        listing.price = newPrice;
        listing.expiresAt = preserveExistingExpiry ? listing.expiresAt : _resolveExpiresAt(durationSeconds);

        emit ListingUpdated(listingId, paymentToken, newPrice);
    }

    function cancelListing(uint256 listingId) external nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing off");
        require(listing.seller == msg.sender, "not seller");

        _deactivateListing(listingId, listing);
        emit ListingCancelled(listingId, msg.sender);
    }

    function buyListing(uint256 listingId) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing off");
        require(listing.seller != msg.sender, "seller blocked");
        require(!_isExpired(listing.expiresAt), "listing old");

        address currentOwner = _currentOwner(listing.collection, listing.tokenId);
        require(currentOwner == listing.seller, "seller lost token");
        require(_isApprovedSeller(listing.seller, listing.collection, listing.tokenId), "not approved");

        bool isNativePayment = listing.paymentToken == address(0);
        if (isNativePayment) {
            require(msg.value == listing.price, "bad payment");
        } else {
            require(msg.value == 0, "no native");
        }

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(listing.collection, listing.tokenId, listing.price, listing.paymentToken);

        _deactivateListing(listingId, listing);

        IERC721(listing.collection).safeTransferFrom(listing.seller, msg.sender, listing.tokenId);

        if (isNativePayment) {
            _payoutNative(listing.seller, sellerProceeds, platformFeeAmount, royaltyRecipient_, royaltyAmount);
        } else {
            _payoutErc20(
                IERC20(listing.paymentToken),
                msg.sender,
                listing.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit ListingPurchased(
            listingId,
            msg.sender,
            listing.collection,
            listing.tokenId,
            listing.seller,
            listing.paymentToken,
            listing.price
        );
    }

    function createERC1155Listing(
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        return _createERC1155Listing(collection, tokenId, amount, paymentToken, price, 0);
    }

    function createERC1155Listing(
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant returns (uint256 listingId) {
        return _createERC1155Listing(collection, tokenId, amount, paymentToken, price, durationSeconds);
    }

    function _createERC1155Listing(
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 price,
        uint256 durationSeconds
    ) internal returns (uint256 listingId) {
        require(collection != address(0), "bad collection");
        require(amount > 0, "bad amount");
        require(price > 0, "bad price");
        require(_supportsInterface(collection, type(IERC1155).interfaceId), "bad standard");
        _requireSupportedPaymentToken(paymentToken);

        require(
            _currentBalance1155(collection, msg.sender, tokenId) >= amount,
            "low balance"
        );
        require(
            _isApprovedSeller1155(msg.sender, collection),
            "not approved"
        );

        uint256 existingListingId = activeERC1155ListingIdByAssetAndSeller[collection][tokenId][msg.sender];
        if (existingListingId != 0) {
            ERC1155Listing storage existingListing = erc1155Listings[existingListingId];

            if (existingListing.active) {
                if (
                    _currentBalance1155(collection, existingListing.seller, tokenId) >= existingListing.amount &&
                    _isApprovedSeller1155(existingListing.seller, collection) &&
                    !_isExpired(existingListing.expiresAt)
                ) {
                    revert("listing exists");
                }

                _invalidateERC1155Listing(existingListingId, existingListing);
            } else {
                activeERC1155ListingIdByAssetAndSeller[collection][tokenId][msg.sender] = 0;
            }
        }

        listingId = nextERC1155ListingId;
        nextERC1155ListingId = listingId + 1;

        erc1155Listings[listingId] = ERC1155Listing({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            paymentToken: paymentToken,
            price: price,
            active: true,
            expiresAt: _resolveExpiresAt(durationSeconds)
        });
        activeERC1155ListingIdByAssetAndSeller[collection][tokenId][msg.sender] = listingId;

        emit ERC1155ListingCreated(
            listingId,
            msg.sender,
            collection,
            tokenId,
            amount,
            paymentToken,
            price
        );
    }

    function updateERC1155Listing(
        uint256 listingId,
        uint256 newAmount,
        address paymentToken,
        uint256 newPrice
    ) external whenNotPaused nonReentrant {
        _updateERC1155Listing(listingId, newAmount, paymentToken, newPrice, 0, true);
    }

    function updateERC1155Listing(
        uint256 listingId,
        uint256 newAmount,
        address paymentToken,
        uint256 newPrice,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant {
        _updateERC1155Listing(listingId, newAmount, paymentToken, newPrice, durationSeconds, false);
    }

    function _updateERC1155Listing(
        uint256 listingId,
        uint256 newAmount,
        address paymentToken,
        uint256 newPrice,
        uint256 durationSeconds,
        bool preserveExistingExpiry
    ) internal {
        require(newAmount > 0, "bad amount");
        require(newPrice > 0, "bad price");
        _requireSupportedPaymentToken(paymentToken);

        ERC1155Listing storage listing = erc1155Listings[listingId];
        require(listing.active, "listing off");
        require(!_isExpired(listing.expiresAt), "listing old");
        require(listing.seller == msg.sender, "not seller");
        require(
            _currentBalance1155(listing.collection, listing.seller, listing.tokenId) >= newAmount,
            "low balance"
        );
        require(
            _isApprovedSeller1155(listing.seller, listing.collection),
            "not approved"
        );

        listing.amount = newAmount;
        listing.paymentToken = paymentToken;
        listing.price = newPrice;
        listing.expiresAt = preserveExistingExpiry ? listing.expiresAt : _resolveExpiresAt(durationSeconds);

        emit ERC1155ListingUpdated(listingId, newAmount, paymentToken, newPrice);
    }

    function cancelERC1155Listing(uint256 listingId) external nonReentrant {
        ERC1155Listing storage listing = erc1155Listings[listingId];
        require(listing.active, "listing off");
        require(listing.seller == msg.sender, "not seller");

        _deactivateERC1155Listing(listingId, listing);
        emit ERC1155ListingCancelled(listingId, msg.sender);
    }

    function buyERC1155Listing(uint256 listingId) external payable whenNotPaused nonReentrant {
        ERC1155Listing storage listing = erc1155Listings[listingId];
        require(listing.active, "listing off");
        require(listing.seller != msg.sender, "seller blocked");
        require(!_isExpired(listing.expiresAt), "listing old");
        require(
            _currentBalance1155(listing.collection, listing.seller, listing.tokenId) >= listing.amount,
            "seller balance"
        );
        require(
            _isApprovedSeller1155(listing.seller, listing.collection),
            "not approved"
        );

        bool isNativePayment = listing.paymentToken == address(0);
        if (isNativePayment) {
            require(msg.value == listing.price, "bad payment");
        } else {
            require(msg.value == 0, "no native");
        }

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(listing.collection, listing.tokenId, listing.price, listing.paymentToken);

        _deactivateERC1155Listing(listingId, listing);

        IERC1155(listing.collection).safeTransferFrom(
            listing.seller,
            msg.sender,
            listing.tokenId,
            listing.amount,
            ""
        );

        if (isNativePayment) {
            _payoutNative(listing.seller, sellerProceeds, platformFeeAmount, royaltyRecipient_, royaltyAmount);
        } else {
            _payoutErc20(
                IERC20(listing.paymentToken),
                msg.sender,
                listing.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit ERC1155ListingPurchased(
            listingId,
            msg.sender,
            listing.collection,
            listing.tokenId,
            listing.seller,
            listing.amount,
            listing.paymentToken,
            listing.price
        );
    }

    function createOffer(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount
    ) external payable whenNotPaused nonReentrant returns (uint256 offerId) {
        return _createOffer(collection, tokenId, paymentToken, amount, 0);
    }

    function createOffer(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount,
        uint256 durationSeconds
    ) external payable whenNotPaused nonReentrant returns (uint256 offerId) {
        return _createOffer(collection, tokenId, paymentToken, amount, durationSeconds);
    }

    function _createOffer(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 amount,
        uint256 durationSeconds
    ) internal returns (uint256 offerId) {
        require(collection != address(0), "bad collection");
        require(amount > 0, "bad amount");
        require(_supportsInterface(collection, type(IERC721).interfaceId), "bad standard");
        _requireSupportedPaymentToken(paymentToken);

        address tokenOwner = _currentOwner(collection, tokenId);
        require(tokenOwner != address(0), "bad token");
        require(tokenOwner != msg.sender, "owner blocked");
        require(!_hasActiveAuction(collection, tokenId), "auction exists");

        bool isNativePayment = paymentToken == address(0);
        if (isNativePayment) {
            require(msg.value == amount, "bad payment");
        } else {
            require(msg.value == 0, "no native");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        }

        offerId = nextOfferId;
        nextOfferId = offerId + 1;

        offers[offerId] = Offer({
            bidder: msg.sender,
            collection: collection,
            tokenId: tokenId,
            paymentToken: paymentToken,
            amount: amount,
            active: true,
            expiresAt: _resolveExpiresAt(durationSeconds)
        });

        emit OfferCreated(offerId, msg.sender, collection, tokenId, paymentToken, amount);
    }

    function cancelOffer(uint256 offerId) external nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "offer off");
        require(offer.bidder == msg.sender, "not bidder");

        _deactivateOffer(offer);
        _refundOffer(offer);

        emit OfferCancelled(offerId, msg.sender);
    }

    function acceptOffer(uint256 offerId) external whenNotPaused nonReentrant {
        Offer storage offer = offers[offerId];
        require(offer.active, "offer off");
        require(!_isExpired(offer.expiresAt), "offer old");

        address currentOwner = _currentOwner(offer.collection, offer.tokenId);
        require(currentOwner == msg.sender, "not token owner");
        require(msg.sender != offer.bidder, "bidder owns");
        require(_isApprovedSeller(msg.sender, offer.collection, offer.tokenId), "not approved");

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(offer.collection, offer.tokenId, offer.amount, offer.paymentToken);

        _deactivateOffer(offer);

        uint256 listingId = activeListingIdByAsset[offer.collection][offer.tokenId];
        if (listingId != 0) {
            Listing storage listing = listings[listingId];

            if (listing.active) {
                _invalidateListing(listingId, listing);
            } else {
                activeListingIdByAsset[offer.collection][offer.tokenId] = 0;
            }
        }

        IERC721(offer.collection).safeTransferFrom(msg.sender, offer.bidder, offer.tokenId);

        if (offer.paymentToken == address(0)) {
            _payoutNative(msg.sender, sellerProceeds, platformFeeAmount, royaltyRecipient_, royaltyAmount);
        } else {
            _payoutEscrowedErc20(
                IERC20(offer.paymentToken),
                msg.sender,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit OfferAccepted(
            offerId,
            msg.sender,
            offer.bidder,
            offer.collection,
            offer.tokenId,
            offer.paymentToken,
            offer.amount
        );
    }

    function createERC1155Offer(
        address collection,
        uint256 tokenId,
        uint256 tokenAmount,
        address paymentToken,
        uint256 amount
    ) external payable whenNotPaused nonReentrant returns (uint256 offerId) {
        return _createERC1155Offer(collection, tokenId, tokenAmount, paymentToken, amount, 0);
    }

    function createERC1155Offer(
        address collection,
        uint256 tokenId,
        uint256 tokenAmount,
        address paymentToken,
        uint256 amount,
        uint256 durationSeconds
    ) external payable whenNotPaused nonReentrant returns (uint256 offerId) {
        return _createERC1155Offer(collection, tokenId, tokenAmount, paymentToken, amount, durationSeconds);
    }

    function _createERC1155Offer(
        address collection,
        uint256 tokenId,
        uint256 tokenAmount,
        address paymentToken,
        uint256 amount,
        uint256 durationSeconds
    ) internal returns (uint256 offerId) {
        require(collection != address(0), "bad collection");
        require(tokenAmount > 0, "bad token amount");
        require(amount > 0, "bad amount");
        require(_supportsInterface(collection, type(IERC1155).interfaceId), "bad standard");
        _requireSupportedPaymentToken(paymentToken);

        bool isNativePayment = paymentToken == address(0);
        if (isNativePayment) {
            require(msg.value == amount, "bad payment");
        } else {
            require(msg.value == 0, "no native");
            IERC20(paymentToken).safeTransferFrom(msg.sender, address(this), amount);
        }

        offerId = nextERC1155OfferId;
        nextERC1155OfferId = offerId + 1;

        erc1155Offers[offerId] = ERC1155Offer({
            bidder: msg.sender,
            collection: collection,
            tokenId: tokenId,
            tokenAmount: tokenAmount,
            paymentToken: paymentToken,
            amount: amount,
            active: true,
            expiresAt: _resolveExpiresAt(durationSeconds)
        });

        emit ERC1155OfferCreated(
            offerId,
            msg.sender,
            collection,
            tokenId,
            tokenAmount,
            paymentToken,
            amount
        );
    }

    function cancelERC1155Offer(uint256 offerId) external nonReentrant {
        ERC1155Offer storage offer = erc1155Offers[offerId];
        require(offer.active, "offer off");
        require(offer.bidder == msg.sender, "not bidder");

        _deactivateERC1155Offer(offer);
        _refundERC1155Offer(offer);

        emit ERC1155OfferCancelled(offerId, msg.sender);
    }

    function acceptERC1155Offer(uint256 offerId) external whenNotPaused nonReentrant {
        ERC1155Offer storage offer = erc1155Offers[offerId];
        require(offer.active, "offer off");
        require(!_isExpired(offer.expiresAt), "offer old");
        require(msg.sender != offer.bidder, "bidder blocked");
        require(
            _currentBalance1155(offer.collection, msg.sender, offer.tokenId) >= offer.tokenAmount,
            "seller balance"
        );
        require(
            _isApprovedSeller1155(msg.sender, offer.collection),
            "not approved"
        );

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(offer.collection, offer.tokenId, offer.amount, offer.paymentToken);

        _deactivateERC1155Offer(offer);

        uint256 listingId = activeERC1155ListingIdByAssetAndSeller[offer.collection][offer.tokenId][msg.sender];
        if (listingId != 0) {
            ERC1155Listing storage listing = erc1155Listings[listingId];

            if (listing.active) {
                uint256 remainingBalance = _currentBalance1155(offer.collection, msg.sender, offer.tokenId) - offer.tokenAmount;

                if (
                    remainingBalance < listing.amount ||
                    !_isApprovedSeller1155(msg.sender, offer.collection)
                ) {
                    _invalidateERC1155Listing(listingId, listing);
                }
            } else {
                activeERC1155ListingIdByAssetAndSeller[offer.collection][offer.tokenId][msg.sender] = 0;
            }
        }

        IERC1155(offer.collection).safeTransferFrom(
            msg.sender,
            offer.bidder,
            offer.tokenId,
            offer.tokenAmount,
            ""
        );

        if (offer.paymentToken == address(0)) {
            _payoutNative(msg.sender, sellerProceeds, platformFeeAmount, royaltyRecipient_, royaltyAmount);
        } else {
            _payoutEscrowedErc20(
                IERC20(offer.paymentToken),
                msg.sender,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit ERC1155OfferAccepted(
            offerId,
            msg.sender,
            offer.bidder,
            offer.collection,
            offer.tokenId,
            offer.tokenAmount,
            offer.paymentToken,
            offer.amount
        );
    }

    function createERC1155Auction(
        address collection,
        uint256 tokenId,
        uint256 amount,
        address paymentToken,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant returns (uint256 auctionId) {
        require(collection != address(0), "bad collection");
        require(amount > 0, "bad amount");
        require(reservePrice > 0, "bad reserve");
        require(minBidIncrement > 0, "bad increment");
        require(durationSeconds > 0, "bad duration");
        require(_supportsInterface(collection, type(IERC1155).interfaceId), "bad standard");
        require(!_hasActiveERC1155Auction(collection, tokenId, msg.sender), "auction exists");
        _requireSupportedPaymentToken(paymentToken);

        uint256 availableBalance = _currentBalance1155(collection, msg.sender, tokenId);
        require(availableBalance >= amount, "seller balance");
        require(_isApprovedSeller1155(msg.sender, collection), "not approved");

        uint256 listingId = activeERC1155ListingIdByAssetAndSeller[collection][tokenId][msg.sender];
        if (listingId != 0) {
            ERC1155Listing storage listing = erc1155Listings[listingId];

            if (listing.active) {
                uint256 remainingBalance = availableBalance - amount;

                if (remainingBalance < listing.amount || !_isApprovedSeller1155(msg.sender, collection)) {
                    _invalidateERC1155Listing(listingId, listing);
                }
            } else {
                activeERC1155ListingIdByAssetAndSeller[collection][tokenId][msg.sender] = 0;
            }
        }

        IERC1155(collection).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        auctionId = nextERC1155AuctionId;
        nextERC1155AuctionId = auctionId + 1;

        erc1155Auctions[auctionId] = ERC1155Auction({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            amount: amount,
            paymentToken: paymentToken,
            reservePrice: reservePrice,
            minBidIncrement: minBidIncrement,
            highestBidder: address(0),
            highestBidAmount: 0,
            endTime: block.timestamp + durationSeconds,
            active: true
        });
        activeERC1155AuctionIdByAssetAndSeller[collection][tokenId][msg.sender] = auctionId;

        emit ERC1155AuctionCreated(
            auctionId,
            msg.sender,
            collection,
            tokenId,
            amount,
            paymentToken,
            reservePrice,
            minBidIncrement,
            block.timestamp + durationSeconds
        );
    }

    function placeERC1155AuctionBid(uint256 auctionId, uint256 bidAmount) external payable whenNotPaused nonReentrant {
        ERC1155Auction storage auction = erc1155Auctions[auctionId];
        require(auction.active, "auction off");
        require(block.timestamp < auction.endTime, "auction over");
        require(msg.sender != auction.seller, "seller blocked");

        if (auction.highestBidAmount == 0) {
            require(bidAmount >= auction.reservePrice, "below reserve");
        } else {
            require(
                bidAmount >= auction.highestBidAmount + auction.minBidIncrement,
                "bid too low"
            );
        }

        if (auction.paymentToken == address(0)) {
            require(msg.value == bidAmount, "bad payment");
        } else {
            require(msg.value == 0, "no native");
            IERC20(auction.paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }

        if (auction.highestBidder != address(0)) {
            _refundEscrowedBid(
                auction.paymentToken,
                auction.highestBidder,
                auction.highestBidAmount
            );
        }

        auction.highestBidder = msg.sender;
        auction.highestBidAmount = bidAmount;

        emit ERC1155AuctionBidPlaced(auctionId, msg.sender, auction.paymentToken, bidAmount);
    }

    function cancelERC1155Auction(uint256 auctionId) external nonReentrant {
        ERC1155Auction storage auction = erc1155Auctions[auctionId];
        require(auction.active, "auction off");
        require(auction.seller == msg.sender, "not seller");
        require(auction.highestBidder == address(0), "has bids");

        _deactivateERC1155Auction(auctionId, auction);
        IERC1155(auction.collection).safeTransferFrom(address(this), auction.seller, auction.tokenId, auction.amount, "");

        emit ERC1155AuctionCancelled(auctionId, msg.sender);
    }

    function settleERC1155Auction(uint256 auctionId) external nonReentrant {
        ERC1155Auction storage auction = erc1155Auctions[auctionId];
        require(auction.active, "auction off");
        require(block.timestamp >= auction.endTime, "auction live");

        _deactivateERC1155Auction(auctionId, auction);

        if (auction.highestBidder == address(0)) {
            IERC1155(auction.collection).safeTransferFrom(address(this), auction.seller, auction.tokenId, auction.amount, "");
            emit ERC1155AuctionSettled(
                auctionId,
                auction.seller,
                address(0),
                auction.collection,
                auction.tokenId,
                auction.amount,
                auction.paymentToken,
                0
            );
            return;
        }

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(auction.collection, auction.tokenId, auction.highestBidAmount, auction.paymentToken);

        IERC1155(auction.collection).safeTransferFrom(
            address(this),
            auction.highestBidder,
            auction.tokenId,
            auction.amount,
            ""
        );

        if (auction.paymentToken == address(0)) {
            _payoutNative(
                auction.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        } else {
            _payoutEscrowedErc20(
                IERC20(auction.paymentToken),
                auction.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit ERC1155AuctionSettled(
            auctionId,
            auction.seller,
            auction.highestBidder,
            auction.collection,
            auction.tokenId,
            auction.amount,
            auction.paymentToken,
            auction.highestBidAmount
        );
    }

    function createAuction(
        address collection,
        uint256 tokenId,
        address paymentToken,
        uint256 reservePrice,
        uint256 minBidIncrement,
        uint256 durationSeconds
    ) external whenNotPaused nonReentrant returns (uint256 auctionId) {
        require(collection != address(0), "bad collection");
        require(reservePrice > 0, "bad reserve");
        require(minBidIncrement > 0, "bad increment");
        require(durationSeconds > 0, "bad duration");
        require(_supportsInterface(collection, type(IERC721).interfaceId), "bad standard");
        require(!_hasActiveAuction(collection, tokenId), "auction exists");
        _requireSupportedPaymentToken(paymentToken);

        address tokenOwner = _currentOwner(collection, tokenId);
        require(tokenOwner == msg.sender, "not token owner");
        require(_isApprovedSeller(msg.sender, collection, tokenId), "not approved");

        uint256 listingId = activeListingIdByAsset[collection][tokenId];
        if (listingId != 0) {
            Listing storage listing = listings[listingId];

            if (listing.active) {
                if (_currentOwner(collection, tokenId) == listing.seller) {
                    _invalidateListing(listingId, listing);
                } else {
                    activeListingIdByAsset[collection][tokenId] = 0;
                }
            } else {
                activeListingIdByAsset[collection][tokenId] = 0;
            }
        }

        IERC721(collection).transferFrom(msg.sender, address(this), tokenId);

        auctionId = nextAuctionId;
        nextAuctionId = auctionId + 1;

        auctions[auctionId] = Auction({
            seller: msg.sender,
            collection: collection,
            tokenId: tokenId,
            paymentToken: paymentToken,
            reservePrice: reservePrice,
            minBidIncrement: minBidIncrement,
            highestBidder: address(0),
            highestBidAmount: 0,
            endTime: block.timestamp + durationSeconds,
            active: true
        });
        activeAuctionIdByAsset[collection][tokenId] = auctionId;

        emit AuctionCreated(
            auctionId,
            msg.sender,
            collection,
            tokenId,
            paymentToken,
            reservePrice,
            minBidIncrement,
            block.timestamp + durationSeconds
        );
    }

    function placeAuctionBid(uint256 auctionId, uint256 bidAmount) external payable whenNotPaused nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "auction off");
        require(block.timestamp < auction.endTime, "auction over");
        require(msg.sender != auction.seller, "seller blocked");

        if (auction.highestBidAmount == 0) {
            require(bidAmount >= auction.reservePrice, "below reserve");
        } else {
            require(
                bidAmount >= auction.highestBidAmount + auction.minBidIncrement,
                "bid too low"
            );
        }

        if (auction.paymentToken == address(0)) {
            require(msg.value == bidAmount, "bad payment");
        } else {
            require(msg.value == 0, "no native");
            IERC20(auction.paymentToken).safeTransferFrom(msg.sender, address(this), bidAmount);
        }

        if (auction.highestBidder != address(0)) {
            _refundEscrowedBid(
                auction.paymentToken,
                auction.highestBidder,
                auction.highestBidAmount
            );
        }

        auction.highestBidder = msg.sender;
        auction.highestBidAmount = bidAmount;

        emit AuctionBidPlaced(auctionId, msg.sender, auction.paymentToken, bidAmount);
    }

    function cancelAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "auction off");
        require(auction.seller == msg.sender, "not seller");
        require(auction.highestBidder == address(0), "has bids");

        _deactivateAuction(auctionId, auction);
        IERC721(auction.collection).transferFrom(address(this), auction.seller, auction.tokenId);

        emit AuctionCancelled(auctionId, msg.sender);
    }

    function settleAuction(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "auction off");
        require(block.timestamp >= auction.endTime, "auction live");

        _deactivateAuction(auctionId, auction);

        if (auction.highestBidder == address(0)) {
            IERC721(auction.collection).transferFrom(address(this), auction.seller, auction.tokenId);
            emit AuctionSettled(
                auctionId,
                auction.seller,
                address(0),
                auction.collection,
                auction.tokenId,
                auction.paymentToken,
                0
            );
            return;
        }

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        ) = _quotePayout(auction.collection, auction.tokenId, auction.highestBidAmount, auction.paymentToken);

        IERC721(auction.collection).transferFrom(address(this), auction.highestBidder, auction.tokenId);

        if (auction.paymentToken == address(0)) {
            _payoutNative(
                auction.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        } else {
            _payoutEscrowedErc20(
                IERC20(auction.paymentToken),
                auction.seller,
                sellerProceeds,
                platformFeeAmount,
                royaltyRecipient_,
                royaltyAmount
            );
        }

        emit AuctionSettled(
            auctionId,
            auction.seller,
            auction.highestBidder,
            auction.collection,
            auction.tokenId,
            auction.paymentToken,
            auction.highestBidAmount
        );
    }

    function quoteListingPayout(
        uint256 listingId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 salePrice,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        )
    {
        Listing storage listing = listings[listingId];
        require(listing.active, "listing off");
        require(!_isExpired(listing.expiresAt), "listing old");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(listing.collection, listing.tokenId, listing.price, listing.paymentToken);

        paymentToken = listing.paymentToken;
        salePrice = listing.price;
        seller = listing.seller;
    }

    function quoteERC1155ListingPayout(
        uint256 listingId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 salePrice,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        )
    {
        ERC1155Listing storage listing = erc1155Listings[listingId];
        require(listing.active, "listing off");
        require(!_isExpired(listing.expiresAt), "listing old");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(listing.collection, listing.tokenId, listing.price, listing.paymentToken);

        paymentToken = listing.paymentToken;
        salePrice = listing.price;
        seller = listing.seller;
    }

    function quoteOfferPayout(
        uint256 offerId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 offerAmount,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address bidder,
            uint256 sellerProceeds
        )
    {
        Offer storage offer = offers[offerId];
        require(offer.active, "offer off");
        require(!_isExpired(offer.expiresAt), "offer old");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(offer.collection, offer.tokenId, offer.amount, offer.paymentToken);

        paymentToken = offer.paymentToken;
        offerAmount = offer.amount;
        bidder = offer.bidder;
    }

    function quoteERC1155OfferPayout(
        uint256 offerId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 tokenAmount,
            uint256 offerAmount,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address bidder,
            uint256 sellerProceeds
        )
    {
        ERC1155Offer storage offer = erc1155Offers[offerId];
        require(offer.active, "offer off");
        require(!_isExpired(offer.expiresAt), "offer old");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(offer.collection, offer.tokenId, offer.amount, offer.paymentToken);

        paymentToken = offer.paymentToken;
        tokenAmount = offer.tokenAmount;
        offerAmount = offer.amount;
        bidder = offer.bidder;
    }

    function quoteERC1155AuctionPayout(
        uint256 auctionId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 tokenAmount,
            uint256 currentBidAmount,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address highestBidder,
            address seller,
            uint256 sellerProceeds
        )
    {
        ERC1155Auction storage auction = erc1155Auctions[auctionId];
        require(auction.active, "auction off");
        require(auction.highestBidder != address(0), "no bids");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(auction.collection, auction.tokenId, auction.highestBidAmount, auction.paymentToken);

        paymentToken = auction.paymentToken;
        tokenAmount = auction.amount;
        currentBidAmount = auction.highestBidAmount;
        highestBidder = auction.highestBidder;
        seller = auction.seller;
    }

    function quoteAuctionPayout(
        uint256 auctionId
    )
        external
        view
        returns (
            address paymentToken,
            uint256 currentBidAmount,
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address highestBidder,
            address seller,
            uint256 sellerProceeds
        )
    {
        Auction storage auction = auctions[auctionId];
        require(auction.active, "auction off");
        require(auction.highestBidder != address(0), "no bids");

        (
            platformFeeAmount,
            royaltyRecipient_,
            royaltyAmount,
            sellerProceeds
        ) = _quotePayout(auction.collection, auction.tokenId, auction.highestBidAmount, auction.paymentToken);

        paymentToken = auction.paymentToken;
        currentBidAmount = auction.highestBidAmount;
        highestBidder = auction.highestBidder;
        seller = auction.seller;
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

    function setSiteNativePaymentToken(address newToken) external onlyOwner {
        if (newToken != address(0)) {
            _requireSupportedPaymentToken(newToken);
        }

        address previousToken = siteNativePaymentToken;
        siteNativePaymentToken = newToken;

        emit SiteNativePaymentTokenUpdated(previousToken, newToken);
    }

    function setSiteNativePaymentTokenFeeBps(uint96 newFeeBps) external onlyOwner {
        require(newFeeBps <= platformFeeBps, "native fee high");

        uint96 previousFeeBps = siteNativePaymentTokenFeeBps;
        siteNativePaymentTokenFeeBps = newFeeBps;

        emit SiteNativePaymentTokenFeeUpdated(previousFeeBps, newFeeBps);
    }

    function setSiteNativePaymentTokenConfig(address newToken, uint96 newFeeBps) external onlyOwner {
        if (newToken != address(0)) {
            _requireSupportedPaymentToken(newToken);
        }
        require(newFeeBps <= platformFeeBps, "native fee high");

        address previousToken = siteNativePaymentToken;
        uint96 previousFeeBps = siteNativePaymentTokenFeeBps;

        siteNativePaymentToken = newToken;
        siteNativePaymentTokenFeeBps = newFeeBps;

        emit SiteNativePaymentTokenUpdated(previousToken, newToken);
        emit SiteNativePaymentTokenFeeUpdated(previousFeeBps, newFeeBps);
    }

    function effectivePlatformFeeBps(address paymentToken) public view returns (uint96) {
        if (
            siteNativePaymentToken != address(0) &&
            paymentToken == siteNativePaymentToken
        ) {
            return siteNativePaymentTokenFeeBps;
        }

        return platformFeeBps;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _quotePayout(
        address collection,
        uint256 tokenId,
        uint256 salePrice,
        address paymentToken
    )
        internal
        view
        returns (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            uint256 sellerProceeds
        )
    {
        platformFeeAmount = (salePrice * effectivePlatformFeeBps(paymentToken)) / MAX_BPS;

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

        require(platformFeeAmount + royaltyAmount <= salePrice, "payout too high");
        sellerProceeds = salePrice - platformFeeAmount - royaltyAmount;
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

    function _requireSupportedPaymentToken(address paymentToken) internal view {
        if (paymentToken != address(0)) {
            require(paymentToken.code.length > 0, "bad pay token");
        }
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

    function _payoutNative(
        address seller,
        uint256 sellerProceeds,
        uint256 platformFeeAmount,
        address royaltyRecipient_,
        uint256 royaltyAmount
    ) internal {
        if (platformFeeAmount > 0) {
            _transferNative(feeRecipient, platformFeeAmount);
            emit PlatformFeePaid(platformFeeAmount, feeRecipient, address(0));
        }

        if (royaltyAmount > 0) {
            _transferNative(royaltyRecipient_, royaltyAmount);
            emit RoyaltyPaid(royaltyAmount, royaltyRecipient_, address(0));
        }

        if (sellerProceeds > 0) {
            _transferNative(seller, sellerProceeds);
        }
    }

    function _payoutErc20(
        IERC20 paymentToken,
        address payer,
        address seller,
        uint256 sellerProceeds,
        uint256 platformFeeAmount,
        address royaltyRecipient_,
        uint256 royaltyAmount
    ) internal {
        if (platformFeeAmount > 0) {
            paymentToken.safeTransferFrom(payer, feeRecipient, platformFeeAmount);
            emit PlatformFeePaid(platformFeeAmount, feeRecipient, address(paymentToken));
        }

        if (royaltyAmount > 0) {
            paymentToken.safeTransferFrom(payer, royaltyRecipient_, royaltyAmount);
            emit RoyaltyPaid(royaltyAmount, royaltyRecipient_, address(paymentToken));
        }

        if (sellerProceeds > 0) {
            paymentToken.safeTransferFrom(payer, seller, sellerProceeds);
        }
    }

    function _transferNative(address recipient, uint256 amount) internal {
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "native transfer failed");
    }

    function _refundOffer(Offer storage offer) internal {
        if (offer.paymentToken == address(0)) {
            _transferNative(offer.bidder, offer.amount);
        } else {
            IERC20(offer.paymentToken).safeTransfer(offer.bidder, offer.amount);
        }
    }

    function _refundERC1155Offer(ERC1155Offer storage offer) internal {
        if (offer.paymentToken == address(0)) {
            _transferNative(offer.bidder, offer.amount);
        } else {
            IERC20(offer.paymentToken).safeTransfer(offer.bidder, offer.amount);
        }
    }

    function _refundEscrowedBid(address paymentToken, address bidder, uint256 amount) internal {
        if (paymentToken == address(0)) {
            _transferNative(bidder, amount);
        } else {
            IERC20(paymentToken).safeTransfer(bidder, amount);
        }
    }

    function _payoutEscrowedErc20(
        IERC20 paymentToken,
        address seller,
        uint256 sellerProceeds,
        uint256 platformFeeAmount,
        address royaltyRecipient_,
        uint256 royaltyAmount
    ) internal {
        if (platformFeeAmount > 0) {
            paymentToken.safeTransfer(feeRecipient, platformFeeAmount);
            emit PlatformFeePaid(platformFeeAmount, feeRecipient, address(paymentToken));
        }

        if (royaltyAmount > 0) {
            paymentToken.safeTransfer(royaltyRecipient_, royaltyAmount);
            emit RoyaltyPaid(royaltyAmount, royaltyRecipient_, address(paymentToken));
        }

        if (sellerProceeds > 0) {
            paymentToken.safeTransfer(seller, sellerProceeds);
        }
    }
}
