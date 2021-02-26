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
});

describe("Auction Case", () => {
  it("revert case creation when sales is on or exchange is not launched", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("2") });
    await expectRevert(
      Auction.createTypedCase("I hate the developers", 1, {
        from: receiver,
        value: toWei("0.00789"),
      }),
      "AUCTION: case_creation_window_closed",
    );
  });
  it("allows case creation after sales is completed", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("10") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    const launched = await Auction.exchangeLaunched();
    const third = await Auction.thirdRelease();
    console.log(third.toString(), launched.toString());
    await helper.advanceTime(helper.fromNow(25));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver,
      value: toWei("0.00789"),
    }),
      expect(await Auction.caseCreated()).to.be.true;
    await helper.revertToSnapShot(snapshotId);
  });
  it("allows two types of cases to be created", async () => {
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
    await helper.advanceTime(helper.fromNow(25));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      expect(await Auction.caseCreated()).to.be.true;
    await Auction.createTypedCase("I hate the developers", 0, {
      from: receiver,
      value: toWei("0.01"),
    }),
      expect(await Auction.refundableCaseCreated()).to.be.true;
    await helper.revertToSnapShot(snapshotId);
  });
  it("allow only contributors to create case", async () => {
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
    await helper.advanceTime(helper.fromNow(25));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      expect(await Auction.caseCreated()).to.be.true;
    await expectRevert(
      Auction.createTypedCase("I hate the developers", 0, {
        from: other,
        value: toWei("0.01"),
      }),
      "AUCTION: not_investor",
    ),
      expect(await Auction.refundableCaseCreated()).to.be.false;
    await helper.revertToSnapShot(snapshotId);
  });
  it("revert if no or less ether value", async () => {
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
    await helper.advanceTime(helper.fromNow(25));
    await expectRevert(
      Auction.createTypedCase("I hate the developers", 1, {
        from: receiver2,
      }),
      "AUCTION: You_have_to_donate",
    ),
      await expectRevert(
        Auction.createTypedCase("I hate the developers", 0, {
          from: receiver,
          value: toWei("0.009"),
        }),
        "AUCTION: You_have_to_donate",
      ),
      await helper.revertToSnapShot(snapshotId);
  });
  it("revert case if lesser token balance", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("30"), toWei("100"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("24.5") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("20") });
    await Auction.buyTokenWithEth({ from: other, value: toWei("0.04") });
    await Auction.buyTokenWithEth({ from: other2, value: toWei("5.46") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(helper.fromNow(25));
    await expectRevert(
      Auction.createTypedCase("I hate the developers", 1, {
        from: other,
        value: toWei("0.00789"),
      }),
      "AUCTION: Only_real_investors",
    ),
      await expectRevert(
        Auction.createTypedCase("I hate the developers", 0, {
          from: other,
          value: toWei("0.01"),
        }),
        "AUCTION: Only_real_investors",
      ),
      expect(await Auction.refundableCaseCreated()).to.be.false;
    await helper.revertToSnapShot(snapshotId);
  });
  it("revert vote if lesser token balance & allow if otherwise", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("30"), toWei("100"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("20") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("24.5") });
    await Auction.buyTokenWithEth({ from: other, value: toWei("0.004") });
    await Auction.buyTokenWithEth({ from: other2, value: toWei("5.496") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(helper.fromNow(25));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver,
      value: toWei("0.00789"),
    }),
      await expectRevert(
        Auction.upvoteCase(1, { from: other, value: toWei("0.004") }),
        "AUCTION: Only_real_investors ",
      );
    await Auction.upvoteCase(1, { from: other2, value: toWei("0.004") });
    const cases = await Auction.viewCases(1);
    expect(cases.length).to.be.equal(1);
    await helper.revertToSnapShot(snapshotId);
  });
  it("release liquidity to exchange if case passes", async () => {
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
    await helper.advanceTime(helper.fromNow(25));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      await Auction.upvoteCase(1, {
        from: receiver,
        value: toWei("0.004"),
      });
    const BalanceBefore = await Auction.getEthBal();
    await helper.revertToSnapShot(snapshotId);
    const snapShot2 = await helper.takeSnapshot();
    const snapshotId2 = snapShot2["result"];
    await helper.advanceTime(helper.fromNow(48));
    await Auction.releaseLiquidity(helper.fromNow(3), { from: receiver });
    const BalanceAfter = await Auction.getEthBal();
    expect(BalanceBefore > BalanceAfter).to.be.true;
    await helper.revertToSnapShot(snapshotId2);
  });

  it("release all liquidity to dev if no cases passed", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    const ownerBalanceBefore = await web3.eth.getBalance(sender);
    console.log(await web3.eth.getBalance(sender));
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: sender1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: sender2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("1") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(86430 * 2);
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      await Auction.upvoteCase(1, {
        from: receiver,
        value: toWei("0.004"),
      });
    await helper.advanceTime(86430 * 2);
    await Auction.releaseLiquidity(MAX_UINT256, { from: receiver });
    console.log(await web3.eth.getBalance(sender));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      await Auction.upvoteCase(1, {
        from: receiver2,
        value: toWei("0.004"),
      });
    await helper.advanceTime(86430 * 2);
    await Auction.releaseLiquidity(MAX_UINT256, { from: receiver });
    console.log(await web3.eth.getBalance(sender));
    await Auction.createTypedCase("I hate the developers", 1, {
      from: receiver2,
      value: toWei("0.00789"),
    }),
      await Auction.upvoteCase(1, {
        from: receiver,
        value: toWei("0.004"),
      });
    await helper.advanceTime(86400 * 2);
    await Auction.releaseLiquidity(MAX_UINT256, { from: receiver });
    const ownerBalanceAfter = await web3.eth.getBalance(sender);
    console.log(await web3.eth.getBalance(sender));
    await helper.revertToSnapShot(snapshotId);
    expect(
      +fromWei(ownerBalanceAfter) >=
        +fromWei(ownerBalanceBefore) + +fromWei("4"),
    ).to.be.true;
  });
  it("stop liquidity release", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("2") });
    await Auction.buyTokenWithEth({ from: receiver1, value: toWei("2") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("2") });
    await Auction.buyTokenWithEth({ from: other1, value: toWei("2") });
    await Auction.buyTokenWithEth({ from: other2, value: toWei("2") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(86430 * 2);
    await Auction.createTypedCase("I hate the developers", 0, {
      from: receiver2,
      value: toWei("0.01"),
    }),
      await Auction.upvoteCase(0, {
        from: receiver,
        value: toWei("0.005"),
      });
    await Auction.upvoteCase(0, {
      from: receiver1,
      value: toWei("0.005"),
    });
    await Auction.upvoteCase(0, {
      from: receiver2,
      value: toWei("0.005"),
    });
    await helper.advanceTime(86430 * 2);
    await expectRevert(
      Auction.releaseLiquidity(MAX_UINT256, { from: receiver }),
      "Auction_release_stoped",
    );
    await helper.revertToSnapShot(snapshotId);
  });
  it("stop liquidity release and refund Buyers", async () => {
    await Token1.approve(Auction.address, MAX_UINT256, {
      from: sender,
    });
    await Auction.deposit(toWei("10"), toWei("20"), toWei("20"), toWei("0"), {
      from: sender,
    });
    console.log(await web3.eth.getBalance(sender));
    await Auction.buyTokenWithEth({ from: receiver, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: receiver2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: other2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: sender1, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: sender2, value: toWei("1") });
    await Auction.buyTokenWithEth({ from: me, value: toWei("2") });
    await Auction.launchEthTokenExchange(MAX_UINT256, { from: receiver });
    const snapShot = await helper.takeSnapshot();
    const snapshotId = snapShot["result"];
    await helper.advanceTime(86430 * 2);
    await Auction.createTypedCase("I hate the developers", 0, {
      from: receiver2,
      value: toWei("0.01"),
    }),
      await Auction.upvoteCase(0, {
        from: receiver,
        value: toWei("0.005"),
      });
    await Auction.upvoteCase(0, {
      from: receiver1,
      value: toWei("0.005"),
    });
    await Auction.upvoteCase(0, {
      from: receiver2,
      value: toWei("0.005"),
    });
    await Auction.upvoteCase(0, {
      from: me,
      value: toWei("0.005"),
    });
    await Auction.upvoteCase(0, {
      from: other1,
      value: toWei("0.005"),
    });
    console.log("still going...");
    await helper.advanceTime(86430 * 2);
    await expectRevert(
      Auction.releaseLiquidity(MAX_UINT256, { from: receiver }),
      "Auction_release_stoped",
    );
    await helper.advanceTime(86430 * 6);
    await Auction.refundBuyers({ from: receiver2 });
    await Auction.refundBuyers({ from: receiver });
    await Auction.refundBuyers({ from: receiver1 });
    await Auction.refundBuyers({ from: other1 });
    await Auction.refundBuyers({ from: other });
    await Auction.refundBuyers({ from: other2 });
    await Auction.refundBuyers({ from: sender1 });
    await Auction.refundBuyers({ from: sender2 });
    await Auction.refundBuyers({ from: me });
    await expectRevert(
      Auction.refundBuyers({ from: sender }),
      "Only_real_investors",
    );
    console.log("refunded...");
    const BalanceAfter = await Auction.getEthBal();
    console.log("balAfter: ", fromWei(BalanceAfter));
    expect(fromWei(BalanceAfter) < fromWei("10")).to.be.true;
    await helper.revertToSnapShot(snapshotId);
  });
});
