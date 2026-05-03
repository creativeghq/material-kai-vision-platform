# Mention Monitoring — Deployment Guide

Step-by-step setup for activating the **Mention Monitoring** module on production.

The module ships disabled. After completing this guide, admins can flip it on at `/admin/modules` and start tracking subjects.

---

## 1. Pre-flight check — what's already in place

These were applied in the 2026-05-03 build and need no further work:

- ✅ DB schema (9 tables, 4 RPCs, 5 enums, RLS policies) — applied to production Supabase
- ✅ Module rows in `public.modules` (both disabled by default)
- ✅ Email templates seeded in `public.email_templates`
- ✅ pg_cron jobs scheduled (`mention-monitoring-refresh-hourly`, `llm-mention-probe-daily`, `mention-classifier-cache-prune`)

What's still required: **secrets** + **deploys**.

---

## 2. Sources covered

| Source | Cost | Setup |
|---|---|---|
| **News** (DataForSEO News API) | $0.0006/req | already configured |
| **Blogs / general web** (Perplexity Sonar) | $0.005/sweep | already configured |
| **RSS feeds** (user-curated per subject) | Free | none — subscribe via subject `source_config.rss_feeds` |
| **YouTube** (titles + descriptions) | Free quota | `YOUTUBE_DATA_API_KEY` (optional) |
| **LLM probes** (Haiku + GPT-4o-mini + Gemini Flash + Sonar) | ~$0.008/subject/week | `GEMINI_API_KEY` (optional, others already configured) |

**Reddit was dropped 2026-05-03** — Reddit's Responsible Builder Policy onboarding wasn't worth the friction for marginal coverage gain. News + Sonar pick up Reddit threads that get cited by news/blogs anyway.

**Twitter/X / TikTok / Instagram** — out of scope (expensive APIs, ToS-hostile, no public search).

---

## 3. Secrets you need to add

### Already present — verify only

| Secret | Where |
|---|---|
| `ANTHROPIC_API_KEY` | GitHub repo + MIVAA systemd unit |
| `PERPLEXITY_API_KEY` | GitHub repo + MIVAA systemd unit |
| `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) | GitHub repo + MIVAA |
| `OPENAI_API_KEY` | GitHub repo + MIVAA |
| `CRON_SECRET` | GitHub repo + MIVAA + Supabase Edge env |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | GitHub repo + MIVAA + Edge |

If any of these aren't set, the corresponding source silently no-ops (no crash). The pipeline will run but with reduced coverage.

### NEW — both optional, both free

| Secret | Required for | Cost |
|---|---|---|
| `YOUTUBE_DATA_API_KEY` | YouTube discovery (opt-in per subject) | Free quota: 10k units/day |
| `GEMINI_API_KEY` | LLM probe model: `gemini-2.0-flash` | Free tier: 15 RPM / 1500 RPD |

Both are **optional**. Without them, the pipeline still runs on News (DataForSEO) + Sonar (Perplexity) + RSS + Haiku/GPT/Sonar LLM probes. Adding them broadens coverage.

---

## 4. Step-by-step: get each secret

### A. YouTube Data API (free, ~10 min)

1. Go to **https://console.cloud.google.com/**.
2. Create a new project (or pick an existing one): top-left dropdown → "New Project" → name it `Material KAI`.
3. Sidebar → **APIs & Services** → **Library**.
4. Search **"YouTube Data API v3"** → click → **Enable**.
5. Sidebar → **APIs & Services** → **Credentials**.
6. **+ Create credentials** → **API key**.
7. Copy the key. That's `YOUTUBE_DATA_API_KEY`.
8. Click **Restrict key** (recommended):
   - **API restrictions** → "Restrict key" → select only **YouTube Data API v3**.
   - **Application restrictions** → leave "None" or set IP allowlist to your MIVAA server IP (157.245.166.19).

**Quota**: 10,000 units/day, free. A search costs ~100 units. So ~100 subjects/day fit comfortably.

### B. Gemini API (free tier, ~3 min)

1. Go to **https://aistudio.google.com/app/apikey**.
2. Sign in with the same Google account you used for YouTube (or a different one — keys are independent).
3. Click **"Create API key"** → **"Create API key in new project"** (or pick an existing project).
4. Copy the key. That's `GEMINI_API_KEY`.

**Cost**: `gemini-2.0-flash` is free up to 15 RPM / 1M TPM / 1500 RPD on the free tier — the LLM probe cron uses ~25 calls per daily run, well under the limit.

---

## 5. Where to put each secret

### GitHub repo secrets (drives the deploy workflow)

1. Go to **https://github.com/creativeghq/material-kai-vision-platform/settings/secrets/actions**
2. Click **"New repository secret"** for each of:
   - `YOUTUBE_DATA_API_KEY`
   - `GEMINI_API_KEY`

### Supabase Edge Function env

The mention crons don't need any new secrets in Supabase Edge env — they reuse `CRON_SECRET` and `PYTHON_BACKEND_URL` from the price-monitoring crons.

Verify they're set at **https://supabase.com/dashboard/project/bgbavxtjlbvgplozizxu/functions/secrets**:
- `CRON_SECRET`
- `PYTHON_BACKEND_URL` (= `https://v1api.materialshub.gr`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

