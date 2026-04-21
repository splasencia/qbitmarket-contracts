// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import "./MarketplaceSecondaryERC1155Offers.sol";

abstract contract MarketplaceSecondaryERC1155Auctions is MarketplaceSecondaryERC1155Offers {
    using SafeERC20 for IERC20;

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
}
