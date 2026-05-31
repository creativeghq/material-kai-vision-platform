# SEO API

**Edge Function:** `seo-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/seo-api`

## Actions

| Action | Purpose | Engine |
|---|---|---|
| `research` | DataForSEO keyword research (6 parallel API calls — expansion, related, etc.) | DataForSEO |
| `plan` | Generate article plan (title, meta, slug, outline, FAQ) from research | Gemini |
| `write` | Produce full SEO article from a plan | Claude Opus |
| `analyze` | 15+ SEO quality checks + auto-fix | Local + Claude |
| `pipeline` | End-to-end orchestrator — research → plan → write → analyze → finalize. Returns `article_id` immediately, polls async. | All of the above |
| `toolkit_audit` | Composite domain audit for `/admin/seo` dashboard | MIVAA `/site-review` |
| `toolkit_research` | User-driven research wrapper | Above `research` + persistence |

## Authentication

```http
Authorization: Bearer <supabase_access_token>
```

Or admin secret key (`apikey: sb_secret_...`).

## Request

```http
POST /functions/v1/seo-api
Content-Type: application/json

{ "action": "<one of the above>", ...action-specific params }
```

## Response

Identical to the previous per-function responses. See per-handler implementation:

- `supabase/functions/seo-api/handlers/research.ts`
- `supabase/functions/seo-api/handlers/plan.ts`
- `supabase/functions/seo-api/handlers/write.ts`
- `supabase/functions/seo-api/handlers/analyze.ts`
- `supabase/functions/seo-api/handlers/pipeline.ts`
- `supabase/functions/seo-api/handlers/toolkit-audit.ts`
- `supabase/functions/seo-api/handlers/toolkit-research.ts`

## Errors

| Code | Meaning |
|---|---|
| 400 | Missing/unknown `action`, invalid JSON |
| 401 | Unauthorized |
| 405 | Method not allowed (only POST) |
| 500 | Handler error |
