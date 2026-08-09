# Account disable — the platform never deletes (#333)

A dealer or architect winding down **disables** their account. There is no delete path anywhere:
not for accounts, not for fiscal documents.

## What disabling does

| | |
|---|---|
| **The workspace** | `status='disabled'`, stamped with when, by whom and why |
| **Its customers** | move to the operator's root workspace **immediately**, stamped with where they came from |
| **Its fiscal documents** | **stay exactly where they are.** Not moved, not deleted |
| **Its orders / quotes / projects** | stay too — that is the dealer's trading history, not the operator's |
| **Its people** | keep reading everything. Only writing stops |

The last row is the point of the whole feature. A disabled dealer's sub-users still need their
invoices, so "disabled" cannot mean "locked out".

## Why the counterparty snapshot had to come first

Customers move; documents don't. So the moment a customer is re-homed, a retained invoice points
at a `crm_companies` row in **another workspace** — and under RLS the disabled tenant can no longer
read it. Without a snapshot, every retained invoice would render with no customer at all: the exact
opposite of "the sub-users need these".

`invoices.counterparty_snapshot` (see [finance-system.md §6a](finance-system.md)) freezes the party
onto the document at issue, so a retained invoice keeps naming its customer forever, regardless of
where that customer's CRM row now lives. Verified by probe: after disabling, the invoice still reads
`Probe Customer A` while that company sits in the operator's workspace.

## Provenance

`crm_companies.rehomed_from_workspace_id` / `rehomed_at` (and the same on `crm_contacts`) record
which dealer a customer came from. Stamped in the same statement that moves the row, so a customer
cannot arrive at the operator without it.

It is recorded because it **cannot be reconstructed afterwards** — once the row sits in the
operator's workspace there is nothing left to say who brought them in. It answers commission
questions, tells an inherited customer from one the operator won themselves, and makes handing one
back on re-enable possible at all.

Re-homing twice keeps the **original** dealer (`coalesce(rehomed_from_workspace_id, …)`) — that is
the one worth knowing.

## Re-enabling does not undo it

`enable_workspace()` flips the status back and **deliberately leaves the customers with the
operator**. In between, the operator may have quoted, invoiced or traded with them; silently
yanking those rows back out would remove customers the operator now considers theirs and orphan any
document pointing at them. Handing one back is a deliberate act, and `rehomed_from_workspace_id`
is what makes it reviewable.

Re-enable is operator-only. Disabling is the owner's own decision (or the operator's).

## The write perimeter is scoped on purpose

263 tables carry a `workspace_id`. A trigger on each would mean 263 status lookups on every write
in the platform, to stop a wound-down dealer editing a moodboard.

`_reject_write_to_disabled_workspace()` is attached to the tables where a write actually matters:

```
invoices · credit_notes · delivery_notes · fiscal_submissions
orders · quotes · payments
finance_recurring_expenses · trip_expense_reports
workspace_webhooks
```

Legal documents, commercial records, money, and the outbound integration surface. **Everything else
stays writable, and everything stays readable.** That is a deliberate boundary, not an oversight —
if a disabled tenant edits a moodboard, nothing is harmed.

`is_workspace_writable(uuid)` is the single predicate; `assert_workspace_writable(uuid)` is the
raise-if-not form for RPCs that need it.

> The first version of the trigger list named a table called `expenses`, which does not exist, and
> the `to_regclass` guard skipped it **silently**. The list now raises if it names a missing table —
> a write-block with a hole in it is worse than no write-block, because it reads as complete.

## Guards that must not be weakened

- **The operator workspace cannot be disabled.** Every tenant transmits through its Novus key;
  disabling it would take the whole platform's e-invoicing down. `disable_workspace` refuses.
- **Disabling requires the workspace's own `owner` or the platform operator** — not any member.
- **`workspaces.status` CHECK includes `disabled`.** It is a distinct state from `inactive` /
  `archived`, which is why it was added rather than overloaded: `is_workspace_writable` keys on
  exactly this value, and "is this account wound down?" has to have one answer.

## Verified

Proven end to end against the live database, then cleaned up: two customers re-homed with
provenance, none left behind, the MARKed invoice still in the disabled workspace and still naming
its original customer, new invoice blocked, new quote blocked, and disabling the operator workspace
refused.

## Source map

| Concern | Where |
|---|---|
| Disable / re-enable | `disable_workspace(uuid, text)`, `enable_workspace(uuid)` |
| Writable predicate | `is_workspace_writable(uuid)`, `assert_workspace_writable(uuid)` |
| Write block | `_reject_write_to_disabled_workspace()` + `*_disabled_workspace_guard` triggers |
| Provenance | `crm_companies` / `crm_contacts` `.rehomed_from_workspace_id`, `.rehomed_at` |
| Client | `src/services/workspaceLifecycleService.ts` |
| UI | `src/components/core/Profile/AccountStatusCard.tsx` (Profile → Profile) |
