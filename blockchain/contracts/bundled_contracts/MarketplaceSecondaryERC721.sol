// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// File: MarketplaceSecondaryERC721.sol

// File: MarketplaceSecondaryAuctions.sol

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol
// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `from` to `to` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol
// OpenZeppelin Contracts (last updated v4.9.3) (token/ERC20/utils/SafeERC20.sol)

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol
// OpenZeppelin Contracts (last updated v4.9.4) (token/ERC20/extensions/IERC20Permit.sol)

/**
 * @dev Interface of the ERC20 Permit extension allowing approvals to be made via signatures, as defined in
 * https://eips.ethereum.org/EIPS/eip-2612[EIP-2612].
 *
 * Adds the {permit} method, which can be used to change an account's ERC20 allowance (see {IERC20-allowance}) by
 * presenting a message signed by the account. By not relying on {IERC20-approve}, the token holder account doesn't
 * need to send a transaction, and thus is not required to hold Ether at all.
 *
 * ==== Security Considerations
 *
 * There are two important considerations concerning the use of `permit`. The first is that a valid permit signature
 * expresses an allowance, and it should not be assumed to convey additional meaning. In particular, it should not be
 * considered as an intention to spend the allowance in any specific way. The second is that because permits have
 * built-in replay protection and can be submitted by anyone, they can be frontrun. A protocol that uses permits should
 * take this into consideration and allow a `permit` call to fail. Combining these two aspects, a pattern that may be
 * generally recommended is:
 *
 * ```solidity
 * function doThingWithPermit(..., uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) public {
 *     try token.permit(msg.sender, address(this), value, deadline, v, r, s) {} catch {}
 *     doThing(..., value);
 * }
 *
 * function doThing(..., uint256 value) public {
 *     token.safeTransferFrom(msg.sender, address(this), value);
 *     ...
 * }
 * ```
 *
 * Observe that: 1) `msg.sender` is used as the owner, leaving no ambiguity as to the signer intent, and 2) the use of
 * `try/catch` allows the permit to fail and makes the code tolerant to frontrunning. (See also
 * {SafeERC20-safeTransferFrom}).
 *
 * Additionally, note that smart contract wallets (such as Argent or Safe) are not able to produce permit signatures, so
 * contracts should have entry points that don't rely on permit.
 */
interface IERC20Permit {
    /**
     * @dev Sets `value` as the allowance of `spender` over ``owner``'s tokens,
     * given ``owner``'s signed approval.
     *
     * IMPORTANT: The same issues {IERC20-approve} has related to transaction
     * ordering also apply here.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `deadline` must be a timestamp in the future.
     * - `v`, `r` and `s` must be a valid `secp256k1` signature from `owner`
     * over the EIP712-formatted function arguments.
     * - the signature must use ``owner``'s current nonce (see {nonces}).
     *
     * For more information on the signature format, see the
     * https://eips.ethereum.org/EIPS/eip-2612#specification[relevant EIP
     * section].
     *
     * CAUTION: See Security Considerations above.
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

    /**
     * @dev Returns the current nonce for `owner`. This value must be
     * included whenever a signature is generated for {permit}.
     *
     * Every successful call to {permit} increases ``owner``'s nonce by one. This
     * prevents a signature from being used multiple times.
     */
    function nonces(address owner) external view returns (uint256);

