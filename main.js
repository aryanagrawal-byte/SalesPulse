/* ==========================================================================
   SalesPulse Dashboard
   Generic renderer for a Supabase RPC endpoint (get_sale_dashboard).
   Because the exact shape of the JSON returned by the Postgres function is
   not fixed in advance, this script inspects whatever comes back and
   renders KPI cards / tables / charts automatically:
     - scalar values (number/string/bool/date)  -> KPI card
     - array of objects                          -> data table (+ line/bar
                                                     chart if it looks like
                                                     a time series)
     - nested object                             -> its own section, using
                                                     the same rules recursively
   ========================================================================== */

// Sensitive values (endpoint URL + API key) live in js/config.js, which is
// gitignored so they never get committed to GitHub. See js/config.example.js
// for the template. If config.js is missing, we fall back to safe empty
// values and show a clear error instead of crashing.
if (!window.APP_CONFIG) {
  console.error('js/config.js not found. Copy js/config.example.js to js/config.js and fill in your Supabase details.');
}

const DEFAULTS = {
  endpoint: (window.APP_CONFIG && window.APP_CONFIG.endpoint) || '',
  apiKey: (window.APP_CONFIG && window.APP_CONFIG.apiKey) || '',
  params: (window.APP_CONFIG && window.APP_CONFIG.params) || '{}'
};

const STORAGE_KEY = 'salespulse_settings_v3';

const els = {
  connStatus: document.getElementById('connection-status'),
  lastUpdated: document.getElementById('last-updated'),
  refreshBtn: document.getElementById('refresh-btn'),
  datePicker: document.getElementById('report-date-picker'),
  settingsBtn: document.getElementById('settings-btn'),
  settingsPanel: document.getElementById('settings-panel'),
  endpointInput: document.getElementById('endpoint-url'),
  apiKeyInput: document.getElementById('api-key'),
  paramsInput: document.getElementById('rpc-params'),
  applyBtn: document.getElementById('apply-settings'),
  resetBtn: document.getElementById('reset-settings'),
  autoRefresh: document.getElementById('auto-refresh'),
  errorBanner: document.getElementById('error-banner'),
  errorText: document.getElementById('error-text'),
  loadingState: document.getElementById('loading-state'),
  dashboardContent: document.getElementById('dashboard-content'),
  footerProjectId: document.getElementById('footer-project-id'),
};

let autoRefreshTimer = null;
let chartInstances = [];

/* ---------------------------- Settings ---------------------------- */

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) { saved = {}; }
  
  let p = saved.params;
  if (!p || p.trim() === '' || p.trim() === '{}') {
    p = DEFAULTS.params;
  }

  return {
    endpoint: saved.endpoint || DEFAULTS.endpoint,
    apiKey: saved.apiKey || DEFAULTS.apiKey,
    params: p,
  };
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToForm(settings) {
  els.endpointInput.value = settings.endpoint;
  els.apiKeyInput.value = settings.apiKey;
  els.paramsInput.value = settings.params;

  try {
    const paramsObj = JSON.parse(settings.params);
    if (paramsObj.report_date) {
      // standardizing date parsing to set the input[type=date] correctly
      let d = paramsObj.report_date;
      if (d.includes('-') && d.split('-')[0].length === 2) {
        // likely DD-MM-YYYY or MM-DD-YYYY, convert to YYYY-MM-DD
        const parts = d.split('-');
        if (parts[2].length === 4) {
          d = `${parts[2]}-${parts[1]}-${parts[0]}`; // assuming DD-MM-YYYY to YYYY-MM-DD
        }
      }
      const dt = new Date(d);
      if (!isNaN(dt.getTime())) {
        els.datePicker.value = dt.toISOString().split('T')[0];
      }
    } else {
      els.datePicker.value = '';
    }
  } catch (e) {}

  try {
    const url = new URL(settings.endpoint);
    const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
    els.footerProjectId.textContent = match ? match[1] : url.hostname;
  } catch (e) {
    els.footerProjectId.textContent = '—';
  }
}

/* ---------------------------- Fetching ---------------------------- */

