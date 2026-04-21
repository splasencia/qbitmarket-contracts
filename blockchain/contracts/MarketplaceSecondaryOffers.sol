// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./MarketplaceSecondaryListings.sol";

abstract contract MarketplaceSecondaryOffers is MarketplaceSecondaryListings {
    using SafeERC20 for IERC20;

    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryListings(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}

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
}
