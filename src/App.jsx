import { useEffect } from 'react';

const scriptQueue = [
  {
    src: 'https://cdnjs.cloudflare.com/ajax/libs/web3/1.8.0/web3.min.js',
  },
  {
    src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    attributes: {
      integrity: 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=',
      crossorigin: '',
    },
  },
  {
    src: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
  },
  {
    src: '/legacy/contracts.js',
  },
  {
    src: '/legacy/app.js',
  },
];

const legacyMarkup = `
<!-- Header -->
  <header>
    <div class="container">
      <div class="header-content">
        <div class="logo">
          <div class="logo-icon"><i class="fas fa-leaf"></i></div>
          <div class="logo-text">
            <h1>EcoTraceDAO</h1>
            <p>Agricultural Traceability & Environmental Seals</p>
          </div>
        </div>
        <button id="connectBtn" class="connect-btn">
          <i class="fas fa-wallet"></i> Connect Wallet
        </button>
      </div>
    </div>
  </header>

  <!-- Main Container -->
  <div class="container">
    <!-- Navigation Tabs -->
    <div class="nav-tabs">
      <button class="tab-btn active" data-tab="trace"><i class="fas fa-route"></i> Product Trace</button>
      <button class="tab-btn" data-tab="farmer"><i class="fas fa-tractor"></i> Farmer Portal</button>
      <button class="tab-btn" data-tab="customer"><i class="fas fa-hand-holding-heart"></i> Customer Portal</button>
      <button class="tab-btn" data-tab="consumer"><i class="fas fa-search"></i> Verify Product</button>
      <button class="tab-btn" data-tab="dashboard"><i class="fas fa-chart-line"></i> Dashboard</button>
    </div>

    <!-- ==================== Product Trace Tab ==================== -->
    <div id="trace-tab" class="tab-content">
      <!-- About / Journey / Farms map (igual a tu versión actual) -->

      <!-- About EcoTraceDAO -->
      <div class="card about-card" id="aboutEcoTrace">
        <div class="about-header">
          <div class="about-icon"><i class="fas fa-circle-info"></i></div>
          <div class="about-title-wrap">
            <h2 class="card-title" style="margin:0;">About EcoTraceDAO</h2>
            <p class="about-sub">Environmental Asset Registry for Agricultural Products</p>
          </div>
          <div class="about-tags">
            <span class="tag">EVM</span>
            <span class="tag">Open Source</span>
            <span class="tag">MIT License</span>
          </div>
        </div>

        <div class="about-grid">
          <div class="about-col">
            <p><strong>EcoTraceDAO</strong> is an on-chain environmental asset registry for agricultural products. It aggregates verifiable field evidence, tokenizes it (e.g., NFTs / on-chain records), and makes it publicly visible so end users can understand environmental attributes and optionally compensate the carbon footprint of a product.</p>

            <p class="about-ic-head"><i class="fas fa-diagram-project"></i> Interconnections</p>
            <p>Integrated with <em>GabbiiDAO</em> (environmental-impact DAO enabling compensation workflows) and <em>Mayordomo</em> (an assistant that helps farmers commercialize products and add value through environmental &amp; social responsibility signals generated via EcoTraceDAO).</p>
          </div>

          <div class="about-col">
            <ul class="feature-list">
              <li><i class="fas fa-check-circle"></i> Register farms/products and attach environmental evidence to them.</li>
              <li><i class="fas fa-check-circle"></i> Tokenize evidence and seals for portable, auditable on-chain records.</li>
              <li><i class="fas fa-check-circle"></i> Expose environmental attributes to the public (traceability, seals, proofs).</li>
              <li><i class="fas fa-check-circle"></i> Enable farmers to discover &amp; sell environmental assets via participatory verification.</li>
            </ul>
          </div>
        </div>

        <div class="about-footer">
          <div class="about-meta">
            <strong>Governance / Origin:</strong> EcoTraceDAO is a product of Corporación KaidáO - NIT 9019577984.
          </div>
          <a class="btn-github" href="https://github.com/kaidaocorporation/kaidao_hackathon_lacchain?tab=readme-ov-file" target="_blank" rel="noopener">
            <i class="fab fa-github"></i> Repository
          </a>
        </div>
      </div>

      <!-- Product Journey (demo route) -->
      <div class="card">
        <h2 class="card-title">
          <i class="fas fa-seedling" style="color:#10b981;margin-right:12px;"></i>
          Product Journey Visualization
        </h2>

        <div id="journeyMap" class="map-container"></div>

        <div class="journey-steps">
          <div class="step-item">
            <div class="step-icon farm"><i class="fas fa-tractor"></i></div>
            <div class="step-title">Farm</div>
            <div class="step-subtitle">Origin</div>
          </div>
          <div class="step-line active"></div>
          <div class="step-item">
            <div class="step-icon transport"><i class="fas fa-truck"></i></div>
            <div class="step-title">Transport</div>
            <div class="step-subtitle">Logistics</div>
          </div>
          <div class="step-line"></div>
          <div class="step-item">
            <div class="step-icon consumer"><i class="fas fa-shopping-cart"></i></div>
            <div class="step-title">Consumer</div>
            <div class="step-subtitle">Purchase</div>
          </div>
        </div>

        <div class="product-info">
          <div class="info-grid">
            <div class="info-section">
              <h3>Product Details</h3>
              <div class="info-item"><i class="fas fa-coffee" style="color:#92400e;"></i><span>Café Arábica Premium</span></div>
              <div class="info-item"><i class="fas fa-weight" style="color:#6b7280;"></i><span>Batch: LOTE001-2025 (1,000 kg)</span></div>
              <div class="info-item"><i class="fas fa-calendar" style="color:#6b7280;"></i><span>Harvested: March 2025</span></div>
            </div>
            <div class="info-section">
              <h3>Farm Origin</h3>
              <div class="info-item"><i class="fas fa-map-marker-alt" style="color:#ef4444;"></i><span>Finca Café Verde, Bogotá, Colombia</span></div>
              <div class="info-item"><i class="fas fa-user" style="color:#6b7280;"></i><span>Carlos Mendez (Farmer)</span></div>
              <div class="info-item"><i class="fas fa-shield-alt" style="color:#10b981;"></i><span style="color:#10b981;font-weight:600;">Deforestation-Free Certified</span></div>
            </div>
          </div>
        </div>

        <div class="seals-grid">
          <div class="seal-card carbon">
            <div class="seal-header">
              <h3>Carbon Footprint Seal</h3>
              <div class="seal-icon carbon"><i class="fas fa-leaf"></i></div>
            </div>
            <div class="seal-value carbon">250 kg CO₂</div>
            <div class="seal-label">per kg of product</div>
            <div class="seal-details">Distance: Bogotá → Miami (2,500 km)</div>
            <div class="seal-badge"><i class="fas fa-check"></i> Verified</div>
          </div>

          <div class="seal-card deforestation">
            <div class="seal-header">
              <h3>Deforestation-Free Seal</h3>
              <div class="seal-icon deforestation"><i class="fas fa-tree"></i></div>
            </div>
            <div class="seal-value deforestation">EU Compliant</div>
            <div class="seal-label">EUDR Regulation</div>
            <div class="seal-details">Cert: EU-EUDR-CERT-2025-001</div>
            <div class="seal-badge deforestation"><i class="fas fa-check"></i> Verified</div>
          </div>
        </div>
      </div>

      <!-- Registered Farms -->
      <div class="card">
        <h2 class="card-title">
          <i class="fas fa-globe-americas" style="color:#10b981; margin-right:12px;"></i>
          Registered Farms Map
        </h2>

        <div id="farmsMap" class="map-container">
          <div class="map-legend">
            <div class="legend-item">
              <div class="legend-dot" style="background:#10b981;"></div>
              <span>Deforestation-Free</span>
            </div>
            <div class="legend-item">
              <div class="legend-dot" style="background:#f59e0b;"></div>
              <span>Standard Farm</span>
            </div>
          </div>
        </div>

        <div class="text-center mb-4">
          <button id="refreshFarmsBtn" class="form-btn secondary" style="width:auto; padding:10px 16px;">
            <i class="fas fa-sync"></i> Refresh Farms
          </button>
        </div>

        <div id="farmsList" class="seals-grid"></div>
        <div id="farmsEmpty" class="text-center mb-4 hidden" style="color:#6b7280;">
          No farms found.
        </div>
      </div>
    </div>

    <!-- ==================== Farmer Portal Tab ==================== -->
    <div id="farmer-tab" class="tab-content hidden">
      <div class="form-grid">
        <!-- Register Farm with Map -->
        <div class="form-card">
          <h3 class="form-title">
            <i class="fas fa-plus-circle" style="color:#10b981;margin-right:8px;"></i>
            Register New Farm
          </h3>
          <form id="farmForm">
            <div class="form-group">
              <label class="form-label">Farm Name</label>
              <input type="text" id="farmName" class="form-input" placeholder="e.g., Finca Verde" required>
            </div>
            <div class="form-group">
              <label class="form-label">Location Coordinates</label>
              <div class="grid-2">
                <input type="number" step="any" id="farmLat" class="form-input" placeholder="Latitude" required>
                <input type="number" step="any" id="farmLon" class="form-input" placeholder="Longitude" required>
              </div>
              <button type="button" id="pickLocationBtn" class="map-pick-btn">
                <i class="fas fa-map-marked-alt"></i> Pick on Map
              </button>
            </div>

            <div id="farmMapPreview" class="map-container map-mini hidden"></div>

            <div class="form-checkbox">
              <input type="checkbox" id="deforestationFree">
              <label for="deforestationFree">Deforestation-Free Certified</label>
            </div>
            <button type="submit" class="form-btn primary">
              <i class="fas fa-tractor"></i> Register Farm
            </button>
          </form>
        </div>

        <!-- Register Product -->
        <div class="form-card">
          <h3 class="form-title">
            <i class="fas fa-seedling" style="color:#3b82f6;margin-right:8px;"></i>
            Register New Product
          </h3>
          <form id="productForm">
            <div class="form-group">
              <label class="form-label">Farm ID</label>
              <input type="number" id="productFarmId" class="form-input" placeholder="1" required>
            </div>
            <div class="form-group">
              <label class="form-label">Product Name</label>
              <input type="text" id="productName" class="form-input" placeholder="e.g., Café Arábica" required>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label class="form-label">Quantity (kg)</label>
                <input type="number" id="productQuantity" class="form-input" placeholder="1000" required>
              </div>
              <div class="form-group">
                <label class="form-label">Batch ID</label>
                <input type="text" id="productBatch" class="form-input" placeholder="LOTE001-2025" required>
              </div>
            </div>
            <button type="submit" class="form-btn secondary">
              <i class="fas fa-plus"></i> Register Product
            </button>
          </form>
        </div>
      </div>

      <!-- Issue Seals -->
      <div class="card mt-4">
        <h3 class="form-title text-center">
          <i class="fas fa-certificate" style="color:#7c3aed;margin-right:8px;"></i>
          Issue Deforestation-Free Seals
        </h3>

        <div class="form-card" style="max-width:520px;margin:0 auto;">
          <p style="color:#6b7280; margin-bottom:12px;">Verify documentation from certifiers and issue a deforestation-free seal that customers can later pair with carbon compensation.</p>
          <form id="deforestationForm">
            <div class="form-group">
              <input type="number" id="defoProductId" class="form-input" placeholder="Product ID" required>
            </div>
            <div class="form-group">
              <input type="text" id="verificationData" class="form-input" placeholder="Verification Data" required>
            </div>
            <button type="submit" class="form-btn secondary">Issue Deforestation Seal</button>
          </form>
        </div>
      </div>
    </div>
    
    <!-- ==================== Customer Portal Tab ==================== -->
    <div id="customer-tab" class="tab-content hidden">
      <div class="card">
        <h2 class="card-title">
          <i class="fas fa-hand-holding-heart" style="color:#f97316;margin-right:12px;"></i>
          Customer Footprint Compensation
        </h2>

        <p style="color:#6b7280; margin-bottom:18px;">Consumers can estimate and compensate the carbon footprint associated with a product by issuing a Carbon Footprint Seal NFT that travels with their purchase.</p>

        <div class="form-card" style="max-width:640px;">
          <h4 style="font-weight:600;margin-bottom:15px;">Carbon Footprint Seal</h4>

          <form id="carbonForm">
            <div class="form-group">
              <input type="number" id="carbonProductId" class="form-input" placeholder="Product ID" required>
            </div>

            <div class="grid-2">
              <div class="form-group">
                <input type="number" step="any" id="consumerLat" class="form-input" placeholder="Consumer Lat" required>
              </div>
              <div class="form-group">
                <input type="number" step="any" id="consumerLon" class="form-input" placeholder="Consumer Lon" required>
              </div>
            </div>

            <div class="grid-2" style="gap:12px; margin-top:8px;">
              <button type="button" id="pickConsumerBtn" class="map-pick-btn">
                <i class="fas fa-map-marked-alt"></i> Pick on Map
              </button>
              <button type="button" id="useMyLocationBtn" class="map-pick-btn">
                <i class="fas fa-compass"></i> Use My Location
              </button>
            </div>

            <div id="carbonMap" class="map-container map-mini hidden" style="margin-top:12px;"></div>

            <div id="carbonStats" class="hidden" style="margin-top:8px; color:#6b7280; font-size:14px;">
              Distance: <strong><span id="distanceKm">0.0</span> km</strong>
              &nbsp;•&nbsp;
              Est. CO₂ per kg: <strong><span id="footprintKg">0.00</span> kg</strong>
            </div>

            <button type="submit" class="form-btn primary" style="margin-top:12px;">
              Issue Carbon Seal
            </button>
          </form>
        </div>
      </div>
    </div>

    <!-- ==================== Consumer Portal Tab ==================== -->
    <div id="consumer-tab" class="tab-content hidden">
      <div class="card">
        <h2 class="card-title">
          <i class="fas fa-qrcode" style="color:#7c3aed;margin-right:12px;"></i>
          Verify Product Authenticity
        </h2>

        <div class="verify-container">
          <!-- Query 1: Verify by Product ID -->
          <div class="form-group">
            <label class="form-label">Enter Product ID</label>
            <div class="verify-input">
              <input type="number" id="verifyProductId" class="form-input" placeholder="Product ID" style="flex:1;">
              <button id="verifyBtn" class="form-btn primary" style="width:auto;padding:12px 20px;">
                <i class="fas fa-search"></i>
              </button>
            </div>
          </div>

          <hr style="border:none;border-top:1px solid #e5e7eb;margin:18px 0;">

          <!-- Query 2: View Seal NFT by Token ID -->
          <div class="form-group">
            <label class="form-label">View Seal NFT (Token ID)</label>
            <div class="verify-input">
              <input type="number" id="viewTokenId" class="form-input" placeholder="NFT Token ID" style="flex:1;">
              <button id="viewTokenBtn" class="form-btn secondary" style="width:auto;padding:12px 20px;">
                <i class="fas fa-image"></i>
              </button>
            </div>
          </div>

          <!-- Result: NFT viewer (2 columnas) -->
          <div id="tokenViewer" class="verify-result hidden" style="margin-top:14px;">
            <div class="verify-header">
              <i class="fas fa-image"></i>
              <span class="verify-title">Seal NFT</span>
            </div>

            <div class="token-grid" style="display:grid;grid-template-columns:1fr 1.2fr;gap:18px;align-items:start;">
              <!-- LEFT: details -->
              <div id="tokenDetails" class="verify-details">
                <div style="font-weight:600;margin-bottom:8px;">Seal Details</div>
                <div class="kv">
                  <div><span>Token ID:</span><strong id="tvTokenId">—</strong></div>
                  <div><span>Product ID:</span><strong id="tvProductId">—</strong></div>
                  <div><span>Type:</span><strong id="tvType">—</strong></div>
                  <div><span>Carbon Footprint:</span><strong id="tvFootprint">—</strong></div>
                  <div><span>Valid:</span><strong id="tvValid">—</strong></div>
                  <div><span>Issued:</span><strong id="tvIssued">—</strong></div>
                  <div><span>Verification:</span><strong id="tvVerification">—</strong></div>
                </div>
                <div id="tvNote" style="margin-top:10px;color:#6b7280;font-size:13px;"></div>
              </div>

              <!-- RIGHT: image preview -->
              <div>
                <img id="tokenImage" alt="NFT image"
                     style="width:100%;height:auto;border-radius:12px;display:block;"/>
                <div id="tokenCaption" style="margin-top:8px;color:#374151;font-size:14px;"></div>
              </div>
            </div>
          </div>

          <!-- Result: product + map -->
          <div id="verificationResult" class="verify-result hidden" style="margin-top:14px;">
            <div class="verify-header">
              <i class="fas fa-check-circle"></i>
              <span class="verify-title">Product Verified</span>
            </div>
            <div id="verificationDetails" class="verify-details"></div>
            <div id="productVerifyMap" class="map-container map-mini hidden"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== Dashboard Tab ==================== -->
    <div id="dashboard-tab" class="tab-content hidden">
      <div class="card">
        <h2 class="card-title"><i class="fas fa-chart-line" style="color:#10b981;margin-right:10px;"></i> My Dashboard</h2>

        <!-- Stats -->
        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:10px;">
          <div class="stat-card">
            <div class="stat-title">Total Products</div>
            <div class="stat-value" id="statTotalProducts">—</div>
            <div class="stat-sub">+12.5% from last month</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">NFT Seals</div>
            <div class="stat-value" id="statNftSeals">—</div>
            <div class="stat-sub">+8.2% from last month</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Verified Farms</div>
            <div class="stat-value" id="statVerifiedFarms">—</div>
            <div class="stat-sub">On-chain</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Active Farms</div>
            <div class="stat-value" id="statActiveFarms">—</div>
            <div class="stat-sub" style="color:#10b981;">Active</div>
          </div>
        </div>

        <!-- Charts -->
        <div class="chart-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
          <div class="chart-card">
            <div class="chart-title">Carbon Credits Overview</div>
            <div style="height:360px;"><canvas id="creditsChart"></canvas></div>
          </div>

          <div class="chart-card">
            <div class="chart-title">Environmental Impact</div>
            <div style="height:360px;"><canvas id="impactChart"></canvas></div>
            <div id="impactMetrics" style="margin-top:12px;display:grid;grid-template-columns:1fr;gap:6px;color:#374151;"></div>
          </div>
          
        </div>
        <div class="card" id="recentProductsCard" style="margin-top:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="chart-title">Recent Products</div>
            <div id="recentProductsTotal" style="background:#ecfdf5;color:#065f46;padding:6px 10px;border-radius:999px;font-weight:600;font-size:13px;">0 Total</div>
          </div>
        
          <div class="table-wrap" style="overflow:auto;">
            <table style="width:100%;border-collapse:separate;border-spacing:0 10px;">
              <thead style="text-align:left;color:#6b7280;font-size:14px;">
                <tr>
                  <th style="padding:8px 12px;">Product</th>
                  <th style="padding:8px 12px;">Farm</th>
                  <th style="padding:8px 12px;">Location</th>
                  <th style="padding:8px 12px;">Carbon Score</th>
                  <th style="padding:8px 12px;">Tokens</th>
                  <th style="padding:8px 12px;">Status</th>
                  <th style="padding:8px 12px;">Actions</th>
                </tr>
              </thead>
              <tbody id="recentProductsBody"></tbody>
            </table>
          </div>
        </div>
        
      </div>
    </div>
  </div>

  <!-- Map Selection Modal -->
  <div id="mapModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Select Location</h3>
        <button class="modal-close" onclick="closeMapModal()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="color:#6b7280; margin-bottom:15px;">Click on the map to select a location.</p>
        <div id="modalMap" class="modal-map"></div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">Selected Latitude</label>
            <input type="text" id="modalLat" class="form-input" readonly>
          </div>
          <div class="form-group">
            <label class="form-label">Selected Longitude</label>
            <input type="text" id="modalLon" class="form-input" readonly>
          </div>
        </div>
        <button id="confirmLocationBtn" class="form-btn primary">Confirm Location</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <div id="toast" class="toast">
    <i class="fas fa-check"></i>
    <span id="toastMessage">Action completed successfully!</span>
  </div>
`;

const loadedScripts = new Set();

function loadScript(src, attributes = {}) {
  if (loadedScripts.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      loadedScripts.add(src);
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    Object.entries(attributes).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      script.setAttribute(key, value);
    });
    script.onload = () => {
      loadedScripts.add(src);
      resolve();
    };
    script.onerror = (event) => {
      reject(new Error(`Failed to load script: ${src}`));
    };
    document.body.appendChild(script);
  });
}

export default function App() {
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (const item of scriptQueue) {
        if (cancelled) break;
        try {
          await loadScript(item.src, item.attributes || {});
        } catch (error) {
          console.error('Failed to load legacy script', item.src, error);
          break;
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return <div dangerouslySetInnerHTML={{ __html: legacyMarkup }} />;
}
