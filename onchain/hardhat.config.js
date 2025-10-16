// onchain/hardhat.config.js
const path = require("path");

// 1) Жорстко вкажемо шлях до .env у цій папці
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

// 2) Плагін ethers для Hardhat v2
require("@nomiclabs/hardhat-ethers");

const { PRIVATE_KEY, BSC_RPC, BSCTEST_RPC } = process.env;

// Невеликий лог – допоможе побачити, що .env зчитався
console.log("[env check]",
  { BSC_RPC: !!BSC_RPC, BSCTEST_RPC: !!BSCTEST_RPC, PRIVATE_KEY: !!PRIVATE_KEY }
);

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    bsc: {
      url: BSC_RPC || "https://bsc-dataseed.binance.org",
      chainId: 56,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    },
    bscTestnet: {
      url: BSCTEST_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545",
      chainId: 97,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
    },
  },
};
