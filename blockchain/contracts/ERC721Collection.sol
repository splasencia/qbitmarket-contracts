// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

contract ERC721Collection is ERC721URIStorage, ERC2981, Ownable, Pausable {
    bytes32 public constant LEAF_TYPEHASH =
        keccak256(
            "LazyMintLeaf(uint256 chainId,address collection,uint256 rootVersion,uint256 tokenId,bytes32 uriHash,uint256 price)"
        );
    uint96 public constant MAX_BPS = 10_000;

    address public marketplace;
    uint256 public currentRootVersion;

    string private _contractMetadataURI;

    mapping(uint256 => bytes32) public merkleRootByVersion;

    event DropPublished(uint256 indexed rootVersion, bytes32 indexed merkleRoot);
    event TokenMinted(address indexed to, uint256 indexed tokenId, string tokenURI, uint256 indexed rootVersion);
    event MarketplaceUpdated(address indexed previousMarketplace, address indexed newMarketplace);
    event ContractURIUpdated(string contractURI);
    event DefaultRoyaltyUpdated(address indexed recipient, uint96 feeNumerator);
    event DefaultRoyaltyCleared();

    modifier onlyMarketplace() {
        require(msg.sender == marketplace, "ERC721Collection: caller is not marketplace");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        address initialOwner_,
        address initialMarketplace_,
        string memory contractURI_,
        address royaltyRecipient_,
        uint96 royaltyBps_
    ) ERC721(name_, symbol_) {
        require(initialOwner_ != address(0), "ERC721Collection: invalid owner");
        require(initialMarketplace_ != address(0), "ERC721Collection: invalid marketplace");

        marketplace = initialMarketplace_;
        _contractMetadataURI = contractURI_;

        if (royaltyRecipient_ != address(0)) {
            require(royaltyBps_ <= MAX_BPS, "ERC721Collection: royalty too high");
            _setDefaultRoyalty(royaltyRecipient_, royaltyBps_);
            emit DefaultRoyaltyUpdated(royaltyRecipient_, royaltyBps_);
        } else {
            require(royaltyBps_ == 0, "ERC721Collection: royalty recipient required");
        }

        transferOwnership(initialOwner_);
        emit MarketplaceUpdated(address(0), initialMarketplace_);
        emit ContractURIUpdated(contractURI_);
    }

    function publishDrop(bytes32 merkleRoot) external onlyOwner returns (uint256 rootVersion) {
        require(merkleRoot != bytes32(0), "ERC721Collection: invalid root");

        rootVersion = currentRootVersion + 1;
        currentRootVersion = rootVersion;
        merkleRootByVersion[rootVersion] = merkleRoot;

        emit DropPublished(rootVersion, merkleRoot);
    }

    function mintLazy(
        address to,
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion,
        bytes32[] calldata proof
    ) external onlyMarketplace whenNotPaused {
        require(to != address(0), "ERC721Collection: invalid recipient");
        require(!_exists(tokenId), "ERC721Collection: token already minted");
        require(rootVersion == currentRootVersion, "ERC721Collection: inactive root version");

        bytes32 merkleRoot = merkleRootByVersion[rootVersion];
        require(merkleRoot != bytes32(0), "ERC721Collection: unknown root version");

        bytes32 leaf = _computeLeaf(tokenId, tokenURI_, price, rootVersion);
        require(MerkleProof.verify(proof, merkleRoot, leaf), "ERC721Collection: invalid proof");

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, tokenURI_);

        emit TokenMinted(to, tokenId, tokenURI_, rootVersion);
    }

    function leafHash(
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion
    ) external view returns (bytes32) {
        return _computeLeaf(tokenId, tokenURI_, price, rootVersion);
    }

    function verifyLazyMint(
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 merkleRoot = merkleRootByVersion[rootVersion];
        if (merkleRoot == bytes32(0) || rootVersion != currentRootVersion || _exists(tokenId)) {
            return false;
        }

        return MerkleProof.verify(proof, merkleRoot, _computeLeaf(tokenId, tokenURI_, price, rootVersion));
    }

    function setMarketplace(address newMarketplace) external onlyOwner {
        require(newMarketplace != address(0), "ERC721Collection: invalid marketplace");

        address previousMarketplace = marketplace;
        marketplace = newMarketplace;

        emit MarketplaceUpdated(previousMarketplace, newMarketplace);
    }

    function pauseMinting() external onlyOwner {
        _pause();
    }

    function unpauseMinting() external onlyOwner {
        _unpause();
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        _contractMetadataURI = newContractURI;
        emit ContractURIUpdated(newContractURI);
    }

    function contractURI() external view returns (string memory) {
        return _contractMetadataURI;
    }

    function setDefaultRoyalty(address recipient, uint96 feeNumerator) external onlyOwner {
        require(recipient != address(0), "ERC721Collection: invalid royalty recipient");
        require(feeNumerator <= MAX_BPS, "ERC721Collection: royalty too high");

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
        override(ERC721URIStorage, ERC2981)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _burn(uint256 tokenId) internal override(ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function _computeLeaf(
        uint256 tokenId,
        string calldata tokenURI_,
        uint256 price,
        uint256 rootVersion
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                LEAF_TYPEHASH,
                block.chainid,
                address(this),
                rootVersion,
                tokenId,
                keccak256(bytes(tokenURI_)),
                price
            )
        );
    }
}