    /**
     * @dev Returns the domain separator used in the encoding of the signature for {permit}, as defined by {EIP712}.
     */
    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

// File: ../app/node_modules/@openzeppelin/contracts/utils/Address.sol
// OpenZeppelin Contracts (last updated v4.9.0) (utils/Address.sol)

/**
 * @dev Collection of functions related to the address type
 */
library Address {
    /**
     * @dev Returns true if `account` is a contract.
     *
     * [IMPORTANT]
     * ====
     * It is unsafe to assume that an address for which this function returns
     * false is an externally-owned account (EOA) and not a contract.
     *
     * Among others, `isContract` will return false for the following
     * types of addresses:
     *
     *  - an externally-owned account
     *  - a contract in construction
     *  - an address where a contract will be created
     *  - an address where a contract lived, but was destroyed
     *
     * Furthermore, `isContract` will also return true if the target contract within
     * the same transaction is already scheduled for destruction by `SELFDESTRUCT`,
     * which only has an effect at the end of a transaction.
     * ====
     *
     * [IMPORTANT]
     * ====
     * You shouldn't rely on `isContract` to protect against flash loan attacks!
     *
     * Preventing calls from contracts is highly discouraged. It breaks composability, breaks support for smart wallets
     * like Gnosis Safe, and does not provide security since it can be circumvented by calling from a contract
     * constructor.
     * ====
     */
    function isContract(address account) internal view returns (bool) {
        // This method relies on extcodesize/address.code.length, which returns 0
        // for contracts in construction, since the code is only stored at the end
        // of the constructor execution.

        return account.code.length > 0;
    }

    /**
     * @dev Replacement for Solidity's `transfer`: sends `amount` wei to
     * `recipient`, forwarding all available gas and reverting on errors.
     *
     * https://eips.ethereum.org/EIPS/eip-1884[EIP1884] increases the gas cost
     * of certain opcodes, possibly making contracts go over the 2300 gas limit
     * imposed by `transfer`, making them unable to receive funds via
     * `transfer`. {sendValue} removes this limitation.
     *
     * https://consensys.net/diligence/blog/2019/09/stop-using-soliditys-transfer-now/[Learn more].
     *
     * IMPORTANT: because control is transferred to `recipient`, care must be
     * taken to not create reentrancy vulnerabilities. Consider using
     * {ReentrancyGuard} or the
     * https://solidity.readthedocs.io/en/v0.8.0/security-considerations.html#use-the-checks-effects-interactions-pattern[checks-effects-interactions pattern].
     */
    function sendValue(address payable recipient, uint256 amount) internal {
        require(address(this).balance >= amount, "Address: insufficient balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Address: unable to send value, recipient may have reverted");
    }

    /**
     * @dev Performs a Solidity function call using a low level `call`. A
     * plain `call` is an unsafe replacement for a function call: use this
     * function instead.
     *
     * If `target` reverts with a revert reason, it is bubbled up by this
     * function (like regular Solidity function calls).
     *
     * Returns the raw returned data. To convert to the expected return value,
     * use https://solidity.readthedocs.io/en/latest/units-and-global-variables.html?highlight=abi.decode#abi-encoding-and-decoding-functions[`abi.decode`].
     *
     * Requirements:
     *
     * - `target` must be a contract.
     * - calling `target` with `data` must not revert.
     *
     * _Available since v3.1._
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, "Address: low-level call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`], but with
     * `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but also transferring `value` wei to `target`.
     *
     * Requirements:
     *
     * - the calling contract must have an ETH balance of at least `value`.
     * - the called Solidity function must be `payable`.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        return functionCallWithValue(target, data, value, "Address: low-level call with value failed");
    }

    /**
     * @dev Same as {xref-Address-functionCallWithValue-address-bytes-uint256-}[`functionCallWithValue`], but
     * with `errorMessage` as a fallback revert reason when `target` reverts.
     *
     * _Available since v3.1._
     */
    function functionCallWithValue(
        address target,
        bytes memory data,
        uint256 value,
        string memory errorMessage
    ) internal returns (bytes memory) {
        require(address(this).balance >= value, "Address: insufficient balance for call");
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(address target, bytes memory data) internal view returns (bytes memory) {
        return functionStaticCall(target, data, "Address: low-level static call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a static call.
     *
     * _Available since v3.3._
     */
    function functionStaticCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        (bool success, bytes memory returndata) = target.staticcall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionDelegateCall(target, data, "Address: low-level delegate call failed");
    }

    /**
     * @dev Same as {xref-Address-functionCall-address-bytes-string-}[`functionCall`],
     * but performing a delegate call.
     *
     * _Available since v3.4._
     */
    function functionDelegateCall(
        address target,
        bytes memory data,
        string memory errorMessage
    ) internal returns (bytes memory) {
        (bool success, bytes memory returndata) = target.delegatecall(data);
        return verifyCallResultFromTarget(target, success, returndata, errorMessage);
    }

    /**
     * @dev Tool to verify that a low level call to smart-contract was successful, and revert (either by bubbling
     * the revert reason or using the provided one) in case of unsuccessful call or if target was not a contract.
     *
     * _Available since v4.8._
     */
    function verifyCallResultFromTarget(
        address target,
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal view returns (bytes memory) {
        if (success) {
            if (returndata.length == 0) {
                // only check isContract if the call was successful and the return data is empty
                // otherwise we already know that it was a contract
                require(isContract(target), "Address: call to non-contract");
            }
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    /**
     * @dev Tool to verify that a low level call was successful, and revert if it wasn't, either by bubbling the
     * revert reason or using the provided one.
     *
     * _Available since v4.3._
     */
    function verifyCallResult(
        bool success,
        bytes memory returndata,
        string memory errorMessage
    ) internal pure returns (bytes memory) {
        if (success) {
            return returndata;
        } else {
            _revert(returndata, errorMessage);
        }
    }

    function _revert(bytes memory returndata, string memory errorMessage) private pure {
        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {
            // The easiest way to bubble the revert reason is using memory via assembly
            /// @solidity memory-safe-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert(errorMessage);
        }
    }
}

/**
 * @title SafeERC20
 * @dev Wrappers around ERC20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    using Address for address;

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    /**
     * @dev Deprecated. This function has issues similar to the ones found in
     * {IERC20-approve}, and its usage is discouraged.
     *
     * Whenever possible, use {safeIncreaseAllowance} and
     * {safeDecreaseAllowance} instead.
     */
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        // safeApprove should only be called when setting an initial allowance,
        // or when resetting it to zero. To increase and decrease it, use
        // 'safeIncreaseAllowance' and 'safeDecreaseAllowance'
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance + value));
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        unchecked {
            uint256 oldAllowance = token.allowance(address(this), spender);
            require(oldAllowance >= value, "SafeERC20: decreased allowance below zero");
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, oldAllowance - value));
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeWithSelector(token.approve.selector, spender, value);

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, 0));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Use a ERC-2612 signature to set the `owner` approval toward `spender` on `token`.
     * Revert on invalid signature.
     */
    function safePermit(
        IERC20Permit token,
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal {
        uint256 nonceBefore = token.nonces(owner);
        token.permit(owner, spender, value, deadline, v, r, s);
        uint256 nonceAfter = token.nonces(owner);
        require(nonceAfter == nonceBefore + 1, "SafeERC20: permit did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We use {Address-functionCall} to perform this call, which verifies that
        // the target address contains contract code and also asserts for success in the low-level call.

        bytes memory returndata = address(token).functionCall(data, "SafeERC20: low-level call failed");
        require(returndata.length == 0 || abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silents catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        // We need to perform a low level call here, to bypass Solidity's return data size checking mechanism, since
        // we're implementing it ourselves. We cannot use {Address-functionCall} here since this should return false
        // and not revert is the subcall reverts.

        (bool success, bytes memory returndata) = address(token).call(data);
        return
            success && (returndata.length == 0 || abi.decode(returndata, (bool))) && Address.isContract(address(token));
    }
}

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC721/IERC721.sol
// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC721/IERC721.sol)

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
 * @dev Required interface of an ERC721 compliant contract.
 */
interface IERC721 is IERC165 {
    /**
     * @dev Emitted when `tokenId` token is transferred from `from` to `to`.
     */
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables `approved` to manage the `tokenId` token.
     */
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    /**
     * @dev Emitted when `owner` enables or disables (`approved`) `operator` to manage all of its assets.
     */
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    /**
     * @dev Returns the number of tokens in ``owner``'s account.
     */
    function balanceOf(address owner) external view returns (uint256 balance);

    /**
     * @dev Returns the owner of the `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function ownerOf(uint256 tokenId) external view returns (address owner);

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;

    /**
     * @dev Safely transfers `tokenId` token from `from` to `to`, checking first that contract recipients
     * are aware of the ERC721 protocol to prevent tokens from being forever locked.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must exist and be owned by `from`.
     * - If the caller is not `from`, it must have been allowed to move this token by either {approve} or {setApprovalForAll}.
     * - If `to` refers to a smart contract, it must implement {IERC721Receiver-onERC721Received}, which is called upon a safe transfer.
     *
     * Emits a {Transfer} event.
     */
    function safeTransferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Transfers `tokenId` token from `from` to `to`.
     *
     * WARNING: Note that the caller is responsible to confirm that the recipient is capable of receiving ERC721
     * or else they may be permanently lost. Usage of {safeTransferFrom} prevents loss, though the caller must
     * understand this adds an external call which potentially creates a reentrancy vulnerability.
     *
     * Requirements:
     *
     * - `from` cannot be the zero address.
     * - `to` cannot be the zero address.
     * - `tokenId` token must be owned by `from`.
     * - If the caller is not `from`, it must be approved to move this token by either {approve} or {setApprovalForAll}.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 tokenId) external;

    /**
     * @dev Gives permission to `to` to transfer `tokenId` token to another account.
     * The approval is cleared when the token is transferred.
     *
     * Only a single account can be approved at a time, so approving the zero address clears previous approvals.
     *
     * Requirements:
     *
     * - The caller must own the token or be an approved operator.
     * - `tokenId` must exist.
     *
     * Emits an {Approval} event.
     */
    function approve(address to, uint256 tokenId) external;

    /**
     * @dev Approve or remove `operator` as an operator for the caller.
     * Operators can call {transferFrom} or {safeTransferFrom} for any token owned by the caller.
     *
     * Requirements:
     *
     * - The `operator` cannot be the caller.
     *
     * Emits an {ApprovalForAll} event.
     */
    function setApprovalForAll(address operator, bool approved) external;

    /**
     * @dev Returns the account approved for `tokenId` token.
     *
     * Requirements:
     *
     * - `tokenId` must exist.
     */
    function getApproved(uint256 tokenId) external view returns (address operator);

    /**
     * @dev Returns if the `operator` is allowed to manage all of the assets of `owner`.
     *
     * See {setApprovalForAll}
     */
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

// File: MarketplaceSecondaryOffers.sol

// File: MarketplaceSecondaryListings.sol

// File: MarketplaceSecondaryPayments.sol

// File: ../app/node_modules/@openzeppelin/contracts/interfaces/IERC2981.sol
// OpenZeppelin Contracts (last updated v4.9.0) (interfaces/IERC2981.sol)

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

// File: MarketplaceSecondaryBase.sol

// File: ../app/node_modules/@openzeppelin/contracts/access/Ownable2Step.sol
// OpenZeppelin Contracts (last updated v4.9.0) (access/Ownable2Step.sol)

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

/**
 * @dev Contract module which provides access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the owner account will be the one that deploys the contract. This
 * can later be changed with {transferOwnership} and {acceptOwnership}.
 *
 * This module is used through inheritance. It will make available all functions
 * from parent (Ownable).
 */
abstract contract Ownable2Step is Ownable {
    address private _pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Returns the address of the pending owner.
     */
    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }

    /**
     * @dev Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one.
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual override onlyOwner {
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner(), newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`) and deletes any pending owner.
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual override {
        delete _pendingOwner;
        super._transferOwnership(newOwner);
    }

    /**
     * @dev The new owner accepts the ownership transfer.
     */
    function acceptOwnership() public virtual {
        address sender = _msgSender();
        require(pendingOwner() == sender, "Ownable2Step: caller is not the new owner");
        _transferOwnership(sender);
    }
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

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC1155/IERC1155.sol
// OpenZeppelin Contracts (last updated v4.9.0) (token/ERC1155/IERC1155.sol)

/**
 * @dev Required interface of an ERC1155 compliant contract, as defined in the
 * https://eips.ethereum.org/EIPS/eip-1155[EIP].
 *
 * _Available since v3.1._
 */
interface IERC1155 is IERC165 {
    /**
     * @dev Emitted when `value` tokens of token type `id` are transferred from `from` to `to` by `operator`.
     */
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);

    /**
     * @dev Equivalent to multiple {TransferSingle} events, where `operator`, `from` and `to` are the same for all
     * transfers.
     */
    event TransferBatch(
        address indexed operator,
        address indexed from,
        address indexed to,
        uint256[] ids,
        uint256[] values
    );

    /**
     * @dev Emitted when `account` grants or revokes permission to `operator` to transfer their tokens, according to
     * `approved`.
     */
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);

    /**
     * @dev Emitted when the URI for token type `id` changes to `value`, if it is a non-programmatic URI.
     *
     * If an {URI} event was emitted for `id`, the standard
     * https://eips.ethereum.org/EIPS/eip-1155#metadata-extensions[guarantees] that `value` will equal the value
     * returned by {IERC1155MetadataURI-uri}.
     */
    event URI(string value, uint256 indexed id);

    /**
     * @dev Returns the amount of tokens of token type `id` owned by `account`.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function balanceOf(address account, uint256 id) external view returns (uint256);

    /**
     * @dev xref:ROOT:erc1155.adoc#batch-operations[Batched] version of {balanceOf}.
     *
     * Requirements:
     *
     * - `accounts` and `ids` must have the same length.
     */
    function balanceOfBatch(
        address[] calldata accounts,
        uint256[] calldata ids
    ) external view returns (uint256[] memory);

    /**
     * @dev Grants or revokes permission to `operator` to transfer the caller's tokens, according to `approved`,
     *
     * Emits an {ApprovalForAll} event.
     *
     * Requirements:
     *
     * - `operator` cannot be the caller.
     */
    function setApprovalForAll(address operator, bool approved) external;

    /**
     * @dev Returns true if `operator` is approved to transfer ``account``'s tokens.
     *
     * See {setApprovalForAll}.
     */
    function isApprovedForAll(address account, address operator) external view returns (bool);

    /**
     * @dev Transfers `amount` tokens of token type `id` from `from` to `to`.
     *
     * Emits a {TransferSingle} event.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - If the caller is not `from`, it must have been approved to spend ``from``'s tokens via {setApprovalForAll}.
     * - `from` must have a balance of tokens of type `id` of at least `amount`.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155Received} and return the
     * acceptance magic value.
     */
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;

    /**
     * @dev xref:ROOT:erc1155.adoc#batch-operations[Batched] version of {safeTransferFrom}.
     *
     * Emits a {TransferBatch} event.
     *
     * Requirements:
     *
     * - `ids` and `amounts` must have the same length.
     * - If `to` refers to a smart contract, it must implement {IERC1155Receiver-onERC1155BatchReceived} and return the
     * acceptance magic value.
     */
    function safeBatchTransferFrom(
        address from,
        address to,
        uint256[] calldata ids,
        uint256[] calldata amounts,
        bytes calldata data
    ) external;
}

// File: ../app/node_modules/@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol
// OpenZeppelin Contracts (last updated v4.5.0) (token/ERC1155/IERC1155Receiver.sol)

/**
 * @dev _Available since v3.1._
 */
interface IERC1155Receiver is IERC165 {
    /**
     * @dev Handles the receipt of a single ERC1155 token type. This function is
     * called at the end of a `safeTransferFrom` after the balance has been updated.
     *
     * NOTE: To accept the transfer, this must return
     * `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))`
     * (i.e. 0xf23a6e61, or its own function selector).
     *
     * @param operator The address which initiated the transfer (i.e. msg.sender)
     * @param from The address which previously owned the token
     * @param id The ID of the token being transferred
     * @param value The amount of tokens being transferred
     * @param data Additional data with no specified format
     * @return `bytes4(keccak256("onERC1155Received(address,address,uint256,uint256,bytes)"))` if transfer is allowed
     */
    function onERC1155Received(
        address operator,
        address from,
        uint256 id,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4);

