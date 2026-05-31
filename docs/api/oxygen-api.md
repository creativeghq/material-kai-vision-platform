# Oxygen API

**Edge Function:** `oxygen-api`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/oxygen-api`

Wrapper around the Greek e-invoicing provider (oxygen.gr). Admin-only.

## Actions

| Action | Body | Result |
|---|---|---|
| `create_pre_invoice` | `{ quote_id }` | Pushes the accepted quote to Oxygen as a notice (pre-invoice). Idempotent — once `quotes.oxygen_notice_id` is set, returns the existing id without external calls. |
| `get_settings` | `{}` | Reads `OXYGEN_API_KEY` / `OXYGEN_API_BASE_URL` / default tax + warehouse from `platform_secrets`. Masks sensitive values. |
| `save_settings` | `{ apiKey?, apiBaseUrl?, defaultTaxId24?, defaultWarehouseId? }` | Persists to `platform_secrets`. |
| `list_taxes` | `{ apiBaseUrl, apiKey }` | Calls Oxygen `/taxes` and returns the list. |
| `list_warehouses` | `{ apiBaseUrl, apiKey }` | Calls Oxygen `/warehouses` and returns the list. |
| `test_connection` | `{ apiBaseUrl, apiKey }` | Verifies a valid Oxygen endpoint + key combination. |

## Authentication

Bearer JWT with `admin` or `super_admin` role.

```http
POST /functions/v1/oxygen-api
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{ "action": "create_pre_invoice", "quote_id": "uuid" }
```

## Errors

| Code | Meaning |
|---|---|
| 400 | Invalid JSON or missing required fields (e.g. `quote_id`) |
| 401 | Unauthorized |
| 403 | Role mismatch |
| 409 | Quote is not in an Oxygen-pushable state (status ≠ accepted) |
| 500 | Oxygen API error or internal failure |
