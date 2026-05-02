// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// File: Marketplace.sol

// File: ../app/node_modules/@openzeppelin/contracts/access/Ownable.sol
// OpenZeppelin Contracts (last updated v4.9.0) (access/Ownable.sol)

// File: ../app/node_modules/@openzeppelin/contracts/utils/Context.sol
// OpenZeppelin Contracts (last updated v4.9.4) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    constructor() {
        _transferOwnership(_msgSender());
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        require(owner() == _msgSender(), "Ownable: caller is not the owner");
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is the zero address");
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// File: ../app/node_modules/@openzeppelin/contracts/interfaces/IERC2981.sol
// OpenZeppelin Contracts (last updated v4.9.0) (interfaces/IERC2981.sol)

// File: ../app/node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol
// OpenZeppelin Contracts v4.4.1 (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[EIP].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[EIP section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/**
 * @dev Interface for the NFT Royalty Standard.
 *
 * A standardized way to retrieve royalty payment information for non-fungible tokens (NFTs) to enable universal
 * support for royalty payments across all NFT marketplaces and ecosystem participants.
 *
 * _Available since v4.5._
 */
interface IERC2981 is IERC165 {
    /**
     * @dev Returns how much royalty is owed and to whom, based on a sale price that may be denominated in any unit of
     * exchange. The royalty amount is denominated and should be paid in that same unit of exchange.
     */
    function royaltyInfo(
        uint256 tokenId,
        uint256 salePrice
    ) external view returns (address receiver, uint256 royaltyAmount);
}

// File: ../app/node_modules/@openzeppelin/contracts/security/Pausable.sol
// OpenZeppelin Contracts (last updated v4.7.0) (security/Pausable.sol)

/**
 * @dev Contract module which allows children to implement an emergency stop
 * mechanism that can be triggered by an authorized account.
 *
 * This module is used through inheritance. It will make available the
 * modifiers `whenNotPaused` and `whenPaused`, which can be applied to
 * the functions of your contract. Note that they will not be pausable by
 * simply including this module, only once the modifiers are put in place.
 */
abstract contract Pausable is Context {
    /**
     * @dev Emitted when the pause is triggered by `account`.
     */
    event Paused(address account);

    /**
     * @dev Emitted when the pause is lifted by `account`.
     */
    event Unpaused(address account);

    bool private _paused;

    /**
     * @dev Initializes the contract in unpaused state.
     */
    constructor() {
        _paused = false;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    modifier whenNotPaused() {
        _requireNotPaused();
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    modifier whenPaused() {
        _requirePaused();
        _;
    }

    /**
     * @dev Returns true if the contract is paused, and false otherwise.
     */
    function paused() public view virtual returns (bool) {
        return _paused;
    }

    /**
     * @dev Throws if the contract is paused.
     */
    function _requireNotPaused() internal view virtual {
        require(!paused(), "Pausable: paused");
    }

    /**
     * @dev Throws if the contract is not paused.
     */
    function _requirePaused() internal view virtual {
        require(paused(), "Pausable: not paused");
    }

    /**
     * @dev Triggers stopped state.
     *
     * Requirements:
     *
     * - The contract must not be paused.
     */
    function _pause() internal virtual whenNotPaused {
        _paused = true;
        emit Paused(_msgSender());
    }

    /**
     * @dev Returns to normal state.
     *
     * Requirements:
     *
     * - The contract must be paused.
     */
    function _unpause() internal virtual whenPaused {
        _paused = false;
        emit Unpaused(_msgSender());
    }
}

// File: ../app/node_modules/@openzeppelin/contracts/security/ReentrancyGuard.sol
// OpenZeppelin Contracts (last updated v4.9.0) (security/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be _NOT_ENTERED
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");

        // Any calls to nonReentrant after this point will fail
        _status = _ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = _NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == _ENTERED;
    }
}

interface ILazyMintCollection {
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

contract Marketplace is Ownable, Pausable, ReentrancyGuard {
    uint96 public constant MAX_BPS = 10_000;

    address public feeRecipient;
    uint96 public platformFeeBps;

    event ItemPurchased(address indexed collection, address indexed buyer, uint256 indexed tokenId, uint256 price);
    event PlatformFeePaid(uint256 amount, address indexed recipient);
    event RoyaltyPaid(uint256 amount, address indexed recipient);
    event FeeRecipientUpdated(address indexed previousRecipient, address indexed newRecipient);
    event PlatformFeeUpdated(uint96 previousFeeBps, uint96 newFeeBps);

    constructor(address initialOwner_, address initialFeeRecipient_, uint96 initialPlatformFeeBps_) {
        require(initialOwner_ != address(0), "Marketplace: invalid owner");
        require(initialFeeRecipient_ != address(0), "Marketplace: invalid fee recipient");
        require(initialPlatformFeeBps_ <= MAX_BPS, "Marketplace: fee too high");

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
        require(collection != address(0), "Marketplace: invalid collection");
        require(price > 0, "Marketplace: invalid price");
        require(msg.value == price, "Marketplace: incorrect payment");

        (
            uint256 platformFeeAmount,
            address royaltyRecipient_,
            uint256 royaltyAmount,
            address seller,
            uint256 sellerProceeds
        ) = _quotePayout(collection, tokenId, price);

        ILazyMintCollection(collection).mintLazy(msg.sender, tokenId, tokenURI_, price, rootVersion, proof);

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
        require(newFeeRecipient != address(0), "Marketplace: invalid fee recipient");

        address previousRecipient = feeRecipient;
        feeRecipient = newFeeRecipient;

        emit FeeRecipientUpdated(previousRecipient, newFeeRecipient);
    }

    function setPlatformFeeBps(uint96 newPlatformFeeBps) external onlyOwner {
        require(newPlatformFeeBps <= MAX_BPS, "Marketplace: fee too high");

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
        require(collection != address(0), "Marketplace: invalid collection");

        seller = ILazyMintCollection(collection).owner();
        require(seller != address(0), "Marketplace: invalid seller");

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

        require(platformFeeAmount + royaltyAmount <= salePrice, "Marketplace: payout exceeds sale price");
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
        require(success, "Marketplace: native transfer failed");
    }
}
