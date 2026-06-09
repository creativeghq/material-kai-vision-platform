# POS / Retail System (Law 5155, vPOS shifts, EFT-POS, thermal receipts)

Part of the [Finance module](finance-system.md). A lightweight B2C walk-in point of sale that issues legally-compliant Greek **myDATA simplified retail receipts** (document type `11.1`) in real time, through the same Novus → AADE transmission path used for B2B invoices.

Route `/pos` — `AuthGuard` + `CapabilityGuard capability="invoice.issue"` (`src/App.tsx`). Page: `src/modules/finance/pages/PosPage.tsx`.

Related: [Finance system](finance-system.md) · [Capabilities & Tenancy](capabilities-and-tenancy.md) · [Finance API](api/finance-api.md).

---

## 1. Overview

The POS is deliberately minimal: no customer record required, software-tracked cash drawer, thermal receipt printed via the browser. A retail receipt is an `invoices` row with `document_type='11.1'` that flows through the identical fiscal machinery as a `1.1` invoice. The POS adds three concerns on top of the shared engine:

1. **Cloud vPOS sessions** — cashier shifts with a Z-number, cash drawer movements, X/Z reports.
2. **Law 5155 card/IRIS signature flow** — EFT-POS terminal registry + two-phase AADE transmission.
3. **Thermal receipt rendering** — 80 mm CSS `@media print` fragment.

A receipt cannot be issued until a shift is open (`PosPage.issue()` blocks with "Open a shift first").

---

## 2. Cloud vPOS shifts

All via `posSessionService` (`src/modules/finance/services/posSessionService.ts`), backed by `is_workspace_member`-guarded RPCs:

- **`open_pos_session(workspace_id, branch_code, opening_float)`** — idempotent (returns the existing open session for that workspace+branch). Inserts `pos_sessions`, stamps `opened_by`.
- **`close_pos_session(session_id, counted_cash?)`** — assigns the next sequential `z_number` (per-workspace `max+1`), computes `cash_variance = counted − expected`, sets `status='closed'`, returns the report.
- **`pos_session_report(session_id)`** — callable anytime: an **X report** while open, or read-back on a closed session.

**Cash drawer**: `posSessionService.recordCash(sessionId, workspaceId, direction, amount, reason?)` inserts `pos_cash_movements` (`direction ∈ {'in','out'}`).

**Report aggregation** (`pos_session_report`): `receipt_count` + `total_sales` (over non-draft/void invoices for the session), `by_payment` (cash/card/other split via `payment_method_code`), `by_vat` (net + VAT per rate), `cash_in`/`cash_out`, `expected_cash = opening_float + cash_sales + cash_in − cash_out`, `counted_cash`, `cash_variance`.

> **Note**: `z_number` is workspace-scoped, not branch-scoped — multi-branch workspaces share one Z sequence.

---

## 3. Law 5155 card / IRIS signature flow

Greek Law 5155/2023 requires card (payment type `7`) and IRIS (type `8`) receipts to carry a digital signature from the Payment Service Provider's Network Service Provider (NSP) **before** AADE transmission. The flow is inherently two-phase.

```
PosPage.issue()  (card/IRIS)
  → invoices INSERT (11.1, payment_method_code=7|8, pos_session_id) + invoice_items
  → fiscalConnectorService.submitInvoice(invoiceId, { posPayment:{terminal_id, pos_nsp_id, payment_type} })
      → finance-issue-invoice { submit_fiscal, pos_payment } → Novus SendInvoices?skipSignature=false
      → Novus returns providerSignature[] → status 'awaiting_payment'
      → pos_signatures INSERT (signature_token, terminal_id, pos_nsp_id, payment_type, expiry_date)
      → invoices.fiscal_status='awaiting_payment'; reserved credits REFUNDED (not charged yet)
  → UI shows amber "awaiting payment" panel

Operator charges the physical terminal, types the transaction_id:
PosPage.chargeAndComplete()
  → fiscalConnectorService.completePos({ pos_signature_id, invoice_id, transaction_id, payment_amount })
      → finance-issue-invoice { pos_complete }
      → expiry check (expired → status 'expired', 409 "re-issue the receipt")
      → reserve 2 credits → Novus CompletionPosInvoices → MARK
      → fiscal_submissions INSERT (accepted, mark); pos_signatures → 'completed' (+final_mark, transaction_id)
      → invoices.fiscal_status='accepted', fiscal_mark stamped
```

### EFT-POS terminal registry (`pos_terminals`)

