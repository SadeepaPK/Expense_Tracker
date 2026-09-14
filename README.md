# Expense Tracker — Node.js + Supabase (Postgres)

Same app as before — plain Node.js backend, no Express — but now your
expenses are stored permanently in a free Supabase Postgres database
instead of a local JSON file. This means your data survives redeploys,
restarts, and free-tier spin-downs on hosts like Render.

## 1. Create your Supabase project

1. Go to https://supabase.com and sign up (free).
2. Click **New Project**. Pick a name, a database password (save it
   somewhere safe), and a region close to you.
3. Wait ~2 minutes for the project to finish provisioning.

## 2. Create the expenses table

1. In your Supabase project, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Paste in the contents of `supabase-schema.sql` (included in this folder).
4. Click **Run**. You should see "Success. No rows returned."

## 3. Get your API credentials

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://xxxxxxxx.supabase.co`).
3. Copy the **service_role** secret key (NOT the "anon" key — the
   service_role key is required so the server can read/write freely;
   it must never be exposed to the browser, and it isn't — the frontend
   only ever talks to our own server, never to Supabase directly).

## 4. Configure your environment variables

Copy `.env.example` to `.env` and fill in the two values:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

### Running locally

If you have Node 20.6 or newer:
```
node --env-file=.env server.js
```

If you have an older Node version, set the variables in your shell first:
```
export SUPABASE_URL=https://your-project-id.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
node server.js
```

Then open http://localhost:3000

### Running on Render (or any host)

Don't upload your `.env` file. Instead, set the two variables in your
host's dashboard:
- Render: your Web Service → **Environment** tab → **Add Environment Variable**
- Add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with the same values

Render will inject them automatically when your app starts — no code
changes needed.

## What changed from the JSON-file version

- `server.js` now reads/writes expenses via Supabase's REST API
  (using Node's built-in `fetch` — no new dependencies).
- The frontend (`public/`) is **completely unchanged** — it still just
  calls `/api/expenses` and `/api/analytics` on your own server.
- `data/expenses.json` is no longer used and can be deleted.