    /**
     * @dev Handles the receipt of a multiple ERC1155 token types. This function
     * is called at the end of a `safeBatchTransferFrom` after the balances have
     * been updated.
     *
     * NOTE: To accept the transfer(s), this must return
     * `bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))`
     * (i.e. 0xbc197c81, or its own function selector).
     *
     * @param operator The address which initiated the batch transfer (i.e. msg.sender)
     * @param from The address which previously owned the token
     * @param ids An array containing ids of each token being transferred (order and length must match values array)
     * @param values An array containing amounts of each token being transferred (order and length must match ids array)
     * @param data Additional data with no specified format
     * @return `bytes4(keccak256("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)"))` if transfer is allowed
     */
    function onERC1155BatchReceived(
        address operator,
        address from,
        uint256[] calldata ids,
        uint256[] calldata values,
        bytes calldata data
    ) external returns (bytes4);
}

abstract contract MarketplaceSecondaryBase is Ownable2Step, Pausable, ReentrancyGuard, IERC1155Receiver {
    uint96 public constant MAX_BPS = 10_000;
    uint96 public constant MAX_PLATFORM_FEE_BPS = 1_000;

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
        require(initialPlatformFeeBps_ <= MAX_PLATFORM_FEE_BPS, "fee high");

        feeRecipient = initialFeeRecipient_;
        platformFeeBps = initialPlatformFeeBps_;
        siteNativePaymentTokenFeeBps = initialPlatformFeeBps_;
        _transferOwnership(initialOwner_);

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
        require(newPlatformFeeBps <= MAX_PLATFORM_FEE_BPS, "fee high");
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

abstract contract MarketplaceSecondaryPayments is MarketplaceSecondaryBase {
    using SafeERC20 for IERC20;

    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryBase(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}

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

contract MarketplaceSecondaryERC721 is MarketplaceSecondaryAuctions {
    constructor(
        address initialOwner_,
        address initialFeeRecipient_,
        uint96 initialPlatformFeeBps_
    ) MarketplaceSecondaryAuctions(initialOwner_, initialFeeRecipient_, initialPlatformFeeBps_) {}
}
