// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./MarketplaceSecondaryPayments.sol";

abstract contract MarketplaceSecondaryERC1155Listings is MarketplaceSecondaryPayments {
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
}
