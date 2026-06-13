# myAADE Module — Greek Business Registry Integration (ΑΑΔΕ)

Self-contained module that wraps Greek government tax-authority (ΑΑΔΕ) web services so the platform can auto-fill the Business profile (legal name, ΔΟΥ, ΚΑΔ, legal form, structured address) from a Greek ΑΦΜ. Designed as a **family of services** — RgWsPublic2 today, more to come (myDATA, ICISnet customs, etc.). Each ΑΑΔΕ service is its own `myaade-*` edge function sharing common helpers in [`_shared/aade/`](../../../supabase/functions/_shared/aade).

## ΑΑΔΕ services wrapped

| Service | Edge function | Endpoint | What it returns |
|---|---|---|---|
| **RgWsPublic2** (Στοιχεία Επιχειρήσεων από ΑΦΜ) | [`myaade-rgwspublic2`](../../../supabase/functions/myaade-rgwspublic2) | `https://www1.gsis.gr/wsaade/RgWsPublic2/RgWsPublic2` | Legal name, trade name, ΔΟΥ, primary + secondary ΚΑΔ, legal form, start date, structured address, active/inactive flag |

To wrap another ΑΑΔΕ service:

1. Add an edge function under `supabase/functions/myaade-<service-slug>/`.
2. Reuse the shared SOAP helpers — see "Shared infrastructure" below.
3. Expose a typed wrapper in `src/modules/myaade/services/` and re-export from `index.ts`.
4. (Optional) Add a section to `MyAadeModulePage.tsx` for admin testing.

## Auth

ΑΑΔΕ uses **WS-Security UsernameToken** in a SOAP 1.2 header. The credentials are **not** the regular TAXISnet ones — they're a separate "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" pair created at https://www1.gsis.gr/sgsisapps/tokenservices/. See [the module Settings page](#configuration) for the full registration walkthrough.

## Database surface

| Table | New columns (added 2026-05-24) |
|---|---|
| `crm_companies` | `commercial_title`, `legal_status`, `kad_primary`, `kad_primary_description`, `kad_secondary jsonb`, `business_start_date`, `aade_data jsonb`, `aade_data_at` |

The module also writes the standard VIES-style `vat_validated*` columns on `crm_companies` with `vat_validation_source='aade'` so any downstream consumer that already reads VIES validation also benefits from the ΑΑΔΕ check (treated as authoritative for Greek businesses).

## Cache + quota

- 90-day cache on `crm_companies.aade_data_at`. Repeat lookups for the same ΑΦΜ on the same company hit cache and **skip the SOAP call + the TAXISnet audit notification**.
- TAXISnet enforces a monthly quota per account. The cache is the primary defence; the manual button in `BusinessSection.tsx` is gated on country_code='EL' + 9-digit ΑΦΜ to avoid accidental calls.

## TAXISnet audit notification

Every successful lookup writes an audit entry to the looked-up ΑΦΜ's TAXISnet inbox. This is expected ΑΑΔΕ policy and a security feature. We **only ever call ΑΑΔΕ when a user is verifying their OWN business** — never as a customer/supplier research tool — so the notification lands in the same person's inbox who triggered it.

## Shared infrastructure

Every `myaade-*` function shares [`supabase/functions/_shared/aade/soap.ts`](../../../supabase/functions/_shared/aade/soap.ts):

- `resolveAadeCredentials(supabase)` — pulls `AADE_USERNAME` / `AADE_PASSWORD` / `AADE_AFM_CALLED_BY` via the platform-wide env-first → DB-fallback policy, returns `{ username, password, afmCalledBy, sources }`.
- `buildSoapEnvelope(creds, bodyXml)` — wraps any operation-specific `<Body>` in the standard SOAP 1.2 envelope + WS-Security UsernameToken header.
- `postSoap(endpoint, envelope, timeoutMs?)` — POSTs with the correct content-type (`application/soap+xml`) and a 20s default timeout, returns `{ ok, xml, httpStatus, err }`.
- `pickTag(xml, tagName)` / `pickAllTagBlocks(xml, tagName)` — namespace-agnostic XML extraction with NULL/--- sentinel handling.
- `summarizeAadeError(xml)` — locates business errors (`<error_rec>` / `<pErrorRec_out>`) or SOAP faults.
- `xmlEscape(s)` — escapes user input before composing the body.

Writing a new `myaade-*` function is typically ~80 lines: an `interface` for the response, a `parseXxx()` per record type, a `buildXxxBody()` for the request, and the standard `Deno.serve` shell that calls these helpers.

## Configuration

Uses the platform-wide `platform_secrets` registry. **Env vars take priority; the DB row is the fallback** — every function reads through `_shared/secrets.ts → resolveSecret()`.

**Primary location: `/admin/modules/myaade` → Settings card.**

| Key | Sensitive | Purpose |
|---|---|---|
| `AADE_USERNAME` | yes | Web-service username from "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" |
| `AADE_PASSWORD` | yes | Web-service password for the username above |
| `AADE_AFM_CALLED_BY` | no | Optional. Platform's own ΑΦΜ; logged as lookup originator |

The admin page has a step-by-step registration walkthrough with the right URLs and a live "Test lookup" panel to confirm the credentials work end-to-end.

**Env-var override at runtime**: if `AADE_USERNAME` is set on the edge function, that value wins regardless of what's in the DB. The Settings card surfaces this with a source badge so admins know which value the function actually used.

**RLS**: `platform_secrets` is locked to `service_role`. Admins reach it through `platform-secrets-admin`, which authenticates on user JWT (`admin` / `super_admin` roles) and masks `is_sensitive` values.

## Public API

```ts
import { aadeService } from '@/modules/myaade';

// Look up by ΑΦΜ. If companyId is provided, the server caches the result on
// crm_companies and mirrors structured fields into the row.
const result = await aadeService.lookup({ afm: '802349569', companyId: '…uuid…' });

if ('ok' in result && result.ok) {
  console.log(result.basic_rec.onomasia);         // legal name
  console.log(result.basic_rec.doy_descr);        // ΔΟΥ
  console.log(result.activities[0].description);  // primary ΚΑΔ description
}
```

## Mount points

The module currently has one consumer:

- [`src/components/core/Profile/BusinessSection.tsx`](../../components/core/Profile/BusinessSection.tsx) — shows a "Get full details from ΑΑΔΕ" button when country_code='EL' AND the VAT field has 9 digits. On success, fills `name`, `street`, `street_number`, `postal_code`, `city`, `country`, `country_code`, `tax_office`, `profession`.

To add more consumers, import `aadeService` from `@/modules/myaade` — same boundary pattern as other self-contained service modules.

## Removal

```bash
rm -rf src/modules/myaade
rm -rf supabase/functions/myaade-*
rm -rf supabase/functions/_shared/aade
# remove the AadeInline import + JSX from BusinessSection.tsx
```

DB columns are nullable and self-contained, so leaving them costs nothing.
