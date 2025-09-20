# Repository Guidelines

## Project Structure & Module Organization
EcoTraceDAO is a static frontend. `index.html` composes the views, `styles.css` handles layout, and `js/app.js` manages Web3 flows, mapping, and dashboard widgets. Contract addresses and ABIs belong in `js/contracts.js`. Solidity sources live in `contracts/` (`EcoTrace.sol`), with Hardhat helpers in `scripts/` and `test/`. Track behaviour changes in this guide and the `README.md`.

## Build, Test, and Development Commands
Serve the UI directly—`python3 -m http.server 8000` or `npx http-server -p 8000` both work. Install contract tooling with `npm install`, compile via `npm run compile`, test with `npm test`, run a dev chain using `npm run node`, and deploy locally through `npm run deploy:localhost` (update `scripts/deploy.js` if you customise parameters). Regenerate ABIs as needed and keep `js/contracts.js` in sync.

## Coding Style & Naming Conventions
Use 2-space indentation for HTML/JS/CSS and 4-space indentation in Solidity. Prefer descriptive camelCase for JavaScript variables/functions and PascalCase for Solidity contracts/structs. Keep CSS class names lower-kebab-case. Run your editor's Prettier defaults for web assets and the Solidity extension formatter for contracts. Store environment constants (e.g. `SEPOLIA_CHAIN_ID`) in UPPER_SNAKE_CASE.

## Testing Guidelines
Hardhat backs the contract suite. After `npm install`, run `npm test` to execute specs in `test/`, and recompile with `npm run compile` before pushing so ABIs stay aligned with `js/contracts.js`. For end-to-end checks, pair `npm run node` with `npm run deploy:localhost` and point the frontend to the returned address. Always smoke test the UI (farm → product → both seals) and document the exact commands in your PR for reproducibility.

## Commit & Pull Request Guidelines
Use the Conventional Commit prefixes already in history (`feat:`, `fix:`, `docs:`) and keep each change focused. PRs need a concise summary, testing proof (commands or manual steps), linked issues, and UI captures when behaviour shifts. Request a reviewer before merging and clear lint or formatting feedback quickly.

## Security & Configuration Tips
Never commit private keys, RPC URLs, or .env secrets—use wallet-injected providers during development. Load local config from `.env` (see `.env.example`) and keep it out of version control. Confirm admin functions remain gated by `Ownable` modifiers and avoid leaking privileged addresses in sample configs. Prefer IPFS URIs for NFT metadata and redact precise farm coordinates when working with public demos.
