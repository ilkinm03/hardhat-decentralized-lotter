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
            });
        });

        describe("performUpkeep", () => {
            it("should only run when checkUpkeep is true", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                const tx = await lottery.performUpkeep([]);
                assert(tx);
            });

            it("should revert when checkUpkeep is false", async () => {
                await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded");
            });

            it("should update the lottery state", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                await lottery.performUpkeep([]);
                const lotteryState = await lottery.getLotteryState();
                assert.equal(Number(lotteryState), 1);
            });

            it("should emit Lottery Winner event if successful", async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
                const txResponse = await lottery.performUpkeep([]);
                const txReceipt = await txResponse.wait(1);
                const requestId = txReceipt.events[1].args.requestId;
                assert(Number(requestId) > 0);
            });
        });

        describe("fulfillRandomWords", () => {
            beforeEach(async () => {
                await lottery.enterLottery({ value: lotteryEntranceFee });
                await network.provider.send("evm_increaseTime", [Number(interval) + 1]);
                await network.provider.send("evm_mine", []);
            });

            it("can only be called after performUpkeep", async () => {
                await expect(
                    vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address),
                ).to.be.revertedWith("nonexistent request");
            });

            it("should pick a winner, reset the lottery and send money", async () => {
                const additionalEntrance = 3;
                const startingAccountIndex = 1;
                const accounts = await ethers.getSigners();
                let winnerStartingBalance;
                for (let i = startingAccountIndex; i < startingAccountIndex + additionalEntrance; i++) {
                    lottery = lottery.connect(accounts[i]);
                    await lottery.enterLottery({ value: lotteryEntranceFee });
                }
                const startingTs = await lottery.getLatestTimestamp();
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event triggered!");
                        try {
                            const lotteryState = await lottery.getLotteryState();
                            const endingTs = await lottery.getLatestTimestamp();
                            const numPlayers = await lottery.getNumberOfPlayers();
                            const winnerEndingBalance = await accounts[1].getBalance();
                            assert.equal(numPlayers.toString(), "0");
                            assert.equal(lotteryState.toString(), "0");
                            assert(endingTs > startingTs);
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance.add(
                                    lotteryEntranceFee
                                        .mul(additionalEntrance + 1)
                                        .toString(),
                                ),
                            );
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                    try {
                        const tx = await lottery.performUpkeep([]);
                        const txReceipt = await tx.wait(1);
                        winnerStartingBalance = await accounts[1].getBalance();
                        await vrfCoordinatorV2Mock.fulfillRandomWords(
                            txReceipt.events[1].args.requestId,
                            lottery.address,
                        );
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        });
    });