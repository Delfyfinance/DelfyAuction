const { expect } = require("chai");

const { accounts, contract, web3 } = require("@openzeppelin/test-environment");
require("@openzeppelin/test-helpers/configure")({
  provider: "http://localhost:7545",
});

const helper = require("../service/utils");

const {
  BN, // Big Number support
  constants, // Common constants, like the zero address and largest integers
  expectEvent, // Assertions for emitted events
  expectRevert,
  time,
  // Assertions for transactions that should fail
} = require("@openzeppelin/test-helpers");
const { assert } = require("hardhat");

let Router,
  delfySwapFactory,
  AuctionFactory,
  Auction,
  WETH,
  DelfyLocker,
  Token1,
  data,
  Token;
const [sender, receiver, other] = accounts;

const DelfySwapFactory = contract.fromArtifact("DelfyFactory");
const WETH9 = contract.fromArtifact("WETH9");
const DelfySwapRouter = contract.fromArtifact("DelfyRouter02");
const ERC20 = contract.fromArtifact("BasicToken");
const delfyLocker = contract.fromArtifact("DelfyLocker");
const auctionFactory = contract.fromArtifact("AuctionFactory");
const auction = contract.fromArtifact("Auction");

const { MAX_UINT256, ZERO_ADDRESS, ZERO_BYTES32 } = constants;
const getBN = (val) => new BN(val);

beforeEach(async () => {
  delfySwapFactory = await DelfySwapFactory.new(sender);
  WETH = await WETH9.new();
  Router = await DelfySwapRouter.new(delfySwapFactory.address, WETH.address);
  Token = await ERC20.new({ from: sender });
  Token1 = await ERC20.new({ from: sender });
  DelfyLocker = await delfyLocker.new({ from: sender });
  console.log("**************", DelfyLocker.address);
  AuctionFactory = await auctionFactory.new({ from: sender });
  console.log("**************");
  data = [delfySwapFactory.address, Router.address, WETH.address];

  await DelfyLocker.setFactory(AuctionFactory.address, { from: sender });
  await AuctionFactory.setDelfyLocker(DelfyLocker.address, { from: sender });
  await Token.approve(Router.address, MAX_UINT256, { from: sender });
});
// 0xb969c96591269416ea2cfa3aa957cfa772392d12d25a48fc241e725fe9ad0403;
const toWei = (val) => web3.utils.toWei(val, "ether");

describe("Confirm Deployment", function () {
  it("creates router, factory, tokens, and weth", async () => {
    await Token1.approve(Router.address, MAX_UINT256, { from: sender });
    const bal = await Token1.balanceOf(sender);
    const supply = await Token1.totalSupply();
    await Router.addLiquidityETH(
      Token1.address,
      getBN(40000),
      getBN(30000),
      getBN(20000),
      sender,
      MAX_UINT256,
      { from: sender, value: getBN(60000) },
    );
    const factory = await Router.factory();
    const weth = await Router.WETH();
    console.log(
      bal.toString(),
      supply.toString(),
      Router.address,
      weth,
      factory,
    );
    const newBal = await Token1.balanceOf(sender);
    console.log(newBal.toString());
    expect(newBal).to.be.bignumber.equal("999999999999999999960000");
  });

  it("confirms factory", async () => {
    const confirm = await DelfyLocker.isFactory(AuctionFactory.address);
    expect(confirm).to.be.true;
  });

  it("has locker ", async () => {
    const locker = await AuctionFactory.DelfyLocker();

    expect(locker).to.equal(DelfyLocker.address);
  });
});

describe("AuctionFactory", function () {
  const salesPeriod = time.duration.days("7");
  const rate = web3.utils.toWei("2", "ether");
  const lockPeriod = time.duration.days("120");
  it("create auction", async () => {
    await AuctionFactory.createAuction(
      data,
      salesPeriod,
      Token1.address,
      rate,
      getBN(5),
      lockPeriod,
      false,
      { from: sender, gas: 8e6 },
    );
    const auctions = await AuctionFactory.getAllAuctions();
    expect(auctions.length).to.equal(1);
    const auctionAddr = await AuctionFactory.getAuction(Token1.address);
    Auction = await new auction(auctionAddr);
    const owner = await Auction.owner();
    expect(owner).to.equal(sender);
  });
  it("revert if token-auction pair exist", async () => {
    AuctionFactory.createAuction(
      data,
      salesPeriod,
      Token1.address,
      rate,
      getBN(5),
      lockPeriod,
      false,
      { from: sender, gas: 8e6 },
    ),
      await expectRevert(
        AuctionFactory.createAuction(
          data,
          salesPeriod,
          Token1.address,
          rate,
          getBN(5),
          lockPeriod,
          false,
          { from: sender, gas: 8e6 },
        ),
        "AUCTION: auction_exist",
      );
  });
  it("allows only admin", async () => {
    await expectRevert(
      AuctionFactory.setDelfyLocker(other, { from: receiver }),
      "Factory_not_owner",
    );
  });
  it("allows only admin", async () => {
    await expectRevert(
      AuctionFactory.changeFeesTo(other, { from: receiver }),
      "Factory_not_owner",
    );
  });
  it("allows only admin", async () => {
    await expectRevert(
      AuctionFactory.changeOwner(other, { from: receiver }),
      "not_owner",
    );
  });
});

