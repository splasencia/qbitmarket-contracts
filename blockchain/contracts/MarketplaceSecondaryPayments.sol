// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./MarketplaceSecondaryBase.sol";

interface IPaymentTokenFactoryRegistry {
    function creatorByPaymentToken(address token) external view returns (address);
}

abstract contract MarketplaceSecondaryPayments is MarketplaceSecondaryBase {
    using SafeERC20 for IERC20;

    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryBase(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}

    /// @notice Sets the ERC-20 token that receives the intentional site-native marketplace fee discount.
    /// @dev The token must be accepted by the hybrid payment-token policy before it can be configured.
    function setSiteNativePaymentToken(address newToken) external onlyOwner {
        if (newToken != address(0)) {
            _requireSupportedPaymentToken(newToken);
        }

        address previousToken = siteNativePaymentToken;
        siteNativePaymentToken = newToken;

        emit SiteNativePaymentTokenUpdated(previousToken, newToken);
    }

    /// @notice Sets the reduced fee for the configured site-native payment token.
    /// @dev The reduced fee must stay less than or equal to the standard platform fee.
    function setSiteNativePaymentTokenFeeBps(uint96 newFeeBps) external onlyOwner {
        require(newFeeBps <= platformFeeBps, "native fee high");

        uint96 previousFeeBps = siteNativePaymentTokenFeeBps;
        siteNativePaymentTokenFeeBps = newFeeBps;

        emit SiteNativePaymentTokenFeeUpdated(previousFeeBps, newFeeBps);
    }

    /// @notice Atomically configures the site-native discount token and its reduced marketplace fee.
    /// @dev This two-tier fee model is intentional: regular tokens use platformFeeBps, while the configured site token uses newFeeBps.
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

    /// @notice Returns the marketplace fee for a payment token, including the site-native discount when applicable.
    function effectivePlatformFeeBps(address paymentToken) public view returns (uint96) {
        if (
            siteNativePaymentToken != address(0) &&
            paymentToken == siteNativePaymentToken
        ) {
            return siteNativePaymentTokenFeeBps;
        }

        return platformFeeBps;
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

    function _requireSupportedPaymentToken(address paymentToken) internal view {
        if (paymentToken != address(0)) {
            require(paymentToken.code.length > 0, "bad pay token");
            require(
                allowedPaymentTokens[paymentToken] || _isFactoryPaymentToken(paymentToken),
                "payment token not allowed"
            );
        }
    }

    function _isFactoryPaymentToken(address paymentToken) internal view returns (bool) {
        if (paymentTokenFactory == address(0)) {
            return false;
        }

        try IPaymentTokenFactoryRegistry(paymentTokenFactory).creatorByPaymentToken(paymentToken) returns (
            address creator
        ) {
            return creator != address(0);
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
