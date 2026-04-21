require("@nomicfoundation/hardhat-toolbox");
require('hardhat-abi-exporter');
require('custom-env').env();


/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      symbol: 'ETH',
      accounts: [`${process.env.PRIVATE_KEY}`]
    },
    qan: {
      url: "https://rpc-testnet.qanplatform.com",
      accounts: [`${process.env.PRIVATE_KEY_QAN}`]
    }
  },
  abiExporter: {
  path: './data/abi',
  runOnCompile: true,
  clear: true,
  flat: true,
  only: ['^contracts\\/(?!bundled_contracts\\/).+:[^:]+$'],
  spacing: 2,
  format:"json"
}
};
