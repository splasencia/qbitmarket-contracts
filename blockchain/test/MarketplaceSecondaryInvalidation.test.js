const { expect } = require("chai");
const { ethers } = require("hardhat");

const ERC721_COLLECTION_FQN = "contracts/ERC721Collection.sol:ERC721Collection";
const ERC1155_COLLECTION_FQN = "contracts/ERC1155Collection.sol:ERC1155Collection";
const MARKETPLACE_SECONDARY_ERC721_FQN =
  "contracts/MarketplaceSecondaryERC721.sol:MarketplaceSecondaryERC721";
const MARKETPLACE_SECONDARY_ERC1155_FQN =
  "contracts/MarketplaceSecondaryERC1155.sol:MarketplaceSecondaryERC1155";

describe("Marketplace secondary invalidation", function () {
  async function deploySecondaryERC721Fixture() {
    const [owner, feeRecipient, seller, buyer, bidder, otherSeller] = await ethers.getSigners();

    const MarketplaceSecondaryERC721 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC721_FQN);
    const marketplace = await MarketplaceSecondaryERC721.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC721Collection = await ethers.getContractFactory(ERC721_COLLECTION_FQN);
    const collection = await ERC721Collection.deploy(
      "Secondary ERC721",
      "S721",
      owner.address,
      owner.address,
      "ipfs://secondary-erc721",
      ethers.ZeroAddress,
      0
    );
    await collection.waitForDeployment();

    return {
      owner,
      feeRecipient,
      seller,
      buyer,
      bidder,
      otherSeller,
      marketplace,
      collection,
    };
  }

  async function mintERC721To(collection, marketplaceOwner, recipient, tokenId) {
    const tokenURI = `ipfs://token-${tokenId}`;
    const price = ethers.parseEther("1");
    const rootVersion = 1;
    const leaf = await collection.leafHash(tokenId, tokenURI, price, rootVersion);
    await collection.connect(marketplaceOwner).publishDrop(leaf);
    await collection.connect(marketplaceOwner).mintLazy(recipient.address, tokenId, tokenURI, price, rootVersion, []);
  }

  async function deploySecondaryERC1155Fixture() {
    const [owner, feeRecipient, seller, buyer, bidder] = await ethers.getSigners();

    const MarketplaceSecondaryERC1155 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC1155_FQN);
    const marketplace = await MarketplaceSecondaryERC1155.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC1155Collection = await ethers.getContractFactory(ERC1155_COLLECTION_FQN);
    const collection = await ERC1155Collection.deploy(
      "Secondary ERC1155",
      "S1155",
      owner.address,
      "ipfs://secondary-erc1155",
      ethers.ZeroAddress,
      0
    );
    await collection.waitForDeployment();

    return {
      owner,
      feeRecipient,
      seller,
      buyer,
      bidder,
      marketplace,
      collection,
    };
  }

  it("invalidates a stale ERC-721 listing when the current owner creates a new listing", async function () {
    const { collection, marketplace, owner, seller, otherSeller } = await deploySecondaryERC721Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const tokenId = 11;

    await mintERC721To(collection, owner, seller, tokenId);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    const initialPrice = ethers.parseEther("1");
    await marketplace
      .connect(seller)
      ["createListing(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, initialPrice);

    await collection.connect(seller).transferFrom(seller.address, otherSeller.address, tokenId);
    await collection.connect(otherSeller).setApprovalForAll(marketplaceAddress, true);

    const replacementPrice = ethers.parseEther("2");
    await expect(
      marketplace
        .connect(otherSeller)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, replacementPrice)
    )
      .to.emit(marketplace, "ListingInvalidated")
      .withArgs(1, seller.address)
      .and.to.emit(marketplace, "ListingCreated")
      .withArgs(2, otherSeller.address, collectionAddress, tokenId, ethers.ZeroAddress, replacementPrice);

    expect((await marketplace.listings(1)).active).to.equal(false);
    expect((await marketplace.listings(2)).active).to.equal(true);
    expect(await marketplace.activeListingIdByAsset(collectionAddress, tokenId)).to.equal(2n);
  });

  it("invalidates an ERC-721 listing when its matching offer is accepted", async function () {
    const { collection, marketplace, owner, seller, bidder } = await deploySecondaryERC721Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const tokenId = 22;

    await mintERC721To(collection, owner, seller, tokenId);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await marketplace
      .connect(seller)
      ["createListing(address,uint256,address,uint256)"](
        collectionAddress,
        tokenId,
        ethers.ZeroAddress,
        ethers.parseEther("1")
      );

    const offerAmount = ethers.parseEther("1.25");
    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, offerAmount, {
        value: offerAmount,
      });

    await expect(marketplace.connect(seller).acceptOffer(1))
      .to.emit(marketplace, "ListingInvalidated")
      .withArgs(1, seller.address)
      .and.to.emit(marketplace, "OfferAccepted")
      .withArgs(1, seller.address, bidder.address, collectionAddress, tokenId, ethers.ZeroAddress, offerAmount);

    expect((await marketplace.listings(1)).active).to.equal(false);
    expect((await marketplace.offers(1)).active).to.equal(false);
    expect(await marketplace.activeListingIdByAsset(collectionAddress, tokenId)).to.equal(0n);
    expect(await collection.ownerOf(tokenId)).to.equal(bidder.address);
  });

  it("invalidates an ERC-721 listing when an auction is created for the token", async function () {
    const { collection, marketplace, owner, seller } = await deploySecondaryERC721Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const tokenId = 33;

    await mintERC721To(collection, owner, seller, tokenId);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await marketplace
      .connect(seller)
      ["createListing(address,uint256,address,uint256)"](
        collectionAddress,
        tokenId,
        ethers.ZeroAddress,
        ethers.parseEther("1")
      );

    await expect(
      marketplace.connect(seller).createAuction(
        collectionAddress,
        tokenId,
        ethers.ZeroAddress,
        ethers.parseEther("1"),
        ethers.parseEther("0.1"),
        3_600
      )
    )
      .to.emit(marketplace, "ListingInvalidated")
      .withArgs(1, seller.address)
      .and.to.emit(marketplace, "AuctionCreated");

    expect((await marketplace.listings(1)).active).to.equal(false);
    expect((await marketplace.auctions(1)).active).to.equal(true);
    expect(await marketplace.activeListingIdByAsset(collectionAddress, tokenId)).to.equal(0n);
    expect(await marketplace.activeAuctionIdByAsset(collectionAddress, tokenId)).to.equal(1n);
  });

  it("invalidates an ERC-1155 listing when accepting an offer leaves insufficient balance", async function () {
    const { collection, marketplace, owner, seller, bidder } = await deploySecondaryERC1155Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const tokenId = 44;

    await collection.connect(owner).mint(seller.address, tokenId, 5, "ipfs://token-44", "0x");
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await marketplace
      .connect(seller)
      ["createERC1155Listing(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        tokenId,
        5,
        ethers.ZeroAddress,
        ethers.parseEther("5")
      );

    const offerAmount = ethers.parseEther("3");
    await marketplace
      .connect(bidder)
      ["createERC1155Offer(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        tokenId,
        3,
        ethers.ZeroAddress,
        offerAmount,
        { value: offerAmount }
      );

    await expect(marketplace.connect(seller).acceptERC1155Offer(1))
      .to.emit(marketplace, "ERC1155ListingInvalidated")
      .withArgs(1, seller.address)
      .and.to.emit(marketplace, "ERC1155OfferAccepted")
      .withArgs(1, seller.address, bidder.address, collectionAddress, tokenId, 3, ethers.ZeroAddress, offerAmount);

    expect((await marketplace.erc1155Listings(1)).active).to.equal(false);
    expect((await marketplace.erc1155Offers(1)).active).to.equal(false);
    expect(await marketplace.activeERC1155ListingIdByAssetAndSeller(collectionAddress, tokenId, seller.address)).to.equal(0n);
    expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2n);
    expect(await collection.balanceOf(bidder.address, tokenId)).to.equal(3n);
  });

  it("invalidates an ERC-1155 listing when creating an auction leaves insufficient balance", async function () {
    const { collection, marketplace, owner, seller } = await deploySecondaryERC1155Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const tokenId = 55;

    await collection.connect(owner).mint(seller.address, tokenId, 5, "ipfs://token-55", "0x");
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await marketplace
      .connect(seller)
      ["createERC1155Listing(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        tokenId,
        5,
        ethers.ZeroAddress,
        ethers.parseEther("5")
      );

    await expect(
      marketplace.connect(seller).createERC1155Auction(
        collectionAddress,
        tokenId,
        3,
        ethers.ZeroAddress,
        ethers.parseEther("3"),
        ethers.parseEther("0.1"),
        3_600
      )
    )
      .to.emit(marketplace, "ERC1155ListingInvalidated")
      .withArgs(1, seller.address)
      .and.to.emit(marketplace, "ERC1155AuctionCreated");

    expect((await marketplace.erc1155Listings(1)).active).to.equal(false);
    expect((await marketplace.erc1155Auctions(1)).active).to.equal(true);
    expect(await marketplace.activeERC1155ListingIdByAssetAndSeller(collectionAddress, tokenId, seller.address)).to.equal(0n);
    expect(await marketplace.activeERC1155AuctionIdByAssetAndSeller(collectionAddress, tokenId, seller.address)).to.equal(1n);
    expect(await collection.balanceOf(marketplaceAddress, tokenId)).to.equal(3n);
    expect(await collection.balanceOf(seller.address, tokenId)).to.equal(2n);
  });
});