| Column | Notes |
|---|---|
| `workspace_id`, `branch_code` | tenant scope (0 = HQ) |
| `label` | display name |
| `terminal_id` | physical device ID |
| `pos_nsp_id` | NSP provider code (drives token encoding) |
| `is_active`, `notes`, `created_by` | |

NSP provider codes (`src/services/fiscalConnectorService.ts → POS_NSP_PROVIDERS`): 1 Mellon (HEX), 2 Viva (HEX), 3 Cardlink (B64), 4 Euronet (B64), 5 Nexi (B64), 6 EDPS (B64), 7 Worldline (HEX), 98 Other (HEX→B64), 99 Other (B64).

Managed by `PosTerminalsCard` in `SettingsTab` (write gated to `is_workspace_finance_manager`). When no terminal is registered, card/IRIS receipts still transmit but **without** a provider signature (`skipSignature=true`) — the UI warns.

> The platform never touches the bank/NSP terminal API directly. The physical charge happens out-of-band; the platform handles only the Novus signature token and the operator-typed `transaction_id` confirmation. IRIS is identical to card at the Novus level (`payment_type=8` vs `7`).

---

## 4. Thermal retail receipt

Pure CSS `@media print` fragment in `PosPage.tsx` — **no edge function**. A hidden `<div id="pos-receipt">` (`display:none`) becomes the only visible element on `window.print()`. Layout: `width:80mm`, `font:'Courier New' 12px`, `@page { size: 80mm auto; margin:0 }`.

Fields: title "ΑΠΟΔΕΙΞΗ / RECEIPT", receipt number, timestamp, line items (`qty × name — amount`), net subtotal, VAT, **TOTAL**, payment method, and the MARK (printed only when `result.mark` is present, i.e. AADE accepted — for the two-phase card flow, reprint after completion).

> Known gap: no QR code on the thermal receipt (Novus returns `qrUrl` on `fiscal_submissions`, not rendered here).

---

## 5. DB tables

| Table | RLS | Key columns |
|---|---|---|
| `pos_sessions` | `is_workspace_member` (ALL) | `branch_code`, `opened_by/at`, `opening_float`, `closed_by/at`, `closing_counted_cash`, `cash_variance`, `z_number`, `status` |
| `pos_cash_movements` | `is_workspace_member` (ALL) | `session_id`, `direction`, `amount`, `reason` |
| `pos_terminals` | read `is_workspace_member`, write `is_workspace_finance_manager` | `branch_code`, `label`, `terminal_id`, `pos_nsp_id`, `is_active` |
| `pos_signatures` | `is_workspace_member` (ALL) | `invoice_id`, `signature_token`, `pos_nsp_id`, `payment_type`, `expiry_date`, `status`, `transaction_id`, `final_mark`, `completed_at` |

Receipts link to a shift via `invoices.pos_session_id`; the Z-report aggregates `invoices`, not `pos_signatures`.

---

## 6. Credits & fiscal integration

- **2 credits per myDATA transmission** (`TRANSMISSION_CREDITS`), same as B2B. Root workspace free.
- Card/IRIS flow: **0 credits** at `pos_payment` (the reservation is refunded while held), **2 credits** at `pos_complete`.
- `submit_fiscal` is gated on `is_workspace_entitled('sales-finance')`. A non-entitled workspace can still open the POS and issue receipts locally — they just get no MARK.

Frontend: `PosPage.tsx` (full UI — shift bar, product/service grid from `product_prices`, cart, VAT-inclusive toggle, movement-document toggle, branch picker, payment selector, terminal picker, awaiting-payment panel, X/Z modal); `posSessionService.ts`; `fiscalConnectorService.ts` (`submitInvoice` / `completePos` / `posTerminalService`); `PosTerminalsCard.tsx`.

---

## 7. Known gaps / follow-ups

- **Old-invoice deferred signature** (`askSignatureForOldInvoice` / `completeOldInvoicePosPayment`) is implemented at the Novus connector layer but has **no UI** — needed when a customer pays by card after an on-credit invoice was issued.
- **Signature expiry** is checked server-side but not surfaced as a countdown; an expired token returns 409 and forces re-issuing the receipt.
- **No QR on thermal receipt** (§4).
- **`/pos` not in `nav-items.ts`** — reachable by direct URL / capability, not listed in nav.
- **No offline mode** — if Supabase is unreachable the receipt INSERT fails (no client queue).
- **VAT-inclusive toggle** is per-page local state (defaults `true`), not persisted per shift.

---

**Last updated**: 2026-06-09 · Covers #185, #205, #207.
