// ---------- Tab navigation ----------

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabButtons.forEach((b) => b.classList.remove('active'));
    tabPanels.forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'history') loadHistory();
    if (btn.dataset.tab === 'analytics') loadAnalytics();
  });
});

// ---------- Helpers ----------

function formatMoney(n) {
  return '$' + Number(n).toFixed(2);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Something went wrong.');
  }
  return data;
}

// ---------- Live timestamp preview (entry form + loan form) ----------

function updateTimestampPreview(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = 'Will be recorded as: ' + formatDateTime(new Date().toISOString());
}

function updateAllTimestampPreviews() {
  updateTimestampPreview('timestamp-preview');
  updateTimestampPreview('loan-timestamp-preview');
}
updateAllTimestampPreviews();
setInterval(updateAllTimestampPreviews, 1000 * 30);

// ---------- Add expense ----------

const form = document.getElementById('expense-form');
const formMessage = document.getElementById('form-message');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.textContent = '';
  formMessage.className = 'form-message';

  const payload = {
    amount: document.getElementById('amount').value,
    category: document.getElementById('category').value,
    note: document.getElementById('note').value,
  };

  try {
    await api('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    form.reset();
    formMessage.textContent = 'Expense added.';
    formMessage.classList.add('success');
    showToast('Expense saved');
  } catch (err) {
    formMessage.textContent = err.message;
    formMessage.classList.add('error');
  }
});

// ---------- Add loan ----------
// A loan is stored as a regular expense with category "Loan" plus a
// "holder" field (the friend's name), so it automatically shows up in
// History and in the category breakdown on the Analytics tab.

const loanForm = document.getElementById('loan-form');
const loanFormMessage = document.getElementById('loan-form-message');

loanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loanFormMessage.textContent = '';
  loanFormMessage.className = 'form-message';

  const payload = {
    amount: document.getElementById('loan-amount').value,
    category: 'Loan',
    holder: document.getElementById('loan-holder').value,
    note: document.getElementById('loan-note').value,
  };

  try {
    await api('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    loanForm.reset();
    loanFormMessage.textContent = 'Loan added.';
    loanFormMessage.classList.add('success');
    showToast('Loan saved');
  } catch (err) {
    loanFormMessage.textContent = err.message;
    loanFormMessage.classList.add('error');
  }
});

// ---------- History ----------

const historyBody = document.getElementById('history-body');
const historyTable = document.getElementById('history-table');
const historyEmpty = document.getElementById('history-empty');
const filterCategory = document.getElementById('filter-category');
const filterFrom = document.getElementById('filter-from');
const filterTo = document.getElementById('filter-to');
const filterClear = document.getElementById('filter-clear');

async function loadHistory() {
  const params = new URLSearchParams();
  if (filterCategory.value) params.set('category', filterCategory.value);
  if (filterFrom.value) params.set('from', filterFrom.value);
  if (filterTo.value) params.set('to', filterTo.value);

  let expenses;
  try {
    expenses = await api('/api/expenses?' + params.toString());
  } catch (err) {
    showToast(err.message);
    return;
  }

  historyBody.innerHTML = '';

  if (expenses.length === 0) {
    historyTable.style.display = 'none';
    historyEmpty.style.display = 'block';
    return;
  }

  historyTable.style.display = 'table';
  historyEmpty.style.display = 'none';

  for (const exp of expenses) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="cell-date">${formatDateTime(exp.createdAt)}</td>
      <td>${escapeHtml(exp.category)}</td>
      <td class="cell-note">${exp.holder ? escapeHtml(exp.holder) : '—'}</td>
      <td class="cell-note">${escapeHtml(exp.note || '—')}</td>
      <td class="cell-amount">${formatMoney(exp.amount)}</td>
      <td class="cell-actions">
        <button class="icon-btn" data-action="delete" data-id="${exp.id}" title="Delete">✕</button>
      </td>
    `;
    historyBody.appendChild(tr);
  }
}

historyBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="delete"]');
  if (!btn) return;
  if (!confirm('Delete this expense?')) return;

  try {
    await api('/api/expenses/' + btn.dataset.id, { method: 'DELETE' });
    showToast('Expense deleted');
    loadHistory();
  } catch (err) {
    showToast(err.message);
  }
});

[filterCategory, filterFrom, filterTo].forEach((el) =>
  el.addEventListener('change', loadHistory)
);

filterClear.addEventListener('click', () => {
  filterCategory.value = '';
  filterFrom.value = '';
  filterTo.value = '';
  loadHistory();
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Analytics ----------

async function loadAnalytics() {
  let data;
  try {
    data = await api('/api/analytics');
  } catch (err) {
    showToast(err.message);
    return;
  }

  document.getElementById('stat-total').textContent = formatMoney(data.totalSpent);
  document.getElementById('stat-daily-avg').textContent = formatMoney(data.dailyAverage);
  document.getElementById('stat-top-category').textContent = data.topCategory
    ? data.topCategory.category
    : '–';
  document.getElementById('stat-count').textContent = data.transactionCount;

  // Bar chart: last 7 days
  const barChart = document.getElementById('bar-chart');
  barChart.innerHTML = '';
  const maxVal = Math.max(...data.last7Days.map((d) => d.total), 1);

  for (const day of data.last7Days) {
    const heightPct = (day.total / maxVal) * 100;
    const label = new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, {
      weekday: 'short',
    });
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `
      <div class="bar-value">${day.total > 0 ? formatMoney(day.total) : ''}</div>
      <div class="bar" style="height:${Math.max(heightPct, 2)}%"></div>
      <div class="bar-label">${label}</div>
    `;
    barChart.appendChild(col);
  }

  // Category breakdown
  const catEl = document.getElementById('category-breakdown');
  catEl.innerHTML = '';

  if (data.categoryBreakdown.length === 0) {
    catEl.innerHTML = '<div class="empty-state">No data yet.</div>';
    return;
  }

  const maxCat = data.categoryBreakdown[0].total;
  for (const cat of data.categoryBreakdown) {
    const row = document.createElement('div');
    row.className = 'cat-row';
    row.innerHTML = `
      <div class="cat-name">${escapeHtml(cat.category)}</div>
      <div class="cat-bar-track"><div class="cat-bar-fill" style="width:${(cat.total / maxCat) * 100}%"></div></div>
      <div class="cat-amount">${formatMoney(cat.total)}</div>
    `;
    catEl.appendChild(row);
  }
}

// ---------- Init ----------

loadHistory();
