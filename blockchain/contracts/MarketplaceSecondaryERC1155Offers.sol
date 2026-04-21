// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./MarketplaceSecondaryERC1155Listings.sol";

abstract contract MarketplaceSecondaryERC1155Offers is MarketplaceSecondaryERC1155Listings {
    using SafeERC20 for IERC20;

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
}
