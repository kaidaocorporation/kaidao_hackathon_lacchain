# Repository Guidelines

## Project Structure & Module Organization
EcoTraceDAO now ships through Vite + React. `index.html` (Vite entry) bootstraps `src/App.jsx`, which renders the legacy layout and loads the Web3/Leaflet logic from `public/legacy/app.js`. Styling lives in `src/styles.css`; contract metadata for the UI sits in `public/legacy/contracts.js`. Solidity sources stay in `contracts/` (`EcoTrace.sol`), with Hardhat helpers in `scripts/` and `test/`. Keep behaviour docs synced between this guide and the `README.md`.

## Build, Test, and Development Commands
Run `npm install` once, then `npm run dev` to start the Vite server (defaults to `http://localhost:5173`) and `npm run build` for production assets. Use `npm run preview` to sanity-check the build output. Hardhat tooling lives in the same workspace: `npm run compile`, `npm test`, `npm run node`, and `npm run deploy:localhost` remain the canonical commands. Regenerate ABIs as needed and keep `public/legacy/contracts.js` aligned with deployments.

## Coding Style & Naming Conventions
Use 2-space indentation for HTML/JS/CSS and 4-space indentation in Solidity. Prefer descriptive camelCase for JavaScript variables/functions and PascalCase for Solidity contracts/structs. Keep CSS class names lower-kebab-case. Run your editor's Prettier defaults for web assets and the Solidity extension formatter for contracts. Store environment constants (e.g. `SEPOLIA_CHAIN_ID`) in UPPER_SNAKE_CASE.

## Testing Guidelines
Hardhat backs the contract suite. After `npm install`, run `npm test` to execute specs in `test/`, and recompile with `npm run compile` before pushing so ABIs stay aligned with `public/legacy/contracts.js`. For end-to-end checks, pair `npm run node` with `npm run deploy:localhost` and point the frontend to the returned address. Always smoke test the UI (farm → product → both seals) and document the exact commands in your PR for reproducibility.

## Commit & Pull Request Guidelines
Use the Conventional Commit prefixes already in history (`feat:`, `fix:`, `docs:`) and keep each change focused. PRs need a concise summary, testing proof (commands or manual steps), linked issues, and UI captures when behaviour shifts. Request a reviewer before merging and clear lint or formatting feedback quickly.

## Security & Configuration Tips
Never commit private keys, RPC URLs, or .env secrets—use wallet-injected providers during development. Load local config from `.env` (see `.env.example`) and keep it out of version control. Confirm admin functions remain gated by `Ownable` modifiers and avoid leaking privileged addresses in sample configs. Prefer IPFS URIs for NFT metadata and redact precise farm coordinates when working with public demos.
