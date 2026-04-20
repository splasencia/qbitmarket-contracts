// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract PaymentToken is ERC20, Ownable {
    uint8 private immutable _tokenDecimals;

    event TokensMinted(address indexed operator, address indexed to, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        address initialOwner_
    ) ERC20(name_, symbol_) {
        require(bytes(name_).length > 0, "PaymentToken: invalid name");
        require(bytes(symbol_).length > 0, "PaymentToken: invalid symbol");
        require(initialOwner_ != address(0), "PaymentToken: invalid owner");
        require(decimals_ <= 18, "PaymentToken: decimals too high");

        _tokenDecimals = decimals_;
        transferOwnership(initialOwner_);

        if (initialSupply_ > 0) {
            _mint(initialOwner_, initialSupply_);
            emit TokensMinted(msg.sender, initialOwner_, initialSupply_);
        }
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "PaymentToken: invalid recipient");
        require(amount > 0, "PaymentToken: invalid amount");

        _mint(to, amount);
        emit TokensMinted(msg.sender, to, amount);
    }
}