---

## 6. Deploy

Once the GitHub secrets are saved:

### A. Deploy MIVAA backend

```bash
git push origin main
```

The `mivaa-pdf-extractor/.github/workflows/deploy.yml` workflow will rsync the code to the server, recreate the systemd unit (with the new `Environment=` lines), and restart `mivaa-pdf-extractor.service`.

After it finishes, SSH to the server and verify:

```bash
ssh root@157.245.166.19
systemctl show mivaa-pdf-extractor --property=Environment | tr ' ' '\n' | grep -E 'YOUTUBE|GEMINI'
```

### B. Deploy the two new edge functions + agent-chat

```bash
supabase functions deploy mention-monitoring-cron
supabase functions deploy llm-mention-probe-cron
supabase functions deploy agent-chat
```

(`agent-chat` redeploy is needed so the new mention tools load.)

---

## 7. Activate the modules

In production:

1. Sign in as admin → go to **`/admin/modules`**.
2. Find **"Mention Monitoring"** → toggle **Enabled**.
3. Find **"Mention Monitoring Notifications"** → toggle **Enabled** (only needed if you want alerts firing).

Until both are flipped on:
- The agent tools will return `mention-monitoring disabled` errors.
- The product detail "Mentions" tab will show empty state.
- The cron jobs will run but find no subjects to refresh.

---

## 8. Smoke test

### Quick check — UI flow

1. Open any product in admin.
2. Click the **"Mentions"** tab.
3. Toggle the enable switch.
4. Wait ~30s for the first refresh to complete.
5. You should see mention rows in the **Feed** tab + KPI numbers populated.

### Quick check — Agent flow

In KAI agent chat:

```
Track mentions for product <product_id>
```

Returns a `mention_tracking_started` chunk with subject details.

```
Show me LLM visibility for <product_id>
```

Returns the latest snapshot or "No probes recorded yet" depending on whether the daily cron has run.

```
Run a fresh LLM probe for <product_id>
```

(Admin only.) Triggers the 16-call probe matrix, debits 2 credits, returns the visibility card inline.

### Quick check — cron is firing

```sql
SELECT jobname, last_started_at, last_finished_at, last_run_status
FROM cron.job_run_details
WHERE jobname LIKE '%mention%'
ORDER BY last_started_at DESC
LIMIT 10;
```

All three jobs should show `succeeded` once they've ticked.

---

## 9. Where each secret is read in code

For audit / debugging:

| Secret | Read in |
|---|---|
| `YOUTUBE_DATA_API_KEY` | `mivaa-pdf-extractor/app/services/integrations/mention_search_service.py` (`_search_youtube`) |
| `GEMINI_API_KEY` | `mivaa-pdf-extractor/app/services/integrations/llm_mention_probe_service.py` (`_call_gemini`) |
| `ANTHROPIC_API_KEY` | `mention_identity_service.py` + `llm_mention_probe_service.py` (`_call_anthropic`) |
| `PERPLEXITY_API_KEY` | `mention_search_service.py` (`_search_perplexity`) + `llm_mention_probe_service.py` (`_call_perplexity`) |
| `DATAFORSEO_BASE64` | `mention_search_service.py` (`_search_dataforseo_news`) |
| `OPENAI_API_KEY` | `llm_mention_probe_service.py` (`_call_openai`) |
| `CRON_SECRET` | `app/api/mention_monitoring_routes.py` (`/cron-refresh`, `/cron-probe-llm`) |

Each adapter checks for an empty key on init and silently disables itself — partial setups are safe.

---

## 10. Troubleshooting

**"youtube: search failed: 403"** → API not enabled in the GCP project, OR the key has IP/HTTP-referer restrictions excluding your server. Re-check Cloud Console → Credentials → key restrictions.

**"youtube: search failed: 400 quotaExceeded"** → daily quota burned. Either wait 24h or request a quota raise. The pipeline auto-recovers on the next cron tick.

**Cron jobs show `failed` in `cron.job_run_details`** → check the edge function logs at https://supabase.com/dashboard/project/bgbavxtjlbvgplozizxu/functions/mention-monitoring-cron/logs. Most common cause: `CRON_SECRET` mismatched between the value pg_cron sends and MIVAA's env.

**Module flipped on but agent tools return "disabled"** → the in-memory `is_module_enabled()` cache lasts 300s. Wait 5 minutes or restart the MIVAA service.

---

## 11. Cost ceiling

With both new sources enabled and conservative cadence (24h refresh + weekly LLM probes):

- **Per subject per month**:
  - Discovery: ~30 refreshes × $0.005 = **$0.15**
  - LLM probes: ~4 weekly × $0.008 = **$0.03**
  - Total: ~**$0.18/subject/month**
- **100 subjects** ≈ $18/month
- **1,000 subjects** ≈ $180/month

If volume scales beyond this, the volatility cadence will auto-stretch stable subjects to weekly polling, dropping the per-subject cost to ~$0.05/month.