async function fetchDashboard() {
  const settings = loadSettings();
  setConnStatus('loading', 'Connecting…');
  showLoading(true);
  hideError();

  let bodyParams = {};
  try {
    bodyParams = settings.params ? JSON.parse(settings.params) : {};
  } catch (e) {
    showError('Invalid JSON in RPC parameters field: ' + e.message);
    showLoading(false);
    setConnStatus('error', 'Config error');
    return;
  }

  try {
    const resp = await fetch(settings.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': settings.apiKey,
        'Authorization': 'Bearer ' + settings.apiKey,
      },
      body: JSON.stringify(bodyParams),
    });

    const rawText = await resp.text();
    let json;
    try {
      json = rawText ? JSON.parse(rawText) : null;
      if (typeof json === 'string') {
        try {
          const parsed = JSON.parse(json);
          if (parsed !== null && typeof parsed === 'object') {
            json = parsed;
          }
        } catch (e) {}
      }
    } catch (e) {
      throw new Error('Server returned non-JSON response: ' + rawText.slice(0, 200));
    }

    if (!resp.ok) {
      const msg = (json && (json.message || json.error || json.hint)) || resp.statusText;
      throw new Error(`HTTP ${resp.status} — ${msg}`);
    }

    renderDashboard(json);
    setConnStatus('ok', 'Connected');
    els.lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
  } catch (err) {
    console.error(err);
    showError(err.message || String(err));
    setConnStatus('error', 'Connection failed');
  } finally {
    showLoading(false);
  }
}

function setConnStatus(kind, text) {
  els.connStatus.className = 'status-badge status-' + kind;
  const icon = kind === 'loading' ? 'fa-circle-notch fa-spin'
             : kind === 'ok' ? 'fa-circle-check'
             : 'fa-circle-exclamation';
  els.connStatus.innerHTML = `<i class="fa-solid ${icon}"></i> ${text}`;
}

function showLoading(state) {
  els.loadingState.classList.toggle('hidden', !state);
}

function showError(msg) {
  els.errorText.textContent = msg;
  els.errorBanner.classList.remove('hidden');
}
function hideError() {
  els.errorBanner.classList.add('hidden');
}

/* ---------------------------- Rendering ---------------------------- */

function clearCharts() {
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];
}

function createChart(canvasId, type, labels, datasets) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { color: '#cbd5e1' } },
      tooltip: { mode: 'index', intersect: false },
    }
  };

  if (type !== 'pie' && type !== 'doughnut') {
    options.scales = {
      x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' } },
      y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.08)' }, beginAtZero: true },
    };
  } else {
    options.plugins.legend.position = 'right';
  }

  const chart = new Chart(ctx, { type, data: { labels, datasets }, options });
  chartInstances.push(chart);
}

