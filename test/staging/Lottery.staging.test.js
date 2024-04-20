const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const { DEVELOPMENT_CHAINS } = require("../../helper-hardhat.config");

DEVELOPMENT_CHAINS.includes(network.name)
    ? describe.skip
    : describe("Lottery Staging", async () => {
        let lottery, lotteryEntranceFee, deployer;

        beforeEach(async () => {
            deployer = (await getNamedAccounts()).deployer;
            lottery = await ethers.getContract("Lottery", deployer);
            lotteryEntranceFee = await lottery.getEntranceFee();
        });
    });