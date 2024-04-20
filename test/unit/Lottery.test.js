const { assert, expect, ...chai } = require("chai");
const { solidity } = require("ethereum-waffle");
const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { DEVELOPMENT_CHAINS, networkConfig } = require("../../helper-hardhat.config");

chai.use(solidity);

!DEVELOPMENT_CHAINS.includes(network.name)
    ? describe.skip
    : describe("Lottery", async () => {
        let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval;
        const chainId = network.config.chainId;

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            await deployments.fixture(["all"]);
            lottery = await ethers.getContract("Lottery", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
            lotteryEntranceFee = await lottery.getEntranceFee();
            interval = await lottery.getInterval();
        });

        describe("constructor", () => {
            it("should initialize lottery with OPEN (0) state", async () => {
                const lotteryState = await lottery.getLotteryState();
                assert.equal(lotteryState.toString(), "0");
            });

            it("should initialize lottery with interval correctly", async () => {
                assert.equal(interval.toString(), networkConfig[chainId].interval);
            });
        });

        describe("enterLottery", () => {
            it("should revert with Lottery__InsufficientFunds when fund are not enough", async () => {
                await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__InsufficientFunds");
            });

            it("should revert with Lottery__NotOpen when the lottery is not open", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                await lottery.performUpkeep([]);
                await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith("Lottery__NotOpen");
            });

            it("should record players as they enter", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                const playerFromContract = await lottery.getPlayer(0);
                assert.equal(playerFromContract, deployer);
            });

            it("should emit event on enter", async () => {
                await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.emit(lottery, "LotteryEnter");
            });
        });

        describe("checkUpkeep", () => {
            it("should return false if people haven't sent any ETH", async () => {
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
                assert(!upkeepNeeded);
            });

            it("should return false if lottery isn't open", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                await lottery.performUpkeep([]);
                const lotteryState = await lottery.getLotteryState();
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
                assert.equal(lotteryState.toString(), "1");
                assert(!upkeepNeeded);
            });

            it("should return false if enough time hasn't passed", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) - 5]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
                assert.equal(upkeepNeeded, false);
            });

            it("should return true if enough time has passed, has player, ETH and is open", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([]);
                assert.equal(upkeepNeeded, true);
            })
        });
    });