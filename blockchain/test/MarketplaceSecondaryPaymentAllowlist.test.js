const { expect } = require("chai");
const { ethers } = require("hardhat");

const MARKETPLACE_SECONDARY_ERC721_FQN =
  "contracts/MarketplaceSecondaryERC721.sol:MarketplaceSecondaryERC721";
const MARKETPLACE_SECONDARY_ERC1155_FQN =
  "contracts/MarketplaceSecondaryERC1155.sol:MarketplaceSecondaryERC1155";
const ERC20_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC20Mock";
const ERC721_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC721Mock";
const ERC1155_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC1155Mock";
const PAYMENT_TOKEN_FACTORY_FQN = "contracts/PaymentTokenFactory.sol:PaymentTokenFactory";

describe("Marketplace secondary payment token allowlist", function () {
  async function deployERC721Fixture() {
    const [owner, feeRecipient, seller, bidder] = await ethers.getSigners();

    const MarketplaceSecondaryERC721 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC721_FQN);
    const marketplace = await MarketplaceSecondaryERC721.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC721 = await ethers.getContractFactory(ERC721_FQN);
    const collection = await ERC721.deploy();
    await collection.waitForDeployment();

    const ERC20 = await ethers.getContractFactory(ERC20_FQN);
    const paymentToken = await ERC20.deploy();
    await paymentToken.waitForDeployment();

    return { owner, seller, bidder, marketplace, collection, paymentToken };
  }

  async function deployERC1155Fixture() {
    const [owner, feeRecipient, seller] = await ethers.getSigners();

    const MarketplaceSecondaryERC1155 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC1155_FQN);
    const marketplace = await MarketplaceSecondaryERC1155.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC1155 = await ethers.getContractFactory(ERC1155_FQN);
    const collection = await ERC1155.deploy();
    await collection.waitForDeployment();

    const ERC20 = await ethers.getContractFactory(ERC20_FQN);
    const paymentToken = await ERC20.deploy();
    await paymentToken.waitForDeployment();

    return { owner, seller, marketplace, collection, paymentToken };
  }

  it("requires ERC-20 payment tokens to be explicitly allowed for ERC-721 offers", async function () {
    const { owner, seller, bidder, marketplace, collection, paymentToken } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const paymentTokenAddress = await paymentToken.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const offerAmount = ethers.parseEther("1");
    const tokenId = 1;

    await collection.mint(seller.address, tokenId);
    await paymentToken.mint(bidder.address, offerAmount * 2n);
    await paymentToken.connect(bidder).approve(marketplaceAddress, offerAmount * 2n);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, paymentTokenAddress, offerAmount)
    ).to.be.revertedWith("payment token not allowed");

    await expect(marketplace.connect(owner).setPaymentTokenAllowed(paymentTokenAddress, true))
      .to.emit(marketplace, "PaymentTokenAllowed")
      .withArgs(paymentTokenAddress, true);

    expect(await marketplace.allowedPaymentTokens(paymentTokenAddress)).to.equal(true);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, paymentTokenAddress, offerAmount)
    )
      .to.emit(marketplace, "OfferCreated")
      .withArgs(1, bidder.address, collectionAddress, tokenId, paymentTokenAddress, offerAmount);
  });

  it("accepts factory-created ERC-20 payment tokens without per-token allowlisting", async function () {
    const { owner, seller, bidder, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const tokenId = 4;
    const offerAmount = ethers.parseEther("1");

    const PaymentTokenFactory = await ethers.getContractFactory(PAYMENT_TOKEN_FACTORY_FQN);
    const paymentTokenFactory = await PaymentTokenFactory.deploy(owner.address);
    await paymentTokenFactory.waitForDeployment();
    const paymentTokenFactoryAddress = await paymentTokenFactory.getAddress();

    await expect(marketplace.connect(owner).setPaymentTokenFactory(paymentTokenFactoryAddress))
      .to.emit(marketplace, "PaymentTokenFactoryUpdated")
      .withArgs(ethers.ZeroAddress, paymentTokenFactoryAddress);

    const paymentTokenAddress = await paymentTokenFactory
      .connect(bidder)
      .createPaymentToken.staticCall("User Token", "USR", 18, offerAmount * 2n, offerAmount * 10n);
    await paymentTokenFactory
      .connect(bidder)
      .createPaymentToken("User Token", "USR", 18, offerAmount * 2n, offerAmount * 10n);

    const paymentToken = await ethers.getContractAt("contracts/PaymentToken.sol:PaymentToken", paymentTokenAddress);

    await collection.mint(seller.address, tokenId);
    await paymentToken.connect(bidder).approve(marketplaceAddress, offerAmount);

    expect(await marketplace.allowedPaymentTokens(paymentTokenAddress)).to.equal(false);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, paymentTokenAddress, offerAmount)
    )
      .to.emit(marketplace, "OfferCreated")
      .withArgs(1, bidder.address, collectionAddress, tokenId, paymentTokenAddress, offerAmount);
  });

  it("keeps native-token secondary payments available without allowlist setup", async function () {
    const { seller, bidder, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const offerAmount = ethers.parseEther("1");
    const tokenId = 2;

    await collection.mint(seller.address, tokenId);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, offerAmount, {
          value: offerAmount,
        })
    )
      .to.emit(marketplace, "OfferCreated")
      .withArgs(1, bidder.address, collectionAddress, tokenId, ethers.ZeroAddress, offerAmount);
  });

  it("applies the ERC-20 allowlist to ERC-1155 listings", async function () {
    const { owner, seller, marketplace, collection, paymentToken } = await deployERC1155Fixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const paymentTokenAddress = await paymentToken.getAddress();
    const tokenId = 3;
    const price = ethers.parseEther("5");

    await collection.mint(seller.address, tokenId, 5);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await expect(
      marketplace
        .connect(seller)
        ["createERC1155Listing(address,uint256,uint256,address,uint256)"](
          collectionAddress,
          tokenId,
          2,
          paymentTokenAddress,
          price
        )
    ).to.be.revertedWith("payment token not allowed");

    await marketplace.connect(owner).setPaymentTokenAllowed(paymentTokenAddress, true);

    await expect(
      marketplace
        .connect(seller)
        ["createERC1155Listing(address,uint256,uint256,address,uint256)"](
          collectionAddress,
          tokenId,
          2,
          paymentTokenAddress,
          price
        )
    )
      .to.emit(marketplace, "ERC1155ListingCreated")
      .withArgs(1, seller.address, collectionAddress, tokenId, 2, paymentTokenAddress, price);
  });
});
