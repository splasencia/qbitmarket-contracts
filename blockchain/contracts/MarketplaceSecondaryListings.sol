// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./MarketplaceSecondaryPayments.sol";

abstract contract MarketplaceSecondaryListings is MarketplaceSecondaryPayments {
    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryPayments(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}

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
}
