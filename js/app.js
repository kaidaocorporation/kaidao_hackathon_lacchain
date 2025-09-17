// app.js
// Core UI + Web3 + Leaflet logic (migrated from inline <script>)

(function () {
  'use strict';

  // ---- Leaflet fallback if primary CDN failed ----
  function ensureLeafletLoaded(cb) {
    if (typeof L !== 'undefined') return cb();
    // inject fallback scripts/styles
    const altJs = document.createElement('script');
    altJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    const altCss = document.createElement('link');
    altCss.rel = 'stylesheet';
    altCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    let loaded = false;
    altJs.onload = () => { if (!loaded) { loaded = true; cb(); } };
    document.head.appendChild(altCss);
    document.head.appendChild(altJs);
  }

  // ---- State ----
  let web3, contract, currentAccount, provider;
  let farmsMap, journeyMap, modalMapInstance, farmPreviewMap, productVerifyMapInstance;
  let selectedLocation = null;
  let farmMarkers = [];

  const DEFAULT_CENTER = [4.570868, -74.297333]; // Colombia

  // Icons
  const farmIcon = () => L.divIcon({
    html: '<div style="background:#10b981;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-tractor" style="font-size:14px;"></i></div>',
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });

  const standardFarmIcon = () => L.divIcon({
    html: '<div style="background:#f59e0b;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-tractor" style="font-size:14px;"></i></div>',
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });

  const consumerIcon = () => L.divIcon({
    html: '<div style="background:#f97316;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-shopping-cart" style="font-size:14px;"></i></div>',
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });

  // DOM helpers
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

  async function ensureSepoliaNetwork(provider) {
    const desired = (window.EcoTraceDAO && window.EcoTraceDAO.chainId) || '0xaa36a7'; // Sepolia
    const current = await provider.request({ method: 'eth_chainId' });
    if (current === desired) return;
  
    try {
      // Try to switch
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: desired }],
      });
    } catch (switchErr) {
      // If chain not added, add it
      if (switchErr.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: desired,
              chainName: 'Sepolia',
              nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } catch (addErr) {
          throw addErr;
        }
      } else {
        throw switchErr;
      }
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

  // Utils
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
  function escapeHTML(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // Web3
  function getInjectedProvider() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (Array.isArray(eth.providers) && eth.providers.length) {
      const metamask = eth.providers.find((p) => p && p.isMetaMask);
      return metamask || eth.providers[0];
    }
    return eth;
  }

  async function initWeb3() {
    // helper: enforce Sepolia (11155111 / 0xaa36a7)
    async function ensureSepoliaNetwork(provider) {
      const desired = (window.EcoTraceDAO && window.EcoTraceDAO.chainId) || '0xaa36a7'; // Sepolia
      const current = await provider.request({ method: 'eth_chainId' });
      if (current === desired) return;
  
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: desired }],
        });
      } catch (err) {
        // 4902 => chain not added yet
        if (err && err.code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: desired,
              chainName: 'Sepolia',
              nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://rpc.sepolia.org'],
              blockExplorerUrls: ['https://sepolia.etherscan.io'],
            }],
          });
        } else {
          throw err;
        }
      }
    }
  
    provider = getInjectedProvider();
    if (!provider) {
      showToast('Please install MetaMask!', 'error');
      return;
    }
  
    web3 = new Web3(provider);
  
    try {
      // 1) Force Sepolia before requesting accounts
      await ensureSepoliaNetwork(provider);
  
      // 2) Request accounts
      await provider.request({ method: 'eth_requestAccounts' });
      const accounts = await web3.eth.getAccounts();
      currentAccount = accounts[0];
  
      // 3) Load contract config (expects contracts.js to set window.EcoTraceDAO)
      const cfg = (typeof window !== 'undefined' && window.EcoTraceDAO) ? window.EcoTraceDAO : {};
      const ADDRESS = cfg.address ?? window.CONTRACT_ADDRESS;
      const ABI = cfg.abi ?? window.CONTRACT_ABI;
  
      if (!ADDRESS || !ABI) {
        showToast('Missing contract configuration', 'error');
        return;
      }
  
      // 4) Instantiate contract
      contract = new web3.eth.Contract(ABI, ADDRESS);
  
      // 5) UI + listeners
      setConnectedUI(true);
      showToast('Wallet connected successfully!');
  
      provider.on('accountsChanged', onAccountsChanged);
      provider.on('chainChanged', onChainChanged);
  
      // 6) Initial data load
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
  function onChainChanged(_) { window.location.reload(); }
  function ensureReady() {
    if (!contract || !currentAccount) {
      showToast('Please connect your wallet first', 'error');
      return false;
    }
    return true;
  }
  function ensureContract() {
    if (!contract) {
      showToast('Connect wallet to load on-chain data', 'error');
      return false;
    }
    return true;
  }

  // Maps
  function initMaps() {
    if ($('#farmsMap') && !farmsMap) {
      farmsMap = L.map('farmsMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(farmsMap);
    }

    if ($('#journeyMap') && !journeyMap) {
      journeyMap = L.map('journeyMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(journeyMap);

      const farmLocation = [4.596, -74.081];         // Bogotá
      const consumerLocation = [25.7617, -80.1918];  // Miami

      L.marker(farmLocation, { icon: farmIcon() }).addTo(journeyMap)
        .bindPopup('<strong>Farm Origin</strong><br>Finca Café Verde<br>Bogotá, Colombia');

      L.marker(consumerLocation, { icon: consumerIcon() }).addTo(journeyMap)
        .bindPopup('<strong>Destination</strong><br>Miami, FL, USA');

      const routeLine = L.polyline([farmLocation, consumerLocation], {
        color: '#3b82f6', weight: 3, opacity: 0.7, dashArray: '10, 10'
      }).addTo(journeyMap);

      journeyMap.fitBounds(routeLine.getBounds().pad(0.1));
    }
  }

  function updateFarmsOnMap(farms) {
    if (!farmsMap) return;
    farmMarkers.forEach(marker => farmsMap.removeLayer(marker));
    farmMarkers = [];

    farms.forEach(farm => {
      const lat = toDegrees(farm.latitude);
      const lon = toDegrees(farm.longitude);
      if (lat && lon) {
        const icon = farm.isDeforestationFree ? farmIcon() : standardFarmIcon();
        const marker = L.marker([lat, lon], { icon }).bindPopup(`
          <strong>${escapeHTML(farm.name)}</strong><br>
          Farm #${farm.id}<br>
          ${farm.isDeforestationFree ? '✅ Deforestation-Free' : 'Standard Farm'}<br>
          <small>${shorten(farm.farmer)}</small>
        `);
        marker.addTo(farmsMap);
        farmMarkers.push(marker);
      }
    });

    if (farmMarkers.length > 0) {
      const group = L.featureGroup(farmMarkers);
      farmsMap.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // Expose modal controls globally (used by HTML onclick)
  window.openMapModal = function () {
    const modal = $('#mapModal');
    modal.classList.add('show');

    if (!modalMapInstance) {
      modalMapInstance = L.map('modalMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(modalMapInstance);

      let tempMarker;
      modalMapInstance.on('click', function (e) {
        if (tempMarker) modalMapInstance.removeLayer(tempMarker);
        tempMarker = L.marker(e.latlng, { icon: farmIcon() }).addTo(modalMapInstance);
        $('#modalLat').value = e.latlng.lat.toFixed(6);
        $('#modalLon').value = e.latlng.lng.toFixed(6);
        selectedLocation = e.latlng;
      });
    }
    setTimeout(() => modalMapInstance.invalidateSize(), 100);
  };
  window.closeMapModal = function () { $('#mapModal').classList.remove('show'); };

  function updateFarmPreview(lat, lon) {
    const preview = $('#farmMapPreview');
    if (!preview) return;
    preview.classList.remove('hidden');

    if (!farmPreviewMap) {
      farmPreviewMap = L.map('farmMapPreview').setView([lat, lon], 10);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(farmPreviewMap);
    }

    farmPreviewMap.eachLayer(layer => { if (layer instanceof L.Marker) farmPreviewMap.removeLayer(layer); });
    L.marker([lat, lon], { icon: farmIcon() }).addTo(farmPreviewMap);
    farmPreviewMap.setView([lat, lon], 10);
    setTimeout(() => farmPreviewMap.invalidateSize(), 100);
  }

  // Tabs & Forms
  function wireTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach((b) => b.classList.remove('active'));
        $$('.tab-content').forEach((c) => c.classList.add('hidden'));
        btn.classList.add('active');
        const id = btn.getAttribute('data-tab') + '-tab';
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
        setTimeout(() => {
          if (farmsMap) farmsMap.invalidateSize();
          if (journeyMap) journeyMap.invalidateSize();
        }, 100);
      });
    });
  }

  function wireForms() {
    $('#connectBtn')?.addEventListener('click', initWeb3);

    $('#refreshFarmsBtn')?.addEventListener('click', () => {
      if (!contract) return showToast('Connect wallet first', 'error');
      refreshFarmsList();
    });

    $('#pickLocationBtn')?.addEventListener('click', openMapModal);

    $('#confirmLocationBtn')?.addEventListener('click', () => {
      if (selectedLocation) {
        $('#farmLat').value = selectedLocation.lat.toFixed(6);
        $('#farmLon').value = selectedLocation.lng.toFixed(6);
        updateFarmPreview(selectedLocation.lat, selectedLocation.lng);
        closeMapModal();
      }
    });

    const previewUpdate = () => {
      const lat = parseFloat($('#farmLat').value);
      const lon = parseFloat($('#farmLon').value);
      if (!isNaN(lat) && !isNaN(lon)) updateFarmPreview(lat, lon);
    };
    $('#farmLat')?.addEventListener('change', previewUpdate);
    $('#farmLon')?.addEventListener('change', previewUpdate);

    // Register Farm
    $('#farmForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const name = $('#farmName').value.trim();
      const lat = scaleCoord($('#farmLat').value);
      const lon = scaleCoord($('#farmLon').value);
      const defoFree = $('#deforestationFree').checked;

      if (!name) return showToast('Farm name is required', 'error');
      if (Number.isNaN(lat) || Number.isNaN(lon)) return showToast('Valid coordinates are required', 'error');

      try {
        await contract.methods.registerFarm(name, lat, lon, defoFree).send({ from: currentAccount });
        showToast('Farm registered successfully!');
        e.target.reset();
        $('#farmMapPreview')?.classList.add('hidden');
        setTimeout(() => refreshFarmsList(), 1200);
      } catch (error) {
        console.error(error);
        showToast(`Failed to register farm: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
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

      if (!farmId || !name || !quantity || !batch) return showToast('All fields are required', 'error');

      try {
        await contract.methods.registerProduct(farmId, name, quantity, batch).send({ from: currentAccount });
        showToast('Product registered successfully!');
        e.target.reset();
      } catch (error) {
        console.error(error);
        showToast(`Failed to register product: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
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
      if (Number.isNaN(consumerLat) || Number.isNaN(consumerLon)) return showToast('Valid consumer coordinates are required', 'error');

      try {
        await contract.methods.issueCarbonFootprintSeal(productId, consumerLat, consumerLon, tokenURI).send({ from: currentAccount });
        showToast('Carbon footprint seal issued!');
        e.target.reset();
      } catch (error) {
        console.error(error);
        showToast(`Failed to issue carbon seal: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // Issue Deforestation-Free Seal
    $('#deforestationForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const productId = $('#defoProductId').value;
      const verificationData = $('#verificationData').value.trim();
      const tokenURI = 'https://ipfs.io/ipfs/QmExample2';

      if (!productId || !verificationData) return showToast('All fields are required', 'error');

      try {
        await contract.methods.issueDeforestationFreeSeal(productId, verificationData, tokenURI).send({ from: currentAccount });
        showToast('Deforestation-free seal issued!');
        e.target.reset();
      } catch (error) {
        console.error(error);
        showToast(`Failed to issue deforestation seal: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // Verify Product
    $('#verifyBtn')?.addEventListener('click', async () => {
      const productId = $('#verifyProductId').value;
      if (!productId) return showToast('Please enter a product ID', 'error');
      if (!ensureContract()) return;

      try {
        const product = await contract.methods.getProduct(productId).call();
        const farm = await contract.methods.getFarm(product.farmId).call();

        const lat = toDegrees(farm.latitude);
        const lon = toDegrees(farm.longitude);

        $('#verificationDetails').innerHTML = `
          <p><strong>Product:</strong> ${escapeHTML(product.productName)}</p>
          <p><strong>Farm:</strong> ${escapeHTML(farm.name)}</p>
          <p><strong>Farmer:</strong> ${shorten(farm.farmer)}</p>
          <p><strong>Batch:</strong> ${escapeHTML(product.batchId)}</p>
          <p><strong>Quantity:</strong> ${product.quantity} kg</p>
          <p><strong>Location:</strong> ${lat?.toFixed(6) ?? '—'}, ${lon?.toFixed(6) ?? '—'}</p>
          <p><strong>Deforestation-Free:</strong> ${farm.isDeforestationFree ? '✅ Yes' : '❌ No'}</p>
        `;

        $('#verificationResult').classList.remove('hidden');

        if (lat && lon) {
          const mapDiv = $('#productVerifyMap');
          mapDiv.classList.remove('hidden');

          if (!productVerifyMapInstance) {
            productVerifyMapInstance = L.map('productVerifyMap').setView([lat, lon], 10);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(productVerifyMapInstance);
          }

          productVerifyMapInstance.eachLayer(layer => { if (layer instanceof L.Marker) productVerifyMapInstance.removeLayer(layer); });
          const icon = farm.isDeforestationFree ? farmIcon() : standardFarmIcon();
          L.marker([lat, lon], { icon }).bindPopup(`<strong>${escapeHTML(farm.name)}</strong>`).addTo(productVerifyMapInstance);
          productVerifyMapInstance.setView([lat, lon], 10);
          setTimeout(() => productVerifyMapInstance.invalidateSize(), 100);
        }

        showToast('Product verified successfully!');
      } catch (error) {
        console.error(error);
        showToast('Product not found or error occurred', 'error');
        $('#verificationResult').classList.add('hidden');
      }
    });
  }

  // Farms list rendering and loading
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

      const farmsData = [];
      const ids = Array.from({ length: total }, (_, i) => i + 1);
      const batch = 20;

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
          .forEach((f) => {
            farmsData.push(f);
            grid.appendChild(renderFarmCard(f));
          });
      }

      if (!grid.children.length) {
        empty.textContent = 'No farms found.';
        empty.classList.remove('hidden');
      } else {
        updateFarmsOnMap(farmsData);
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
    card.style.cursor = 'pointer';

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

    card.addEventListener('click', () => {
      if (farmsMap && lat && lon) {
        farmsMap.setView([lat, lon], 10);
        farmMarkers.forEach(marker => {
          const pos = marker.getLatLng();
          if (Math.abs(pos.lat - lat) < 0.0001 && Math.abs(pos.lng - lon) < 0.0001) {
            marker.openPopup();
          }
        });
      }
    });

    return card;
  }

  // Initialize once DOM is ready and Leaflet is ensured
  document.addEventListener('DOMContentLoaded', () => {
    ensureLeafletLoaded(() => {
      wireTabs();
      wireForms();
      initMaps();
    });

    // Final safety: if Leaflet never loads in 5s, hide map features gracefully
    setTimeout(() => {
      if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load. Maps will not be available.');
        document.querySelectorAll('.map-container, #pickLocationBtn').forEach(el => { if (el) el.style.display = 'none'; });
      }
    }, 5000);
  });
})();
