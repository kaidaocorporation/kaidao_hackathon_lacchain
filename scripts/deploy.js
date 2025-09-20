const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying EcoTraceDAO with account:", deployer.address);

  const ecoTrace = await ethers.deployContract("EcoTraceDAO");
  await ecoTrace.waitForDeployment();

  console.log("EcoTraceDAO deployed to:", await ecoTrace.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
