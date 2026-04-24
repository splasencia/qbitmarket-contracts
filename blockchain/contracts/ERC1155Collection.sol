// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";

contract ERC1155Collection is ERC1155, ERC1155Supply, ERC2981, Ownable2Step, Pausable {
    uint96 public constant MAX_BPS = 10_000;

    string private _name;
    string private _symbol;
    string private _contractMetadataURI;

    mapping(uint256 => string) private _tokenURIById;

    event ContractURIUpdated(string contractURI);
    event TokenURISet(uint256 indexed tokenId, string tokenURI);
    event TokenMinted(address indexed to, uint256 indexed tokenId, uint256 amount, string tokenURI);
    event BatchMinted(address indexed to, uint256[] tokenIds, uint256[] amounts);
    event DefaultRoyaltyUpdated(address indexed recipient, uint96 feeNumerator);
    event DefaultRoyaltyCleared();

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_,
        string memory contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) ERC1155("") {
        require(initialOwner_ != address(0), "ERC1155Collection: invalid owner");

        _name = name_;
        _symbol = symbol_;
        _contractMetadataURI = contractURI_;

        if (royaltyRecipient_ != address(0)) {
            require(royaltyBps_ <= MAX_BPS, "ERC1155Collection: royalty too high");
            _setDefaultRoyalty(royaltyRecipient_, royaltyBps_);
            emit DefaultRoyaltyUpdated(royaltyRecipient_, royaltyBps_);
        } else {
            require(royaltyBps_ == 0, "ERC1155Collection: royalty recipient required");
        }

        _transferOwnership(initialOwner_);
        emit ContractURIUpdated(contractURI_);
    }

    function name() external view returns (string memory) {
        return _name;
    }

    function symbol() external view returns (string memory) {
        return _symbol;
    }

    function contractURI() external view returns (string memory) {
        return _contractMetadataURI;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIById[tokenId];
    }

    function mint(
        address to,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenURI_,
        bytes calldata data
    ) external onlyOwner whenNotPaused {
        require(to != address(0), "ERC1155Collection: invalid recipient");
        require(amount > 0, "ERC1155Collection: invalid amount");

        bool isNewToken = totalSupply(tokenId) == 0;
        _requireValidTokenURI(tokenURI_, isNewToken);

        if (isNewToken) {
            _setTokenURI(tokenId, tokenURI_);
        }

        _mint(to, tokenId, amount, data);

        emit TokenMinted(to, tokenId, amount, _tokenURIById[tokenId]);
    }

    function mintBatch(
        address to,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts,
        string[] calldata tokenURIs_,
        bytes calldata data
    ) external onlyOwner whenNotPaused {
        require(to != address(0), "ERC1155Collection: invalid recipient");
        require(tokenIds.length == amounts.length, "ERC1155Collection: length mismatch");
        require(tokenIds.length == tokenURIs_.length, "ERC1155Collection: uri length mismatch");

        for (uint256 index = 0; index < tokenIds.length; index++) {
            require(amounts[index] > 0, "ERC1155Collection: invalid amount");

            bool isNewToken = totalSupply(tokenIds[index]) == 0;
            _requireValidTokenURI(tokenURIs_[index], isNewToken);

            if (isNewToken) {
                _setTokenURI(tokenIds[index], tokenURIs_[index]);
            }
        }

        _mintBatch(to, tokenIds, amounts, data);

        emit BatchMinted(to, tokenIds, amounts);
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        _contractMetadataURI = newContractURI;
        emit ContractURIUpdated(newContractURI);
    }

    function pauseMinting() external onlyOwner {
        _pause();
    }

    function unpauseMinting() external onlyOwner {
        _unpause();
    }

    function setDefaultRoyalty(address recipient, uint96 feeNumerator) external onlyOwner {
        require(recipient != address(0), "ERC1155Collection: invalid royalty recipient");
        require(feeNumerator <= MAX_BPS, "ERC1155Collection: royalty too high");

        _setDefaultRoyalty(recipient, feeNumerator);
        emit DefaultRoyaltyUpdated(recipient, feeNumerator);
    }

    function clearDefaultRoyalty() external onlyOwner {
        _deleteDefaultRoyalty();
        emit DefaultRoyaltyCleared();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override(ERC1155, ERC1155Supply) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }

    function _setTokenURI(uint256 tokenId, string memory tokenURI_) internal {
        _tokenURIById[tokenId] = tokenURI_;
        emit TokenURISet(tokenId, tokenURI_);
    }

    function _requireValidTokenURI(string memory tokenURI_, bool isNewToken) internal pure {
        if (isNewToken) {
            require(bytes(tokenURI_).length > 0, "ERC1155Collection: token URI required");
        } else {
            require(bytes(tokenURI_).length == 0, "ERC1155Collection: token URI immutable");
        }
    }
}
