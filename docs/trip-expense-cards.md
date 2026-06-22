# Trip Expense Cards & Customer AR Aging

Two finance features shipped together (2026-06-20):

1. **Trip / expense cards** — sales reps (and other staff) collect expenses into a "card", attach receipts, submit for per-line finance approval, and (optionally) get a reimbursement payable created automatically.
2. **Customer AR aging buckets** — a per-customer outstanding-receivables breakdown by days-past-due, consumed across the finance Parties views.

Both are workspace-scoped and gated by the `sales-finance` module.

---

## Expense cards

### Data model

**`trip_expense_reports`** — the card.
- Identity / ownership: `id`, `workspace_id`, `user_id`, `card_type` (`'trip' | 'monthly' | 'other'`).
- Trip details: `title`, `destination` (trip cards only), `purpose`, `trip_start`, `trip_end`, `currency` (default `'EUR'`).
- Lifecycle: `status` (`'draft' | 'submitted' | 'partially_approved' | 'approved' | 'rejected' | 'reimbursed'`), `submitted_at`, `reviewed_at`, `reviewed_by`, `review_notes`.
- Denormalized rollups: `item_count`, `total_amount`, `approved_amount`, `rejected_amount`, `pending_amount` (recomputed by `_trip_expense_recompute`).
- Assignment (finance requested the card on a teammate's behalf): `assigned_by`, `request_note`.
- Reimbursement: `reimbursement_planned_payment_id` (FK → `planned_payments.id`), `reimbursed_at`.

**`trip_expense_items`** — one line per expense.
- `id`, `report_id` (FK), `workspace_id`, `expense_date`.
- `category` (`'transport' | 'fuel' | 'hotel' | 'meals' | 'parking' | 'tolls' | 'supplies' | 'other'`), `description`, `vendor`, `amount`, `currency`, `vat_amount`.
- `payment_method` (`'cash' | 'card' | 'personal' | 'company_card' | 'other'`), `billable`, `project_id` (optional billable link).
- Receipt: `receipt_bucket` (`'pdf-documents'`), `receipt_path`, `receipt_name`, `receipt_mime`.
- Per-line review: `approval_status` (`'pending' | 'approved' | 'rejected'`), `review_notes`, `reviewed_by`, `reviewed_at`, `sort_order`.

### Lifecycle

1. **Create + fill** — rep creates a card (`createReport`) and adds expense lines (`addItem`).
2. **Submit** — `trip_expense_submit` RPC flips the card to `submitted`, stamps `submitted_at`, and emits the `expense_card_submitted` flow event to workspace finance reviewers.
3. **Per-line review** — finance approves/rejects each line via `trip_expense_review_item(p_item_id, p_decision, p_note?)`. Each call recomputes the card rollups; the card lands on `approved` / `partially_approved` / `rejected`. When every line is decided, the `expense_card_reviewed` flow event fires back to the rep.
4. **Reimbursement (optional)** — `_trip_expense_sync_reimbursement` reads `finance_settings.trip_expense_reimbursement_mode`:
   - `'planned_payment'` → creates/updates a payable (`planned_payments`, expense direction, counterparty = the rep, amount = approved total) and links it via `reimbursement_planned_payment_id`.
   - `'none'` → approval-only, no payable.
   Marking that planned payment paid flips the card to `reimbursed` and stamps `reimbursed_at`. The toggle lives in **Finance → Settings** ("Auto-create a reimbursement payable on approval").
5. **Finance-requested cards** — finance can open a card *for* a teammate via `trip_expense_request_card(...)` (stamps `assigned_by` / `request_note`), which emits `expense_card_requested` to that user. Assignee candidates come from `list_workspace_expense_assignees(p_workspace_id)`.

### Edge function — `trip-expense-ops`

Service-role-backed (receipts live in the private `pdf-documents` bucket). The caller is the authenticated card owner / finance manager; ownership + `is_workspace_finance_manager` are checked before writes. Action-based POST:

| Action | Body | Does |
|---|---|---|
| `upload_receipt` | `item_id`, `filename`, `content_type`, `data_base64` | Uploads the receipt → `pdf-documents/trip-expenses/{report_id}/{item_id}-{ts}.{ext}`, writes the `receipt_*` columns. Returns a 7-day signed URL. |
| `sign_receipt` | `item_id` | Mints a fresh 7-day signed URL for the stored receipt. |
| `generate_pdf` | `report_id` | Renders the A4 expense report (header + per-line table with color-coded approval status + totals) → `pdf-documents/trip-expenses/{report_id}/report-{ts}.pdf`, returns a signed URL + `page_count`. |

Receipt paths are added to `build_storage_reference_set()` so the orphan-cleanup cron never reaps a live receipt.

### Agent tools (`_shared/tools/trip-expense-tools.ts`)

Registered on KAI, gated on the `sales-finance` module, **0 credits**, service-role enforces the caller's `user_id`:

- `create_trip_card` → `{ title, card_type?, destination?, purpose?, trip_start?, trip_end?, currency? }`
- `add_trip_expense` → `{ card_id? | card_title?, amount, category?, description?, vendor?, expense_date?, currency?, payment_method? }`
- `list_trip_cards` → `{ status?, card_type? }`
- `submit_trip_card` → `{ card_id? | card_title? }` (validates draft + ≥1 line, emits `expense_card_submitted`)

Chunk types streamed to AgentHub: `trip_card_created`, `trip_expense_added`, `trip_cards_list`, `trip_card_submitted`.

### Frontend

- Route **`/trip-expenses`** ([src/pages/TripExpensesPage.tsx](../src/pages/TripExpensesPage.tsx)) — any authenticated workspace member; renders `TripExpensesPanel` with `canReview={false}` (reps see only their own cards).
- **Finance → "Expense cards" tab** ([src/pages/Admin/FinancePage.tsx](../src/pages/Admin/FinancePage.tsx), tab `trip_cards`) — renders the same panel with `canReview={true}` for finance/owners (read-only for accountants).
- Panel + dialogs: [src/modules/finance/components/TripExpensesPanel.tsx](../src/modules/finance/components/TripExpensesPanel.tsx) (`TripCardDetail`, `NewTripCardDialog`, `RequestCardDialog`, `AddExpenseDialog`).
- Service: [src/modules/finance/services/tripExpenseService.ts](../src/modules/finance/services/tripExpenseService.ts) — `listReports / getReport / createReport / updateReport / deleteReport / addItem / updateItem / removeItem / submit / reviewItem / requestCard / listAssignees / uploadReceipt / receiptUrl / generatePdf`.

### Flow events

| Event | Audience | Action URL |
|---|---|---|
| `expense_card_submitted` | workspace finance reviewers | `/finance?tab=trip_cards` |
| `expense_card_reviewed` | card owner (rep) | `/trip-expenses` |
| `expense_card_requested` | the assigned teammate | `/trip-expenses` |

(All delivered through the Flows engine — see [flows-notification-system.md](./flows-notification-system.md).)

---

## Customer AR aging buckets

**`vw_customer_aging_buckets`** — a `security_invoker` view (base-table RLS applies), one row per customer (company or contact) with outstanding receivables.

| Column | Meaning |
|---|---|
| `customer_company_id`, `customer_contact_id`, `party_name` | the customer |
| `not_due` | amount not yet due (or no due date) |
| `due_0_30` | 1–30 days past due |
| `due_31_90` | 31–90 days past due |
| `due_90_plus` | > 90 days past due |
| `total_outstanding` | sum of all buckets |
| `open_doc_count`, `max_days_overdue` | open-document count + worst overdue age |
| `workspace_id` | tenant scope |

Read via `financeService.getCustomerAgingBuckets({ workspaceId?, companyId?, contactId? })` ([src/modules/finance/services/financeService.ts](../src/modules/finance/services/financeService.ts)), ordered by `total_outstanding` desc.

Consumed by:
- [src/modules/finance/tabs/PartiesTab.tsx](../src/modules/finance/tabs/PartiesTab.tsx) — headline totals + per-party breakdown.
- [src/modules/finance/components/CustomerFinanceTabs.tsx](../src/modules/finance/components/CustomerFinanceTabs.tsx) — `PartyAccountSummary` renders the four buckets (90+ highlighted red when non-zero).

---

## Activation

Enable the `sales-finance` module. Deploy the `trip-expense-ops` edge function and (if not already) `agent-chat` so the trip-expense tools load. All DB objects (tables, view, RPCs, the storage-reference-set protection) are applied via MCP migrations.
