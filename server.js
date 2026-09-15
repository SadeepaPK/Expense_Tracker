/**
 * Expense Tracker Backend — Plain Node.js, data stored in Supabase (Postgres)
 *
 * No external npm packages required: talks to Supabase's REST API
 * (PostgREST) using Node's built-in `fetch`, available in Node 18+.
 *
 * Required environment variables:
 *   SUPABASE_URL              e.g. https://xxxxxxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY the "service_role" secret key from
 *                             Supabase → Project Settings → API
 *
 * IMPORTANT: the service_role key must NEVER be sent to the browser.
 * It only ever lives here, on the server, in an environment variable.
 * The frontend keeps talking only to our own /api/... routes, exactly
 * as before — nothing changes on the client side.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

require("dotenv").config();

const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'expenses';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.\n' +
    'Set them before starting the server (see README.md).'
  );
  process.exit(1);
}

// ---------- Supabase REST helper ----------
// Talks to PostgREST at {SUPABASE_URL}/rest/v1/{table}

async function supabaseRequest(pathAndQuery, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // DELETE without a return preference can come back with an empty body
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      data = text;
    }
  }

  if (!res.ok) {
    const message = (data && data.message) || `Supabase request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

// Maps a Supabase row (snake_case) to the shape the frontend expects (camelCase)
function mapRow(row) {
  return {
    id: String(row.id),
    amount: Number(row.amount),
    category: row.category,
    note: row.note || '',
    holder: row.holder || null,
    createdAt: row.created_at,
  };
}

// ---------- Expense data access ----------

async function fetchExpenses({ category, from, to } = {}) {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('order', 'created_at.desc');

  if (category) params.append('category', `eq.${category}`);
  if (from) params.append('created_at', `gte.${new Date(from).toISOString()}`);
  if (to) {
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);
    params.append('created_at', `lte.${toDate.toISOString()}`);
  }

  const rows = await supabaseRequest(`${TABLE}?${params.toString()}`, { method: 'GET' });
  return rows.map(mapRow);
}

async function insertExpense({ amount, category, note, holder }) {
  const rows = await supabaseRequest(TABLE, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify([{ amount, category, note: note || '', holder: holder || null }]),
  });
  return mapRow(rows[0]);
}

async function updateExpense(id, { amount, category, note, holder }) {
  const params = new URLSearchParams({ id: `eq.${id}` });
  const rows = await supabaseRequest(`${TABLE}?${params.toString()}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ amount, category, note: note || '', holder: holder || null }),
  });
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

async function deleteExpense(id) {
  const params = new URLSearchParams({ id: `eq.${id}` });
  const rows = await supabaseRequest(`${TABLE}?${params.toString()}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  if (!rows.length) return null;
  return mapRow(rows[0]);
}

// ---------- Validation ----------

function validateExpensePayload(payload) {
  const errors = [];
  const amount = Number(payload.amount);

  if (payload.amount === undefined || payload.amount === null || payload.amount === '') {
    errors.push('Amount is required.');
  } else if (Number.isNaN(amount) || amount <= 0) {
    errors.push('Amount must be a positive number.');
  }

  if (!payload.category || typeof payload.category !== 'string' || !payload.category.trim()) {
    errors.push('Category is required.');
  }

  if (payload.note && typeof payload.note !== 'string') {
    errors.push('Note must be text.');
  }

  if (payload.category && payload.category.trim().toLowerCase() === 'loan') {
    if (!payload.holder || typeof payload.holder !== 'string' || !payload.holder.trim()) {
      errors.push('Friend name is required for loans.');
    }
  } else if (payload.holder && typeof payload.holder !== 'string') {
    errors.push('Friend name must be text.');
  }

  return errors;
}

// ---------- Analytics (computed here in Node from the fetched rows) ----------

function computeAnalytics(expenses) {
  if (expenses.length === 0) {
    return {
      totalSpent: 0,
      transactionCount: 0,
      dailyAverage: 0,
      topCategory: null,
      categoryBreakdown: [],
      last7Days: [],
    };
  }

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);

  const distinctDays = new Set(
    expenses.map((e) => new Date(e.createdAt).toISOString().slice(0, 10))
  );
  const dailyAverage = totalSpent / distinctDays.size;

  const categoryTotals = {};
  for (const e of expenses) {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  }
  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const topCategory = categoryBreakdown[0] || null;

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const total = expenses
      .filter((e) => new Date(e.createdAt).toISOString().slice(0, 10) === key)
      .reduce((sum, e) => sum + e.amount, 0);
    last7Days.push({ date: key, total });
  }

  return { totalSpent, transactionCount: expenses.length, dailyAverage, topCategory, categoryBreakdown, last7Days };
}

// ---------- HTTP response helpers ----------

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// ---------- Static file serving ----------

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.svg': 'image/svg+xml',
};

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJSON(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- API route handlers ----------

async function handleApi(req, res, pathname, query) {
  try {
    // GET /api/expenses
    if (pathname === '/api/expenses' && req.method === 'GET') {
      const expenses = await fetchExpenses(query);
      sendJSON(res, 200, expenses);
      return;
    }

    // POST /api/expenses
    if (pathname === '/api/expenses' && req.method === 'POST') {
      let payload;
      try {
        payload = await readRequestBody(req);
      } catch (err) {
        sendJSON(res, 400, { error: 'Invalid JSON body.' });
        return;
      }

      const errors = validateExpensePayload(payload);
      if (errors.length) {
        sendJSON(res, 400, { error: errors.join(' ') });
        return;
      }

      const newExpense = await insertExpense({
        amount: Number(payload.amount),
        category: payload.category.trim(),
        note: (payload.note || '').trim(),
        holder: (payload.holder || '').trim(),
      });
      sendJSON(res, 201, newExpense);
      return;
    }

    // PUT /api/expenses/:id
    const idMatch = pathname.match(/^\/api\/expenses\/([^/]+)$/);
    if (idMatch && req.method === 'PUT') {
      let payload;
      try {
        payload = await readRequestBody(req);
      } catch (err) {
        sendJSON(res, 400, { error: 'Invalid JSON body.' });
        return;
      }

      const errors = validateExpensePayload(payload);
      if (errors.length) {
        sendJSON(res, 400, { error: errors.join(' ') });
        return;
      }

      const updated = await updateExpense(idMatch[1], {
        amount: Number(payload.amount),
        category: payload.category.trim(),
        note: (payload.note || '').trim(),
        holder: (payload.holder || '').trim(),
      });

      if (!updated) {
        sendJSON(res, 404, { error: 'Expense not found.' });
        return;
      }
      sendJSON(res, 200, updated);
      return;
    }

    // DELETE /api/expenses/:id
    if (idMatch && req.method === 'DELETE') {
      const removed = await deleteExpense(idMatch[1]);
      if (!removed) {
        sendJSON(res, 404, { error: 'Expense not found.' });
        return;
      }
      sendJSON(res, 200, removed);
      return;
    }

    // GET /api/analytics
    if (pathname === '/api/analytics' && req.method === 'GET') {
      const expenses = await fetchExpenses();
      sendJSON(res, 200, computeAnalytics(expenses));
      return;
    }

    sendJSON(res, 404, { error: 'Not found.' });
  } catch (err) {
    console.error('Supabase request error:', err.message);
    sendJSON(res, 502, { error: 'Could not reach the database. Please try again shortly.' });
  }
}

// ---------- Server ----------

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsed.pathname);

  try {
    if (pathname.startsWith('/api/')) {
      await handleApi(req, res, pathname, parsed.query);
    } else if (req.method === 'GET') {
      serveStatic(req, res, pathname);
    } else {
      sendJSON(res, 404, { error: 'Not found.' });
    }
  } catch (err) {
    console.error('Unhandled error:', err);
    sendJSON(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, () => {
  console.log(`Expense Tracker running at http://localhost:${PORT}`);
  console.log(`Data source: Supabase (${SUPABASE_URL})`);
});