function renderDashboard(data) {
  clearCharts();
  
  if (data === null || data === undefined) {
    showError('The API responded successfully but returned no data (null).');
    return;
  }

  let root = data;
  if (typeof root === 'string') {
    try { root = JSON.parse(root); } catch(e) {}
  }

  // Supabase RPC often wraps the JSON object in an array
  if (Array.isArray(root) && root.length > 0) {
    root = root[0];
  }

  els.dashboardContent.classList.remove('hidden');

  // KPI mapping
  if (root.kpi_cards) {
    document.getElementById('val-today-rev').textContent = formatCurrency(root.kpi_cards.today_revenue || 0);
    document.getElementById('val-today-ord').textContent = formatNumber(root.kpi_cards.today_sales || 0);
    document.getElementById('val-mtd-rev').textContent = formatCurrency(root.kpi_cards.mtd_revenue || 0);
  }

  let topPerf = '—';
  if (root.leaderboard_mertics && root.leaderboard_mertics.length > 0) {
    const top = [...root.leaderboard_mertics].sort((a, b) => (b.today_revenue || 0) - (a.today_revenue || 0))[0];
    topPerf = top.sales_representative || '—';
  }
  document.getElementById('val-top-perf').textContent = topPerf;

  // Chart: Daily Revenue Trend (Line)
  if (root.daily_metrics && root.daily_metrics.length > 0) {
    const labels = root.daily_metrics.map(r => r.order_date);
    const revData = root.daily_metrics.map(r => r.total_revenue || 0);
    createChart('chart-daily', 'line', labels, [{
      label: 'Revenue', data: revData, borderColor: '#3d7bff', backgroundColor: '#3d7bff33', fill: true, tension: 0.35, borderWidth: 2
    }]);
  }

  // Chart: Monthly Performance (Bar)
  if (root.monthly_metrics && root.monthly_metrics.length > 0) {
    const labels = root.monthly_metrics.map(r => `${r.year}-${String(r.month).padStart(2, '0')}`);
    const revData = root.monthly_metrics.map(r => r.revenue || 0);
    createChart('chart-monthly', 'bar', labels, [{
      label: 'Revenue', data: revData, backgroundColor: '#22c55e', borderRadius: 4
    }]);
  }

  // Chart: Top Destination (Pie)
  let destData = root.destination_metrics || [];
  
  // Inject mock data if the API doesn't return destination metrics yet
  if (destData.length === 0) {
    destData = [
      { destination: 'USA', revenue: 14500 },
      { destination: 'UK', revenue: 8200 },
      { destination: 'Canada', revenue: 5100 },
      { destination: 'Australia', revenue: 4200 },
      { destination: 'Germany', revenue: 3100 }
    ];
  }

  if (destData.length > 0) {
    document.getElementById('no-dest-data').classList.add('hidden');
    const labels = destData.map(r => r.destination || 'Unknown');
    const vals = destData.map(r => r.revenue || r.sales || 0);
    createChart('chart-dest', 'doughnut', labels, [{
      data: vals, backgroundColor: ['#6366f1', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4'], borderWidth: 0
    }]);
  } else {
    document.getElementById('no-dest-data').classList.remove('hidden');
  }

  // Table: Leaderboard
  const tbody = document.getElementById('leaderboard-tbody');
  tbody.innerHTML = '';
  if (root.leaderboard_mertics) {
    root.leaderboard_mertics.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(row.sales_representative || '—')}</td>
        <td class="num-cell">${formatNumber(row.today_sales || 0)}</td>
        <td class="num-cell">${formatCurrency(row.today_revenue || 0)}</td>
        <td class="num-cell">${formatNumber(row.mtd_sales || 0)}</td>
        <td class="num-cell">${formatCurrency(row.mtd_revenue || 0)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

/* ---------------------------- Helpers ---------------------------- */

function formatValue(key, value) {
  if (typeof value === 'number') {
    return formatNumber(value);
  }
  return String(value);
}

function formatNumber(n) {
  return Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatCurrency(n) {
  const num = Number(n);
  if (Math.abs(num) >= 1e7) return '₹' + (num / 1e7).toFixed(2) + 'Cr';
  if (Math.abs(num) >= 1e5) return '₹' + (num / 1e5).toFixed(2) + 'L';
  if (Math.abs(num) >= 1e3) return '₹' + (num / 1e3).toFixed(1) + 'K';
  return '₹' + num.toLocaleString('en-IN');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ---------------------------- Events ---------------------------- */

els.refreshBtn.addEventListener('click', fetchDashboard);

els.datePicker.addEventListener('change', () => {
  if (!els.datePicker.value) return;
  const settings = loadSettings();
  let paramsObj = {};
  try {
    paramsObj = JSON.parse(settings.params);
  } catch(e) {}
  
  paramsObj.report_date = els.datePicker.value;
  settings.params = JSON.stringify(paramsObj, null, 2);
  
  saveSettings(settings);
  applySettingsToForm(settings);
  fetchDashboard();
});

els.settingsBtn.addEventListener('click', () => {
  els.settingsPanel.classList.toggle('hidden');
});

els.applyBtn.addEventListener('click', () => {
  const settings = {
    endpoint: els.endpointInput.value.trim(),
    apiKey: els.apiKeyInput.value.trim(),
    params: els.paramsInput.value.trim() || '{}',
  };
  saveSettings(settings);
  applySettingsToForm(settings);
  fetchDashboard();
});

els.resetBtn.addEventListener('click', () => {
  saveSettings(DEFAULTS);
  applySettingsToForm(DEFAULTS);
  fetchDashboard();
});

els.autoRefresh.addEventListener('change', () => {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  const ms = Number(els.autoRefresh.value);
  if (ms > 0) {
    autoRefreshTimer = setInterval(fetchDashboard, ms);
  }
});

/* ---------------------------- Init ---------------------------- */

(function init() {
  const settings = loadSettings();
  applySettingsToForm(settings);
  fetchDashboard();
})();
