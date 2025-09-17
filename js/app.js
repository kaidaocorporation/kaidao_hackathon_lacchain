/*
 * EcoTraceDAO - Environmental Asset Registry for Agricultural Products
 * Copyright (C) 2025 Corporación KaidáO - NIT 9019577984
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


// app.js
// Core UI + Web3 + Leaflet logic

(function () {
  'use strict';

  // ---- Leaflet fallback if primary CDN failed ----
  function ensureLeafletLoaded(cb) {
    if (typeof L !== 'undefined') return cb();
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

  // carbon map state
  let carbonMap, carbonFarmMarker, carbonConsumerMarker, carbonRouteLine;

  let farmMarkers = [];
  let mapPickTarget = null; // 'farm' | 'consumer'

  const DEFAULT_CENTER = [4.570868, -74.297333]; // Colombia
  const EMISSION_PER_KM_PER_KG = 0.0006; // simple default rule: 0.0006 kg CO2 per km per kg

  // ---- Icons ----
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

  // ---- DOM helpers ----
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

  function toHttpUrl(uri) {
    if (!uri) return null;
    if (uri.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + uri.slice(7);
    return uri;
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

  // ---- Utils ----
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
  function haversineKm(aLat, aLon, bLat, bLon) {
    const R = 6371; // km
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLon = (bLon - aLon) * Math.PI / 180;
    const s1 = Math.sin(dLat/2) ** 2 +
               Math.cos(aLat * Math.PI/180) * Math.cos(bLat * Math.PI/180) *
               (Math.sin(dLon/2) ** 2);
    return 2 * R * Math.asin(Math.sqrt(s1));
  }

  // ---- Flexible metadata + seal readers ----
  function readAttr(meta, keys) {
    if (!meta) return null;
    for (const k of keys) {
      if (meta[k] != null && meta[k] !== '') return meta[k];
    }
    const attrs = Array.isArray(meta.attributes) ? meta.attributes : [];
    for (const k of keys) {
      const hit = attrs.find(a =>
        String(a.trait_type || a.trait || a.type || '').toLowerCase() === String(k).toLowerCase()
      );
      if (hit && hit.value != null && hit.value !== '') return hit.value;
    }
    return null;
  }
  function prettyBool(v) {
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (v == null || v === '') return '—';
    const s = String(v).toLowerCase();
    if (['true','yes','y','1','valid','verified'].includes(s)) return 'Yes';
    if (['false','no','n','0','invalid','unverified'].includes(s)) return 'No';
    return String(v);
  }
  async function tryCall(method, args) {
    if (!contract?.methods?.[method]) return null;
    try { return await contract.methods[method](...(args || [])).call(); }
    catch { return null; }
  }
  function normalizeSeal(obj) {
    if (!obj) return null;
    const keys = Object.keys(obj).filter(k => isNaN(k));
    const lc = {};
    keys.forEach(k => { lc[k.toLowerCase()] = obj[k]; });
    const pick = (...names) => {
      for (const n of names) {
        if (lc[n] != null && String(lc[n]) !== '') return lc[n];
      }
      return null;
    };
    const productId   = pick('productid','product_id','product','pid');
    const footprint   = pick('carbonfootprint','footprint','value','footprintvalue');
    const valid       = pick('isvalid','valid','status');
    let   issued      = pick('issuedat','issued','timestamp','date','time');
    const verification= pick('verification','verificationdata','verifier','certificate','cert');
    const type        = pick('type','sealtype','category','kind') || 'Seal NFT';

    // common timestamp normalization
    if (issued != null) {
      const num = Number(issued);
      if (Number.isFinite(num) && num > 100000) issued = fmtDate(num);
    }

    return { productId, footprint, valid, issued, verification, type };
  }
  async function readSealOnChainByTokenId(tokenId) {
    const candidates = [
      ['getCarbonSealByTokenId', [tokenId]],
      ['getSealByTokenId',       [tokenId]],
      ['carbonSeals',            [tokenId]],
      ['seals',                  [tokenId]],
      ['tokenIdToSeal',          [tokenId]],
      ['tokenInfo',              [tokenId]],
      ['getNFT',                 [tokenId]],
      ['getCarbonFootprintSeal', [tokenId]],
    ];
    for (const [m, a] of candidates) {
      const res = await tryCall(m, a);
      const norm = normalizeSeal(res);
      if (norm && (norm.productId != null || norm.footprint != null || norm.valid != null || norm.issued != null || norm.verification != null)) {
        return norm;
      }
    }
    return null;
  }

  // ---- Web3 / Network ----
  function getInjectedProvider() {
    const eth = window.ethereum;
    if (!eth) return null;
    if (Array.isArray(eth.providers) && eth.providers.length) {
      const metamask = eth.providers.find((p) => p && p.isMetaMask);
      return metamask || eth.providers[0];
    }
    return eth;
  }

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

  async function initWeb3() {
    provider = getInjectedProvider();
    if (!provider) {
      showToast('Please install MetaMask!', 'error');
      return;
    }

    web3 = new Web3(provider);

    try {
      await ensureSepoliaNetwork(provider);
      await provider.request({ method: 'eth_requestAccounts' });
      const accounts = await web3.eth.getAccounts();
      currentAccount = accounts[0];

      const cfg = (typeof window !== 'undefined' && window.EcoTraceDAO) ? window.EcoTraceDAO : {};
      const ADDRESS = cfg.address ?? window.CONTRACT_ADDRESS;
      const ABI = cfg.abi ?? window.CONTRACT_ABI;

      if (!ADDRESS || !ABI) {
        showToast('Missing contract configuration', 'error');
        return;
      }

      contract = new web3.eth.Contract(ABI, ADDRESS);

      setConnectedUI(true);
      showToast('Wallet connected successfully!');

      provider.on('accountsChanged', onAccountsChanged);
      provider.on('chainChanged', onChainChanged);

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
      updateCarbonMapFromInputs().catch(() => {});
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

  // ---- Maps ----
  function initMaps() {
    if ($('#farmsMap') && !farmsMap) {
      farmsMap = L.map('farmsMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(farmsMap);
    }

    if ($('#journeyMap') && !journeyMap) {
      journeyMap = L.map('journeyMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(journeyMap);

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

  // ===== Map Picker (supports 'farm' and 'consumer') =====
  window.openMapModal = function (target = 'farm') {
    mapPickTarget = target;
    const modal = $('#mapModal');
    modal.classList.add('show');

    if (!modalMapInstance) {
      modalMapInstance = L.map('modalMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(modalMapInstance);
    }

    // Clear any previous marker and click handlers
    modalMapInstance.eachLayer(layer => { if (layer instanceof L.Marker) modalMapInstance.removeLayer(layer); });
    modalMapInstance.off('click');

    let tempMarker;
    modalMapInstance.on('click', function (e) {
      if (tempMarker) modalMapInstance.removeLayer(tempMarker);
      const icon = (mapPickTarget === 'consumer') ? consumerIcon() : farmIcon();
      tempMarker = L.marker(e.latlng, { icon }).addTo(modalMapInstance);

      const lat = e.latlng.lat.toFixed(6);
      const lon = e.latlng.lng.toFixed(6);
      $('#modalLat').value = lat;
      $('#modalLon').value = lon;

      if (mapPickTarget === 'farm') {
        $('#farmLat').value = lat;
        $('#farmLon').value = lon;
        updateFarmPreview(parseFloat(lat), parseFloat(lon));
      } else if (mapPickTarget === 'consumer') {
        $('#consumerLat').value = lat;
        $('#consumerLon').value = lon;
        updateCarbonMapFromInputs().catch(() => {});
      }
    });

    setTimeout(() => modalMapInstance.invalidateSize(), 100);
  };

  window.closeMapModal = function () {
    $('#mapModal').classList.remove('show');
  };

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

  // ===== Carbon route map =====
  function ensureCarbonMap() {
    const container = $('#carbonMap');
    if (!container) return null;
    container.classList.remove('hidden');

    if (!carbonMap) {
      carbonMap = L.map('carbonMap').setView(DEFAULT_CENTER, 3);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(carbonMap);
      setTimeout(() => carbonMap.invalidateSize(), 100);
    }
    return carbonMap;
  }

  function updateCarbonStats(distanceKm) {
    const stats = $('#carbonStats');
    if (!stats) return;
    stats.classList.remove('hidden');
    const d = $('#distanceKm');
    const f = $('#footprintKg');
    if (d) d.textContent = distanceKm.toFixed(1);
    if (f) f.textContent = (distanceKm * EMISSION_PER_KM_PER_KG).toFixed(2);
  }

  async function loadFarmCoordsForProduct(productId) {
    if (!ensureContract()) throw new Error('No contract');
    const product = await contract.methods.getProduct(productId).call();
    const farm = await contract.methods.getFarm(product.farmId).call();
    const lat = toDegrees(farm.latitude);
    const lon = toDegrees(farm.longitude);
    if (!lat || !lon) throw new Error('Farm has no coordinates');
    return { lat, lon, farmName: farm.name, isDeforestationFree: farm.isDeforestationFree };
  }

  async function updateCarbonMapFromInputs() {
    const productId = $('#carbonProductId')?.value?.trim();
    const cLat = parseFloat($('#consumerLat')?.value);
    const cLon = parseFloat($('#consumerLon')?.value);
    if (!productId || Number.isNaN(cLat) || Number.isNaN(cLon)) return;

    try {
      const farmData = await loadFarmCoordsForProduct(productId);
      const map = ensureCarbonMap();
      if (!map) return;

      if (carbonFarmMarker) map.removeLayer(carbonFarmMarker);
      if (carbonConsumerMarker) map.removeLayer(carbonConsumerMarker);
      if (carbonRouteLine) map.removeLayer(carbonRouteLine);

      carbonFarmMarker = L.marker([farmData.lat, farmData.lon], {
        icon: farmData.isDeforestationFree ? farmIcon() : standardFarmIcon()
      }).bindPopup(`<strong>${escapeHTML(farmData.farmName || 'Farm')}</strong>`).addTo(map);

      carbonConsumerMarker = L.marker([cLat, cLon], {
        icon: consumerIcon()
      }).bindPopup('<strong>Consumer</strong>').addTo(map);

      carbonRouteLine = L.polyline([[farmData.lat, farmData.lon], [cLat, cLon]], {
        color: '#3b82f6',
        weight: 3,
        opacity: 0.7,
        dashArray: '10, 10'
      }).addTo(map);

      map.fitBounds(carbonRouteLine.getBounds().pad(0.2));

      const distanceKm = haversineKm(farmData.lat, farmData.lon, cLat, cLon);
      updateCarbonStats(distanceKm);
    } catch (err) {
      console.warn('updateCarbonMapFromInputs:', err);
      $('#carbonStats')?.classList.add('hidden');
    }
  }

  // ---- Tabs & Forms ----
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
          if (carbonMap) carbonMap.invalidateSize();
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

    $('#pickLocationBtn')?.addEventListener('click', () => openMapModal('farm'));
    $('#pickConsumerBtn')?.addEventListener('click', () => openMapModal('consumer'));

    $('#useMyLocationBtn')?.addEventListener('click', () => {
      if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          $('#consumerLat').value = latitude.toFixed(6);
          $('#consumerLon').value = longitude.toFixed(6);
          updateCarbonMapFromInputs().catch(() => {});
        },
        () => showToast('Unable to get your location', 'error'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    $('#confirmLocationBtn')?.addEventListener('click', () => {
      const lat = parseFloat($('#modalLat').value);
      const lon = parseFloat($('#modalLon').value);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (mapPickTarget === 'farm') {
          $('#farmLat').value = lat.toFixed(6);
          $('#farmLon').value = lon.toFixed(6);
          updateFarmPreview(lat, lon);
        } else if (mapPickTarget === 'consumer') {
          $('#consumerLat').value = lat.toFixed(6);
          $('#consumerLon').value = lon.toFixed(6);
          updateCarbonMapFromInputs().catch(() => {});
        }
      }
      closeMapModal();
    });

    const previewUpdate = () => {
      const lat = parseFloat($('#farmLat').value);
      const lon = parseFloat($('#farmLon').value);
      if (!isNaN(lat) && !isNaN(lon)) updateFarmPreview(lat, lon);
    };
    $('#farmLat')?.addEventListener('change', previewUpdate);
    $('#farmLon')?.addEventListener('change', previewUpdate);

    $('#carbonProductId')?.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });
    $('#consumerLat')?.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });
    $('#consumerLon')?.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });

    // ----- Forms: on-chain calls -----

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

    // View Seal NFT (by tokenId) — populate from metadata or on-chain
    $('#viewTokenBtn')?.addEventListener('click', async () => {
      const tokenId = $('#viewTokenId').value;
      if (!tokenId) return showToast('Enter a token ID', 'error');
      if (!ensureContract()) return;

      try {
        const viewer = $('#tokenViewer');
        const imgEl  = $('#tokenImage');

        // Resolve tokenURI & attempt to fetch metadata or image
        const uri = await contract.methods.tokenURI(tokenId).call();
        const url = toHttpUrl(uri);

        let meta = null;
        let imageUrl = null;

        try {
          const res = await fetch(url);
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.includes('application/json') || /\.json($|\?)/i.test(url)) {
            meta = await res.json();
            imageUrl = toHttpUrl(meta.image || meta.image_url || readAttr(meta, ['image']));
          } else if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(url)) {
            imageUrl = url;
          }
        } catch (e) {
          console.warn('tokenURI fetch failed:', e);
        }

        // Try to read seal data directly from chain (fallback if metadata is bare image)
        const seal = await readSealOnChainByTokenId(tokenId);

        // Fill left column (Seal Details)
        $('#tvTokenId').textContent  = tokenId;
        $('#tvType').textContent     = (readAttr(meta, ['type','sealType','category']) || seal?.type || 'Seal NFT');
        const footprint = readAttr(meta, ['carbonFootprint','footprintKg','footprint','co2_kg','co2']) ?? seal?.footprint;
        $('#tvFootprint').textContent = footprint != null ? String(footprint) : '—';
        const valid = readAttr(meta, ['valid','verified']);
        $('#tvValid').textContent     = valid != null ? prettyBool(valid) : (seal ? prettyBool(seal.valid) : '—');
        const issued = readAttr(meta, ['issued','issuedAt','issue_date','date']) ?? seal?.issued;
        $('#tvIssued').textContent    = issued != null ? String(issued) : '—';
        const verification = readAttr(meta, ['verification','verifier','certificate','cert']) ?? seal?.verification;
        $('#tvVerification').textContent = verification != null ? String(verification) : '—';

        // Determine productId (metadata first, then chain)
        const productIdFromMeta = readAttr(meta, ['productId','product_id','productID','product']);
        const productId = productIdFromMeta ?? seal?.productId;
        $('#tvProductId').textContent = productId ?? '—';

        // Build caption under image (product/farm/batch/qty if we can)
        const name = meta?.name ? String(meta.name) : null;
        const desc = meta?.description ? String(meta.description) : null;
        let caption = name ? (desc ? `${name} — ${desc}` : name) : (desc || '');

        if (productId != null) {
          try {
            const prod = await contract.methods.getProduct(productId).call();
            const farm = await contract.methods.getFarm(prod.farmId).call();
            const cap = [
              prod.productName ? `Product: ${prod.productName}` : null,
              farm.name ? `Farm: ${farm.name}` : null,
              prod.batchId ? `Batch: ${prod.batchId}` : null,
              (prod.quantity ? `Quantity: ${prod.quantity} kg` : null)
            ].filter(Boolean).join(' — ');
            if (cap) caption = cap;
          } catch {/* ignore */}
        }
        $('#tokenCaption').textContent = caption;

        // Image
        if (imageUrl) {
          imgEl.src = imageUrl;
          imgEl.style.display = 'block';
        } else {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
        }

        viewer.classList.remove('hidden');
        showToast('NFT loaded');
      } catch (err) {
        console.error(err);
        showToast('Failed to load token', 'error');
        $('#tokenViewer')?.classList.add('hidden');
      }
    });

    // Verify Product (read-only)
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

  // ---- Farms list rendering and loading ----
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

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', () => {
    ensureLeafletLoaded(() => {
      wireTabs();
      wireForms();
      initMaps();
    });

    setTimeout(() => {
      if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load. Maps will not be available.');
        document.querySelectorAll('.map-container, #pickLocationBtn, #pickConsumerBtn').forEach(el => { if (el) el.style.display = 'none'; });
      }
    }, 5000);
  });
})();
