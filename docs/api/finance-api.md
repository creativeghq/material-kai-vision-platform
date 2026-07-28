# Finance API (edge functions)

Per-function reference for the `finance-*` and related edge functions. Architecture context: [finance-system.md](../finance-system.md), [pos-retail-system.md](../pos-retail-system.md), [online-storefront.md](../online-storefront.md).

Base URL: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/`. All POST. Standard error shape `{ ok:false, error, code? }`. Credits debited from the caller's `user_credits`; root workspace transmits free.

| Function | Auth | Credits |
|---|---|---|
| `finance-issue-invoice` | JWT `admin/super_admin/owner/finance/accountant` | 2 / myDATA transmission |
| `finance-invoice-pdf` | JWT `admin/super_admin/owner/finance` | 0 |
| `finance-pay-invoice` | admin JWT **or** public `pay_token` | 0 |
| `finance-send-invoice-email` | JWT `admin/super_admin/owner/finance` | email via `email-api` (1) |
| `finance-send-statement` | finance JWT / `x-cron-secret` (batch) | email via `email-api` (1) |
| `finance-inbound-sync` | finance JWT (manual, free) / `x-cron-secret` (2) | 2 / automated sync |
| `finance-fiscal-offline-recovery` | `x-cron-secret` | 0 |
| `finance-digest-aggregate` | Flows / `x-cron-secret` / admin `mode:'now'` | email via `email-api` (1) |
| `finance-storefront` | none (public, slug-keyed) | 0 (transmission billed later at issue) |
| `parse-supplier-cost-list` | JWT `admin/super_admin/owner` | 0 |

Every document-touching path also runs `userCanAccessWorkspace(supabase, userId, doc.workspace_id)` (post-#208 IDOR guard) and, before any myDATA transmission, `is_workspace_entitled(workspace_id, 'sales-finance')`.

---

## `finance-issue-invoice`

The central document engine. Request (all optional, composable):

```jsonc
{
  "quote_id": "uuid",          // create invoice from quote (idempotent)
  "invoice_id": "uuid",        // act on an existing invoice
  "credit_note_id": "uuid",    // act on a credit note
  "delivery_note_id": "uuid",  // act on a delivery note
  "issue_now": true,           // draft → issued (allocates legal series/AA)
  "submit_fiscal": true,       // transmit to AADE via Novus
  "skip_signature": false,     // false ⇒ POS Law 5155 card/IRIS flow
  "fiscal_overrides": { "series": "A", "aa": 123, "transmissionFailure": 1 },
  "pos_payment": { "type": 7, "terminalId": "...", "amount": 12.40 },
  "pos_complete": { "signatureToken": "..." }
}
```

Response: `{ ok, invoice_id, status, fiscal_status, fiscal_mark, fiscal_uid, fiscal_qr_url, credits_used, provider_credits }`.

Behavior: resolve document → optionally `mark_invoice_issued` (the only place the gapless legal counter advances) → optionally reserve 2 credits + Novus `SendInvoices` → upsert `fiscal_submissions` + stamp `invoices.fiscal_*`. `accepted` keeps credits; `offline` waits for the recovery cron; `rejected`/`error` refunds. POS: `pos_payment` (`skipSignature=false`) holds the doc `awaiting_payment` + inserts `pos_signatures` + refunds; `pos_complete` runs `CompletionPosInvoices` and debits 2 credits. See [POS doc](../pos-retail-system.md#3-law-5155-card--iris-signature-flow).

---

## `finance-invoice-pdf`

`{ invoice_id? | credit_note_id? | delivery_note_id?, regenerate? }` → `{ ok, pdf_url (7-day signed), pdf_storage_path, cached }`. Renders A4 (`pdf-lib` + Noto Sans, `doc_language` el/en) from the document + `finance_settings` + customer + branch. Returns the cached signed URL unless `regenerate`. Uploads to `pdf-documents/{invoice|credit-note|delivery-note}-output/{id}/...`. QR + MARK printed when `fiscal_mark` set. **Op risk**: fonts load from CDN at cold start with no fallback.

---

## `finance-pay-invoice`

**Admin** `{ invoice_id, link_only?, success_url?, cancel_url? }`: `link_only` mints/rotates a 7-day `pay_token` → `{ pay_link, pay_token }`; otherwise creates a Stripe Checkout session (routed to the workspace Connect account via `get_workspace_payout_account`). **Public** `{ pay_token, success_url?, cancel_url? }`: `resolve_invoice_pay_token` (service-role) → Checkout session → `{ ok, checkout_url, amount, currency, customer_display, already_paid }`. Bootstraps `STRIPE_SECRET_KEY` from `platform_secrets`. Fulfillment via the `stripe-webhooks` function (`payment_intent.succeeded`). See [storefront §4–5](../online-storefront.md#4-stripe-connect-checkout).

---

## `finance-send-invoice-email`

`{ invoice_id? | credit_note_id?, to? }`. Calls `finance-invoice-pdf` (passing the caller's `Authorization` through), resolves the recipient from CRM (overridable by `to`), and dispatches via `email-api` with the PDF base64-attached. Body includes MARK, QR URL, and pay link.

---

## `finance-send-statement`

Party ledger (καρτέλα). **Single** `{ party_type:'company'|'contact', party_id, email?, dry_run?, side?:'customer'|'supplier', from?, to?, lang? }` → `{ ok, email_sent_to, pdf_url, rows, closing_balance, total_outstanding }`. Builds an 8-column running ledger (carry-forward opening balance, red overdue callout) at `pdf-documents/statements/...`, mints 90-day pay tokens for open invoices, emails via `email-api`. **Cron** `{ mode:'cron_batch' }`: iterates `finance_settings.auto_statement_enabled` parties due per their schedule, honoring `crm_companies.finance_statement_opt_out`.

---

## `finance-inbound-sync`

Pulls AADE `RequestDocs` into `inbound_documents`. **Cron** (`x-cron-secret`): all enabled workspaces, 2 cr each after success. **Manual** (finance JWT): caller's workspaces only, free. Per-workspace `is_workspace_entitled('sales-finance')` gate. `GET {baseUrl}/RequestDocs?mark={watermark}` with `aade-user-id` + `Ocp-Apim-Subscription-Key`; advances `finance_settings.inbound_last_mark`. Optional body `{date_from, date_to}` (ISO `yyyy-mm-dd`, manual path only, both-or-neither, `from <= to` else 400) bounds the pull to that issue-date window (`dateFrom`/`dateTo` as `dd/MM/yyyy`, requested with `mark=0`). See [finance §4](../finance-system.md#4-inbound-document-sync-finance-inbound-sync).

---

## `finance-fiscal-offline-recovery`

`x-cron-secret` only. Reads `invoices`/`credit_notes WHERE fiscal_status='offline'` (50/batch, grouped by workspace), calls Novus `RequestTransmittedDocs` per doc, and stamps `fiscal_mark` + flips `accepted` once AADE has processed it. 0 credits. Run at least hourly.

---

## `finance-digest-aggregate`

`{ mode?:'cron'|'now'|'followups_only', workspace_id?, recipients_override? }`. Per due workspace (schedule from `finance_settings.digest_*`): reads `vw_ar_aging`/`vw_ap_aging`/`vw_cash_flow_forecast`/`vw_monthly_pnl` + `planned_payments` + `report_top_customer/supplier_outstanding`, renders HTML fragments, emails via `email-api` (`templateSlug='finance.digest'`). The follow-up dispatcher scans `vw_quote_followup_queue`, fires `user_notifications`, and writes a `quote_activities` `reminder_dispatched` row (24h dedupe).

---

## `finance-storefront`

Public, no auth, `{ action, slug, ... }`. `meta` → store config; `products` → published priced products; `checkout` `{ items, customer:{name,email} }` → server-recomputes prices, `assertEntitled('sales-finance')` (402), inserts a draft `11.1` invoice + items, returns `{ invoice_id, pay_token, pay_url, total, currency }`. Full detail in [online-storefront.md §3](../online-storefront.md#3-finance-storefront-edge-function).

---

## `parse-supplier-cost-list`

`{ kb_doc_id, dry_run? }` → `{ ok, parsed_rows, matched, updated, unmatched, errors, rows[] }`. Parses a `kb_docs` row with `price_doc_type='supplier_cost_list'` (Markdown table) and writes `products.cost`/`cost_currency`/`cost_updated_at`/`cost_source='kb_price_list'` for matching SKUs in the doc's workspace. `dry_run:true` simulates without writing. See [finance-system.md §4](../finance-system.md#supplier-cost-list-import-parse-supplier-cost-list).

---

## Related functions

- **`stripe-connect`** — `{ action:'onboard'|'status', return_url? }` (owner/admin JWT). Creates/refreshes the workspace Stripe Express account on `workspace_payment_config`.
- **`stripe-webhooks`** — Stripe signature auth. `payment_intent.succeeded` with `metadata.type='invoice_payment'` → `payments` + `payment_allocations` → invoice flips paid. Verifies against `STRIPE_WEBHOOK_SECRET` or `STRIPE_BILLING_WEBHOOK_SECRET` (#200).
- **`catalog-access`** — presentation-catalog email gate; see [sales-and-marketplace.md §3](../sales-and-marketplace.md#3-presentation-catalog-email-gate-catalog-access-edge-function).
- **`myaade-rgwspublic2`** — Greek business registry lookup; see [myAADE README](../../src/modules/myaade/README.md).

---

**Last updated**: 2026-06-09.
