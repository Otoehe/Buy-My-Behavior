// onchain/scripts/deploy-escrow.js
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const hre = require("hardhat");
  const { ethers } = hre;

  const USDT = process.env.USDT_ADDRESS_MAINNET;
  const TREASURY = process.env.TREASURY_ADDRESS;

  if (!USDT || !TREASURY) {
    throw new Error("ENV is missing: check USDT_ADDRESS_MAINNET and TREASURY_ADDRESS in onchain/.env");
  }

  console.log("Deploying Escrow with:");
  console.log("  USDT:", USDT);
  console.log("  TREASURY:", TREASURY);

  const Escrow = await ethers.getContractFactory("Escrow"); // ім'я контракту як у contracts/Escrow.sol
  const escrow = await Escrow.deploy(USDT, TREASURY);
  await escrow.deployed();

  console.log("\n✅ Escrow deployed at:", escrow.address);

  // опціонально: виведемо трохи стану, якщо в контракті є публічні геттери:
  try {
    const token = await escrow.token?.();
    const treasury = await escrow.treasury?.();
    if (token)   console.log("   token():   ", token);
    if (treasury) console.log("   treasury():", treasury);
  } catch (_) {}

  console.log("\n🎯 Збережіть цю адресу в фронтенд .env як VITE_ESCROW_ADDRESS і перезапустіть dev-сервер.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
