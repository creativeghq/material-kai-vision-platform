# Finance System (Greek e-invoicing, AADE/myDATA, AR/AP)

> Module slug: **`sales-finance`** · category `core` · tier `pro` · `src/modules/finance/manifest.json`
> Multi-tenant: **tenant = workspace**. Every table, view, RPC, and edge function is scoped to a `workspace_id`.

The finance module is the platform's multi-tenant accounting and e-invoicing layer for Greek businesses. It issues legally-compliant documents to **AADE/myDATA** through the **Novus** provider connector, tracks AR/AP, and produces the reports a Greek business needs for VAT filing and bookkeeping. It replaced a removed legacy third-party ERP connector (see [§10](#10-removed-the-legacy-erp-connector)).

Related docs: [Orders](orders-system.md) · [POS / Retail](pos-retail-system.md) · [Online Storefront](online-storefront.md) · [Capabilities & Tenancy](capabilities-and-tenancy.md) · [Warehouse & Billing](warehouse-and-billing.md) · [Finance API reference](api/finance-api.md) · [myAADE module](../src/modules/myaade/README.md).

---

## 1. What the module covers

- **Orders** ([orders-system.md](orders-system.md)) — sales & purchase orders are the commercial hub that quotes, invoices, payments/receipts, dispatch, products and **profit** attach to. An accepted quote auto-creates an order + a draft **pre-invoice**; a POS sale auto-creates a fulfilled/paid order. Orders are the first **Documents** tab and replace the per-doc tabs on the CRM company page.
- **Outbound documents** — sales invoices (`1.x`), service invoices (`2.x`), retail receipts (`11.x`, see [POS](pos-retail-system.md)), delivery/dispatch notes (`9.3`), and customer credit notes (`5.1`/`5.2`). All submitted to AADE/myDATA via the Novus connector.
- **Inbound documents** — pulls bills that suppliers transmitted to AADE citing this workspace's VAT (`RequestDocs`) into `inbound_documents`; convert to `supplier_bills` and/or receive into warehouse stock.
- **AP side** — supplier bills, supplier credit notes, planned payments, payment allocation.
- **Payments** — both cash-in (AR) and cash-out (AP) via `payments` + `payment_allocations`.
- **Reporting** — VAT analysis (ΦΠΑ), myDATA reconciliation, AR/AP aging, P&L, cash-flow forecast, ledgers (καρτέλα), and accounting export bridges (γέφυρες, CSV).
- **Digest** — scheduled email of the AR/AP snapshot + P&L + follow-up queue via the Flows engine.
- **Storefront + Stripe** — anonymous mini-store ([online-storefront.md](online-storefront.md)) + Stripe Checkout for online invoice payment.
- **Multi-branch** — `finance_branches` with branch codes surfaced on PDFs and submitted to AADE.

### Tenancy guard convention (from audit #208)

Every workspace-scoped `SECURITY DEFINER` RPC begins with:

```sql
PERFORM public.assert_workspace_member(p_workspace_id);
```

Edge functions enforce tenancy via `userCanAccessWorkspace()` / `listUserWorkspaceIds()` from `supabase/functions/_shared/auth.ts` — the post-#208 IDOR fix re-checks the authenticated user against the document's `workspace_id` on every document-touching path. See [Capabilities & Tenancy](capabilities-and-tenancy.md) for the guard RPC definitions.

---

## 2. Edge functions

All live under `supabase/functions/`. Full request/response detail in [api/finance-api.md](api/finance-api.md).

