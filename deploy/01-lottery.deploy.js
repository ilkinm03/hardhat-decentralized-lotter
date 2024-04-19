const { network, ethers } = require("hardhat");
const { vars } = require("hardhat/config");
const { DEVELOPMENT_CHAINS, networkConfig } = require("../helper-hardhat.config");
const { verify } = require("../utils/verify");

const VRF_SUB_FUND_AMOUNT = ethers.utils.parseEther("2");

module.exports = async ({ getNamedAccounts, deployments }) => {
    const { deploy, log } = deployments;
    const { deployer } = await getNamedAccounts();
    const chainId = network.config.chainId;
    let vrfCoordinatorV2Address, subscriptionId, vrfCoordinatorV2Mock;
    if (DEVELOPMENT_CHAINS.includes(network.name)) {
        vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock");
        vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;
        const txResponse = await vrfCoordinatorV2Mock.createSubscription();
        const txReceipt = await txResponse.wait(1);
        subscriptionId = txReceipt.events[0].args.subId;
        await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, VRF_SUB_FUND_AMOUNT);
    } else {
        vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2;
        subscriptionId = networkConfig[chainId].subscriptionId;
    }
    const {
        entranceFee,
        gasLane,
        callbackGasLimit,
        interval,
    } = networkConfig[chainId];
    const args = [
        vrfCoordinatorV2Address,
        entranceFee,
        gasLane,
        subscriptionId,
        callbackGasLimit,
        interval
    ];
    log("Deploying lottery contract...");
    const lottery = await deploy("Lottery", {
        from: deployer,
        args,
        waitConfirmations: network.config.blockConfirmations || 1,
    });
    if (DEVELOPMENT_CHAINS.includes(network.name)) {
        await vrfCoordinatorV2Mock.addConsumer(subscriptionId, lottery.address);
    }
    if (!DEVELOPMENT_CHAINS.includes(network.name) && vars.get("ETHERSCAN_API_KEY")) {
        log("Verifying...");
        await verify(lottery.address, args);
    }
    log("-------------------------------");
};

module.exports.tags = ["all", "lottery"];