/* ==========================================================================
   config.example.js — TEMPLATE, SAFE TO COMMIT
   Copy this file to js/config.js and put your real Supabase project's
   endpoint URL and anon API key inside. js/config.js is gitignored so your
   real credentials never get pushed to GitHub.

   Steps:
     1. cp js/config.example.js js/config.js
     2. Edit js/config.js and paste your real Supabase URL + anon key
     3. Never commit js/config.js
   ========================================================================== */

window.APP_CONFIG = {
  endpoint: 'https://YOUR-PROJECT-ID.supabase.co/rest/v1/rpc/get_sale_dashboard',
  apiKey: 'YOUR-SUPABASE-ANON-KEY-HERE',
  params: '{\n  "report_date": "2026-01-01"\n}'
};