| Function | Auth | Purpose |
|---|---|---|
| `finance-issue-invoice` | `admin/super_admin/owner/finance/accountant` JWT | Create invoice from quote, issue (allocate series/AA), transmit to myDATA, POS card/IRIS two-phase flow, credit notes, delivery notes |
| `finance-invoice-pdf` | `admin/super_admin/owner/finance` JWT | Render A4 PDF for invoice / credit note / delivery note (`pdf-lib` + Noto Sans) |
| `finance-pay-invoice` | admin JWT **or** public `pay_token` | Mint pay link / create Stripe Checkout session (routes to workspace Connect account when configured) |
| `finance-send-invoice-email` | `admin/super_admin/owner/finance` JWT | Email the invoice PDF as attachment via `email-api` |
| `finance-send-statement` | finance JWT (single) or `x-cron-secret` (batch) | Party ledger (καρτέλα) PDF + email, with pay links; cron auto-statements |
| `finance-inbound-sync` | finance JWT (manual, free) or `x-cron-secret` (batch, 2 cr) | Pull `RequestDocs` from AADE myDATA into `inbound_documents` |
| `finance-fiscal-offline-recovery` | `x-cron-secret` | Backfill MARK on `fiscal_status='offline'` documents via `RequestTransmittedDocs` |
| `finance-digest-aggregate` | Flows / `x-cron-secret` / admin `mode:'now'` | Email AR/AP + P&L + follow-up digest; dispatch quote follow-up reminders |
| `finance-storefront` | none (public, slug-keyed) | Anonymous mini-store meta/products/checkout → draft retail receipt + pay link |
| `finance-customer-documents` | buyer session JWT (not a workspace member) | Customer self-service: list **their own** invoices / retail receipts / payment receipts with fresh signed PDF links |
| `parse-supplier-cost-list` | `admin/super_admin/owner` JWT | Apply a supplier price list (KB doc) → `products.cost` (procurement cost maintenance) |

### `finance-customer-documents` — customer self-service

A **buyer** with an app account (their `auth.users.id` linked to one or more `crm_contacts`) can see their own issued invoices, retail receipts, and payment receipts, each with a freshly-signed PDF link.

Why an edge function rather than direct table reads: `invoices` RLS is `is_workspace_member(workspace_id)`, and **a customer is not a workspace member** — so they cannot read the table at all. This function runs under the service role and scopes **strictly** to documents whose counterparty is one of the caller's own linked CRM contacts. That scoping is the entire security control: it is the "service-role client + must re-derive identity from the JWT" case from [invariant 1](../CLAUDE.md), so never let a body-supplied contact/company id widen it.

Frontend: [`MyDocumentsTab.tsx`](../src/components/core/Profile/MyDocumentsTab.tsx) (Profile) and [`ClientPortalPage.tsx`](../src/pages/ClientPortalPage.tsx), via [`customerDocumentsService.ts`](../src/services/customerDocumentsService.ts). PDF links are signed on read, never persisted (invariant 8 of the pipeline conventions).

### `finance-issue-invoice` — the central document engine

Request body flags (all optional, composable):

```
quote_id?          create invoice from quote (idempotent via issue_invoice_from_quote RPC)
invoice_id?        act on an existing invoice
credit_note_id?    act on a credit note
delivery_note_id?  act on a delivery note
issue_now?         flip draft → issued (allocates series/AA via mark_invoice_issued)
submit_fiscal?     transmit to AADE via Novus
skip_signature?    false = POS card/IRIS flow (Law 5155)
fiscal_overrides?  { series, aa, invoiceType, transmissionFailure }
pos_payment?       { type, terminalId, amount } — EFT-POS Law 5155
pos_complete?      { signatureToken } — finalize a held POS receipt
```

`issue_now` and `submit_fiscal` are **independent** — you can issue without transmitting, or transmit a pre-issued invoice. Credit cost: **2 credits per successful myDATA transmission** (`TRANSMISSION_CREDITS = 2`); root workspace transmits free; failure refunds.

---

## 3. The myDATA / AADE / Novus transmission flow

### 3.1 Connector resolution (master-key model)

`supabase/functions/_shared/fiscal/registry.ts → resolveWorkspaceConnector(supabase, workspaceId, capability)`:

1. Reads `workspace_fiscal_bindings WHERE workspace_id=? AND capability=?` for an explicit `connector_slug`.
2. No binding → defaults to `'novus'` for capabilities `legal_invoice` / `pre_invoice_notice` / `tax_submission`.
3. Loads Novus config: `NOVUS_API_KEY` + `NOVUS_SANDBOX` + `NOVUS_API_BASE_URL` via `resolveSecret()` (env-first, DB-second).

**This is a master-key model**: one platform-wide `NOVUS_API_KEY`. All sub-tenants transmit through it, distinguished by their own issuer VAT (`finance_settings.business_vat`). This is what makes it correct for multi-tenancy (unlike the removed legacy single-account ERP model).

