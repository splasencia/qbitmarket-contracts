const { expect } = require("chai");
const { ethers } = require("hardhat");

const ERC20_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC20Mock";
const ERC721_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC721Mock";
const MARKETPLACE_PRIMARY_UPGRADEABLE_FQN =
  "contracts/MarketplacePrimaryUpgradeable.sol:MarketplacePrimaryUpgradeable";
const MARKETPLACE_SECONDARY_ERC721_FQN =
  "contracts/MarketplaceSecondaryERC721.sol:MarketplaceSecondaryERC721";
const PAYMENT_TOKEN_FACTORY_FQN = "contracts/PaymentTokenFactory.sol:PaymentTokenFactory";
const PAYMENT_TOKEN_FQN = "contracts/PaymentToken.sol:PaymentToken";
const PROXY_ADMIN_FQN = "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin";
const TRANSPARENT_PROXY_FQN =
  "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy";

describe("Marketplace focused fuzz and invariants", function () {
  async function deploySecondaryFixture() {
    const [owner, feeRecipient, seller, bidder, otherBidder] = await ethers.getSigners();

    const MarketplaceSecondaryERC721 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC721_FQN);
    const marketplace = await MarketplaceSecondaryERC721.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC721 = await ethers.getContractFactory(ERC721_FQN);
    const collection = await ERC721.deploy();
    await collection.waitForDeployment();

    return { owner, feeRecipient, seller, bidder, otherBidder, marketplace, collection };
  }

  async function deployPrimaryProxyFixture(initialFeeBps = 250) {
    const [owner, feeRecipient] = await ethers.getSigners();

    const MarketplacePrimaryUpgradeable = await ethers.getContractFactory(MARKETPLACE_PRIMARY_UPGRADEABLE_FQN);
    const implementation = await MarketplacePrimaryUpgradeable.deploy();
    await implementation.waitForDeployment();

    const ProxyAdmin = await ethers.getContractFactory(PROXY_ADMIN_FQN);
    const proxyAdmin = await ProxyAdmin.deploy();
    await proxyAdmin.waitForDeployment();

    const TransparentUpgradeableProxy = await ethers.getContractFactory(TRANSPARENT_PROXY_FQN);
    const initializationData = MarketplacePrimaryUpgradeable.interface.encodeFunctionData("initialize", [
      owner.address,
      feeRecipient.address,
      initialFeeBps,
    ]);
    const proxy = await TransparentUpgradeableProxy.deploy(
      await implementation.getAddress(),
      await proxyAdmin.getAddress(),
      initializationData
    );
    await proxy.waitForDeployment();

    const marketplace = await ethers.getContractAt(MARKETPLACE_PRIMARY_UPGRADEABLE_FQN, await proxy.getAddress());

    return { owner, feeRecipient, marketplace };
  }

  async function expectMarketplaceNativeEscrow(marketplace, expectedAmount) {
    expect(await ethers.provider.getBalance(await marketplace.getAddress())).to.equal(expectedAmount);
  }

  it("preserves native escrow across fuzzed ERC-721 offer and auction lifecycles", async function () {
    const { seller, bidder, otherBidder, marketplace, collection } = await deploySecondaryFixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();
    const offerAmounts = [
      ethers.parseEther("0.01"),
      ethers.parseEther("0.2"),
      ethers.parseEther("1.75"),
    ];

    let tokenId = 1;
    for (const offerAmount of offerAmounts) {
      await collection.mint(seller.address, tokenId);
      await marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, offerAmount, {
          value: offerAmount,
        });
      await expectMarketplaceNativeEscrow(marketplace, offerAmount);

      await marketplace.connect(bidder).cancelOffer(await marketplace.nextOfferId() - 1n);
      await expectMarketplaceNativeEscrow(marketplace, 0n);
      tokenId += 1;
    }

    for (const offerAmount of offerAmounts) {
      await collection.mint(seller.address, tokenId);
      await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
      await marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, offerAmount, {
          value: offerAmount,
        });
      await expectMarketplaceNativeEscrow(marketplace, offerAmount);

      const offerId = await marketplace.nextOfferId() - 1n;
      await marketplace.connect(seller).acceptOffer(offerId);
      await expectMarketplaceNativeEscrow(marketplace, 0n);
      expect(await collection.ownerOf(tokenId)).to.equal(bidder.address);
      tokenId += 1;
    }

    const reservePrices = [
      ethers.parseEther("0.05"),
      ethers.parseEther("0.5"),
      ethers.parseEther("2"),
    ];

    for (const reservePrice of reservePrices) {
      await collection.mint(seller.address, tokenId);
      await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
      await marketplace
        .connect(seller)
        .createAuction(collectionAddress, tokenId, ethers.ZeroAddress, reservePrice, ethers.parseEther("0.01"), 60);

      const auctionId = await marketplace.nextAuctionId() - 1n;
      await marketplace.connect(bidder).placeAuctionBid(auctionId, reservePrice, { value: reservePrice });
      await expectMarketplaceNativeEscrow(marketplace, reservePrice);

      const replacementBid = reservePrice + ethers.parseEther("0.05");
      await marketplace.connect(otherBidder).placeAuctionBid(auctionId, replacementBid, { value: replacementBid });
      await expectMarketplaceNativeEscrow(marketplace, replacementBid);

      await ethers.provider.send("evm_increaseTime", [61]);
      await ethers.provider.send("evm_mine", []);
      await marketplace.settleAuction(auctionId);

      await expectMarketplaceNativeEscrow(marketplace, 0n);
      expect(await collection.ownerOf(tokenId)).to.equal(otherBidder.address);
      tokenId += 1;
    }
  });

  it("preserves ERC-20 payment-token policy across factory, allowlisted, and external tokens", async function () {
    const { owner, seller, bidder, marketplace, collection } = await deploySecondaryFixture();
    const marketplaceAddress = await marketplace.getAddress();
    const collectionAddress = await collection.getAddress();

    const PaymentTokenFactory = await ethers.getContractFactory(PAYMENT_TOKEN_FACTORY_FQN);
    const paymentTokenFactory = await PaymentTokenFactory.deploy(owner.address);
    await paymentTokenFactory.waitForDeployment();
    await marketplace.connect(owner).setPaymentTokenFactory(await paymentTokenFactory.getAddress());

    const offerAmounts = [
      ethers.parseEther("0.25"),
      ethers.parseEther("1"),
      ethers.parseEther("3.5"),
    ];

    let tokenId = 100;
    for (let index = 0; index < offerAmounts.length; index += 1) {
      const offerAmount = offerAmounts[index];
      const paymentTokenAddress = await paymentTokenFactory
        .connect(bidder)
        .createPaymentToken.staticCall(`Factory Token ${index}`, `F${index}`, 18, offerAmount * 2n, offerAmount * 10n);
      await paymentTokenFactory
        .connect(bidder)
        .createPaymentToken(`Factory Token ${index}`, `F${index}`, 18, offerAmount * 2n, offerAmount * 10n);
      const paymentToken = await ethers.getContractAt(PAYMENT_TOKEN_FQN, paymentTokenAddress);

      await collection.mint(seller.address, tokenId);
      await paymentToken.connect(bidder).approve(marketplaceAddress, offerAmount);
      await marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, paymentTokenAddress, offerAmount);

      expect(await marketplace.allowedPaymentTokens(paymentTokenAddress)).to.equal(false);
      expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(offerAmount);

      await marketplace.connect(bidder).cancelOffer(await marketplace.nextOfferId() - 1n);
      expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(0n);
      tokenId += 1;
    }

    const ERC20 = await ethers.getContractFactory(ERC20_FQN);
    const externalToken = await ERC20.deploy();
    await externalToken.waitForDeployment();
    const externalTokenAddress = await externalToken.getAddress();
    const externalAmount = ethers.parseEther("1.2");

    await collection.mint(seller.address, tokenId);
    await externalToken.mint(bidder.address, externalAmount * 2n);
    await externalToken.connect(bidder).approve(marketplaceAddress, externalAmount * 2n);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, externalTokenAddress, externalAmount)
    ).to.be.revertedWith("payment token not allowed");

    await marketplace.connect(owner).setPaymentTokenAllowed(externalTokenAddress, true);
    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256)"](collectionAddress, tokenId, externalTokenAddress, externalAmount);
    expect(await externalToken.balanceOf(marketplaceAddress)).to.equal(externalAmount);
  });

  it("keeps primary and secondary fee caps invariant across fuzzed fee values", async function () {
    const { owner, marketplace: primaryMarketplace } = await deployPrimaryProxyFixture();
    const { owner: secondaryOwner, marketplace: secondaryMarketplace } = await deploySecondaryFixture();

    for (const allowedFeeBps of [0, 1, 250, 999, 1_000]) {
      await primaryMarketplace.connect(owner).setPlatformFeeBps(allowedFeeBps);
      expect(await primaryMarketplace.platformFeeBps()).to.equal(BigInt(allowedFeeBps));

      await secondaryMarketplace.connect(secondaryOwner).setSiteNativePaymentTokenFeeBps(0);
      await secondaryMarketplace.connect(secondaryOwner).setPlatformFeeBps(allowedFeeBps);
      expect(await secondaryMarketplace.platformFeeBps()).to.equal(BigInt(allowedFeeBps));
    }

    for (const disallowedFeeBps of [1_001, 2_500, 10_001]) {
      await expect(primaryMarketplace.connect(owner).setPlatformFeeBps(disallowedFeeBps)).to.be.revertedWith(
        "MarketplacePrimaryUpgradeable: fee too high"
      );
      await expect(secondaryMarketplace.connect(secondaryOwner).setPlatformFeeBps(disallowedFeeBps)).to.be.revertedWith(
        "fee high"
      );
    }

    await secondaryMarketplace.connect(secondaryOwner).setPlatformFeeBps(500);
    await secondaryMarketplace.connect(secondaryOwner).setSiteNativePaymentTokenFeeBps(400);

    await expect(secondaryMarketplace.connect(secondaryOwner).setPlatformFeeBps(399)).to.be.revertedWith(
      "below native fee"
    );
    await expect(secondaryMarketplace.connect(secondaryOwner).setSiteNativePaymentTokenFeeBps(501)).to.be.revertedWith(
      "native fee high"
    );
  });
});
