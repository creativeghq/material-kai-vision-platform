# Careers API (`hr-careers`)

Public, **anonymous** careers surface for a workspace: a machine-readable **job board** (GET) and the
action API our own careers page uses (POST). One edge function, two shapes.

- **Function:** `hr-careers` (`verify_jwt = false`)
- **Base:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/hr-careers`
- **Auth:** none. The workspace is resolved from its public `slug`.
- **Machine-readable:** [`openapi-edge.json`](../../public/api/openapi-edge.json) → path `/hr-careers`
- **Related:** [hr-api.md](./hr-api.md) (authenticated HR/ATS module), [../contracts-system.md](../contracts-system.md)

---

## Visibility rule (applies to BOTH surfaces)

A posting is publicly visible **only while `status = 'open'` AND it is not past `closes_at`**
(`closes_at IS NULL` counts as open-ended). A posting that is `open` but past its close date is
treated as gone: it disappears from the board list and returns **404** individually.

---

## 1. Job board (GET) — for integrations

Modelled on Greenhouse (`/v1/boards/{board}/jobs`), Lever and Ashby: a plain `GET` returning JSON that
a `curl`, a job aggregator, or a no-code tool can poll. Use this for anything that is **not** our own
careers page.

### List open postings

```bash
curl "https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/hr-careers?slug=<company-slug>"
```

```json
{
  "company": { "name": "Acme", "slug": "acme", "website": null, "logo_url": null },
  "count": 1,
  "jobs": [
    {
      "id": "c8879391-…",
      "slug": "senior-tester",
      "title": "Senior Tester",
      "location": "Athens, GR",
      "location_type": "hybrid",
      "remote": true,
      "employment_type": "full_time",
      "level": "senior",
      "salary_min": null, "salary_max": null, "currency": "EUR",
      "compensation": [], "compensation_note": null,
      "published_at": "2026-07-21T04:00:00Z",
      "closes_at": null,
      "updated_at": "2026-07-21T04:00:00Z",
      "department": null,
      "absolute_url": "https://app.materialshub.gr/careers/acme/senior-tester"
    }
  ]
}
```

### Fetch a single posting

```bash
curl "…/hr-careers?slug=<company-slug>&job=<job-slug>"
```

Returns `{ company, job }` where `job` additionally carries **`description`** and **`requirements`**.

### Query parameters

| Param | Required | Description |
|---|---|---|
| `slug` | ✅ | Workspace public slug — the company's board |
| `job` | — | Job posting slug. When present, returns that single posting (with body copy) instead of the list |

### Behaviour notes

- **Integration-shaped, not UI-shaped.** Deliberately omits `turnstile_site_key` and `apply_config` —
  those are careers-page concerns and needless surface for an integrator.
- **`absolute_url`** deep-links to `/careers/{slug}/{job}` so a consumer can link straight to the posting.
- **`updated_at`** is included so consumers can poll incrementally.
- **Caching:** responses send `Cache-Control: public, max-age=300`.
- **CORS:** `Access-Control-Allow-Origin: *`; `GET` is allowed.

### Errors

| Status | When |
|---|---|
| `400` | `slug` missing |
| `404` | unknown company slug |
| `404` | job not found, or no longer open (see the visibility rule) |

---

## 2. Careers page actions (POST) — used by our own UI

`POST` with a JSON body `{ action, slug, … }`.

| Action | Body | Returns |
|---|---|---|
| `meta` | `{ slug }` | `{ ok, company, company_profile, turnstile_site_key, jobs: [...] }` |
| `get-job` | `{ slug, job_slug }` (or legacy `{ slug, job_id }`) | `{ ok, company, company_profile, turnstile_site_key, job }` — `job` includes `apply_config` |
| `apply` | `{ slug, job_id/job_slug, applicant fields, turnstile token }` | application receipt |

`meta`/`get-job` intentionally include `turnstile_site_key` and `apply_config` because the page needs
them to render and gate the application form.

### Applying

`apply` is **Turnstile-gated** when `TURNSTILE_SECRET_KEY` is configured, and **fails open** when it is
not, so the form works out of the box. It is additionally throttled **per IP: 8 applications / 10 min**.
Résumé uploads are capped at **8 MB** and land in the workspace's own `hr/` storage prefix. It writes
only `hr_candidates` + `hr_applications`.

---

## SEO / Google Jobs

The public job page (`/careers/{slug}/{job}`) emits **`JobPosting` JSON-LD** (`application/ld+json`,
schema.org), so individual roles are indexable by job search engines without needing this API.

---

## Which one should I use?

| You are… | Use |
|---|---|
| A job aggregator / ATS integration / partner site | **GET board** (§1) |
| A script or no-code tool polling for new roles | **GET board** (§1) — poll `updated_at` |
| Our own careers page / application form | **POST actions** (§2) |
