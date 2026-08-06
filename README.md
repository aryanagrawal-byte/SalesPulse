# SalesPulse — Supabase Sales Dashboard

## 🔑 Setup (do this first)
Your Supabase endpoint URL and API key are **not** stored in the tracked
code — they live in `js/config.js`, which is listed in `.gitignore` so it
never gets pushed to GitHub.

1. Copy the template: `cp js/config.example.js js/config.js`
2. Open `js/config.js` and paste in your real Supabase project URL + anon
   key (already pre-filled for you locally — just don't commit this file).
3. Open `index.html` — it loads `js/config.js` automatically before
   `js/main.js`.

If you ever accidentally commit `js/config.js`, treat the key as leaked:
rotate/regenerate the anon key in your Supabase dashboard (Project
Settings → API) and update `js/config.js` with the new one.


A responsive, dark-themed static dashboard that calls a Supabase Postgres RPC
function (`get_sale_dashboard`) and automatically renders whatever data comes
back as KPI cards, charts (Chart.js) and data tables — no server code
required.

## ✅ Completed features
- Dark, modern responsive UI (topbar, KPI cards, charts, tables, raw JSON
  debug viewer).
- Calls your Supabase REST RPC endpoint via `fetch()`:
  `POST https://<project_id>.supabase.co/rest/v1/rpc/get_sale_dashboard`
  with the required `apikey` and `Authorization: Bearer <anon key>` headers.
- **Generic auto-renderer**: inspects the JSON response and automatically
  turns
  - top-level scalar fields (numbers/strings) into KPI cards (auto-formats
    currency, percentages, plain numbers),
  - nested objects into grouped KPI card sections,
  - arrays of records into a data table, plus an auto-generated line/bar
    chart when the array contains numeric columns.
- **Settings panel** (gear icon, top right) lets you change the endpoint URL,
  API key, and the JSON body sent to the RPC call (for date-range filters,
  etc.) without touching code. Saved to `localStorage` in your browser only.
- Manual **Refresh** button plus optional **auto-refresh** (30s / 1min /
  5min).
- Connection status indicator (connecting / connected / failed) and a
  friendly error banner that surfaces the exact Supabase error message.
- Raw JSON viewer (collapsible) for debugging the exact API payload.

## ⚠️ Current connection status
The dashboard is wired up with the project id and anon key you provided and
is calling:
```
POST https://ocxgzekngzcupzjycmfq.supabase.co/rest/v1/rpc/get_sale_dashboard
Headers: apikey, Authorization: Bearer <anon key>
Body: {}
```
Right now Supabase returns:
```
404 — Could not find the function public.get_sale_dashboard without
parameters in the schema cache
```
This means Supabase's PostgREST layer can't find a `get_sale_dashboard`
function that takes **zero parameters**. This is a backend/database
configuration issue, not something the front-end can fix. To resolve it,
please check one of the following in your Supabase project:
1. **The function requires parameters.** If your SQL function is defined
   like `get_sale_dashboard(p_start date, p_end date)`, open the gear ⚙️
   settings panel on the dashboard and put the required arguments as JSON in
   the "RPC Parameters" box, e.g. `{"p_start": "2026-01-01", "p_end":
   "2026-08-01"}`, then click **Apply & Fetch**.
2. **The function name/casing doesn't match** what's in the database, or it
   hasn't been created yet — check *Database → Functions* in the Supabase
   dashboard.
3. **PostgREST schema cache is stale** — in Supabase, go to *Database → API*
   and click "Reload schema" (or run `NOTIFY pgrst, 'reload schema';`).
4. Make sure the function is exposed to the `anon` role (`GRANT EXECUTE ON
   FUNCTION public.get_sale_dashboard TO anon;`) and is in a schema exposed
   via PostgREST (usually `public`).

Once the RPC call succeeds, the dashboard will automatically populate KPI
cards / charts / tables with no further code changes needed — the renderer
adapts to whatever JSON shape your function returns.

## Functional entry points
- `index.html` — the only page. No URL parameters needed; all configuration
  (endpoint, API key, RPC params) is available via the in-page settings
  panel (gear icon) and persisted to `localStorage`.

## Data model
No local table storage is used — all data is fetched live from your
Supabase Postgres RPC function. The renderer supports any JSON shape:
- Scalars → KPI cards
- Arrays of objects → tables + auto charts
- Nested objects → grouped KPI card sections

## Not yet implemented / suggested next steps
- Once the RPC call returns real data, we can fine-tune KPI labels, icons,
  currency formatting, and chart types to match your exact schema (e.g.
  "Today Orders", "MTD Revenue", daily leaderboard, monthly summary — similar
  to the Voyx dashboard shown in your screenshot).
- Add date-range filter controls in the main UI (currently only available
  via the JSON textarea in Settings) if your function accepts date
  parameters.
- Add CSV export for tables if needed.
- Consider row-level security / a scoped API key if this dashboard will be
  exposed publicly, since the anon key and RPC call are visible in
  client-side JS (standard for Supabase's anon key + RLS-protected
  functions, but worth double-checking your function's `SECURITY DEFINER` /
  RLS setup).

## Deployment
To publish this dashboard live, use the **Publish tab** in this workspace —
it will handle deployment and give you a live URL.
