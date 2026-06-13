# Platform Secrets (centralised key store + env-first resolver)

A single registry for every external-service key the platform uses, with an **env-first, DB-second** resolution model so admins can configure keys without a redeploy while deployer-set env vars always win. Referenced by nearly every edge function and the MIVAA Python backend.

Admin surfaces: `/admin/operations → Keys` (platform-wide) and `/admin/modules/<slug>/settings` (per-module).

---

## 1. Resolution priority (always env-first)

`supabase/functions/_shared/secrets.ts → resolveSecret(supabase, key)` returns `{ value, source }`:

1. `Deno.env.get(key)` — **wins unconditionally**. A deployer's explicit env choice is never overridden.
2. `platform_secrets.value` — DB fallback (admin-managed, no redeploy).
3. `platform_secrets.default_value` — static seeded default.
4. else `{ value: null, source: 'missing' }`.

A 30-second in-process LRU cache (per worker) avoids a DB round-trip per request; `invalidateSecretCache(key)` clears it immediately after a write.

The Python backend mirrors this exactly: `mivaa-pdf-extractor/app/services/integrations/platform_secret_resolver.py` (`os.getenv(key)` → DB value → default → missing, 30s cache). Used for `TURNSTILE_SECRET_KEY`, Perplexity, Firecrawl, DataForSEO, etc.

---

## 2. Bootstrap into `Deno.env`

`supabase/functions/_shared/secrets-bootstrap.ts`:

- **`bootstrapSecretsFromDb(supabase)`** — reads all non-null `platform_secrets` rows and `Deno.env.set(key, value)` for any key not already in env (env still wins). Memoised per worker. Called inside `_shared/auth.ts → authenticate()`, so the ~47 functions that authenticate become DB-aware automatically.
- **`bootstrapForFunction()`** — one-liner for functions that don't call `authenticate()` (crons, webhooks, public endpoints, e.g. `crawl-user-website`, `moodboard-sheet-share`). ~26 functions call it explicitly.

This required converting ~41 files from module-load `const X = Deno.env.get('Y')` (captured before bootstrap) to lazy getters `const X = () => Deno.env.get('Y')` called at request time — the load-bearing change without which bootstrap would populate env too late.

---

## 3. Tables

### `platform_secrets` (PK `key`)
RLS: `service_role` only — reached exclusively through the admin edge function.

| Column | Notes |
|---|---|
| `key` | env var name, e.g. `ANTHROPIC_API_KEY` |
| `value` | plaintext; NULL = cleared (env/default still apply) |
| `description`, `category` | admin-UI metadata |
| `primary_module_slug` | NULL = platform-wide (shows at `/admin/operations → Keys`) |
| `is_sensitive` | default true — controls masking in GET responses |
| `default_value` | third-tier fallback |
| `last_verified_at` / `last_verified_status` / `last_verified_error` | connection-test results |
| `updated_by`, `created_at`, `updated_at` | audit |

### `platform_secret_module_links` (PK `secret_key, module_slug`)
Lets one secret appear under multiple modules' settings pages (e.g. `DATAFORSEO_BASE64` under `mention-monitoring`, `job-research`, `seo-toolkit`, `seo-interlinking`).

---

## 4. Admin function: `platform-secrets-admin`

`supabase/functions/platform-secrets-admin/index.ts`. Auth `authenticate({ allowedRoles: ['admin','super_admin'] })`.

| Action | Effect |
|---|---|
| `list` | all secrets |
| `list_platform` | only `primary_module_slug IS NULL` |
| `list_for_module` | secrets where `primary_module_slug = slug` OR linked via `platform_secret_module_links` |
| `save` | upsert one key (`value=''`/null clears); invalidates cache |
| `save_many` | upsert N keys (module settings forms) |
| `delete_value` | null-out a key's value |

**Masking** (`maskSecretValue`): for `is_sensitive=true`, GETs never return plaintext — `••••` (≤8 chars) or `first4••••last4`. Non-sensitive keys (e.g. `TURNSTILE_SITE_KEY`) return in full.

Each listed secret includes `value_masked`, `value_present`, `effective.{value_present, source}` (`env`/`db`/`default`/`missing`), and `modules[]`. The `effective.source` badge tells admins whether they're editing a live value or one shadowed by env (writing the DB row is a no-op when env wins).

---

## 5. Admin UI

- **`/admin/operations → Keys`** — `SecretsManagerCard scope={{mode:'platform'}}` for `primary_module_slug IS NULL` keys (AI providers, Stripe, VAPID, cron secret, etc.).
- **`/admin/modules/<slug>/settings`** — `ModuleSettingsPage` mounts `SecretsManagerCard scope={{mode:'module', moduleSlug}}`, powered by `list_for_module`. Every registered module gets this page automatically (no per-module page code).

---

## 6. Key inventory (illustrative)

**Per-module** (sharing via links): `PERPLEXITY_API_KEY`, `FIRECRAWL_API_KEY`, `DATAFORSEO_BASE64`/`LOGIN`/`PASSWORD`, `YOUTUBE_DATA_API_KEY`, `ZERNIO_API_KEY`/`WEBHOOK_SECRET`, `RESEND_API_KEY`, `NOVUS_API_KEY`, `TURNSTILE_SITE_KEY`/`SECRET_KEY`, AADE credentials.

**Platform-wide** (`primary_module_slug NULL`): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, `HF_TOKEN`, `SLIG_ENDPOINT_TOKEN`, `WORLDLABS_API_KEY`, `PINTEREST_*`, `CRON_SECRET`, `ADMIN_RESTART_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BILLING_SECRET_KEY`, `VAPID_*`.

> Removed 2026-06-07: the legacy ERP connector's secrets (connector deleted). Replaced by Twilio→`ZERNIO_*` for messaging 2026-06-08.

---

**Last updated**: 2026-06-09.
