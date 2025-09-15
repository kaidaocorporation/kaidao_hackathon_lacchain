// js/app.js
// UI + Web3 glue code for EcoTraceDAO
(() => {
    'use strict';
  
    let web3;
    let contract;
    let currentAccount;
    let provider; // selected EIP-1193 provider
  
    // ---------- DOM helpers ----------
    const $  = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  
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
    // Prefer MetaMask if multiple providers are injected (EIP-1193 multi-provider)
    function getInjectedProvider() {
      const eth = window.ethereum;
      if (!eth) return null;
      if (Array.isArray(eth.providers) && eth.providers.length) {
        const metamask = eth.providers.find((p) => p && p.isMetaMask);
        return metamask || eth.providers[0];
      }
      return eth;
    }
  
    // ---------- Web3 boot ----------
    async function initWeb3() {
      provider = getInjectedProvider();
      if (!provider) {
        showToast('Please install MetaMask!', 'error');
        return;
      }
  
      web3 = new Web3(provider);
  
      try {
        await provider.request({ method: 'eth_requestAccounts' });
        const accounts = await web3.eth.getAccounts();
        currentAccount = accounts[0];
  
        // Resolve contract config (window.EcoTraceDAO has priority)
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
  
        contract = new web3.eth.Contract(ABI, ADDRESS);
  
        try {
          const chainId = await provider.request({ method: 'eth_chainId' });
          console.log('Connected chainId:', chainId, 'Contract:', ADDRESS);
        } catch (_) {}
  
        setConnectedUI(true);
        showToast('Wallet connected successfully!');
  
        // Reattach listeners to the chosen provider
        try {
          provider.removeListener?.('accountsChanged', onAccountsChanged);
          provider.removeListener?.('chainChanged', onChainChanged);
        } catch (_) {}
        provider.on('accountsChanged', onAccountsChanged);
        provider.on('chainChanged', onChainChanged);
  
        // Prime homepage farms list + (optional) keep previous tokenId view
        refreshFarmsList().catch((e) => console.warn('refreshFarmsList error:', e));
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
        refreshFarmsList().catch(() => {});
      } else {
        setConnectedUI(false);
        showToast('Wallet disconnected', 'error');
      }
    }
  
    function onChainChanged(_) {
      // Full reload keeps provider/contract state aligned with chain
      window.location.reload();
    }
  
    // Forms require both contract and an account (for sending tx)
    function ensureReady() {
      if (!contract || !currentAccount) {
        showToast('Please connect your wallet first', 'error');
        return false;
      }
      return true;
    }
  
    // Read-only operations only need contract
    function ensureContract() {
      if (!contract) {
        showToast('Connect wallet to load on-chain data', 'error');
        return false;
      }
      return true;
    }
  
    // ---------- Utils ----------
    // Contract stores coords as int256 scaled by 1e6
    function toDegrees(intScaled) {
      const n = Number(intScaled);
      if (!Number.isFinite(n)) return null;
      return n / 1_000_000;
    }
  
    function scaleCoord(value) {
      const num = parseFloat(value);
      if (Number.isNaN(num)) return NaN;
      return Math.round(num * 1_000_000);
    }
  
    function shorten(addr) {
      if (!addr || addr === '0x0000000000000000000000000000000000000000') return '—';
      return addr.slice(0, 6) + '…' + addr.slice(-4);
    }
  
    function fmtDate(ts) {
      const ms = Number(ts) * 1000;
      if (!Number.isFinite(ms)) return '—';
      return new Date(ms).toLocaleDateString();
    }
  
    // Basic XSS-safe text injection
    function escapeHTML(str) {
      return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }
  
    // IPFS helpers
    function ipfsToHttp(uri) {
      if (!uri) return null;
      if (uri.startsWith('ipfs://')) {
        return 'https://ipfs.io/ipfs/' + uri.replace('ipfs://', '');
      }
      return uri;
    }
  
    // ---------- Homepage: list farms ----------
    async function refreshFarmsList() {
      const grid = $('#farmsList');
      const empty = $('#farmsEmpty');
      if (!grid) return;
  
      grid.innerHTML = '';
      empty.classList.add('hidden');
  
      if (!contract) {
        empty.textContent = 'Connect your wallet to load farms.';
        empty.classList.remove('hidden');
        return;
      }
  
      try {
        const total = Number(await contract.methods.farmCounter().call());
        if (!Number.isFinite(total) || total <= 0) {
          empty.textContent = 'No farms found.';
          empty.classList.remove('hidden');
          return;
        }
  
        const ids = Array.from({ length: total }, (_, i) => i + 1);
        const batch = 20; // throttle concurrency
        for (let i = 0; i < ids.length; i += batch) {
          const slice = ids.slice(i, i + batch);
          const farms = await Promise.all(
            slice.map(async (id) => {
              try {
                const f = await contract.methods.getFarm(id).call();
                return { id, ...f };
              } catch {
                return null;
              }
            })
          );
  
          farms
            .filter(Boolean)
            .filter((f) => f.isActive && f.name && f.name.trim().length > 0)
            .forEach((f) => grid.appendChild(renderFarmCard(f)));
        }
  
        if (!grid.children.length) {
          empty.textContent = 'No farms found.';
          empty.classList.remove('hidden');
        }
      } catch (err) {
        console.error('refreshFarmsList error:', err);
        empty.textContent = 'Failed to load farms.';
        empty.classList.remove('hidden');
        showToast('Failed to load farms', 'error');
      }
    }
  
    function renderFarmCard(farm) {
      const lat = toDegrees(farm.latitude);
      const lon = toDegrees(farm.longitude);
  
      const card = document.createElement('div');
      card.className = 'seal-card';
      card.style.borderColor = farm.isDeforestationFree ? '#10b981' : '#e5e7eb';
  
      card.innerHTML = `
        <div class="seal-header">
          <h3>Farm #${farm.id}: ${escapeHTML(farm.name)}</h3>
          <div class="seal-icon ${farm.isDeforestationFree ? 'carbon' : 'deforestation'}">
            <i class="${farm.isDeforestationFree ? 'fas fa-shield-alt' : 'fas fa-exclamation-triangle'}"></i>
          </div>
        </div>
        <div class="seal-value ${farm.isDeforestationFree ? 'carbon' : 'deforestation'}" style="font-size:20px;">
          ${farm.isDeforestationFree ? 'Deforestation-Free' : 'Standard'}
        </div>
        <div class="seal-label">Registered: ${fmtDate(farm.registrationDate)}</div>
        <div class="seal-details">
          Farmer: <strong>${shorten(farm.farmer)}</strong><br/>
          Location: <strong>${lat?.toFixed(6) ?? '—'}, ${lon?.toFixed(6) ?? '—'}</strong><br/>
          Active: <strong>${farm.isActive ? 'Yes' : 'No'}</strong>
        </div>
        <div class="seal-badge ${farm.isDeforestationFree ? '' : 'deforestation'}">
          ${farm.isDeforestationFree ? '<i class="fas fa-check"></i> Verified' : 'No EUDR badge'}
        </div>
      `;
      return card;
    }
  
    // ---------- Farmer area helpers ----------
    async function loadFarmerFarms() {
      if (!ensureReady()) return;
  
      try {
        const farmIds = await contract.methods.getFarmerFarms(currentAccount).call();
        const farmSelect = $('#productFarmId');
        if (farmSelect && farmSelect.tagName.toLowerCase() === 'select') {
          farmSelect.innerHTML = '<option value="">Select a farm...</option>';
          for (const farmId of farmIds) {
            const farm = await contract.methods.getFarm(farmId).call();
            const opt = document.createElement('option');
            opt.value = farmId;
            opt.textContent = `${farm.name} (ID: ${farmId})`;
            farmSelect.appendChild(opt);
          }
        }
        showToast(`Loaded ${farmIds.length} farms successfully!`);
      } catch (error) {
        console.error(error);
        showToast('Failed to load farms', 'error');
      }
    }
  
    // ---------- Seal NFT viewer ----------
    async function viewSealNFT() {
      if (!ensureContract()) return;
  
      const tokenId = $('#sealTokenId')?.value;
      if (!tokenId) {
        showToast('Enter a token ID', 'error');
        return;
      }
  
      const box   = $('#sealBox');
      const meta  = $('#sealMeta');
      const img   = $('#sealImage');
      const note  = $('#sealNote');
  
      try {
        // Read on-chain seal struct
        const seal = await contract.methods.getSeal(tokenId).call();
  
        // Try to resolve tokenURI (if implemented)
        let uri = null;
        try {
          uri = await contract.methods.tokenURI(tokenId).call();
        } catch (_) {
          // tokenURI may not exist for some contracts; ignore
        }
  
        // Compose metadata text
        meta.innerHTML = `
          <p><strong>Token ID:</strong> ${tokenId}</p>
          <p><strong>Product ID:</strong> ${seal.productId}</p>
          <p><strong>Type:</strong> ${Number(seal.sealType) === 0 ? 'Carbon Footprint' : 'Deforestation-Free'}</p>
          <p><strong>Carbon Footprint:</strong> ${seal.carbonFootprint} (raw units)</p>
          <p><strong>Valid:</strong> ${seal.isValid ? 'Yes' : 'No'}</p>
          <p><strong>Issued:</strong> ${fmtDate(seal.issuanceDate)}</p>
          <p><strong>Verification:</strong> ${escapeHTML(seal.verificationData || '—')}</p>
        `;
  
        // Attempt to display image:
        // - If tokenURI points to a JSON metadata, fetch and read image field.
        // - If tokenURI already points to an image (e.g., ipfs PNG), show directly.
        let displaySrc = null;
        let displayMsg = '';
  
        if (uri) {
          const httpURI = ipfsToHttp(uri);
          try {
            const res = await fetch(httpURI, { mode: 'cors' });
            const contentType = res.headers.get('content-type') || '';
  
            if (contentType.includes('application/json')) {
              const json = await res.json();
              const imgField = json.image || json.image_url || json.imageURI;
              if (imgField) {
                displaySrc = ipfsToHttp(imgField);
                displayMsg = 'Loaded from metadata image field.';
              } else {
                displaySrc = null;
                displayMsg = 'No image field in metadata.';
              }
            } else if (contentType.startsWith('image/')) {
              // Direct image hosted at tokenURI
              displaySrc = httpURI;
              displayMsg = 'tokenURI is a direct image.';
            } else {
              // Unknown, still try to show if it’s a common image extension
              if (/\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(httpURI)) {
                displaySrc = httpURI;
                displayMsg = 'tokenURI appears to be an image link.';
              } else {
                displayMsg = 'tokenURI does not point to an image.';
              }
            }
          } catch (e) {
            console.warn('Fetching tokenURI failed:', e);
            displayMsg = 'Could not fetch tokenURI (CORS or gateway issue).';
          }
        } else {
          displayMsg = 'tokenURI() not available on contract.';
        }
  
        if (displaySrc) {
          img.src = displaySrc;
          img.classList.remove('hidden');
        } else {
          img.removeAttribute('src');
          img.classList.add('hidden');
        }
  
        note.textContent = displayMsg + (uri ? ` (${uri})` : '');
        box.classList.remove('hidden');
        showToast('Seal loaded.');
      } catch (err) {
        console.error('viewSealNFT error:', err);
        showToast('Failed to load seal', 'error');
        $('#sealBox')?.classList.add('hidden');
      }
    }
  
    // ---------- Forms & actions ----------
    function wireForms() {
      // Connect wallet
      $('#connectBtn')?.addEventListener('click', initWeb3);
  
      // Homepage farms refresh
      $('#refreshFarmsBtn')?.addEventListener('click', () => {
        if (!contract) return showToast('Connect wallet first', 'error');
        refreshFarmsList();
      });
  
      // Load farms button (optional)
      $('#loadFarmsBtn')?.addEventListener('click', loadFarmerFarms);
  
      // Register Farm
      $('#farmForm')?.addEventListener('submit', async (e) => {
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
          await contract.methods.registerFarm(name, lat, lon, defoFree).send({ from: currentAccount });
          showToast('Farm registered successfully!');
          e.target.reset();
          setTimeout(() => refreshFarmsList(), 1200);
        } catch (error) {
          console.error(error);
          showToast(
            `Failed to register farm: ${error?.data?.message || error?.message || 'Transaction failed'}`,
            'error'
          );
        }
      });
  
      // Register Product
      $('#productForm')?.addEventListener('submit', async (e) => {
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
          await contract.methods.registerProduct(farmId, name, quantity, batch).send({ from: currentAccount });
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
  
      // Issue Carbon Seal
      $('#carbonForm')?.addEventListener('submit', async (e) => {
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
  
      // Issue Deforestation-Free Seal
      $('#deforestationForm')?.addEventListener('submit', async (e) => {
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
  
      // Verify Product (by productId)
      $('#verifyBtn')?.addEventListener('click', async () => {
        const productId = $('#verifyProductId').value;
        if (!productId) return showToast('Please enter a product ID', 'error');
        if (!ensureContract()) return;
  
        try {
          const product = await contract.methods.getProduct(productId).call();
          const farm = await contract.methods.getFarm(product.farmId).call();
  
          $('#verificationDetails').innerHTML = `
            <p><strong>Product:</strong> ${escapeHTML(product.productName)}</p>
            <p><strong>Farm:</strong> ${escapeHTML(farm.name)}</p>
            <p><strong>Farmer:</strong> ${shorten(farm.farmer)}</p>
            <p><strong>Batch:</strong> ${escapeHTML(product.batchId)}</p>
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
  
      // View Seal NFT (by tokenId)
      $('#viewSealBtn')?.addEventListener('click', viewSealNFT);
    }
  
    // ---------- Boot ----------
    document.addEventListener('DOMContentLoaded', () => {
      wireTabs();
      wireForms();
      // Note: farms list is populated after wallet connection (to ensure proper provider/chain).
    });
  })();
  