### 3.2 Invoice payload construction

`supabase/functions/_shared/fiscal/invoice-builder.ts` — `buildInvoiceInputFromDb` / `buildCreditNoteInputFromDb` / `buildDeliveryNoteInputFromDb`:

- **Issuer** from `finance_settings` (name, VAT, address, tax office); branch address from `finance_branches` when `invoices.branch_code > 0`.
- **Counterpart** from `crm_companies` / `crm_contacts`. Retail receipts (`11.x`) emit **no counterpart** (AADE does not require it).
- **Per-line myDATA classification** from `products.mydata_vat_category` / `mydata_income_classification_type` / `mydata_income_classification_category`.
- **VAT category map** (canonical, post-#208): `{24:1, 13:2, 6:3, 17:4, 9:5, 4:6, 0:7, exempt:8}`. VAT amount is always recomputed as `net × pct/100` — the stored value is not trusted.
- **Series/AA**: `series = overrides.series ?? inv.series ?? finance_settings.invoice_number_prefix ?? 'A'`; `aa = overrides.aa ?? inv.series_number ?? inv.legal_number`.
- **Movement block** (`9.3` / shipping invoices) when `has_shipping=true`: dispatch date/time, vehicle number, `movePurpose`, loading/delivery address.
- Credit notes: `correlated_mark` set → `correlatedInvoices: [mark]` → myDATA **5.1** (correlated); unset → **5.2** (standalone).

### 3.3 Novus REST

`supabase/functions/_shared/fiscal/novus.ts`. Sandbox `https://provider-dev.timologisi.online`, production `https://provider.timologisi.online`.

| Endpoint | Use |
|---|---|
| `POST /api/v1/Provider/SendInvoices` | Transmit a document |
| `POST /api/v1/Provider/CompletionPosInvoices` | Finalize a POS card/IRIS receipt after the terminal charge clears |
| `GET /api/v1/Provider/RequestTransmittedDocs` | Poll for the MARK of an offline-queued document |
| `POST /api/v1/Provider/AskSignatureForOldInvoice` + `.../CompletionAskSignatureForOldInvoice` | Retroactive Law 5155 signature on an already-issued on-credit invoice (connector-only; no UI yet) |

Novus returns HTTP 200 on processed requests; branch on `response[0].statusCode`:

- `Success` → `{accepted, mark, uid, authenticationCode, qrUrl, invoiceUrl, providerCredits}`
- `Offline` → `{offline, uid, qrUrl, …}` — AADE down; Novus queues; MARK arrives later via `RequestTransmittedDocs`
- other → `rejected` (errorCode/errorMessage); 5XX → `error` (sets `transmissionFailure` on retry)
- `providerSignature[]` present → `awaiting_payment` (POS Law 5155 path)

### 3.4 State machine

```
draft
  → issue_now → issued                 (mark_invoice_issued allocates legal series/AA)
  → submit_fiscal → [2 cr reserved]
      → Novus SendInvoices
          accepted → fiscal_status='accepted', fiscal_mark stamped, credits kept
          offline  → fiscal_status='offline'  (offline-recovery cron backfills mark)
          rejected → fiscal_status='rejected', credits refunded
          error    → fiscal_status='error',   credits refunded, transmissionFailure on retry

POS card/IRIS (Law 5155):
  → pos_payment (skipSignature=false) → awaiting_payment, pos_signatures inserted, credits refunded
      → terminal charged → pos_complete
          → CompletionPosInvoices → accepted, 2 cr debited
```

Every attempt appends a row to `fiscal_submissions` (full request + response payload stored). The `finance-fiscal-offline-recovery` cron polls offline documents (50/batch, grouped by workspace so connectors resolve once) and stamps the MARK once AADE processes them.

---

## 4. Inbound document sync (`finance-inbound-sync`)

Pulls AADE's `RequestDocs` REST feed — documents **other** Greek businesses submitted to AADE citing this workspace's VAT as counterpart (statutory "received documents").

- **Credentials** (per-workspace) in `workspace_inbound_credentials`: `aade_user_id`, `subscription_key` (Ocp-Apim-Subscription-Key, masked in browser via `get_inbound_creds_status` RPC), `base_url`, `enabled`. These are AADE myDATA **REST** "Special Access Code" credentials — **not** TaxisNet, **not** the SOAP creds the [myAADE module](../src/modules/myaade/README.md) uses.
- **Auth**: cron path (`x-cron-secret`, 2 cr/sync debited after success) loops all enabled workspaces; manual path (finance JWT, free) scoped to caller's workspaces. Entitlement-gated on `sales-finance`.
- **Pull**: `GET {baseUrl}/RequestDocs?mark={watermark}` with `aade-user-id` + `Ocp-Apim-Subscription-Key` headers. Watermark = `finance_settings.inbound_last_mark` (advances to max MARK seen).
- **Date-bounded manual pull**: the "Sync from myDATA" button opens a period dialog and posts `{date_from, date_to}` (ISO `yyyy-mm-dd`, both required together, `from <= to`) — sent to AADE as `dateFrom`/`dateTo` in `dd/MM/yyyy`. A dated pull requests `mark=0` (an already-advanced watermark would empty an older window) but the **stored** watermark still only moves forward. Cron pulls stay watermark-only; a dated body on the cron path is ignored.
- **Issuer name resolution.** AADE's `<issuer>` block carries `vatNumber`/`country`/`branch` and **no name** — measured on live data, 0 of 1,146 name-less documents contained a `<name>` tag, and all 412 type-2.1 documents lack both the name and any `itemDescr`. `_shared/finance/resolve-issuer-names.ts` fills it after each sync: platform cache (`greek_registry_companies`) → workspace `crm_companies` by VAT → **ΓΕΜΗ OpenData** (`GEMI_API_KEY`, ≤40 live lookups/run). **ΓΕΜΗ's budget is 8 requests per MINUTE** — published per response as `X-RateLimit-Limit-Minute: 8` / `X-RateLimit-Remaining-Minute` / `RateLimit-Reset`. Over budget it answers **HTTP 200 with `{"message":"API rate limit exceeded"}` and no `searchResults` key**, so status alone can't distinguish a throttle from a miss: any payload without an array `searchResults` is transient and must never be cached as `not_found`, or live companies get pinned unresolvable (this bit the first backfill — 152 of 166 ΑΦΜ, every one active). The resolver is therefore strictly sequential at one call per 8s, follows the remaining-header, and **stops on throttle instead of retrying** (a per-minute budget already spent cannot be retried into). Default `maxLookups` is 8 = one minute's budget; a backlog drains across runs. Cost of ignoring this, measured: ~600 requests to resolve 166 ΑΦΜ instead of 166. ΓΕΜΗ and **not** ΑΑΔΕ RgWsPublic2 on purpose — every RgWsPublic2 call notifies the looked-up ΑΦΜ's TAXISnet inbox under the caller's identity and burns their quota, which is right for "verify my own business" and wrong for bulk supplier resolution. `greek_registry_companies` is platform-wide by design (public registry data, one platform key).
- **Document number**: `series` + `aa` from `invoiceHeader` (e.g. `ΤΔΑ 5160`) — the number printed on the supplier's paper copy, shown next to the MARK in the Expenses list.
- **Lands in** `inbound_documents` (PK `(workspace_id, mark)`, upsert ignore-duplicates). `status`: `new` → `classified` → `received` (lines mapped to stock) / `dismissed`. `lines` jsonb holds per-line `{line_number, quantity, net_value, vat_amount, item_description}`.
- **Downstream**: `inbound_doc_to_supplier_bill(p_doc_id)` creates a `supplier_bills` row; `inbound_doc_receive_to_warehouse(p_doc_id, p_mappings)` records stock-in (see [warehouse doc](warehouse-and-billing.md)).

### Supplier cost-list import (`parse-supplier-cost-list`)

Procurement-cost maintenance without editing product rows. An admin pastes a supplier's price list into a `kb_docs` row tagged `price_doc_type='supplier_cost_list'` (a Markdown table), then POSTs `{ kb_doc_id, dry_run? }`. The function parses SKU/cost/currency columns (case-insensitive header detection; strips `€$£`, handles comma separators), looks up `products` by `sku` (fallback `external_sku`) within the doc's `workspace_id`, and updates `products.cost` / `cost_currency` / `cost_updated_at` / `cost_source='kb_price_list'`. `dry_run:true` reports matched/unmatched without writing. Auth `admin/super_admin/owner`; 0 credits; manually invoked (no cron). Unmatched SKUs are reported, not errored.

---

## 5. Reports

### VAT analysis (ΦΠΑ)
RPC `finance_vat_report(p_workspace_id, p_from, p_to)` → rows of `{vat_rate, vat_category_code, output_vat, input_vat, net_sales, net_purchases, payable_vat}` — the shape needed for the Greek quarterly VAT return (Φ2). The canonical 8-code VAT table lives in `financeService.ts` (`VAT_CATEGORIES`):

| Code | % | Label | | Code | % | Label |
|---|---|---|---|---|---|---|
| 1 | 24 | Standard | | 5 | 9 | Island reduced |
| 2 | 13 | Reduced | | 6 | 4 | Island super-reduced |
| 3 | 6 | Super-reduced | | 7 | 0 | Zero-rated |
| 4 | 17 | Island reduced | | 8 | 0 | Exempt (needs `vatExemptionCategory`) |

### myDATA reconciliation
RPC `finance_mydata_reconciliation(...)` — every issued legal document bucketed by AADE state: `accepted` / `offline_pending` / `rejected` / `failed` / `not_transmitted`.

### Customer/Supplier ledger (Καρτέλα)
- **In-app**: `finance_party_ledger(...)` + `finance_party_opening_balance(...)` RPCs (`financeService.getPartyLedger` / `getPartyOpeningBalance`).
- **PDF + email**: `finance-send-statement` builds an 8-column running ledger with carry-forward opening balance and "Pay now" links per open invoice; cron mode auto-sends per `finance_settings.auto_statement_*` schedule, honoring `crm_companies.finance_statement_opt_out`.

### Accounting export bridges (Γέφυρες)
`src/modules/finance/services/accountingExportService.ts` (pure client-side, RLS-scoped — the `accountant` persona reaches it via Finance → Reports):
- `salesJournal(ws, from, to)` — `invoices` + `credit_notes` (sign-flipped).
- `purchasesJournal(ws, from, to)` — `supplier_bills` + `supplier_credit_notes` (sign-flipped).
- `summarize(...)` — groups by `(section × effective rate)`.
- **CSV**: 13 columns (`Date, Kind, myDATA type, Number, Series, Counterpart, VAT No, Net, VAT, Total, Rate %, MARK, Status`), UTF-8 BOM-prefixed for Excel Greek support. Imports into Epsilon Net / SoftOne / Megasoft via column mapping — plain delimited CSV, no proprietary format.

### When revenue counts — one derivation, one predicate
Not every sale becomes an invoice here: plenty are sold, delivered and paid straight off the order. So
**`vw_uninvoiced_sales_order_lines`** (line level) and **`vw_uninvoiced_sales_orders`** (its per-order
aggregate) hold the whole recognition rule: *a sales order counts as revenue once it leaves `draft`,
and stops counting the moment a live invoice exists for it* — the invoice takes over, so nothing is
counted twice. Moving recognition to fulfilment is a one-line edit to that predicate and every
consumer follows.

`vw_monthly_pnl`, `report_customer_profitability`, `report_pnl_per_category` and the six sales reports
all read it. They did not always: the rule was written out twice, missing from the rest, and a
workspace selling on orders therefore read a profitable month as a pure loss in *P&L by category*
(its costs were booked as supplier bills, its revenue existed nowhere) while the dashboard showed
the margin. Two rules for consumers adding themselves:
- **Take both halves, or neither.** Revenue without its cost is the same defect facing the other way: recognising a €3,000 order and leaving its €2,580 of goods on the supplier bill's own date reported €3,000 of profit for a month that made €420. Cost of goods follows the **sale**, not the bill.
- **Cost comes from the lines' `unit_cost` snapshot, never from the attached bills.** Every other margin surface uses the snapshot, and on live data the two disagree by thousands: a bill on a sales order is often a partial record of the same goods. Two sources for one money quantity is the rule this whole section exists to prevent.
- **Then exclude those bills from the expense side.** `report_pnl_per_category` drops any `supplier_bills` row sitting on a counted sales order, or on the purchase order raised to cover one — its cost has already arrived with the sale. The exclusion is deliberately *not* period-scoped, because the bill and the sale routinely fall in different months.
- **Never add order VAT to a VAT figure.** An order declares nothing to AADE; `vat_income` feeds the VAT return and stays document-only.

### Additional reports
All backed by `assert_workspace_member`-guarded RPCs: sales per day/customer/product/category/factory/designer; purchases per product; receipts per product; spend per supplier; payments in/out per counterparty; top customer/supplier outstanding; open tasks/follow-ups; customer top products. Plus views `vw_ar_aging`, `vw_ap_aging`, `vw_cash_flow_forecast`, `vw_monthly_pnl` (used by the digest + dashboard).

The per-day / per-customer / per-designer three summed the INVOICE's `subtotal_net` across a join to
`invoice_items`, so a 3-line invoice reported 3× its revenue. The count had been guarded with
`COUNT(DISTINCT)` and the margin is per line, so revenue was the one number nobody watched. Margin is
now folded per document *before* the sum — keep it that way when editing them.

---

## 6. Credit notes

### Customer credit notes (`credit_notes`)
Issued via `issue_credit_note(p_invoice_id, p_reason, p_lines, p_document_type)` RPC. Transmitted via `finance-issue-invoice` with `credit_note_id`. `correlated_mark` (source invoice's MARK) → myDATA **5.1** (correlated); absent → **5.2** (standalone). PDF at `pdf-documents/credit-note-output/{id}/cn-{id}.pdf`.

### Supplier credit notes (`supplier_credit_notes`)
Issued via `issue_supplier_credit_note(p_bill_id, p_reason, p_amount, p_lines)`. **NOT transmitted to AADE** — they are the supplier's document (already in AADE under the supplier's VAT). `external_mark` captures the MARK the supplier reported, for reconciliation against `inbound_documents`. Recorded for AP ledger accuracy and the purchases journal only.

---

## 6a. A MARK makes the document immutable (#328)

Once AADE returns a MARK, the document is a filed tax record. It **cannot be edited and cannot be
deleted** — a correction is a credit note, never an `UPDATE`. Enforced in the database, not in the
UI, because the UI is one of several writers:

| Table | Trigger |
|---|---|
| `invoices`, `credit_notes`, `delivery_notes` | `_fiscal_document_immutability_guard()` (BEFORE UPDATE **OR DELETE**) |
| `invoice_items` | `_invoice_items_immutability_guard()` |
| `credit_note_items`, `delivery_note_items` | `_fiscal_line_item_mark_guard()` |

**Two tiers.** Below a MARK, the old status-based rule is unchanged: an issued invoice freezes its
eight financial fields. Once `fiscal_mark IS NOT NULL` it flips to an **allowlist** —
everything is frozen except the operational fields in `fiscal_mutable_after_mark()`: settlement
(`amount_paid`, `paid_at`, `status`…), rendering artefacts (`pdf_*`), payment links, and the #193
post-transmission bookkeeping (`fiscal_error`, `fiscal_alerted_at`, `fiscal_credits_refunded_at`).

The allowlist direction is the point. The previous guard was a **denylist of 8 columns**, and it
had silently gone stale: `series` / `series_number` (the myDATA legal identity — `legal_number` was
frozen, these were not), `issued_at`, all five tax-total columns transmitted in `invoiceSummary`,
`document_type`, `branch_code`, the whole transport block that prints on a 9.3, and **`fiscal_mark`
itself** were all editable. `credit_notes` and `delivery_notes` had no guard at all, and nothing
blocked `DELETE`. With an allowlist, a column added tomorrow is frozen by default and whoever needs
it mutable has to say so.

Verified by probe against the live database rather than asserted — changing the total, the series
number, the MARK, a tax total, the issue date or the frozen counterparty, adding a line item, and
deleting the document are all rejected, while recording a payment, attaching the PDF and writing
recovery bookkeeping still succeed.

### The counterparty is frozen too

`invoices.counterparty_snapshot` / `delivery_notes.counterparty_snapshot` record **who the document
was issued to**, captured by `trg_*_freeze_counterparty` the moment the document stops being a
draft. Before this, every document resolved its customer live from `crm_companies`, so renaming a
customer silently rewrote who every past invoice was addressed to.

- Captured by a **trigger, not by `mark_invoice_issued`** — the POS page inserts rows with
  `status='issued'` directly and would never have been snapshotted.
- Stores an **allowlisted** set of fields, not the row: an immutable legal record must not
  accumulate PII (`lead_score`, `marketing_consent`) that nothing reads.
- `capture_counterparty_snapshot` resolves an attached contact **up to its primary company**, the
  same rule as `resolveContactBillingSource`, because that is the identity the document showed.
- Credit notes deliberately have **no** snapshot of their own — they resolve from the invoice they
  correct, snapshot included.
- The **transmission** reads it through `resolveCounterparty` in `_shared/fiscal/invoice-builder.ts`,
  which feeds the snapshot to the same `partyFromCrm` used for live rows, so the billing-identity
  precedence rules exist once and cannot drift between frozen and live documents.
- The **printers** read it through `resolvePrintedCounterparty`
  ([src/modules/finance/invoice-templates/counterparty.ts](../src/modules/finance/invoice-templates/counterparty.ts),
  mirrored to `_shared/finance/invoice-party.ts` by `npm run finance:mirror`). Until 2026-08-21
  they did not: both the React preview and the pdf-lib generator re-read `crm_companies` live, so
  the paper and the envelope could name different parties — a renamed customer rewrote every past
  PDF, a party with a separate billing identity was transmitted under it and printed under its
  visiting address, and a re-homed customer rendered with no name at all.
- A party panel prints **only** fields the allowlist above actually freezes. A field outside it
  (`gemi_number`, `kad_primary_description`) would render on a draft, which reads the live row, and
  vanish the moment the document is issued.

---

## 7. Key DB tables

All workspace-scoped; RLS enforces `is_workspace_member` for read and `is_workspace_finance_manager` for write on document tables.

**Documents:** `invoices` (78 cols — `internal_number`/`legal_number`/`series`/`series_number`, `document_type`, `status`, `fiscal_status`, `fiscal_mark`/`uid`/`qr_url`, `subtotal_net`/`vat_amount`/`total`/`amount_paid`/`amount_due`, per-line tax totals, `has_shipping`+movement fields, `pay_token`, `stripe_*`, `project_id`, `invoice_kind`, `pos_session_id`), `invoice_items`, `credit_notes`+`credit_note_items`, `delivery_notes`+`delivery_note_items`, `supplier_bills`, `supplier_credit_notes`(+items).

**Payments:** `payments` (AR cash-in + AP cash-out), `payment_allocations` (M2M to invoices/bills — its insert fires the status-keeper that derives `invoices.status`), `planned_payments`.

**Fiscal:** `fiscal_submissions` (one row per attempt, full payloads), `workspace_fiscal_bindings` (capability → connector), `fiscal_connectors` (registry; currently `novus`), `pos_*` (see [POS doc](pos-retail-system.md)).

**Inbound:** `inbound_documents`, `workspace_inbound_credentials`.

**Config:** `finance_settings` (~80 cols — business identity incl. EN variants, invoice numbering, banking, myDATA defaults, statement/digest schedules, template paths, FX), `finance_branches`, `finance_categories`.

**Views:** `vw_ar_aging`, `vw_ap_aging`, `vw_cash_flow_forecast`, `vw_monthly_pnl`, `vw_finance_parties`, `vw_customer_account_summary`, `vw_supplier_account_summary`, `vw_quote_followup_queue`.

---

## 8. Frontend

Module root `src/modules/finance/` (manifest slug `sales-finance`). Route `/finance` is double-gated: `CapabilityGuard capability="finance.manage"` then `EntitlementGuard moduleSlug="sales-finance"`.

- **Pages**: `DocumentsPage` (Invoices / Credit Notes / Delivery Notes / Supplier Bills / Inbound / Parties / Planning / Reports / Settings), `PosPage` (see [POS doc](pos-retail-system.md)).
- **Tabs**: `ReportsTab` (18 report kinds + `AccountingExportCard`), `PartiesTab` (ledgers + send statement), `SettingsTab` (identity, numbering, banking, myDATA defaults, digest/statement schedules, inbound creds, branches, POS terminals, storefront), `PlanningTab` (cash-flow/aging/planned payments), `TimeBillingTab` (see [billing doc](warehouse-and-billing.md)).
- **Services**: `financeService` (single merged service, ~1700 lines — all document CRUD, fiscal, payments, reports, statement, pay, digest, canonical VAT constants), `accountingExportService`, `inboundService`, `posSessionService`, `timeTrackingService`, `warehouseService`, `deliveryNotesService`.

---

## 9. Secrets & environment

| Key | Where | Purpose |
|---|---|---|
| `NOVUS_API_KEY` | `platform_secrets` / env | Master Novus key (one for the platform). Issuer identity comes from each tenant's `finance_settings.business_vat`. |
| `NOVUS_SANDBOX` | `platform_secrets` / env | `'true'` → `provider-dev.timologisi.online` |
| `NOVUS_API_BASE_URL` | `platform_secrets` / env | Override base URL |
| `AADE_MYDATA_BASE_URL` | `platform_secrets` / env | Inbound REST endpoint, default `https://mydatapi.aade.gr/myDATA` |
| `aade_user_id`, `subscription_key` | `workspace_inbound_credentials` (per tenant) | AADE myDATA REST creds (not TaxisNet) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `platform_secrets` / env | Tenant invoice/storefront payments (workspace Connect account via `get_workspace_payout_account`) |
| `CRON_SECRET` | `platform_secrets` / env | `x-cron-secret` for inbound-sync / offline-recovery / digest crons |
| `PUBLIC_APP_URL` | env | Pay links (`/pay/:token`), default `https://app.materialshub.gr` |

Resolution is env-first, DB-second via `resolveSecret()`. Admin manages keys at `/admin/operations → Keys`. Note `STRIPE_BILLING_SECRET_KEY` is a **separate** dedicated account for platform SaaS revenue (#200) — see [online-storefront.md §5](online-storefront.md).

---

## 10. Removed: the legacy ERP connector

The legacy third-party ERP connector was **removed entirely (2026-06-07)**: its module folder, edge functions, shared client, API docs, the `push_to_*` path in `finance-issue-invoice`, its `platform_secrets` rows + `modules` row, and all of its columns (0 data rows). It used a single platform-wide API key — architecturally wrong for multi-tenancy (every tenant's pre-invoices would land in the one operator account). Its purpose is fully replaced by the per-tenant Novus → AADE/myDATA path.

---

## 11. Known open issues (audit #208)

These are documented, currently-open bugs — do not assume they are fixed:

1. **Legal numbering allocated at draft-create, not at issue** — `NewInvoiceDialog` / `PosPage` / `duplicateInvoice` allocate `series_number` at insert, so abandoned drafts gap the series. Correct fix: allocate only at issue. Legally sensitive — requires a live myDATA smoke test before changing.
2. **Dialog-issued invoices get no `legal_number`** — the `NewInvoiceDialog` path sets `status:'issued'` inline without calling `mark_invoice_issued`. The quote→invoice path through `finance-issue-invoice` is correct.
3. **Commission ledger bills from live `list_price`, not `cost_snapshot`** — `record_invoice_commissions` diverges from the quote when base price changed.
4. **Nav vs route gating mismatch** — nav shows Settings for `staff` even though the route is guarded by `network.manage`.
5. **`debit_user_credits` failure after successful transmission** is logged (`console.warn`), not hard-failed; a pre-check mitigates but full fix needs atomic reservation.
6. **`VAT_CATEGORIES` duplicated** across `NewInvoiceDialog` / `ProductFiscalCard` / `ServicesCard` with inconsistent string-vs-numeric codes (canonical copy now in `financeService.ts`).

---

**Last updated**: 2026-06-09 · Covers #207, #208, #185, #206, #193, #200, #174.
