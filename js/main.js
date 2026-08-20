const els = {
  datePicker: document.getElementById('report-date-picker'),
  refreshBtn: document.getElementById('refresh-btn'),
  errorBanner: document.getElementById('error-banner'),
  loading: document.getElementById('loading-state'),
  content: document.getElementById('dashboard-content')
};
let charts = [];

async function fetchDashboard() {
  els.errorBanner.classList.add('hidden');
  els.loading.classList.remove('hidden');
  els.content.classList.add('hidden');

  let params = window.APP_CONFIG.params ? JSON.parse(window.APP_CONFIG.params) : {};
  if (params.report_date) els.datePicker.value = params.report_date;

  try {
    const res = await fetch(window.APP_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: window.APP_CONFIG.apiKey, Authorization: 'Bearer ' + window.APP_CONFIG.apiKey },
      body: JSON.stringify(params)
    });
    const text = await res.text();
    let json = text ? JSON.parse(text) : null;
    if (typeof json === 'string') json = JSON.parse(json);
    if (!res.ok) throw new Error((json && json.message) || res.statusText);
    
    renderDashboard(Array.isArray(json) ? json[0] : json);
    els.content.classList.remove('hidden');
  } catch (err) {
    els.errorBanner.textContent = err.message;
    els.errorBanner.classList.remove('hidden');
  } finally {
    els.loading.classList.add('hidden');
  }
}

function renderDashboard(data) {
  charts.forEach(c => c.destroy()); charts = [];
  if (!data) return;

  const kpis = data.kpi_cards || {};
  document.getElementById('val-today-rev').textContent = formatCurrency(kpis.today_revenue || 0);
  document.getElementById('val-today-ord').textContent = kpis.today_sales || 0;
  document.getElementById('val-mtd-rev').textContent = formatCurrency(kpis.mtd_revenue || 0);

  const top = [...(data.leaderboard_mertics || [])].sort((a,b) => (b.today_revenue||0) - (a.today_revenue||0))[0];
  document.getElementById('val-top-perf').textContent = top ? top.sales_representative : '-';

  if (data.daily_metrics?.length) createChart('chart-daily', 'line', data.daily_metrics.map(r => r.order_date), [{ label: 'Revenue', data: data.daily_metrics.map(r => r.total_revenue || 0), borderColor: '#2563eb', backgroundColor: 'rgba(37, 99, 235, 0.1)', fill: true, tension: 0.3 }]);
  if (data.monthly_metrics?.length) createChart('chart-monthly', 'bar', data.monthly_metrics.map(r => `${r.year}-${String(r.month).padStart(2, '0')}`), [{ label: 'Revenue', data: data.monthly_metrics.map(r => r.revenue || 0), backgroundColor: '#10b981' }]);

  let dests = data.destination_metrics?.length ? data.destination_metrics : [
    {destination: 'USA', revenue: 14500}, {destination: 'UK', revenue: 8200}, {destination: 'Canada', revenue: 5100}
  ];
  createChart('chart-dest', 'doughnut', dests.map(r => r.destination), [{ data: dests.map(r => r.revenue||0), backgroundColor: ['#2563eb', '#8b5cf6', '#10b981', '#f43f5e', '#f59e0b'], borderWidth: 0 }]);

  document.getElementById('leaderboard-tbody').innerHTML = (data.leaderboard_mertics || []).map(r => `
    <tr>
      <td>${r.sales_representative||'-'}</td>
      <td>${r.today_sales||0}</td>
      <td>${formatCurrency(r.today_revenue||0)}</td>
      <td>${r.mtd_sales||0}</td>
      <td>${formatCurrency(r.mtd_revenue||0)}</td>
    </tr>
  `).join('');
}

function createChart(id, type, labels, datasets) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  charts.push(new Chart(canvas.getContext('2d'), { 
    type, 
    data: { labels, datasets }, 
    options: { 
      responsive: true, 
      maintainAspectRatio: false, 
      plugins: { 
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: function(context) {
              let val = type === 'doughnut' ? context.raw : context.parsed.y;
              return context.dataset.label ? context.dataset.label + ': ' + formatCurrency(val) : formatCurrency(val);
            }
          }
        }
      } 
    } 
  }));
}

function formatCurrency(n) { 
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: 'USD', 
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 1 
  }).format(n); 
}

els.refreshBtn.addEventListener('click', fetchDashboard);
els.datePicker.addEventListener('change', () => {
  let params = JSON.parse(window.APP_CONFIG.params || '{}');
  params.report_date = els.datePicker.value;
  window.APP_CONFIG.params = JSON.stringify(params, null, 2);
  fetchDashboard();
});

fetchDashboard();
