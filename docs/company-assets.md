# Company Assets Register

Fleet, phones, laptops, payment cards and equipment — owned, leased or financed — with one active holder each and a link into the recurring-expense machinery.

- Service: [`src/services/assetsService.ts`](../src/services/assetsService.ts)
- UI: [`src/components/business/assets/CompanyAssetsPanel.tsx`](../src/components/business/assets/CompanyAssetsPanel.tsx)
- Tables: `company_assets`, `asset_assignments`
- Agent tool: `manage_company_assets`

---

## 1. One panel, two mount points, no page

`CompanyAssetsPanel` is mounted in **both** the workspace Finance module and the HR module. There is deliberately **no `/assets` route**.

The register answers two different questions for two different people, and both are already somewhere else:

- Finance asks *what does this cost and how is it financed* — so the panel sits with the rest of the cost surface.
- HR asks *who is holding what* — so the panel sits with the people it is assigned to.

A third destination would have meant a third place to remember, plus a nav item that is wrong for whichever of the two users clicked it. One shared element mounted twice keeps the data single-sourced and each mount contextual. This is the same pattern as the shared CRM record-activity element used by both contact and company records.

---

## 2. Model

### `company_assets`

| Field | Values / notes |
|---|---|
| `category` | `vehicle` \| `phone` \| `laptop` \| `payment_card` \| `equipment` \| `other` |
| `status` | `active` \| `in_repair` \| `retired` \| `returned` |
| `acquisition_type` | `owned` \| `leased` \| `financed` |
| `depreciation_method` | `none` \| `straight_line` |
| `recurring_expense_id` | Links a leased/financed asset to a `finance_recurring_expenses` template |
| `book_value`, `monthly_depreciation` | **Computed**, not stored — see §4 |

### `asset_assignments`

Assigns an asset to an **employee** (`hr_employees`) or a **CRM contact**. A partial unique index enforces **one active holder per asset** — the register can't drift into two people both holding the same phone. History is retained: returning an asset closes the assignment rather than deleting it.

RLS is workspace-scoped via `is_workspace_member`. Tables applied via the `company_assets_register` migration.

---

## 3. Leased and financed assets flow into Finance

A leased or financed asset carries a `recurring_expense_id` pointing at a `finance_recurring_expenses` template. The monthly cost then flows through the **existing** expense → `supplier_bills` machinery — the nightly recurring-expense cron raises the bill, it lands in payables, it settles like any other bill.

Nothing about asset accounting is bespoke. A car lease is a recurring expense that happens to have a car attached to it, and modelling it any other way would have created a second, parallel cost ledger that the P&L would then have to reconcile against.

---

## 4. Depreciation

Straight-line only, and **derived rather than stored**:

- `monthly_depreciation` = (cost − residual) ÷ useful life in months
- `book_value` = cost − accumulated depreciation since `depreciation_start` (falling back to `acquired_at`)

Both return `null` when `depreciation_method` is `none` or the inputs are incomplete — a missing acquisition cost yields no book value, not a book value of zero.

Deriving rather than caching is the [one-derivation rule](../CLAUDE.md) applied to a new money quantity: if the figure were stored, it would need a nightly job to advance it and a drift check to catch that job failing. Computing it on read costs nothing at this row count and cannot go stale.

**Leased assets need no depreciation** — the lease payment is already the expense. That's why `none` is the default rather than an omission.

---

## 5. Agent parity

`manage_company_assets` gives the JARVIS agent the same capabilities as the panel: list, register, assign, return, retire. Adding an asset over chat and adding it in Finance write the same rows through the same service.

## Related

- [docs/finance-system.md](finance-system.md) — recurring expenses → supplier bills
- [docs/hr-system.md](hr-system.md) — employees the assets are assigned to
- [docs/trip-expense-cards.md](trip-expense-cards.md) — the payment-card expense flow
