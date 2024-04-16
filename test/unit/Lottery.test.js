const { network, getNamedAccounts, deployments, ethers } = require("hardhat");
const { DEVELOPMENT_CHAINS } = require("../../helper-hardhat.config");

!DEVELOPMENT_CHAINS.includes(network.name)
    ? describe.skip
    : describe("Lottery", async () => {
        let lottery, vrfCoordinatorV2Mock;

        beforeEach(async () => {
            const { deployer } = await getNamedAccounts();
            await deployments.fixture(["all"]);
            lottery = await ethers.getContract("Lottery", deployer);
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer);
        });
    });