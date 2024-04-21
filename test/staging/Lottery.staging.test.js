const { assert, expect, ...chai } = require("chai");
const { solidity } = require("ethereum-waffle");
const { getNamedAccounts, ethers, network } = require("hardhat");
const { DEVELOPMENT_CHAINS } = require("../../helper-hardhat.config");

chai.use(solidity);

DEVELOPMENT_CHAINS.includes(network.name)
    ? describe.skip
    : describe("Lottery Staging", () => {
        let lottery, lotteryEntranceFee, deployer;

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            lottery = await ethers.getContract("Lottery", deployer);
            lotteryEntranceFee = await lottery.getEntranceFee();
        });

        describe("fulfillRandomWords", () => {
            it("should work with live ChainLink Keepers and VRF and get a random winner", async () => {
                console.log("Setting up test...")
                let winnerStartingBalance;
                const startingTs = await lottery.getLatestTimestamp();
                const [deployerAccount] = await ethers.getSigners();
                console.log("Setting up Listener...")
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("WinnerPicked event triggered!");
                        try {
                            const recentWinner = await lottery.getRecentWinner();
                            const lotteryState = await lottery.getLotteryState();
                            const winnerEndingBalance = await deployerAccount.getBalance();
                            const endingTs = await lottery.getLatestTimestamp();
                            await expect(lottery.getPlayer(0)).to.be.reverted;
                            assert.equal(recentWinner.toString(), deployerAccount.address);
                            assert.equal(lotteryState, 0);
                            assert.equal(
                                winnerEndingBalance.toString(),
                                winnerStartingBalance
                                    .add(lotteryEntranceFee)
                                    .toString(),
                            );
                            assert(endingTs > startingTs);
                            resolve();
                        } catch (error) {
                            console.error(error);
                            reject(error);
                        }
                    });
                    try {
                        console.log("Entering Lottery...")
                        const tx = await lottery.enterLottery({ value: lotteryEntranceFee });
                        await tx.wait(1);
                        console.log("Ok, time to wait...")
                        winnerStartingBalance = await deployerAccount.getBalance();
                    } catch (error) {
                        console.error(error);
                        reject(error);
                    }
                });
            });
        });
    });