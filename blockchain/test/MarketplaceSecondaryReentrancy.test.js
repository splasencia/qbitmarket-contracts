const { expect } = require("chai");
const { ethers } = require("hardhat");

const MARKETPLACE_SECONDARY_ERC721_FQN =
  "contracts/MarketplaceSecondaryERC721.sol:MarketplaceSecondaryERC721";
const MARKETPLACE_SECONDARY_ERC1155_FQN =
  "contracts/MarketplaceSecondaryERC1155.sol:MarketplaceSecondaryERC1155";
const REENTRANT_ERC20_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC20Mock";
const REENTRANT_ERC721_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC721Mock";
const REENTRANT_ERC1155_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC1155Mock";

describe("Marketplace secondary reentrancy hardening", function () {
  async function deployERC721MarketplaceFixture() {
    const [owner, feeRecipient, seller, bidder] = await ethers.getSigners();

    const MarketplaceSecondaryERC721 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC721_FQN);
    const marketplace = await MarketplaceSecondaryERC721.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    return { owner, feeRecipient, seller, bidder, marketplace };
  }

  async function deployERC1155MarketplaceFixture() {
    const [owner, feeRecipient, seller, bidder] = await ethers.getSigners();

    const MarketplaceSecondaryERC1155 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC1155_FQN);
    const marketplace = await MarketplaceSecondaryERC1155.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    return { owner, feeRecipient, seller, bidder, marketplace };
  }

  it("blocks ERC-20 offer escrow reentrancy while preserving the outer ERC-721 offer", async function () {
    const { marketplace, owner, seller, bidder } = await deployERC721MarketplaceFixture();
    const marketplaceAddress = await marketplace.getAddress();

    const ReentrantERC721 = await ethers.getContractFactory(REENTRANT_ERC721_FQN);
    const collection = await ReentrantERC721.deploy();
    await collection.waitForDeployment();
    const collectionAddress = await collection.getAddress();

    const ReentrantERC20 = await ethers.getContractFactory(REENTRANT_ERC20_FQN);
    const paymentToken = await ReentrantERC20.deploy();
    await paymentToken.waitForDeployment();
    const paymentTokenAddress = await paymentToken.getAddress();
    await marketplace.connect(owner).setPaymentTokenAllowed(paymentTokenAddress, true);

    const tokenId = 101;
    const offerAmount = ethers.parseEther("1");

    await collection.mint(seller.address, tokenId);
    await paymentToken.mint(bidder.address, offerAmount * 2n);
    await paymentToken.connect(bidder).approve(marketplaceAddress, offerAmount * 2n);

    const reentrantCall = marketplace.interface.encodeFunctionData("createOffer(address,uint256,address,uint256)", [
      collectionAddress,
      tokenId,
      paymentTokenAddress,
      offerAmount,
    ]);
    await paymentToken.configureAttack(marketplaceAddress, reentrantCall);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, paymentTokenAddress, offerAmount)
    )
      .to.emit(marketplace, "OfferCreated")
      .withArgs(1, bidder.address, collectionAddress, tokenId, paymentTokenAddress, offerAmount);

    expect(await paymentToken.attackSucceeded()).to.equal(false);
    expect((await marketplace.offers(1)).active).to.equal(true);
    expect(await marketplace.nextOfferId()).to.equal(2n);
    expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(offerAmount);
  });

  it("blocks ERC-721 auction custody reentrancy while preserving the outer auction", async function () {
    const { marketplace, seller } = await deployERC721MarketplaceFixture();
    const marketplaceAddress = await marketplace.getAddress();

    const ReentrantERC721 = await ethers.getContractFactory(REENTRANT_ERC721_FQN);
    const collection = await ReentrantERC721.deploy();
    await collection.waitForDeployment();
    const collectionAddress = await collection.getAddress();

    const tokenId = 202;
    await collection.mint(seller.address, tokenId);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    const reentrantCall = marketplace.interface.encodeFunctionData("createAuction", [
      collectionAddress,
      tokenId,
      ethers.ZeroAddress,
      ethers.parseEther("1"),
      ethers.parseEther("0.1"),
      3_600,
    ]);
    await collection.configureAttack(marketplaceAddress, reentrantCall);

    await expect(
      marketplace.connect(seller).createAuction(
        collectionAddress,
        tokenId,
        ethers.ZeroAddress,
        ethers.parseEther("1"),
        ethers.parseEther("0.1"),
        3_600
      )
    ).to.emit(marketplace, "AuctionCreated");

    expect(await collection.attackSucceeded()).to.equal(false);
    expect((await marketplace.auctions(1)).active).to.equal(true);
    expect(await marketplace.nextAuctionId()).to.equal(2n);
    expect(await marketplace.activeAuctionIdByAsset(collectionAddress, tokenId)).to.equal(1n);
    expect(await collection.ownerOf(tokenId)).to.equal(marketplaceAddress);
  });

  it("blocks ERC-1155 auction custody reentrancy while preserving the outer auction", async function () {
    const { marketplace, seller } = await deployERC1155MarketplaceFixture();
    const marketplaceAddress = await marketplace.getAddress();

    const ReentrantERC1155 = await ethers.getContractFactory(REENTRANT_ERC1155_FQN);
    const collection = await ReentrantERC1155.deploy();
    await collection.waitForDeployment();
    const collectionAddress = await collection.getAddress();

    const tokenId = 303;
    await collection.mint(seller.address, tokenId, 5);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    const reentrantCall = marketplace.interface.encodeFunctionData("createERC1155Auction", [
      collectionAddress,
      tokenId,
      2,
      ethers.ZeroAddress,
      ethers.parseEther("2"),
      ethers.parseEther("0.1"),
      3_600,
    ]);
    await collection.configureAttack(marketplaceAddress, reentrantCall);

    await expect(
      marketplace.connect(seller).createERC1155Auction(
        collectionAddress,
        tokenId,
        2,
        ethers.ZeroAddress,
        ethers.parseEther("2"),
        ethers.parseEther("0.1"),
        3_600
      )
    ).to.emit(marketplace, "ERC1155AuctionCreated");

    expect(await collection.attackSucceeded()).to.equal(false);
    expect((await marketplace.erc1155Auctions(1)).active).to.equal(true);
    expect(await marketplace.nextERC1155AuctionId()).to.equal(2n);
    expect(await marketplace.activeERC1155AuctionIdByAssetAndSeller(collectionAddress, tokenId, seller.address)).to.equal(1n);
    expect(await collection.balanceOf(marketplaceAddress, tokenId)).to.equal(2n);
    expect(await collection.balanceOf(seller.address, tokenId)).to.equal(3n);
  });
});
