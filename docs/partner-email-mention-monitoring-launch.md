# Partner email — Mention Monitoring API launch

Copy/paste-ready email announcing the new API to existing API-key holders. Tone matches the price-monitoring partner update.

---

**Subject**: New API endpoint: track product & brand mentions across news, blogs, YouTube + LLM responses

---

Hi {first_name},

Following the Price Monitoring API you've been using, we've shipped a new companion endpoint on the same host: **Mention Monitoring**. Same authentication (your existing `kai_*` key works as-is), same response shape, same partner-controls-cadence model.

## What it does

Tracks every public mention of a product, brand, or keyword you care about across:

- **News** — global news index (DataForSEO, ~6h freshness)
- **Blogs & general web** — Perplexity Sonar with recency filtering
- **RSS feeds** — any RSS URL you supply (industry pubs, competitor newsrooms)
- **YouTube** — titles + descriptions (opt-in per subject)
- **LLM responses** — your share-of-voice across Claude Haiku, GPT-4o-mini, Gemini Flash, and Sonar; we run a 4-prompt × 4-model probe matrix on a weekly cadence and report whether you got mentioned, at what rank, and which competitors appeared alongside you

Every mention is automatically classified for **sentiment** (positive / neutral / negative) and **relevance** to your subject (exact / tangential / mismatch / unverifiable) — using the same Haiku batched classifier we run on price discovery, with a 7-day verdict cache so repeat URLs cost zero.

Reddit was evaluated and intentionally left out — Reddit's API onboarding has too much friction for the marginal coverage gain. News + Sonar pick up Reddit threads when news/blogs cite them.

## Endpoint surface

**Host**: `https://v1api.materialshub.gr`
**Path prefix**: `/api/v1/mentions/track`
**Auth**: `Authorization: Bearer kai_<your-existing-key>`

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/mentions/track` | Create a tracked subject (returns first refresh inline) |
| `GET` | `/api/v1/mentions/track` | List your tracked subjects |
| `GET` | `/api/v1/mentions/track/{id}` | Read one (config + cached snapshot) |
| `PUT` | `/api/v1/mentions/track/{id}` | Update aliases / sources / alert prefs / cadence |
| `DELETE` | `/api/v1/mentions/track/{id}` | Soft delete |
| `POST` | `/api/v1/mentions/track/{id}/refresh` | Re-run discovery now |
| `GET` | `/api/v1/mentions/track/{id}/feed` | Latest run rows |
| `GET` | `/api/v1/mentions/track/{id}/history?days=30&sentiment=negative` | Filterable history |
| `GET` | `/api/v1/mentions/track/{id}/summary?days=30` | Aggregate snapshot |
| `GET` | `/api/v1/mentions/track/{id}/llm-visibility` | LLM share-of-voice + competitor co-mentions |
| `POST` | `/api/v1/mentions/track/{id}/probe-llm` | Fire a fresh LLM probe matrix |
| `POST` | `/api/v1/mentions/track/{id}/exclude` | Suppress a URL or domain |
| `POST` | `/api/v1/mentions/track/{id}/include` | Undo an exclude |

## 60-second quickstart

```bash
# Create a brand-tracking subject
curl -X POST https://v1api.materialshub.gr/api/v1/mentions/track \
  -H "Authorization: Bearer kai_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_type": "brand",
    "subject_label": "YourBrand",
    "brand_name": "YourBrand",
    "aliases": ["YourBrand Tiles", "Y.B."],
    "auto_expand_aliases": false,
    "language_codes": ["en"],
    "country_codes": ["US"],
    "alert_on_negative_sentiment": true,
    "alert_on_new_outlet": true,
    "alert_channels": ["webhook"],
    "alert_webhook_url": "https://your.api/webhooks/material-kai-mentions"
  }'
```

The response includes the first refresh inline (no async polling needed for the create call).

**A note on aliases**: by default the API runs **exact-match discovery** — it searches only the `subject_label` you supply plus any strings in `aliases`. No LLM expansion. If your subject is a multi-word label where articles often split the words (e.g. `"BRAND PRODUCTLINE"` written as just `"Brand"` or `"Productline"`), either supply the variants explicitly in `aliases`, or pass `"auto_expand_aliases": true` to let the platform's classifier widen the search automatically on first refresh. Default off keeps cost lower and search behavior fully predictable.

## Webhook alerts (4 types, each opt-in)

| Type | Fires when |
|---|---|
| `mention_spike` | today's count ≥ 2× the trailing 7-day daily-average baseline |
| `negative_sentiment` | new negative-sentiment mention from a domain with DA ≥ 30 |
| `new_outlet` | first-ever mention from a domain we haven't seen for this subject |
| `llm_visibility_change` | average LLM rank shifts by ≥2 positions week-over-week |

All deduped 24h per `(alert_type, subject, outlet_domain)`. Webhook payload shape and full alert reference are in the docs.

## Cadence + cost model (same as the price API)

You control the refresh cadence per subject (`refresh_interval_hours`, 1–720). Our internal cron does **not** touch your subjects — refreshes happen only when you call `POST /{id}/refresh`, so there are no surprise charges. Each subject row carries a `next_check_at` field as a hint about when polling is worth the cost (volatility-aware: stable subjects auto-stretch to weekly, active subjects auto-tighten).

Typical refresh on a stable subject costs roughly **$0.005–0.010** (DataForSEO News + cached Sonar + free RSS). LLM probe runs are about **$0.008/subject/week** when run weekly.

## Full reference

Complete API docs (request/response shapes, all field semantics, error codes, alert payloads): **{LINK_TO_DOCS}**

Your existing `kai_*` key works on the new endpoints with no changes — same `allowed_endpoints` rules apply (if your key is restricted to specific paths, please add `/api/v1/mentions/track/*` to the allowlist).

Happy to jump on a call if you want to walk through integration patterns or talk about coverage tuning for your specific markets.

Best,
{your_name}
{your_signature}

---

## Notes for the sender

- Replace `{first_name}`, `{your_name}`, `{your_signature}`, `{LINK_TO_DOCS}` before sending.
- For the docs link: either link to the public version of `docs/mention-monitoring-api.md` once you publish it, or attach the markdown file.
- Skip this email for keys with `allowed_endpoints` restricted to non-mention paths — they'll need a key reissue, which is a separate conversation.
- This template uses the same admin email broadcast endpoint pattern as `/api/v1/price-monitoring/broadcast-api-announcement` — if you want to send it through the platform (idempotent + tracked in `email_send_log`), seed it as `email_templates` slug `api_broadcast.mention_tracking_v1` first.
