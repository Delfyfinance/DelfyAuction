const { expect, should } = require("chai");

const { accounts, contract, web3 } = require("@openzeppelin/test-environment");
require("@openzeppelin/test-helpers/configure")({
  provider: "http://localhost:7545",
});

const {
  BN,
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
  AuctionT,
  Token;

const [
  sender,
  sender1,
  sender2,
  receiver,
  receiver1,
  receiver2,
  other,
  other1,
  other2,
  me,
] = accounts;

const DelfySwapFactory = contract.fromArtifact("DelfyFactory");
const WETH9 = contract.fromArtifact("WETH9");
const DelfySwapRouter = contract.fromArtifact("DelfyRouter02");
const ERC20 = contract.fromArtifact("BasicToken");
const delfyLocker = contract.fromArtifact("DelfyLocker");
const auctionFactory = contract.fromArtifact("AuctionFactory");
const auction = contract.fromArtifact("Auction");

const { MAX_UINT256 } = constants;

const helper = require("../service/utils");
const toWei = (val) => web3.utils.toWei(val, "ether");
const fromWei = (val) => web3.utils.fromWei(val, "ether");
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
  const salesPeriod = time.duration.days("7");
  const rate = toWei("2");
  const lockPeriod = time.duration.days("120");
  await AuctionFactory.createAuction(
    data,
    salesPeriod,
    Token1.address,
    rate,
    5,
    lockPeriod,
    false,
    { from: sender, gas: 8e6 },
  );
  const auctionAddr = await AuctionFactory.getAuction(Token1.address);
  Auction = await new auction(auctionAddr);

  AuctionT = await auction.new({ from: sender });
});

describe("locker", () => {
  it("only allows factory", async () => {
    await expectRevert(
      DelfyLocker.addAuctionDetails(
        delfySwapFactory.address,
        WETH.address,
        Token1.address,
        sender1,
        AuctionT.address,
        MAX_UINT256,
        false,
        { from: sender },
      ),
      "LOCKER: only_factory",
    );
  });
  it("only allows owner to add and remove factory", async () => {
    await expectRevert(
      DelfyLocker.setFactory(AuctionT.address, { from: sender1 }),
      "only_owner",
    );
    await expectRevert(
      DelfyLocker.removeFactory(AuctionT.address, { from: sender1 }),
      "only_owner",
    );
  });
  it("allow auction owner to burn liquidity", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("5") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("5") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(helper.fromNow(200));
    await DelfyLocker.burnDexLPToken(
      Token1.address,
      await DelfyLocker.getLPAmount(Auction.address),
      { from: sender },
    );
    expect(+(await DelfyLocker.getLPAmount(Auction.address)) === 0).to.be.true;
    await helper.revertToSnapShot(snapshotId);
  });
  it("allow withdrawal after the lock period", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("5") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("5") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(10602700);
    const balance = await DelfyLocker.getLPAmount(Auction.address);
    await DelfyLocker.withdrawLpToken(Token1.address, balance.toString(), {
      from: sender,
    });
    console.log("here...");
    expect(+fromWei(await DelfyLocker.getLPAmount(Auction.address)) === 0).to.be
      .true;
    await helper.revertToSnapShot(snapshotId);
  });
});