describe("Auction", function () {
  const salesPeriod = time.duration.days("7");
  const rate = web3.utils.toWei("2", "ether");
  const lockPeriod = time.duration.days("120");
  beforeEach(async () => {
    await AuctionFactory.createAuction(
      data,
      salesPeriod,
      Token1.address,
      rate,
      getBN(5),
      lockPeriod,
      false,
      { from: sender, gas: 8e6 },
    );
    const auctionAddr = await AuctionFactory.getAuction(Token1.address);
    Auction = await new auction(auctionAddr);
  });

  it("set min-max", async () => {
    await Auction.setMinMax(getBN(500), getBN(1000), { from: sender });
    const min = await Auction.minimumPurchaseEth();
    const max = await Auction.maximumPurchaseEth();
    expect(min).to.be.bignumber.equal("500");
    expect(max).to.be.bignumber.equal("1000");
  });

  it("whitelist participants", async () => {
    await Auction.whitelistAddresses([sender, other], { from: sender });
    const whitelist = await Auction.whitelistAuction();
    expect(whitelist).to.be.true;
  });

  it("sets project info", async () => {
    await Auction.addProjectInfo("google.com", "delfyfinance.org", {
      from: sender,
    });
    const logoLink = await Auction.logoLink();
    const projectUrl = await Auction.projectURL();
    expect(logoLink).to.equal("google.com");
    expect(projectUrl).to.equal("delfyfinance.org");
  });

  it("allows deposit", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    const auctionBalance = await Token1.balanceOf(Auction.address);
    expect(auctionBalance).to.be.bignumber.equal(toWei("50"));
  });

  it("process buy with rate", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("2") });
    const receiverBalance = await Token1.balanceOf(receiver);
    expect(receiverBalance).to.be.bignumber.equal(toWei("4"));
  });

  it("allow only whitelisted addresses", async () => {
    await Auction.whitelistAddresses([sender, other], { from: sender });
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await expectRevert(
      Auction.buyTokenWithEth({ from: receiver, value: toWei("2") }),
      "AUCTION: only_whitelisted_address",
    );
  });

  it("maintains buying range", async () => {
    await Auction.setMinMax(toWei("2"), toWei("4"), { from: sender });
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await expectRevert(
      Auction.buyTokenWithEth({ from: receiver, value: toWei("5") }),
      "AUCTION: value_out_of_range",
    );

    await Auction.buyTokenWithEth({ from: other, value: toWei("2.5") });

    await expectRevert(
      Auction.buyTokenWithEth({ from: other, value: toWei("2") }),
      "AUCTION:: You_have_reached_your_allowed_cap",
    );
  });

  it("launch exchange", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });

    await Auction.buyTokenWithEth({ from: other, value: toWei("2.5") });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("2.5") });
    await Auction.buyTokenWithEth({ from: sender, value: toWei("5") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: sender });
  });
  it("allows presale contributors to launch exchange", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });

    await Auction.buyTokenWithEth({ from: other, value: toWei("2.5") });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("2.5") });
    await Auction.buyTokenWithEth({ from: sender, value: toWei("5") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    expect(await Auction.exchangeLaunched()).to.be.true;
  });
  it("revert if not contributor", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });

    await Auction.buyTokenWithEth({ from: receiver, value: toWei("5") });
    await Auction.buyTokenWithEth({ from: sender, value: toWei("5") });
    await expectRevert(
      Auction.launchEthTokenExchange(MAX_UINT256, { from: other }),
      "AUCTION: not_investor",
    );
  });

  it("close sales after the stated time", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });

    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });

    const till = await Auction.openTill();

    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];

    await helper.advanceTime(+till + 300);
    await expectRevert(
      Auction.buyTokenWithEth({ from: receiver, value: toWei("5") }),
      "AUCTION: auction_closed",
    );

    await helper.revertToSnapShot(snapshotId);
  });
});
