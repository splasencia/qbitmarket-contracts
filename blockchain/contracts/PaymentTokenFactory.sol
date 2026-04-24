// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

import "./PaymentToken.sol";

contract PaymentTokenFactory is Ownable2Step {
    address[] private _allPaymentTokens;
    mapping(address => address[]) private _paymentTokensByCreator;
    mapping(address => address) public creatorByPaymentToken;

    event PaymentTokenCreated(
        address indexed creator,
        address indexed token,
        address indexed initialOwner,
        string name,
        string symbol,
        uint8 decimals,
        uint256 initialSupply,
        uint256 maxSupply
    );

    constructor(address initialOwner_) {
        require(initialOwner_ != address(0), "PaymentTokenFactory: invalid owner");
        _transferOwnership(initialOwner_);
    }

    function createPaymentToken(
        string calldata name_,
        string calldata symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        uint256 maxSupply_
    ) external returns (address token) {
        token = address(
            new PaymentToken(name_, symbol_, decimals_, initialSupply_, msg.sender, maxSupply_)
        );

        _allPaymentTokens.push(token);
        _paymentTokensByCreator[msg.sender].push(token);
        creatorByPaymentToken[token] = msg.sender;

        emit PaymentTokenCreated(
            msg.sender,
            token,
            msg.sender,
            name_,
            symbol_,
            decimals_,
            initialSupply_,
            maxSupply_
        );
    }

    function allPaymentTokensLength() external view returns (uint256) {
        return _allPaymentTokens.length;
    }

    function allPaymentTokens(uint256 index) external view returns (address) {
        return _allPaymentTokens[index];
    }

    function paymentTokensByCreator(address creator) external view returns (address[] memory) {
        return _paymentTokensByCreator[creator];
    }
}
