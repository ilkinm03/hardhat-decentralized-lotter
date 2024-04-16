require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-deploy");
require("hardhat-gas-reporter");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();
const { vars } = require("hardhat/config");

const { REPORT_GAS_FEATURE } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
    solidity: "0.8.24",
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            chainId: 31377,
            blockConfirmations: 1,
        },
        sepolia: {
            chainId: 11155111,
            blockConfirmations: 6,
            url: vars.get("SEPOLIA_RPC_URL"),
            accounts: [vars.get("PRIVATE_KEY")],
        },
    },
    etherscan: {
        apiKey: vars.get("ETHERSCAN_API_KEY"),
    },
    gasReporter: {
        enabled: REPORT_GAS_FEATURE === "true",
        currency: "USD",
        noColors: true,
        outputFile: "gas-report.txt",
        coinmarketcap: vars.get("COINMARKETCAP_API_KEY"),
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
        player: {
            default: 1,
        },
    },
};
