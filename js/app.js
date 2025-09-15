// js/app.js
// UI + Web3 glue code for EcoTraceDAO
(() => {
    'use strict';
  
    let web3;
    let contract;
    let currentAccount;
    let provider; // keep the chosen injected provider reference
  
    // Shortcuts
    const $  = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  
    // ---------- UI Helpers ----------
    function setConnectedUI(connected) {
      const btn = $('#connectBtn');
      if (!btn) return;
      if (connected) {
        btn.innerHTML = '<i class="fas fa-check"></i> Connected';
        btn.classList.add('connected');
      } else {
        btn.innerHTML = '<i class="fas fa-wallet"></i> Connect Wallet';
        btn.classList.remove('connected');
      }
    }
  
    function showToast(message, type = 'success') {
      const toast = $('#toast');
      const msg = $('#toastMessage');
      if (!toast || !msg) {
        // Minimal fallback if toast DOM is missing
        console[type === 'error' ? 'error' : 'log'](message);
        return;
      }
      msg.textContent = message;
      toast.className = `toast ${type} show`;
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  
    function wireTabs() {
      $$('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          $$('.tab-btn').forEach((b) => b.classList.remove('active'));
          $$('.tab-content').forEach((c) => c.classList.add('hidden'));
          btn.classList.add('active');
          const id = btn.getAttribute('data-tab') + '-tab';
          const el = document.getElementById(id);
          if (el) el.classList.remove('hidden');
        });
      });
    }
  
    // ---------- Provider selection ----------
    // Prefer MetaMask when multiple providers are injected (e.g., TronLink also present)
    function getInjectedProvider() {
      const eth = window.ethereum;
      if (!eth) return null;
  
      // EIP-1193 multi-provider pattern
      if (Array.isArray(eth.providers) && eth.providers.length) {
        const metamask = eth.providers.find((p) => p && p.isMetaMask);
        return metamask || eth.providers[0];
      }
      return eth;
    }
  
    // ---------- Web3 ----------
    async function initWeb3() {
      provider = getInjectedProvider();
      if (!provider) {
        showToast('Please install MetaMask!', 'error');
        return;
      }
  
      // Bind Web3 to the selected provider (avoid accidental TronLink/TON usage)
      web3 = new Web3(provider);
  
      try {
        // Request accounts from the chosen provider
        await provider.request({ method: 'eth_requestAccounts' });
        const accounts = await web3.eth.getAccounts();
        currentAccount = accounts[0];
  
        // Resolve contract config (prefer window.EcoTraceDAO, then legacy globals)
        const cfg = (typeof window !== 'undefined' && window.EcoTraceDAO) ? window.EcoTraceDAO : {};
        const ADDRESS =
          cfg.address ??
          (typeof window !== 'undefined' && window.CONTRACT_ADDRESS ? window.CONTRACT_ADDRESS : null) ??
          (typeof CONTRACT_ADDRESS !== 'undefined' ? CONTRACT_ADDRESS : null);
  
        const ABI =
          cfg.abi ??
          (typeof window !== 'undefined' && window.CONTRACT_ABI ? window.CONTRACT_ABI : null) ??
          (typeof CONTRACT_ABI !== 'undefined' ? CONTRACT_ABI : null);
  
        if (!ADDRESS) {
          console.error('Missing CONTRACT_ADDRESS. Provide via window.EcoTraceDAO.address or CONTRACT_ADDRESS.');
          showToast('Missing contract address.', 'error');
          return;
        }
        if (!Array.isArray(ABI) || ABI.length === 0) {
          console.error('Missing CONTRACT_ABI. Provide via window.EcoTraceDAO.abi or CONTRACT_ABI.');
          showToast('Missing contract ABI.', 'error');
          return;
        }
  
        // Create contract instance
        contract = new web3.eth.Contract(ABI, ADDRESS);
  
        // Log chain for debugging wrong-network issues
        try {
          const chainId = await provider.request({ method: 'eth_chainId' });
          console.log('Connected chainId:', chainId, 'Contract:', ADDRESS);
        } catch (_) {}
  
        setConnectedUI(true);
        showToast('Wallet connected successfully!');
  
        // Rewire listeners to the selected provider
        try {
          provider.removeListener?.('accountsChanged', onAccountsChanged);
          provider.removeListener?.('chainChanged', onChainChanged);
        } catch (_) {}
        provider.on('accountsChanged', onAccountsChanged);
        provider.on('chainChanged', onChainChanged);
      } catch (error) {
        console.error('initWeb3 error:', error);
        showToast(`Failed to connect wallet: ${error?.message || 'Unknown error'}`, 'error');
      }
    }
  
    function onAccountsChanged(accounts) {
      currentAccount = accounts && accounts[0] ? accounts[0] : undefined;
      if (currentAccount) {
        setConnectedUI(true);
        showToast('Account changed');
      } else {
        setConnectedUI(false);
        showToast('Wallet disconnected', 'error');
      }
    }
  
    function onChainChanged(_) {
      // Full reload to keep provider/contract state in sync with chain
      window.location.reload();
    }
  
    function ensureReady() {
      if (!contract || !currentAccount) {
        showToast('Please connect your wallet first', 'error');
        return false;
      }
      return true;
    }
  
    // Scale decimal degrees to int (contract expects int256).
    // Using Math.round handles negative coordinates correctly.
    function scaleCoord(value) {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return NaN;
      return Math.round(num * 1_000_000);
    }
  
    // Load farmer's farms (for multiple farms support)
    async function loadFarmerFarms() {
      if (!ensureReady()) return;
  
      try {
        const farmIds = await contract.methods.getFarmerFarms(currentAccount).call();
        const farmSelect = $('#productFarmId');
  
        // Populate only if it's a <select>; if it's an <input>, skip rendering options
        if (farmSelect && farmSelect.tagName.toLowerCase() === 'select') {
          farmSelect.innerHTML = '<option value="">Select a farm...</option>';
          for (const farmId of farmIds) {
            const farm = await contract.methods.getFarm(farmId).call();
            const option = document.createElement('option');
            option.value = farmId;
            option.textContent = `${farm.name} (ID: ${farmId})`;
            farmSelect.appendChild(option);
          }
        }
  
        showToast(`Loaded ${farmIds.length} farms successfully!`);
      } catch (error) {
        console.error(error);
        showToast('Failed to load farms', 'error');
      }
    }
  
    // ---------- Forms & Actions ----------
    function wireForms() {
      // Connect wallet button
      const connectBtn = $('#connectBtn');
      if (connectBtn) connectBtn.addEventListener('click', initWeb3);
  
      // Load farms button (if exists)
      const loadFarmsBtn = $('#loadFarmsBtn');
      if (loadFarmsBtn) loadFarmsBtn.addEventListener('click', loadFarmerFarms);
  
      // Register Farm
      const farmForm = $('#farmForm');
      if (farmForm) {
        farmForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!ensureReady()) return;
  
          const name = $('#farmName').value.trim();
          const lat = scaleCoord($('#farmLat').value);
          const lon = scaleCoord($('#farmLon').value);
          const defoFree = $('#deforestationFree').checked;
  
          if (!name) return showToast('Farm name is required', 'error');
          if (Number.isNaN(lat) || Number.isNaN(lon)) {
            return showToast('Latitude/Longitude must be valid numbers', 'error');
          }
  
          try {
            await contract.methods
              .registerFarm(name, lat, lon, defoFree)
              .send({ from: currentAccount });
            showToast('Farm registered successfully!');
            e.target.reset();
  
            // Reload farms after registration (if select exists)
            setTimeout(() => loadFarmerFarms(), 1500);
          } catch (error) {
            console.error(error);
            showToast(
              `Failed to register farm: ${error?.data?.message || error?.message || 'Transaction failed'}`,
              'error'
            );
          }
        });
      }
  
      // Register Product
      const productForm = $('#productForm');
      if (productForm) {
        productForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!ensureReady()) return;
  
          const farmId = $('#productFarmId').value;
          const name = $('#productName').value.trim();
          const quantity = $('#productQuantity').value;
          const batch = $('#productBatch').value.trim();
  
          if (!farmId) return showToast('Please select a farm first', 'error');
          if (!name || !quantity || !batch) {
            return showToast('All product fields are required', 'error');
          }
  
          try {
            await contract.methods
              .registerProduct(farmId, name, quantity, batch)
              .send({ from: currentAccount });
            showToast('Product registered successfully!');
            e.target.reset();
          } catch (error) {
            console.error(error);
            showToast(
              `Failed to register product: ${error?.data?.message || error?.message || 'Transaction failed'}`,
              'error'
            );
          }
        });
      }
  
      // Issue Carbon Seal
      const carbonForm = $('#carbonForm');
      if (carbonForm) {
        carbonForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!ensureReady()) return;
  
          const productId = $('#carbonProductId').value;
          const consumerLat = scaleCoord($('#consumerLat').value);
          const consumerLon = scaleCoord($('#consumerLon').value);
          const tokenURI = 'https://ipfs.io/ipfs/QmExample';
  
          if (!productId) return showToast('Product ID is required', 'error');
          if (Number.isNaN(consumerLat) || Number.isNaN(consumerLon)) {
            return showToast('Consumer coordinates must be valid numbers', 'error');
          }
  
          try {
            await contract.methods
              .issueCarbonFootprintSeal(productId, consumerLat, consumerLon, tokenURI)
              .send({ from: currentAccount });
            showToast('Carbon footprint seal issued!');
            e.target.reset();
          } catch (error) {
            console.error(error);
            showToast(
              `Failed to issue carbon seal: ${error?.data?.message || error?.message || 'Transaction failed'}`,
              'error'
            );
          }
        });
      }
  
      // Issue Deforestation-Free Seal
      const defoForm = $('#deforestationForm');
      if (defoForm) {
        defoForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (!ensureReady()) return;
  
          const productId = $('#defoProductId').value;
          const verificationData = $('#verificationData').value.trim();
          const tokenURI = 'https://ipfs.io/ipfs/QmExample2';
  
          if (!productId || !verificationData) {
            return showToast('Product ID and verification data are required', 'error');
          }
  
          try {
            await contract.methods
              .issueDeforestationFreeSeal(productId, verificationData, tokenURI)
              .send({ from: currentAccount });
            showToast('Deforestation-free seal issued!');
            e.target.reset();
          } catch (error) {
            console.error(error);
            showToast(
              `Failed to issue deforestation seal: ${error?.data?.message || error?.message || 'Transaction failed'}`,
              'error'
            );
          }
        });
      }
  
      // Verify Product
      const verifyBtn = $('#verifyBtn');
      if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
          const productId = $('#verifyProductId').value;
          if (!productId) return showToast('Please enter a product ID', 'error');
          if (!ensureReady()) return;
  
          try {
            const product = await contract.methods.getProduct(productId).call();
            const farm = await contract.methods.getFarm(product.farmId).call();
  
            $('#verificationDetails').innerHTML = `
              <p><strong>Product:</strong> ${product.productName}</p>
              <p><strong>Farm:</strong> ${farm.name}</p>
              <p><strong>Farmer:</strong> ${farm.farmer}</p>
              <p><strong>Batch:</strong> ${product.batchId}</p>
              <p><strong>Quantity:</strong> ${product.quantity} kg</p>
              <p><strong>Deforestation-Free:</strong> ${farm.isDeforestationFree ? 'Yes' : 'No'}</p>
            `;
            $('#verificationResult').classList.remove('hidden');
            showToast('Product verified successfully!');
          } catch (error) {
            console.error(error);
            showToast('Product not found or error occurred', 'error');
            $('#verificationResult').classList.add('hidden');
          }
        });
      }
    }
  
    // ---------- Boot ----------
    document.addEventListener('DOMContentLoaded', () => {
      wireTabs();
      wireForms();
    });
  })();
  