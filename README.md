# EcoTraceDAO

Agricultural traceability and environmental seals on EVM.

EcoTraceDAO is a lightweight, open-source registry that lets producers register farms and products, attach verifiable environmental evidence, and issue portable on-chain “seals” (NFTs) such as **Carbon Footprint** and **Deforestation‑Free**. Consumers can independently verify products and view provenance on a map.

---

## Table of Contents

* [Motivation](#motivation)
* [Key Features](#key-features)
* [System Architecture](#system-architecture)
* [Data Model](#data-model)
* [Carbon Footprint Model](#carbon-footprint-model)
* [Smart Contracts](#smart-contracts)
* [Frontend](#frontend)
* [Configuration](#configuration)
* [Running Locally](#running-locally)
* [Usage Guide](#usage-guide)
* [NFT Metadata / IPFS](#nft-metadata--ipfs)
* [Security and Privacy](#security-and-privacy)
* [Limitations](#limitations)
* [Roadmap](#roadmap)
* [Contributing](#contributing)
* [License](#license)
* [Acknowledgements](#acknowledgements)

---

## Motivation

Environmental attributes of agricultural goods are difficult to verify and even harder to communicate across supply chains. EcoTraceDAO proposes an open, verifiable registry where:

* **Farms** and **products** are registered on-chain with signed ownership and geolocation.
* **Environmental seals** (e.g., Carbon Footprint and Deforestation‑Free) are issued as NFTs and can be validated by anyone.
* **Consumers** can check provenance and environmental information by product ID or by NFT token ID, with an interactive map of origin and route.

The goal is to make traceability portable, tamper-resistant, and inexpensive to integrate.

---

## Key Features

* Register farms with precise coordinates (stored as scaled integers) and compliance flags.
* Register products that reference farms and include batch and quantity.
* Issue two types of on-chain seals:

  * **Carbon Footprint Seal**: stores consumer destination coordinates; the UI estimates distance and a simple transport footprint per kg.
  * **Deforestation‑Free Seal**: stores verification data/certifier reference.
* Verify a product by ID (read-only) and visualize its origin on a map.
* View a Seal NFT by token ID, render its media and show normalized product facts.
* Works on **Sepolia** (default) via MetaMask; contracts are EVM-compatible.

---

## System Architecture

```
frontend/ (static)
  index.html         # UI: tabs for Trace, Farmer Portal, Consumer
  styles.css         # Styling and layout
  js/
    contracts.js     # Address + ABI configuration
    app.js           # Web3 + Leaflet logic, UI wiring
contracts/           # (Optional) solidity sources if included by your fork
```

* **Frontend**: vanilla HTML/CSS/JS. Uses Web3.js for contract calls and Leaflet + OpenStreetMap for maps.
* **Contracts**: single registry + ERC‑721 seal(s). Minimal ABI is consumed by the frontend (see below). Deploy your own or plug an existing address.

External libraries:

* Web3.js 1.8.x
* Leaflet 1.9.x (OpenStreetMap tiles)
* Font Awesome (icons)

---

## Data Model

Coordinates are stored on-chain as **integers scaled by 1e6** to avoid floating point.

### Farm (struct)

* `id`: incremental identifier
* `name`: string
* `latitude`: int32/64 (`lat * 1e6`)
* `longitude`: int32/64 (`lon * 1e6`)
* `farmer`: `address`
* `isDeforestationFree`: `bool`
* `isActive`: `bool`
* `registrationDate`: `uint` (unix seconds)

### Product (struct)

* `id`: incremental identifier
* `farmId`: `uint`
* `productName`: string
* `quantity`: `uint` (kg)
* `batchId`: string

### Seals (NFTs)

Two minting paths are exposed by the registry contract:

* `issueCarbonFootprintSeal(productId, consumerLatScaled, consumerLonScaled, tokenURI)`
* `issueDeforestationFreeSeal(productId, verificationData, tokenURI)`

`tokenURI` should point to a JSON metadata document (or, in legacy scenarios, directly to an image). Metadata MAY embed product attributes and footprint estimates for better UX.

Read-only helpers consumed by the UI:

* `farmCounter()` → `uint`
* `getFarm(id)` → `Farm`
* `getProduct(id)` → `Product`
* `tokenURI(tokenId)` → `string`

---

## Carbon Footprint Model

The UI implements a simple, transparent transport estimate used for **previewing** footprint during issuance:

* Distance is computed using the Haversine formula between farm coordinates and consumer destination.
* Default emission factor: `0.0006 kg CO2 / km / kg` (configurable in `app.js`).
* The value is **not** written on-chain by default; it can be embedded into off-chain NFT metadata.

This model is deliberately simple and intended to be replaced or complemented by more accurate supply‑chain factors.

---

## Smart Contracts

> If you use your own contracts, ensure they expose the methods above and standard ERC‑721 `tokenURI`.

Reference interface consumed by the frontend (pseudocode):

```solidity
struct Farm {
    string name;
    int64 latitude;    // scaled by 1e6
    int64 longitude;   // scaled by 1e6
    address farmer;
    bool isDeforestationFree;
    bool isActive;
    uint256 registrationDate;
}

struct Product {
    uint256 farmId;
    string productName;
    uint256 quantity;  // kg
    string batchId;
}

function registerFarm(
    string calldata name,
    int64 latScaled,
    int64 lonScaled,
    bool isDeforestationFree
) external;

function registerProduct(
    uint256 farmId,
    string calldata productName,
    uint256 quantity,
    string calldata batchId
) external;

function issueCarbonFootprintSeal(
    uint256 productId,
    int64 consumerLatScaled,
    int64 consumerLonScaled,
    string calldata tokenURI
) external returns (uint256 tokenId);

function issueDeforestationFreeSeal(
    uint256 productId,
    string calldata verificationData,
    string calldata tokenURI
) external returns (uint256 tokenId);

function getFarm(uint256 id) external view returns (Farm memory);
function getProduct(uint256 id) external view returns (Product memory);
function farmCounter() external view returns (uint256);
```

Deployment network: **Sepolia** (chainId `0xaa36a7`).

### Local Development (Hardhat)

This repo now includes Hardhat helpers for contract work:

1. `npm install`
2. `npm run compile`
3. `npm test`
4. `npm run node` in one terminal, then `npm run deploy:localhost`

Copy `.env.example` to `.env` and set your RPC URL, deployer key, and (optionally) Etherscan API key before deploying to Sepolia.

---

## Frontend

The UI is rendered through Vite + React (`src/App.jsx`) which mounts the legacy markup and hydrates it with the existing Web3/Leaflet logic from `public/legacy/app.js`. This keeps the original styles (`src/styles.css`), tab structure, and map interactions intact while enabling modern bundling.

Legacy script responsibilities remain the same:

* Handles MetaMask connection and chain switching to Sepolia.
* Renders the four portals (Trace, Farmer, Customer, Verify) plus the dashboard widgets.
* Provides map pickers, route visualisation, and modal workflows.
* Resolves NFT metadata and normalises seal information for display.

Leaflet maps load from the CDN; the script still falls back to an alternate host if the primary CDN fails.

---

## Configuration

Update `public/legacy/contracts.js` (loaded before `public/legacy/app.js`) with your deployed address and ABI:

```js
// public/legacy/contracts.js
window.EcoTraceDAO = {
  chainId: '0xaa36a7', // Sepolia
  address: '0xYourDeployedContract',
  abi: [ /* … minimal ABI for functions above … */ ]
};
```

You may also expose `window.CONTRACT_ADDRESS` and `window.CONTRACT_ABI` for backwards compatibility. `public/legacy/app.js` will use either.

---

## Running Locally

The frontend now runs on Vite + React while preserving the legacy UX.

```bash
# 1) Clone
git clone https://github.com/<org>/<repo>.git
cd <repo>

# 2) Install dependencies (frontend + Hardhat)
npm install

# 3) Start the Vite dev server
npm run dev
# Vite prints a local URL (default http://localhost:5173)

# 4) Build production assets when deploying
npm run build
```

Frontend requirements:

* Browser with MetaMask (or an injected EIP‑1193 provider)
* Sepolia ETH for test transactions

---

## Usage Guide

### 1) Connect Wallet

Click **Connect Wallet**. The app will propose chain switch/add to Sepolia.

### 2) Register a Farm

* Open **Farmer Portal** → **Register New Farm**.
* Provide a name and coordinates.

  * Use **Pick on Map** to select a point. Coordinates are autoscaled on-chain.
* Optionally mark **Deforestation‑Free Certified**.

### 3) Register a Product

* Provide `Farm ID`, `Product Name`, `Quantity (kg)`, and `Batch ID`.

### 4) Issue Seals

* **Deforestation‑Free Seal (Farmer Portal)**:

  * Enter `Product ID` and `Verification Data` (certificate or reference).
  * Provide a `tokenURI` in your contract integration (frontend uses a placeholder unless customized).
  * Submit to mint the verification NFT for your harvest.

* **Carbon Footprint Seal (Customer Portal)**:

  * Enter `Product ID`.
  * Provide consumer destination lat/lon (type, **Pick on Map**, or **Use My Location**).
  * Review the route map, distance, and coarse CO₂ estimate.
  * Submit to mint the seal NFT with your `tokenURI` (IPFS recommended) so the customer can compensate emissions.

### 5) Verify

* **Verify Product**: enter `Product ID` to view product, farm and map.
* **View Seal NFT**: enter `Token ID` to render the NFT media and normalized facts (product, batch, distance, CO₂ per kg when present in metadata).

---

## NFT Metadata / IPFS

Use IPFS (e.g., Pinata, web3.storage) and reference URIs as `ipfs://...`. The frontend converts to public gateways for display.

### Example: Carbon Footprint Seal Metadata

```json
{
  "name": "Carbon Footprint Seal — Café Arábica",
  "description": "Transport footprint preview for Lot LOTE001-2025.",
  "image": "ipfs://bafybeihash/img.png",
  "attributes": [
    { "trait_type": "type", "value": "Carbon" },
    { "trait_type": "productId", "value": 1 },
    { "trait_type": "farmName", "value": "Finca Café Verde" },
    { "trait_type": "batch", "value": "LOTE001-2025" },
    { "trait_type": "quantityKg", "value": 1000 },
    { "trait_type": "distanceKm", "value": 4032.5 },
    { "trait_type": "co2PerKg", "value": 2.42 },
    { "trait_type": "valid", "value": true },
    { "trait_type": "issuedTs", "value": 1757893200 }
  ]
}
```

### Example: Deforestation‑Free Seal Metadata

```json
{
  "name": "Deforestation‑Free Seal — Café Arábica",
  "description": "EUDR-aligned self-declaration with third-party verification.",
  "image": "ipfs://bafybeihash/df.png",
  "attributes": [
    { "trait_type": "type", "value": "Deforestation‑Free" },
    { "trait_type": "productId", "value": 1 },
    { "trait_type": "certificateId", "value": "EU-EUDR-CERT-2025-001" },
    { "trait_type": "regulation", "value": "EUDR" },
    { "trait_type": "valid", "value": true },
    { "trait_type": "issuedTs", "value": 1757893200 }
  ]
}
```

Metadata tips:

* Provide `productId` to let the UI resolve on-chain product and farm details.
* Use `image` or `image_url` fields; both are supported. IPFS URIs are preferred.
* Include domain‑specific traits you want the UI or external marketplaces to surface.

---

## Security and Privacy

* **Ownership & Authorization**: contracts should restrict registration/minting according to your governance model (e.g., only farmer, DAO roles, or allowlists). The reference UI assumes caller has rights.
* **Coordinates**: location data is sensitive. Consider rounding or redacting if needed.
* **Immutability**: once minted, NFTs are portable. Avoid putting confidential data in metadata.
* **DoS & Validation**: validate coordinates and inputs on-chain; reject empty names and out‑of‑range values.

---

## Limitations

* The footprint model is a coarse transport estimate and should not be used for official accounting without calibration.
* The UI depends on public map tiles (rate limits may apply). Host your own tile server for production.
* No subgraph/indexer is used; reads are direct and may be slow on large datasets.

---

## Roadmap

* Multiple transport legs and mode‑specific emission factors.
* Optional off‑chain attestations and verifier signatures.
* Batch operations and pagination for large registries.
* ENS/Sign‑in With Ethereum for roles and delegation.
* Subgraph integration for faster queries and analytics.

---

## Contributing

Pull requests are welcome. Refer to the [Repository Guidelines](AGENTS.md) for contributor expectations and workflow details.

Please:

1. Open an issue describing the change.
2. Keep PRs focused and add tests where applicable.
3. Follow existing code style; avoid adding heavy dependencies.

---

## License

AGPL-3.0 License. See `LICENSE` for details.

---

## Acknowledgements

* OpenStreetMap contributors
* Leaflet
* Web3.js
* The broader EVM/OSS community enabling open registries
