const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { DEVELOPMENT_CHAINS, networkConfig } = require("../../helper-hardhat.config");
const { assert } = require("chai");

!DEVELOPMENT_CHAINS.includes(network.name)
    ? describe.skip
    : describe("Lottery", async () => {
        let lottery, vrfCoordinatorV2Mock;
        const chainId = network.config.chainId;

        beforeEach(async () => {
            const { deployer } = await getNamedAccounts();
            await deployments.fixture(["all"]);
            lottery = await ethers.getContract("Lottery", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
        });

        describe("constructor", async () => {
            it("should initialize lottery with OPEN (0) state", async () => {
                const lotteryState = await lottery.getLotteryState();
                assert.equal(lotteryState.toString(), "0");
            });

            it("should initialize lottery with interval correctly", async () => {
                const interval = await lottery.getInterval();
                assert.equal(interval.toString(), networkConfig[chainId].interval);
            });
        });
    });