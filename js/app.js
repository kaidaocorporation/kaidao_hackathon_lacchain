/*
 * EcoTraceDAO - Environmental Asset Registry for Agricultural Products
 * Copyright (C) 2025 Corporación KaidáO - NIT 9019577984
 * License: AGPL-3.0-or-later
 */

// app.js
// Core UI + Web3 + Leaflet + Dashboard + NFT Viewer

(function () {
  'use strict';

  // ================= THEME (colores del sitio) =================
  const THEME = {
    primary: '#10b981',   // emerald 500
    primarySoft: '#34d399',
    primaryAlt: '#059669', // emerald 600
    accent: '#3b82f6',    // azul p/ rutas
    warn: '#f59e0b',
    gray700: '#374151',
    gray600: '#4b5563',
    gray500: '#6b7280',
    gray200: '#e5e7eb',
    white: '#ffffff'
  };

  // ================= Leaflet fallback =================
  function ensureLeafletLoaded(cb) {
    if (typeof L !== 'undefined') return cb();
    const altJs = document.createElement('script');
    altJs.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';
    const altCss = document.createElement('link');
    altCss.rel = 'stylesheet';
    altCss.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
    let fired = false;
    altJs.onload = () => { if (!fired) { fired = true; cb(); } };
    document.head.appendChild(altCss);
    document.head.appendChild(altJs);
  }

  // ================= State =================
  let web3, contract, currentAccount, provider;

  // maps
  let farmsMap, journeyMap, modalMapInstance, farmPreviewMap, productVerifyMapInstance;
  let carbonMap, carbonFarmMarker, carbonConsumerMarker, carbonRouteLine;
  let farmMarkers = [];
  let mapPickTarget = null; // 'farm' | 'consumer'

  // dashboard charts
  let creditsChart, impactChart;

  const DEFAULT_CENTER = [4.570868, -74.297333]; // Colombia
  const EMISSION_PER_KM_PER_KG = 0.0006;

  // Demo para "Recent Products" (misma info de tus mocks)
  const DEMO_PRODUCTS = [
    { code: 'PRD-001', name: 'Organic Coffee Beans', farm: 'Highland Farm',      location: 'Colombia', carbonScore: 92, tokens: 15, status: 'Active'  },
    { code: 'PRD-002', name: 'Sustainable Avocados', farm: 'Green Valley Co-op', location: 'Mexico',   carbonScore: 88, tokens: 8,  status: 'Active'  },
    { code: 'PRD-003', name: 'Fair Trade Bananas',    farm: 'Tropical Farms Ltd', location: 'Ecuador',  carbonScore: 76, tokens: 12, status: 'Pending' },
    { code: 'PRD-004', name: 'Regenerative Quinoa',   farm: 'Andean Growers',     location: 'Peru',     carbonScore: 95, tokens: 20, status: 'Active'  },
  ];

  // ================= Icons =================
  const farmIcon = () => L.divIcon({
    html: `<div style="background:${THEME.primary};color:${THEME.white};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-tractor" style="font-size:14px;"></i></div>`,
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });
  const standardFarmIcon = () => L.divIcon({
    html: `<div style="background:${THEME.warn};color:${THEME.white};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-tractor" style="font-size:14px;"></i></div>`,
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });
  const consumerIcon = () => L.divIcon({
    html: `<div style="background:#f97316;color:${THEME.white};width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i class="fas fa-shopping-cart" style="font-size:14px;"></i></div>`,
    iconSize: [30, 30],
    className: 'custom-div-icon'
  });

  // ================= DOM helpers =================
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Helper function para setear texto de forma segura
  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  const setTextIf = (ids, value) => {
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = value; });
  };

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

  // ================= Utils =================
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
    const R = 6371;
    const dLat = (bLat - aLat) * Math.PI / 180;
    const dLon = (bLon - aLon) * Math.PI / 180;
    const s1 = Math.sin(dLat/2) ** 2 +
               Math.cos(aLat * Math.PI/180) * Math.cos(bLat * Math.PI/180) *
               (Math.sin(dLon/2) ** 2);
    return 2 * R * Math.asin(Math.sqrt(s1));
  }

  // -------- Flexible metadata helpers --------
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

  // ================= Web3 / Network =================
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
    const desired = (window.EcoTraceDAO && window.EcoTraceDAO.chainId) || '0xaa36a7';
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

      refreshFarmsList().catch(() => {});
      refreshDashboardStats().catch(() => {});
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
      refreshDashboardStats().catch(() => {});
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

  // ================= Maps =================
  function initMaps() {
    if (typeof L === 'undefined') return; // guard extra

    if ($('#farmsMap') && !farmsMap) {
      farmsMap = L.map('farmsMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(farmsMap);
    }

    if ($('#journeyMap') && !journeyMap) {
      journeyMap = L.map('journeyMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(journeyMap);

      const farmLocation = [4.596, -74.081];        // Bogotá
      const consumerLocation = [25.7617, -80.1918]; // Miami

      L.marker(farmLocation, { icon: farmIcon() }).addTo(journeyMap)
        .bindPopup('<strong>Farm Origin</strong><br>Finca Café Verde<br>Bogotá, Colombia');
      L.marker(consumerLocation, { icon: consumerIcon() }).addTo(journeyMap)
        .bindPopup('<strong>Destination</strong><br>Miami, FL, USA');

      const routeLine = L.polyline([farmLocation, consumerLocation], {
        color: THEME.accent, weight: 3, opacity: 0.7, dashArray: '10, 10'
      }).addTo(journeyMap);
      journeyMap.fitBounds(routeLine.getBounds().pad(0.1));
    }
  }

  function updateFarmsOnMap(farms) {
    if (!farmsMap || typeof L === 'undefined') return;
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

  // ===== Map Picker =====
  window.openMapModal = function (target = 'farm') {
    if (typeof L === 'undefined') return showToast('Maps not available', 'error');

    mapPickTarget = target;
    const modal = $('#mapModal');
    modal.classList.add('show');

    if (!modalMapInstance) {
      modalMapInstance = L.map('modalMap').setView(DEFAULT_CENTER, 5);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(modalMapInstance);
    }

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
    if (typeof L === 'undefined') return;
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
    if (typeof L === 'undefined') return null;
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
    const productIdEl = $('#carbonProductId');
    const cLatEl = $('#consumerLat');
    const cLonEl = $('#consumerLon');
    
    if (!productIdEl || !cLatEl || !cLonEl) return;
    
    const productId = productIdEl.value?.trim();
    const cLat = parseFloat(cLatEl.value);
    const cLon = parseFloat(cLonEl.value);
    
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
        color: THEME.accent, weight: 3, opacity: 0.7, dashArray: '10, 10'
      }).addTo(map);

      map.fitBounds(carbonRouteLine.getBounds().pad(0.2));

      const distanceKm = haversineKm(farmData.lat, farmData.lon, cLat, cLon);
      updateCarbonStats(distanceKm);
    } catch (err) {
      console.warn('updateCarbonMapFromInputs:', err);
      const statsEl = $('#carbonStats');
      if (statsEl) statsEl.classList.add('hidden');
    }
  }

  // ------- Métricas bajo el donut + tabla Recent Products -------
  function renderImpactMetrics(values) {
    const wrap = document.getElementById('impactMetrics');
    if (!wrap) return;
    const labels = ['Carbon Sequestered', 'Emissions Reduced', 'Waste Diverted', 'Water Saved'];
    const colors = [THEME.primary, THEME.primaryAlt, THEME.primarySoft, '#6ee7b7'];
    wrap.innerHTML = labels.map((lab, i) => `
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};display:inline-block;"></span>
          <span>${lab}</span>
        </div>
        <strong>${(values && values[i] != null) ? values[i] : 0}</strong>
      </div>
    `).join('');
  }
  
  function renderRecentProducts(items) {
    const tbody = document.getElementById('recentProductsBody');
    const totalEl = document.getElementById('recentProductsTotal');
    if (!tbody) return;
  
    tbody.innerHTML = '';
    items.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:12px 12px;background:#fff;border-radius:12px 0 0 12px;">
          <div style="font-weight:600;">${escapeHTML(p.name)}</div>
          <div style="color:#6b7280;font-size:13px;">${escapeHTML(p.code)}</div>
        </td>
        <td style="padding:12px 12px;background:#fff;">${escapeHTML(p.farm)}</td>
        <td style="padding:12px 12px;background:#fff;">
          <i class="fas fa-map-marker-alt" style="color:${THEME.primary};margin-right:6px;"></i>${escapeHTML(p.location)}
        </td>
        <td style="padding:12px 12px;background:#fff;">
          <i class="fas fa-leaf" style="color:${THEME.primary};margin-right:6px;"></i><strong>${p.carbonScore}</strong>
        </td>
        <td style="padding:12px 12px;background:#fff;">
          <span style="background:#ecfdf5;color:#065f46;padding:6px 10px;border-radius:999px;font-weight:600;font-size:12px;">
            ${p.tokens} NFTs
          </span>
        </td>
        <td style="padding:12px 12px;background:#fff;">
          <span style="background:${p.status==='Active' ? '#ecfdf5' : '#f3f4f6'};color:${p.status==='Active' ? '#065f46' : '#374151'};padding:6px 10px;border-radius:999px;font-weight:600;font-size:12px;">
            ${escapeHTML(p.status)}
          </span>
        </td>
        <td style="padding:12px 12px;background:#fff;border-radius:0 12px 12px 0;text-align:center;">
          <i class="fas fa-eye" style="color:#6b7280;"></i>
        </td>
      `;
      tbody.appendChild(tr);
    });
    if (totalEl) totalEl.textContent = `${items.length} Total`;
  }
  
  // ================= Dashboard =================
  const hasChart = () => (typeof Chart !== 'undefined');

  function destroyCharts() {
    try { creditsChart?.destroy(); } catch {}
    try { impactChart?.destroy(); } catch {}
    creditsChart = undefined; impactChart = undefined;
  }

  function initDashboardCharts(data) {
    if (!hasChart()) return; // Chart.js no presente
    destroyCharts();

    // ---- Credits bar chart ----
    const barCtx = document.getElementById('creditsChart')?.getContext?.('2d');
    if (barCtx) {
      creditsChart = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [
            { label: 'Credits Issued',  data: data.issued,  backgroundColor: THEME.primary,     borderRadius: 8, maxBarThickness: 24 },
            { label: 'Credits Retired', data: data.retired, backgroundColor: THEME.primarySoft, borderRadius: 8, maxBarThickness: 24 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: { grid: { display: false }, ticks: { color: THEME.gray600 }},
            y: { grid: { color: THEME.gray200 }, ticks: { color: THEME.gray600 } }
          },
          plugins: {
            legend: { labels: { color: THEME.gray700 } },
            tooltip: { backgroundColor: THEME.gray700, titleColor: THEME.white, bodyColor: THEME.white }
          }
        }
      });
    }

    // ---- Impact donut ----
    const donutCtx = document.getElementById('impactChart')?.getContext?.('2d');
    if (donutCtx) {
      impactChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Carbon Sequestered','Emissions Reduced','Waste Diverted','Water Saved'],
          datasets: [{
            data: data.impact,
            backgroundColor: [THEME.primary, THEME.primaryAlt, THEME.primarySoft, '#6ee7b7'],
            borderColor: THEME.white,
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: {
            legend: { position: 'bottom', labels: { color: THEME.gray700 } },
            tooltip: { backgroundColor: THEME.gray700, titleColor: THEME.white, bodyColor: THEME.white }
          }
        }
      });
    }

    // NUEVO: pintar métricas bajo el donut
    renderImpactMetrics(data.impact);
  }

  async function refreshDashboardStats() {
    setTextIf(['statTotalProducts','statProducts'], '—');
    setTextIf(['statNftSeals','statSeals'], '—');
    setTextIf(['statVerifiedFarms'], '—');
    setTextIf(['statActiveFarms'], '—');

    const fallbackCharts = {
      labels: ['Apr','May','Jun','Jul','Aug','Sep'],
      issued:  [480,540,600,660,720,760],
      retired: [410,460,520,580,610,660],
      impact:  [2000,1100,800,520]
    };

    if (!contract) {
      // Datos demo si no hay wallet
      initDashboardCharts(fallbackCharts);
      renderRecentProducts(DEMO_PRODUCTS);
      return;
    }

    try {
      let totalProducts =
        Number(await tryCall('productCounter')) ??
        Number(await tryCall('productsCount')) ??
        Number(await tryCall('productCount'));
      if (!Number.isFinite(totalProducts)) totalProducts = null;

      let totalSeals = Number(await tryCall('totalSupply'));
      if (!Number.isFinite(totalSeals)) {
        totalSeals = Number(await tryCall('sealCounter')) ?? null;
      }

      let totalFarms = Number(await tryCall('farmCounter')) ?? 0;
      let activeFarms = 0;
      let verifiedFarms = 0;

      if (totalFarms > 0) {
        const ids = Array.from({ length: totalFarms }, (_, i) => i + 1);
        const batch = 20;
        for (let i = 0; i < ids.length; i += batch) {
          const slice = ids.slice(i, i + batch);
          const farms = await Promise.all(
            slice.map(async (id) => {
              try { return await contract.methods.getFarm(id).call(); } catch { return null; }
            })
          );
          farms.filter(Boolean).forEach(f => {
            if (f.isActive) activeFarms += 1;
            if (f.isDeforestationFree) verifiedFarms += 1;
          });
        }
      }

      if (totalProducts != null) setTextIf(['statTotalProducts','statProducts'], String(totalProducts));
      if (totalSeals != null)    setTextIf(['statNftSeals','statSeals'], String(totalSeals));
      setTextIf(['statVerifiedFarms'], String(verifiedFarms));
      setTextIf(['statActiveFarms'], String(activeFarms));

      // Por ahora usamos las series demo para las gráficas
      initDashboardCharts(fallbackCharts);
      renderRecentProducts(DEMO_PRODUCTS);
    } catch (e) {
      console.warn('refreshDashboardStats error:', e);
      initDashboardCharts(fallbackCharts);
      renderRecentProducts(DEMO_PRODUCTS);
    }
  }

  // ================= Tabs & Forms =================
  function wireTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach((b) => b.classList.remove('active'));
        $$('.tab-content').forEach((c) => c.classList.add('hidden'));
        btn.classList.add('active');
        const id = btn.getAttribute('data-tab') + '-tab';
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');

        // reajustar mapas al cambiar
        setTimeout(() => {
          try { farmsMap?.invalidateSize(); } catch {}
          try { journeyMap?.invalidateSize(); } catch {}
          try { carbonMap?.invalidateSize(); } catch {}
        }, 100);

        if (id === 'dashboard-tab') {
          refreshDashboardStats().catch(() => {});
        }
      });
    });
  }

  function wireForms() {
    const connectBtn = $('#connectBtn');
    if (connectBtn) connectBtn.addEventListener('click', initWeb3);
    
    const refreshBtn = $('#refreshFarmsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => {
      if (!contract) return showToast('Connect wallet first', 'error');
      refreshFarmsList();
    });

    // Map pickers
    const pickLocationBtn = $('#pickLocationBtn');
    if (pickLocationBtn) pickLocationBtn.addEventListener('click', () => openMapModal('farm'));
    
    const pickConsumerBtn = $('#pickConsumerBtn');
    if (pickConsumerBtn) pickConsumerBtn.addEventListener('click', () => openMapModal('consumer'));

    // Geolocalización
    const useMyLocationBtn = $('#useMyLocationBtn');
    if (useMyLocationBtn) useMyLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) return showToast('Geolocation not supported', 'error');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          const consumerLatEl = $('#consumerLat');
          const consumerLonEl = $('#consumerLon');
          if (consumerLatEl) consumerLatEl.value = latitude.toFixed(6);
          if (consumerLonEl) consumerLonEl.value = longitude.toFixed(6);
          updateCarbonMapFromInputs().catch(() => {});
        },
        () => showToast('Unable to get your location', 'error'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });

    // Confirm modal
    const confirmLocationBtn = $('#confirmLocationBtn');
    if (confirmLocationBtn) confirmLocationBtn.addEventListener('click', () => {
      const modalLatEl = $('#modalLat');
      const modalLonEl = $('#modalLon');
      if (!modalLatEl || !modalLonEl) return;
      
      const lat = parseFloat(modalLatEl.value);
      const lon = parseFloat(modalLonEl.value);
      
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        if (mapPickTarget === 'farm') {
          const farmLatEl = $('#farmLat');
          const farmLonEl = $('#farmLon');
          if (farmLatEl) farmLatEl.value = lat.toFixed(6);
          if (farmLonEl) farmLonEl.value = lon.toFixed(6);
          updateFarmPreview(lat, lon);
        } else if (mapPickTarget === 'consumer') {
          const consumerLatEl = $('#consumerLat');
          const consumerLonEl = $('#consumerLon');
          if (consumerLatEl) consumerLatEl.value = lat.toFixed(6);
          if (consumerLonEl) consumerLonEl.value = lon.toFixed(6);
          updateCarbonMapFromInputs().catch(() => {});
        }
      }
      closeMapModal();
    });

    // Previews
    const previewUpdate = () => {
      const farmLatEl = $('#farmLat');
      const farmLonEl = $('#farmLon');
      if (!farmLatEl || !farmLonEl) return;
      
      const lat = parseFloat(farmLatEl.value);
      const lon = parseFloat(farmLonEl.value);
      if (!isNaN(lat) && !isNaN(lon)) updateFarmPreview(lat, lon);
    };
    
    const farmLatInput = $('#farmLat');
    const farmLonInput = $('#farmLon');
    if (farmLatInput) farmLatInput.addEventListener('change', previewUpdate);
    if (farmLonInput) farmLonInput.addEventListener('change', previewUpdate);

    // Carbon map inputs
    const carbonProductIdInput = $('#carbonProductId');
    const consumerLatInput = $('#consumerLat');
    const consumerLonInput = $('#consumerLon');
    
    if (carbonProductIdInput) carbonProductIdInput.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });
    if (consumerLatInput) consumerLatInput.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });
    if (consumerLonInput) consumerLonInput.addEventListener('change', () => { updateCarbonMapFromInputs().catch(() => {}); });

    // ----- On-chain forms -----
    // Register Farm
    const farmForm = $('#farmForm');
    if (farmForm) farmForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const nameEl = $('#farmName');
      const latEl = $('#farmLat');
      const lonEl = $('#farmLon');
      const defoFreeEl = $('#deforestationFree');
      
      if (!nameEl || !latEl || !lonEl || !defoFreeEl) return;
      
      const name = nameEl.value.trim();
      const lat = scaleCoord(latEl.value);
      const lon = scaleCoord(lonEl.value);
      const defoFree = defoFreeEl.checked;

      if (!name) return showToast('Farm name is required', 'error');
      if (Number.isNaN(lat) || Number.isNaN(lon)) return showToast('Valid coordinates are required', 'error');

      try {
        await contract.methods.registerFarm(name, lat, lon, defoFree).send({ from: currentAccount });
        showToast('Farm registered successfully!');
        e.target.reset();
        const farmMapPreviewEl = $('#farmMapPreview');
        if (farmMapPreviewEl) farmMapPreviewEl.classList.add('hidden');
        setTimeout(() => { refreshFarmsList(); refreshDashboardStats(); }, 1000);
      } catch (error) {
        console.error(error);
        showToast(`Failed to register farm: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // Register Product
    const productForm = $('#productForm');
    if (productForm) productForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const farmIdEl = $('#productFarmId');
      const nameEl = $('#productName');
      const quantityEl = $('#productQuantity');
      const batchEl = $('#productBatch');
      
      if (!farmIdEl || !nameEl || !quantityEl || !batchEl) return;
      
      const farmId = farmIdEl.value;
      const name = nameEl.value.trim();
      const quantity = quantityEl.value;
      const batch = batchEl.value.trim();

      if (!farmId || !name || !quantity || !batch) return showToast('All fields are required', 'error');

      try {
        await contract.methods.registerProduct(farmId, name, quantity, batch).send({ from: currentAccount });
        showToast('Product registered successfully!');
        e.target.reset();
        setTimeout(() => refreshDashboardStats(), 800);
      } catch (error) {
        console.error(error);
        showToast(`Failed to register product: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // Issue Carbon Seal
    const carbonForm = $('#carbonForm');
    if (carbonForm) carbonForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const productIdEl = $('#carbonProductId');
      const consumerLatEl = $('#consumerLat');
      const consumerLonEl = $('#consumerLon');
      
      if (!productIdEl || !consumerLatEl || !consumerLonEl) return;
      
      const productId = productIdEl.value;
      const consumerLat = scaleCoord(consumerLatEl.value);
      const consumerLon = scaleCoord(consumerLonEl.value);
      const tokenURI = 'https://ipfs.io/ipfs/QmExample';

      if (!productId) return showToast('Product ID is required', 'error');
      if (Number.isNaN(consumerLat) || Number.isNaN(consumerLon)) return showToast('Valid consumer coordinates are required', 'error');

      try {
        await contract.methods.issueCarbonFootprintSeal(productId, consumerLat, consumerLon, tokenURI).send({ from: currentAccount });
        showToast('Carbon footprint seal issued!');
        e.target.reset();
        setTimeout(() => refreshDashboardStats(), 800);
      } catch (error) {
        console.error(error);
        showToast(`Failed to issue carbon seal: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // Issue Deforestation-Free Seal
    const deforestationForm = $('#deforestationForm');
    if (deforestationForm) deforestationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!ensureReady()) return;

      const productIdEl = $('#defoProductId');
      const verificationDataEl = $('#verificationData');
      
      if (!productIdEl || !verificationDataEl) return;
      
      const productId = productIdEl.value;
      const verificationData = verificationDataEl.value.trim();
      const tokenURI = 'https://ipfs.io/ipfs/QmExample2';

      if (!productId || !verificationData) return showToast('All fields are required', 'error');

      try {
        await contract.methods.issueDeforestationFreeSeal(productId, verificationData, tokenURI).send({ from: currentAccount });
        showToast('Deforestation-free seal issued!');
        e.target.reset();
        setTimeout(() => refreshDashboardStats(), 800);
      } catch (error) {
        console.error(error);
        showToast(`Failed to issue deforestation seal: ${error?.data?.message || error?.message || 'Transaction failed'}`, 'error');
      }
    });

    // ====== View Seal NFT (corregido) ======
    const viewTokenBtn = $('#viewTokenBtn');
    if (viewTokenBtn) viewTokenBtn.addEventListener('click', async () => {
      const tokenIdEl = $('#viewTokenId');
      if (!tokenIdEl) return;
      
      const tokenId = tokenIdEl.value;
      if (!tokenId) return showToast('Enter a token ID', 'error');
      if (!ensureContract()) return;

      const viewer  = $('#tokenViewer');
      const imgEl   = $('#tokenImage');
      const caption = $('#tokenCaption');

      // reset UI
      setText('tvTokenId', tokenId);
      setText('tvProductId', '—');
      setText('tvType', 'Seal NFT');
      setText('tvFootprint', '—');
      setText('tvValid', '—');
      setText('tvIssued', '—');
      setText('tvVerification', '—');
      setText('tvNote', '');

      try {
        // 1) tokenURI (si existe)
        let url = null;
        try {
          const uri = await contract.methods.tokenURI(tokenId).call();
          url = toHttpUrl(uri);
        } catch {}

        let meta = null;
        let imageUrl = null;

        // 2) Intentar leer metadata si hay URL
        if (url) {
          try {
            const res = await fetch(url, { mode: 'cors' });
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (ct.includes('application/json') || /\.json($|\?)/i.test(url)) {
              meta = await res.json();
              imageUrl = toHttpUrl(meta.image || meta.image_url || readAttr(meta, ['image']));
            } else if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(url)) {
              imageUrl = url;
            }
          } catch (e) {
            console.warn('tokenURI fetch failed:', e);
            setText('tvNote', 'tokenURI no accesible; mostrando datos on-chain si están disponibles.');
          }
        }

        // 3) Complementar con lectura on-chain del sello
        const seal = await readSealOnChainByTokenId(tokenId);

        // 4) Rellenar panel izquierdo
        setText('tvType', 
          (readAttr(meta, ['type','sealType','category']) || seal?.type || 'Seal NFT'));

        const footprint = readAttr(meta, ['carbonFootprint','footprintKg','footprint','co2_kg','co2']) ?? seal?.footprint;
        setText('tvFootprint', (footprint != null ? String(footprint) : '—'));

        const valid = readAttr(meta, ['valid','verified']);
        setText('tvValid', (valid != null ? prettyBool(valid) : (seal ? prettyBool(seal.valid) : '—')));

        const issued = readAttr(meta, ['issued','issuedAt','issue_date','date']) ?? seal?.issued;
        setText('tvIssued', (issued != null ? String(issued) : '—'));

        const verification = readAttr(meta, ['verification','verifier','certificate','cert']) ?? seal?.verification;
        setText('tvVerification', (verification != null ? String(verification) : '—'));

        const productId = (readAttr(meta, ['productId','product_id','productID','product']) ?? seal?.productId);
        if (productId != null) setText('tvProductId', String(productId));

        // 5) Caption enriquecido
        let captionText = '';
        if (productId != null) {
          try {
            const prod = await contract.methods.getProduct(productId).call();
            const farm = await contract.methods.getFarm(prod.farmId).call();
            captionText = [
              prod.productName ? `Product: ${prod.productName}` : null,
              farm.name ? `Farm: ${farm.name}` : null,
              prod.batchId ? `Batch: ${prod.batchId}` : null,
              (prod.quantity ? `Quantity: ${prod.quantity} kg` : null)
            ].filter(Boolean).join(' — ');
          } catch {/* ignore */}
        } else if (meta?.name || meta?.description) {
          captionText = meta?.name ? (meta.description ? `${meta.name} — ${meta.description}` : meta.name) : meta.description;
        }
        if (caption) caption.textContent = captionText || '';

        // 6) Imagen (si existe)
        if (imageUrl && imgEl) {
          imgEl.src = imageUrl;
          imgEl.style.display = 'block';
        } else if (imgEl) {
          imgEl.removeAttribute('src');
          imgEl.style.display = 'none';
        }

        if (viewer) viewer.classList.remove('hidden');
        showToast('NFT loaded');
      } catch (err) {
        console.error(err);
        setText('tvNote', 'No fue posible cargar metadatos; verifique el token en el explorador.');
        if (viewer) viewer.classList.remove('hidden');
      }
    });

    // Verify Product (read-only)
    const verifyBtn = $('#verifyBtn');
    if (verifyBtn) verifyBtn.addEventListener('click', async () => {
      const productIdEl = $('#verifyProductId');
      if (!productIdEl) return;
      
      const productId = productIdEl.value;
      if (!productId) return showToast('Please enter a product ID', 'error');
      if (!ensureContract()) return;

      try {
        const product = await contract.methods.getProduct(productId).call();
        const farm = await contract.methods.getFarm(product.farmId).call();

        const lat = toDegrees(farm.latitude);
        const lon = toDegrees(farm.longitude);

        const detailsEl = $('#verificationDetails');
        if (detailsEl) {
          detailsEl.innerHTML = `
            <p><strong>Product:</strong> ${escapeHTML(product.productName)}</p>
            <p><strong>Farm:</strong> ${escapeHTML(farm.name)}</p>
            <p><strong>Farmer:</strong> ${shorten(farm.farmer)}</p>
            <p><strong>Batch:</strong> ${escapeHTML(product.batchId)}</p>
            <p><strong>Quantity:</strong> ${product.quantity} kg</p>
            <p><strong>Location:</strong> ${lat?.toFixed(6) ?? '—'}, ${lon?.toFixed(6) ?? '—'}</p>
            <p><strong>Deforestation-Free:</strong> ${farm.isDeforestationFree ? '✅ Yes' : '❌ No'}</p>
          `;
        }

        const resultEl = $('#verificationResult');
        if (resultEl) resultEl.classList.remove('hidden');

        if (lat && lon) {
          const mapDiv = $('#productVerifyMap');
          if (mapDiv) {
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
        }

        showToast('Product verified successfully!');
      } catch (error) {
        console.error(error);
        showToast('Product not found or error occurred', 'error');
        const resultEl = $('#verificationResult');
        if (resultEl) resultEl.classList.add('hidden');
      }
    });
  }

  // ================= Farms list =================
  async function refreshFarmsList() {
    const grid = $('#farmsList');
    const empty = $('#farmsEmpty');
    if (!grid) return;

    grid.innerHTML = '';
    if (empty) empty.classList.add('hidden');

    if (!contract) {
      if (empty) {
        empty.textContent = 'Connect your wallet to load farms.';
        empty.classList.remove('hidden');
      }
      return;
    }

    try {
      const total = Number(await contract.methods.farmCounter().call());
      if (!Number.isFinite(total) || total <= 0) {
        if (empty) {
          empty.textContent = 'No farms found.';
          empty.classList.remove('hidden');
        }
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
        if (empty) {
          empty.textContent = 'No farms found.';
          empty.classList.remove('hidden');
        }
      } else {
        updateFarmsOnMap(farmsData);
      }
    } catch (err) {
      console.error('refreshFarmsList error:', err);
      if (empty) {
        empty.textContent = 'Failed to load farms.';
        empty.classList.remove('hidden');
      }
      showToast('Failed to load farms', 'error');
    }
  }

  function renderFarmCard(farm) {
    const lat = toDegrees(farm.latitude);
    const lon = toDegrees(farm.longitude);

    const card = document.createElement('div');
    card.className = 'seal-card';
    card.style.borderColor = farm.isDeforestationFree ? THEME.primary : THEME.gray200;
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

  // ================= Boot =================
  document.addEventListener('DOMContentLoaded', () => {
    // 1) Cablear UI SIEMPRE (aunque Leaflet falle)
    wireTabs();
    wireForms();

    // 2) Mapas solo cuando Leaflet esté listo
    ensureLeafletLoaded(() => {
      initMaps();
    });

    // 3) Dashboard con datos demo hasta tener wallet
    refreshDashboardStats().catch(() => {});

    // 4) Safety si Leaflet no carga
    setTimeout(() => {
      if (typeof L === 'undefined') {
        console.warn('Leaflet failed to load. Maps will not be available.');
        document.querySelectorAll('.map-container, #pickLocationBtn, #pickConsumerBtn').forEach(el => { if (el) el.style.display = 'none'; });
      }
    }, 5000);
  });
})();
