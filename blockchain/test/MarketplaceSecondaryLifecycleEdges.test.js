const { expect } = require("chai");
const { ethers } = require("hardhat");

const ERC20_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC20Mock";
const ERC1155_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC1155Mock";
const ERC721_FQN = "contracts/test/ReentrantSecondaryAttackMocks.sol:ReentrantERC721Mock";
const REJECTING_ETH_RECEIVER_FQN =
  "contracts/test/ReentrantSecondaryAttackMocks.sol:RejectingEthReceiver";
const MARKETPLACE_SECONDARY_ERC721_FQN =
  "contracts/MarketplaceSecondaryERC721.sol:MarketplaceSecondaryERC721";
const MARKETPLACE_SECONDARY_ERC1155_FQN =
  "contracts/MarketplaceSecondaryERC1155.sol:MarketplaceSecondaryERC1155";

describe("Marketplace secondary lifecycle edge cases", function () {
  async function deployERC721Fixture(options = {}) {
    const [owner, feeRecipient, seller, buyer, bidder, other] = await ethers.getSigners();
    const resolvedFeeRecipient = options.feeRecipient ?? feeRecipient.address;

    const MarketplaceSecondaryERC721 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC721_FQN);
    const marketplace = await MarketplaceSecondaryERC721.deploy(owner.address, resolvedFeeRecipient, 250);
    await marketplace.waitForDeployment();

    const ERC721 = await ethers.getContractFactory(ERC721_FQN);
    const collection = await ERC721.deploy();
    await collection.waitForDeployment();

    return { owner, feeRecipient, seller, buyer, bidder, other, marketplace, collection };
  }

  async function deployERC1155Fixture() {
    const [owner, feeRecipient, seller, buyer, bidder, other] = await ethers.getSigners();

    const MarketplaceSecondaryERC1155 = await ethers.getContractFactory(MARKETPLACE_SECONDARY_ERC1155_FQN);
    const marketplace = await MarketplaceSecondaryERC1155.deploy(owner.address, feeRecipient.address, 250);
    await marketplace.waitForDeployment();

    const ERC1155 = await ethers.getContractFactory(ERC1155_FQN);
    const collection = await ERC1155.deploy();
    await collection.waitForDeployment();

    return { owner, feeRecipient, seller, buyer, bidder, other, marketplace, collection };
  }

  async function deployPaymentToken(holder, amount) {
    const ERC20 = await ethers.getContractFactory(ERC20_FQN);
    const paymentToken = await ERC20.deploy();
    await paymentToken.waitForDeployment();
    await paymentToken.mint(holder.address, amount);
    return paymentToken;
  }

  async function createERC721Listing(marketplace, collection, seller, tokenId, price, durationSeconds) {
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    await collection.mint(seller.address, tokenId);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    if (durationSeconds === undefined) {
      await marketplace
        .connect(seller)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, tokenId, ethers.ZeroAddress, price);
    } else {
      await marketplace
        .connect(seller)
        ["createListing(address,uint256,address,uint256,uint256)"](
          collectionAddress,
          tokenId,
          ethers.ZeroAddress,
          price,
          durationSeconds
        );
    }

    return await marketplace.nextListingId() - 1n;
  }

  async function createERC1155Listing(marketplace, collection, seller, tokenId, tokenAmount, price, durationSeconds) {
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    await collection.mint(seller.address, tokenId, tokenAmount);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    if (durationSeconds === undefined) {
      await marketplace
        .connect(seller)
        ["createERC1155Listing(address,uint256,uint256,address,uint256)"](
          collectionAddress,
          tokenId,
          tokenAmount,
          ethers.ZeroAddress,
          price
        );
    } else {
      await marketplace
        .connect(seller)
        ["createERC1155Listing(address,uint256,uint256,address,uint256,uint256)"](
          collectionAddress,
          tokenId,
          tokenAmount,
          ethers.ZeroAddress,
          price,
          durationSeconds
        );
    }

    return await marketplace.nextERC1155ListingId() - 1n;
  }

  async function expireCurrentBlock(seconds = 2) {
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine", []);
  }

  it("rejects invalid ERC-721 listing creation and update attempts", async function () {
    const { seller, buyer, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const price = ethers.parseEther("1");

    await collection.mint(seller.address, 1);
    await expect(
      marketplace
        .connect(buyer)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, 1, ethers.ZeroAddress, price)
    ).to.be.revertedWith("not token owner");

    await expect(
      marketplace
        .connect(seller)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, 1, ethers.ZeroAddress, price)
    ).to.be.revertedWith("not approved");

    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await marketplace
      .connect(seller)
      ["createListing(address,uint256,address,uint256)"](collectionAddress, 1, ethers.ZeroAddress, price);

    await expect(
      marketplace
        .connect(seller)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, 1, ethers.ZeroAddress, price)
    ).to.be.revertedWith("listing exists");
    await expect(marketplace.connect(buyer).updateListing(1, ethers.ZeroAddress, price)).to.be.revertedWith(
      "not seller"
    );
    await expect(marketplace.connect(seller).updateListing(1, ethers.ZeroAddress, 0)).to.be.revertedWith("bad price");

    await marketplace.connect(seller).cancelListing(1);
    await expect(marketplace.connect(seller).updateListing(1, ethers.ZeroAddress, price)).to.be.revertedWith(
      "listing off"
    );
  });

  it("rejects cancelled, expired, executed, underpaid, overpaid, self, and unapproved ERC-721 listing purchases", async function () {
    const { seller, buyer, other, marketplace, collection } = await deployERC721Fixture();
    const price = ethers.parseEther("1");

    const cancelledListingId = await createERC721Listing(marketplace, collection, seller, 10, price);
    await marketplace.connect(seller).cancelListing(cancelledListingId);
    await expect(marketplace.connect(buyer).buyListing(cancelledListingId, { value: price })).to.be.revertedWith(
      "listing off"
    );

    const expiredListingId = await createERC721Listing(marketplace, collection, seller, 11, price, 1);
    await expireCurrentBlock();
    await expect(marketplace.connect(buyer).buyListing(expiredListingId, { value: price })).to.be.revertedWith(
      "listing old"
    );

    const soldListingId = await createERC721Listing(marketplace, collection, seller, 12, price);
    await marketplace.connect(buyer).buyListing(soldListingId, { value: price });
    await expect(marketplace.connect(other).buyListing(soldListingId, { value: price })).to.be.revertedWith(
      "listing off"
    );

    const badPaymentListingId = await createERC721Listing(marketplace, collection, seller, 13, price);
    await expect(
      marketplace.connect(buyer).buyListing(badPaymentListingId, { value: price - 1n })
    ).to.be.revertedWith("bad payment");
    await expect(
      marketplace.connect(buyer).buyListing(badPaymentListingId, { value: price + 1n })
    ).to.be.revertedWith("bad payment");
    await expect(marketplace.connect(seller).buyListing(badPaymentListingId, { value: price })).to.be.revertedWith(
      "seller blocked"
    );

    await collection.connect(seller).setApprovalForAll(await marketplace.getAddress(), false);
    await expect(marketplace.connect(buyer).buyListing(badPaymentListingId, { value: price })).to.be.revertedWith(
      "not approved"
    );

    await collection.connect(seller).setApprovalForAll(await marketplace.getAddress(), true);
    await collection.connect(seller).transferFrom(seller.address, other.address, 13);
    await expect(marketplace.connect(buyer).buyListing(badPaymentListingId, { value: price })).to.be.revertedWith(
      "seller lost token"
    );
  });

  it("keeps ERC-721 native listing state intact when a fee recipient rejects ETH", async function () {
    const RejectingEthReceiver = await ethers.getContractFactory(REJECTING_ETH_RECEIVER_FQN);
    const rejectingFeeRecipient = await RejectingEthReceiver.deploy();
    await rejectingFeeRecipient.waitForDeployment();

    const { seller, buyer, marketplace, collection } = await deployERC721Fixture({
      feeRecipient: await rejectingFeeRecipient.getAddress(),
    });
    const price = ethers.parseEther("1");
    const listingId = await createERC721Listing(marketplace, collection, seller, 20, price);

    await expect(marketplace.connect(buyer).buyListing(listingId, { value: price })).to.be.revertedWith(
      "native transfer failed"
    );

    expect((await marketplace.listings(listingId)).active).to.equal(true);
    expect(await collection.ownerOf(20)).to.equal(seller.address);
  });

  it("rejects invalid, cancelled, expired, reused, and unauthorized ERC-721 offers", async function () {
    const { seller, bidder, buyer, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const offerAmount = ethers.parseEther("1");

    await collection.mint(seller.address, 30);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await expect(
      marketplace
        .connect(bidder)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, 30, ethers.ZeroAddress, 0)
    ).to.be.revertedWith("bad amount");
    await expect(
      marketplace
        .connect(seller)
        ["createOffer(address,uint256,address,uint256)"](collectionAddress, 30, ethers.ZeroAddress, offerAmount, {
          value: offerAmount,
        })
    ).to.be.revertedWith("owner blocked");

    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256)"](collectionAddress, 30, ethers.ZeroAddress, offerAmount, {
        value: offerAmount,
      });
    await marketplace.connect(bidder).cancelOffer(1);
    await expect(marketplace.connect(seller).acceptOffer(1)).to.be.revertedWith("offer off");

    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256,uint256)"](
        collectionAddress,
        30,
        ethers.ZeroAddress,
        offerAmount,
        1,
        { value: offerAmount }
      );
    await expireCurrentBlock();
    await expect(marketplace.connect(seller).acceptOffer(2)).to.be.revertedWith("offer old");

    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256)"](collectionAddress, 30, ethers.ZeroAddress, offerAmount, {
        value: offerAmount,
      });
    await expect(marketplace.connect(buyer).acceptOffer(3)).to.be.revertedWith("not token owner");
    await marketplace.connect(seller).acceptOffer(3);
    await expect(marketplace.connect(seller).acceptOffer(3)).to.be.revertedWith("offer off");
    expect(await collection.ownerOf(30)).to.equal(bidder.address);
  });

  it("rejects ERC-20 offers when allowance or balance is insufficient", async function () {
    const { owner, seller, bidder, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const offerAmount = ethers.parseEther("1");
    const paymentToken = await deployPaymentToken(bidder, offerAmount - 1n);
    const paymentTokenAddress = await paymentToken.getAddress();

    await collection.mint(seller.address, 40);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await marketplace.connect(owner).setPaymentTokenAllowed(paymentTokenAddress, true);

    await expect(
      marketplace.connect(bidder)["createOffer(address,uint256,address,uint256)"](
        collectionAddress,
        40,
        paymentTokenAddress,
        offerAmount
      )
    ).to.be.reverted;

    await paymentToken.mint(bidder.address, 1n);
    await expect(
      marketplace.connect(bidder)["createOffer(address,uint256,address,uint256)"](
        collectionAddress,
        40,
        paymentTokenAddress,
        offerAmount
      )
    ).to.be.reverted;

    await paymentToken.connect(bidder).approve(marketplaceAddress, offerAmount);
    await marketplace.connect(bidder)["createOffer(address,uint256,address,uint256)"](
      collectionAddress,
      40,
      paymentTokenAddress,
      offerAmount
    );
    expect(await paymentToken.balanceOf(marketplaceAddress)).to.equal(offerAmount);
  });

  it("rejects ERC-1155 listing amount, balance, approval, payment, and double-execution edge cases", async function () {
    const { seller, buyer, other, marketplace, collection } = await deployERC1155Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const price = ethers.parseEther("1");

    await collection.mint(seller.address, 50, 2);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await expect(
      marketplace.connect(seller)["createERC1155Listing(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        50,
        0,
        ethers.ZeroAddress,
        price
      )
    ).to.be.revertedWith("bad amount");
    await expect(
      marketplace.connect(seller)["createERC1155Listing(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        50,
        3,
        ethers.ZeroAddress,
        price
      )
    ).to.be.revertedWith("low balance");

    await marketplace.connect(seller)["createERC1155Listing(address,uint256,uint256,address,uint256)"](
      collectionAddress,
      50,
      2,
      ethers.ZeroAddress,
      price
    );
    await expect(marketplace.connect(buyer).buyERC1155Listing(1, { value: price - 1n })).to.be.revertedWith(
      "bad payment"
    );
    await expect(marketplace.connect(seller).buyERC1155Listing(1, { value: price })).to.be.revertedWith(
      "seller blocked"
    );

    await collection.connect(seller).setApprovalForAll(marketplaceAddress, false);
    await expect(marketplace.connect(buyer).buyERC1155Listing(1, { value: price })).to.be.revertedWith("not approved");

    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await collection.connect(seller).safeTransferFrom(seller.address, other.address, 50, 1, "0x");
    await expect(marketplace.connect(buyer).buyERC1155Listing(1, { value: price })).to.be.revertedWith(
      "seller balance"
    );

    const listingId = await createERC1155Listing(marketplace, collection, seller, 51, 2n, price);
    await marketplace.connect(buyer).buyERC1155Listing(listingId, { value: price });
    await expect(marketplace.connect(other).buyERC1155Listing(listingId, { value: price })).to.be.revertedWith(
      "listing off"
    );
  });

  it("rejects cancelled, expired, reused, self, and unapproved ERC-1155 offers", async function () {
    const { seller, bidder, marketplace, collection } = await deployERC1155Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const offerAmount = ethers.parseEther("1");

    await collection.mint(seller.address, 60, 4);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await expect(
      marketplace.connect(bidder)["createERC1155Offer(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        60,
        0,
        ethers.ZeroAddress,
        offerAmount,
        { value: offerAmount }
      )
    ).to.be.revertedWith("bad token amount");

    await expect(
      marketplace.connect(bidder)["createERC1155Offer(address,uint256,uint256,address,uint256)"](
        collectionAddress,
        60,
        1,
        ethers.ZeroAddress,
        0
      )
    ).to.be.revertedWith("bad amount");

    await marketplace.connect(bidder)["createERC1155Offer(address,uint256,uint256,address,uint256)"](
      collectionAddress,
      60,
      2,
      ethers.ZeroAddress,
      offerAmount,
      { value: offerAmount }
    );
    await marketplace.connect(bidder).cancelERC1155Offer(1);
    await expect(marketplace.connect(seller).acceptERC1155Offer(1)).to.be.revertedWith("offer off");

    await marketplace.connect(bidder)["createERC1155Offer(address,uint256,uint256,address,uint256,uint256)"](
      collectionAddress,
      60,
      2,
      ethers.ZeroAddress,
      offerAmount,
      1,
      { value: offerAmount }
    );
    await expireCurrentBlock();
    await expect(marketplace.connect(seller).acceptERC1155Offer(2)).to.be.revertedWith("offer old");

    await marketplace.connect(bidder)["createERC1155Offer(address,uint256,uint256,address,uint256)"](
      collectionAddress,
      60,
      2,
      ethers.ZeroAddress,
      offerAmount,
      { value: offerAmount }
    );
    await expect(marketplace.connect(bidder).acceptERC1155Offer(3)).to.be.revertedWith("bidder blocked");

    await collection.connect(seller).setApprovalForAll(marketplaceAddress, false);
    await expect(marketplace.connect(seller).acceptERC1155Offer(3)).to.be.revertedWith("not approved");

    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await marketplace.connect(seller).acceptERC1155Offer(3);
    await expect(marketplace.connect(seller).acceptERC1155Offer(3)).to.be.revertedWith("offer off");
  });

  it("rejects invalid ERC-721 auction bids, cancellation, early settlement, and double settlement", async function () {
    const { seller, buyer, bidder, other, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const reservePrice = ethers.parseEther("1");
    const increment = ethers.parseEther("0.1");

    await collection.mint(seller.address, 80);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await expect(
      marketplace.connect(seller).createAuction(collectionAddress, 80, ethers.ZeroAddress, 0, increment, 60)
    ).to.be.revertedWith("bad reserve");
    await expect(
      marketplace.connect(seller).createAuction(collectionAddress, 80, ethers.ZeroAddress, reservePrice, 0, 60)
    ).to.be.revertedWith("bad increment");
    await expect(
      marketplace.connect(seller).createAuction(collectionAddress, 80, ethers.ZeroAddress, reservePrice, increment, 0)
    ).to.be.revertedWith("bad duration");

    await marketplace
      .connect(seller)
      .createAuction(collectionAddress, 80, ethers.ZeroAddress, reservePrice, increment, 60);

    await expect(
      marketplace.connect(seller).placeAuctionBid(1, reservePrice, { value: reservePrice })
    ).to.be.revertedWith("seller blocked");
    await expect(
      marketplace.connect(bidder).placeAuctionBid(1, reservePrice - 1n, { value: reservePrice - 1n })
    ).to.be.revertedWith("below reserve");
    await expect(
      marketplace.connect(bidder).placeAuctionBid(1, reservePrice, { value: reservePrice - 1n })
    ).to.be.revertedWith("bad payment");

    await marketplace.connect(bidder).placeAuctionBid(1, reservePrice, { value: reservePrice });
    await expect(
      marketplace.connect(other).placeAuctionBid(1, reservePrice + increment - 1n, { value: reservePrice + increment - 1n })
    ).to.be.revertedWith("bid too low");
    await expect(marketplace.connect(seller).cancelAuction(1)).to.be.revertedWith("has bids");
    await expect(marketplace.connect(buyer).settleAuction(1)).to.be.revertedWith("auction live");

    await marketplace.connect(other).placeAuctionBid(1, reservePrice + increment, { value: reservePrice + increment });
    await expireCurrentBlock(61);
    await marketplace.connect(buyer).settleAuction(1);
    await expect(marketplace.connect(buyer).settleAuction(1)).to.be.revertedWith("auction off");
    expect(await collection.ownerOf(80)).to.equal(other.address);
  });

  it("rejects invalid ERC-1155 auction bids, cancellation, early settlement, and double settlement", async function () {
    const { seller, buyer, bidder, other, marketplace, collection } = await deployERC1155Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const reservePrice = ethers.parseEther("1");
    const increment = ethers.parseEther("0.1");

    await collection.mint(seller.address, 90, 3);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);

    await expect(
      marketplace
        .connect(seller)
        .createERC1155Auction(collectionAddress, 90, 0, ethers.ZeroAddress, reservePrice, increment, 60)
    ).to.be.revertedWith("bad amount");
    await expect(
      marketplace
        .connect(seller)
        .createERC1155Auction(collectionAddress, 90, 4, ethers.ZeroAddress, reservePrice, increment, 60)
    ).to.be.revertedWith("seller balance");

    await marketplace
      .connect(seller)
      .createERC1155Auction(collectionAddress, 90, 2, ethers.ZeroAddress, reservePrice, increment, 60);

    await expect(
      marketplace.connect(seller).placeERC1155AuctionBid(1, reservePrice, { value: reservePrice })
    ).to.be.revertedWith("seller blocked");
    await expect(
      marketplace.connect(bidder).placeERC1155AuctionBid(1, reservePrice - 1n, { value: reservePrice - 1n })
    ).to.be.revertedWith("below reserve");
    await expect(
      marketplace.connect(bidder).placeERC1155AuctionBid(1, reservePrice, { value: reservePrice - 1n })
    ).to.be.revertedWith("bad payment");

    await marketplace.connect(bidder).placeERC1155AuctionBid(1, reservePrice, { value: reservePrice });
    await expect(
      marketplace
        .connect(other)
        .placeERC1155AuctionBid(1, reservePrice + increment - 1n, { value: reservePrice + increment - 1n })
    ).to.be.revertedWith("bid too low");
    await expect(marketplace.connect(seller).cancelERC1155Auction(1)).to.be.revertedWith("has bids");
    await expect(marketplace.connect(buyer).settleERC1155Auction(1)).to.be.revertedWith("auction live");

    await marketplace.connect(other).placeERC1155AuctionBid(1, reservePrice + increment, { value: reservePrice + increment });
    await expireCurrentBlock(61);
    await marketplace.connect(buyer).settleERC1155Auction(1);
    await expect(marketplace.connect(buyer).settleERC1155Auction(1)).to.be.revertedWith("auction off");
    expect(await collection.balanceOf(other.address, 90)).to.equal(2n);
  });

  it("blocks critical ERC-721 actions while paused but keeps cancellations available", async function () {
    const { owner, seller, buyer, bidder, marketplace, collection } = await deployERC721Fixture();
    const collectionAddress = await collection.getAddress();
    const marketplaceAddress = await marketplace.getAddress();
    const price = ethers.parseEther("1");

    const listingId = await createERC721Listing(marketplace, collection, seller, 70, price);
    await marketplace
      .connect(bidder)
      ["createOffer(address,uint256,address,uint256)"](collectionAddress, 70, ethers.ZeroAddress, price, {
        value: price,
      });

    await collection.mint(seller.address, 71);
    await collection.connect(seller).setApprovalForAll(marketplaceAddress, true);
    await collection.mint(seller.address, 72);
    await marketplace.connect(owner).pause();

    await expect(
      marketplace
        .connect(seller)
        ["createListing(address,uint256,address,uint256)"](collectionAddress, 71, ethers.ZeroAddress, price)
    ).to.be.reverted;
    await expect(marketplace.connect(buyer).buyListing(listingId, { value: price })).to.be.reverted;
    await expect(marketplace.connect(seller).acceptOffer(1)).to.be.reverted;
    await expect(
      marketplace
        .connect(seller)
        .createAuction(collectionAddress, 72, ethers.ZeroAddress, price, ethers.parseEther("0.1"), 60)
    ).to.be.reverted;

    await marketplace.connect(seller).cancelListing(listingId);
    await marketplace.connect(bidder).cancelOffer(1);

    expect((await marketplace.listings(listingId)).active).to.equal(false);
    expect((await marketplace.offers(1)).active).to.equal(false);
  });
});
