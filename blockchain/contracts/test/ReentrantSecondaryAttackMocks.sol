// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract ReentrantERC20Mock is ERC20 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public attackEnabled;
    bool public attackSucceeded;
    bytes public attackReturnData;

    bool private attacking;

    constructor() ERC20("Reentrant ERC20", "R20") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function configureAttack(address target, bytes calldata data) external {
        attackTarget = target;
        attackCalldata = data;
        attackEnabled = true;
        attackSucceeded = false;
        delete attackReturnData;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _attackOnce();
        return super.transferFrom(from, to, amount);
    }

    function _attackOnce() private {
        if (!attackEnabled || attacking || attackTarget == address(0)) {
            return;
        }

        attacking = true;
        (attackSucceeded, attackReturnData) = attackTarget.call(attackCalldata);
        attacking = false;
        attackEnabled = false;
    }
}

contract ReentrantERC721Mock is ERC721 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public attackEnabled;
    bool public attackSucceeded;
    bytes public attackReturnData;

    bool private attacking;

    constructor() ERC721("Reentrant ERC721", "R721") {}

    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }

    function configureAttack(address target, bytes calldata data) external {
        attackTarget = target;
        attackCalldata = data;
        attackEnabled = true;
        attackSucceeded = false;
        delete attackReturnData;
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        _attackOnce();
        super.transferFrom(from, to, tokenId);
    }

    function _attackOnce() private {
        if (!attackEnabled || attacking || attackTarget == address(0)) {
            return;
        }

        attacking = true;
        (attackSucceeded, attackReturnData) = attackTarget.call(attackCalldata);
        attacking = false;
        attackEnabled = false;
    }
}

contract ReentrantERC1155Mock is ERC1155 {
    address public attackTarget;
    bytes public attackCalldata;
    bool public attackEnabled;
    bool public attackSucceeded;
    bytes public attackReturnData;

    bool private attacking;

    constructor() ERC1155("ipfs://reentrant-erc1155/{id}.json") {}

    function mint(address to, uint256 tokenId, uint256 amount) external {
        _mint(to, tokenId, amount, "");
    }

    function configureAttack(address target, bytes calldata data) external {
        attackTarget = target;
        attackCalldata = data;
        attackEnabled = true;
        attackSucceeded = false;
        delete attackReturnData;
    }

    function safeTransferFrom(
        address from,
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) public override {
        _attackOnce();
        super.safeTransferFrom(from, to, id, amount, data);
    }

    function _attackOnce() private {
        if (!attackEnabled || attacking || attackTarget == address(0)) {
            return;
        }

        attacking = true;
        (attackSucceeded, attackReturnData) = attackTarget.call(attackCalldata);
        attacking = false;
        attackEnabled = false;
    }
}
