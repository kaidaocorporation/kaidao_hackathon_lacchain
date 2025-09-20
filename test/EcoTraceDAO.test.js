const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

async function deployEcoTraceFixture() {
  const [deployer, farmer, consumer] = await ethers.getSigners();
  const EcoTraceDAO = await ethers.getContractFactory("EcoTraceDAO", deployer);
  const ecoTrace = await EcoTraceDAO.deploy();
  await ecoTrace.waitForDeployment();

  return { ecoTrace, deployer, farmer, consumer };
}

describe("EcoTraceDAO", function () {
  it("registers a farm and stores metadata", async function () {
    const { ecoTrace, farmer } = await loadFixture(deployEcoTraceFixture);

    const tx = await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);

    await expect(tx)
      .to.emit(ecoTrace, "FarmRegistered")
      .withArgs(1n, farmer.address, "Finca Verde");

    const farmId = await ecoTrace.farmCounter();
    const farm = await ecoTrace.farms(farmId);
    expect(farm.farmer).to.equal(farmer.address);
    expect(farm.name).to.equal("Finca Verde");
    expect(farm.isDeforestationFree).to.equal(true);
  });

  it("allows farm owner to register products and rejects others", async function () {
    const { ecoTrace, farmer, consumer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);

    await expect(
      ecoTrace
        .connect(consumer)
        .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01")
    ).to.be.revertedWith("Not farm owner");

    const tx = await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    await expect(tx)
      .to.emit(ecoTrace, "ProductRegistered")
      .withArgs(1n, 1n, "Cafe Arabica");

    const productId = await ecoTrace.productCounter();
    const product = await ecoTrace.products(productId);
    expect(product.farmId).to.equal(1n);
    expect(product.productName).to.equal("Cafe Arabica");
  });

  it("mints carbon footprint seals to the caller", async function () {
    const { ecoTrace, farmer, consumer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);
    await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    const tx = await ecoTrace
      .connect(consumer)
      .issueCarbonFootprintSeal(1n, 41000000, -73000000, "ipfs://carbon");

    await expect(tx)
      .to.emit(ecoTrace, "SealIssued")
      .withArgs(1n, 1n, 0);

    const seal = await ecoTrace.getSeal(1n);
    expect(await ecoTrace.ownerOf(1n)).to.equal(consumer.address);
    expect(seal.productId).to.equal(1n);
    expect(seal.sealType).to.equal(0);
    expect(seal.carbonFootprint).to.be.gt(0n);
  });

  it("rejects carbon seals for unknown products", async function () {
    const { ecoTrace, farmer, consumer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);

    await expect(
      ecoTrace
        .connect(consumer)
        .issueCarbonFootprintSeal(99n, 41000000, -73000000, "ipfs://carbon")
    ).to.be.revertedWith("Product doesn't exist");
  });

  it("requires certified farms for deforestation-free seals", async function () {
    const { ecoTrace, farmer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);
    await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    const tx = await ecoTrace
      .connect(farmer)
      .issueDeforestationFreeSeal(1n, "CERT-123", "ipfs://df");

    await expect(tx)
      .to.emit(ecoTrace, "SealIssued")
      .withArgs(1n, 1n, 1);

    const seal = await ecoTrace.getSeal(1n);
    expect(await ecoTrace.ownerOf(1n)).to.equal(farmer.address);
    expect(seal.sealType).to.equal(1);
    expect(seal.verificationData).to.equal("CERT-123");
  });

  it("requires deforestation-free certification before minting", async function () {
    const { ecoTrace, farmer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Encina", 40000000, -74000000, false);
    await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    await expect(
      ecoTrace
        .connect(farmer)
        .issueDeforestationFreeSeal(1n, "CERT-XYZ", "ipfs://df")
    ).to.be.revertedWith("Farm not certified deforestation-free");
  });

  it("blocks non-owners from issuing deforestation-free seals", async function () {
    const { ecoTrace, farmer, consumer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);
    await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    await expect(
      ecoTrace
        .connect(consumer)
        .issueDeforestationFreeSeal(1n, "CERT-XYZ", "ipfs://df")
    ).to.be.revertedWith("Not authorized");
  });

  it("tracks farmer and farm inventory helper arrays", async function () {
    const { ecoTrace, farmer } = await loadFixture(deployEcoTraceFixture);

    await ecoTrace
      .connect(farmer)
      .registerFarm("Finca Verde", 40000000, -74000000, true);
    await ecoTrace
      .connect(farmer)
      .registerProduct(1n, "Cafe Arabica", 100n, "LOT-01");

    const farmsForFarmer = await ecoTrace.getFarmerFarms(farmer.address);
    const productsForFarm = await ecoTrace.getFarmProducts(1n);

    expect(farmsForFarmer).to.deep.equal([1n]);
    expect(productsForFarm).to.deep.equal([1n]);
  });
});
