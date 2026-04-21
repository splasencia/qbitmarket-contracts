// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./MarketplaceSecondaryOffers.sol";

abstract contract MarketplaceSecondaryAuctions is MarketplaceSecondaryOffers {
    using SafeERC20 for IERC20;

    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryOffers(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}

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
}
