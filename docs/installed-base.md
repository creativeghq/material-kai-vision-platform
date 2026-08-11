# Installed base — customer equipment, warranties and recurring service

_Added 2026-08-11 · issue #343_

The platform used to forget a product the moment its order was delivered. For tiles that is
correct. For an HVAC unit, a boiler, a water heater or a TV it is not: the customer still owns it,
it is still under warranty, and it still needs its filters cleaned every three months.

This is the subsystem that remembers.

---

## What it is not

Two things already in the schema look adjacent and are not this:

- **`company_assets` + `asset_assignments`** — *our own* fixed-asset register. Acquisition cost,
  `useful_life_months`, depreciation method, assignment to an employee. That is accounting.
- **`property_maintenance`** — reactive ticketing against a real-estate listing. Someone reports a
  leak, a contractor fixes it. No recurrence, no warranty, no product.

The installed base is the **customer's** equipment, and its defining feature is that it is
*scheduled* rather than reported.

---

## The model

```
customer_assets                    one physical unit at one customer
├── customer_asset_warranties      0..n cover periods (manufacturer / extended / installer / insurance)
└── customer_asset_service_plans   0..n recurring plans ("Clean the filters, every 3 months")
    └── customer_asset_service_events    the occurrences — exactly ONE open per plan

product_service_defaults           per-product / per-category defaults, copied in at registration
products.is_serviceable            the switch that turns on auto-registration
products.default_warranty_months   copied onto the unit's manufacturer warranty
```

A unit belongs to a `crm_companies` **or** a `crm_contacts` row (at least one), and optionally to a
`projects` row and a `project_rooms` row inside it — which is how "the AC in the second-floor
bedroom of the Kolonaki renovation" is addressable.

### There is no `next_due_on`. Anywhere.

This is the single most important thing to know before changing anything here.

"When is this next due" is **the `due_on` of the plan's one open service event**. A partial unique
index makes that single-valued:

```sql
create unique index uq_case_one_open_per_plan
  on customer_asset_service_events (plan_id) where status = 'due';
```

No column caches it, no view recomputes it, and the client formats the server's answer rather than
deriving its own. This is the money-derivation rule (`CLAUDE.md`) applied to a date, and for the
same reason: **a wrong date is a valid date.** Typecheck cannot see it, an integrity probe cannot
see it, and the only thing that would ever notice is a customer whose AC was serviced on the wrong
month. "How much is settled on an order" was implemented five times before that lesson landed.

The one place the arithmetic lives is `next_service_due(from, interval_months, interval_days)`, and
the only thing that calls it is `open_next_service_event(plan_id, from)`.

Guarded by [tests/unit/installedBaseDerivation.test.ts](../tests/unit/installedBaseDerivation.test.ts),
which fails on any `next_due*` / `nextDue*` identifier in the feature's sources and on any
client-side date arithmetic. It has been watched to fire.

### Completing an occurrence is the only thing that advances a plan

`complete_asset_service(event_id, …)` closes the occurrence and opens the next one in the same
transaction. It anchors the next date on **when the work actually happened**, not on when it was
nominally due — a service done three weeks late moves the whole cycle, which is what maintenance
physically means. `p_skip => true` records a skip and still advances.

There is deliberately no client path that writes `customer_asset_service_events` directly; doing so
would close an occurrence without opening its successor and the schedule would silently end.

### History outlives the schedule that produced it

`plan_id` on an occurrence is `ON DELETE SET NULL`, **not** cascade, and the event carries its own
`plan_title`. It shipped as cascade for a few hours, which meant the bin icon next to a schedule in
the Equipment UI deleted every service ever performed under it — who came, when, what it cost —
and the only visible symptom was a row count getting smaller.

Deleting a plan now runs `tg_close_open_event_before_plan_delete`, which removes **only** the open
occurrence (work nobody will now do) and leaves the completed and skipped ones orphaned but
readable. A `case_open_needs_plan` CHECK stops the inverse mistake: an occurrence can only be
`due` while its plan exists, so a detached row can never sit on the worklist with nothing able to
complete it. Renaming a plan updates its open occurrence and leaves history under the title the
work was actually done as.

`customer_asset_service_history` is the customer-level ledger — every completed or skipped service
across their whole installed base, with `plan_removed` flagging entries whose schedule is gone. The
per-unit view of the same data is in the asset dialog.

---

## How a unit gets registered

**Automatically.** An `AFTER UPDATE OF quantity_delivered` trigger on `order_items`
(`tg_register_asset_on_delivery`) fires on the 0 → delivered transition when the order is a
`sales` order and the product is `is_serviceable`. Customer, project, purchase date and supplier
are inherited from the order. A partial unique index on `source_order_item_id` makes it idempotent,
so a later quantity correction does not register a second unit.

**Manually.** "Add equipment" on the CRM contact/company or project, via
`register_customer_asset(...)`, for units we did not sell or that predate the register.

Both paths call `apply_asset_service_defaults(asset_id)`, so "an AC always gets its cleaning
schedule" has exactly one implementation. Product-specific defaults win; category defaults fill in
whatever title the product-specific ones did not claim.

`product_service_defaults` is deliberately **not** an `entity_templates` type. That system is for a
reusable starting point a user *picks* from the Templates hub; these are product master data
applied automatically and never chosen.

---

## Reminders

`asset-service-reminders-cron` runs daily (`30 6 * * *`, `x-cron-secret`) and **emits flow events**.
It never writes a `user_notifications` row and never calls `email-api`.

| Event | Fires when |
|---|---|
| `asset.service_due` | `current_date >= due_on - lead_days` |
| `asset.service_overdue` | `due_on` has passed and the occurrence is still open |
| `asset.warranty_expiring` | each configured offset in `remind_days_before` before `ends_on` |

Each has a seeded, locked `system-default` flow and a `flow_area_registry` row, so an admin can
pause, retarget or add a channel from the Flows admin without a deploy.

**Recipients** resolve in order: the plan's `assignee_user_id` → the customer's
`responsible_sales_user_ids` → the workspace owners/admins. The last step is unconditional, because
an empty recipient list is a reminder that fires into nothing.

**The customer** is a separate audience. Every event carries `customer_email` and the plan's
`notify_customer` flag; a flow that should also mail the customer adds a Filter node on
`notify_customer` and a Send Email to `{{trigger.data.customer_email}}`. Keeping that in the flow
rather than in the cron is what makes "who hears about this" an admin decision.

**Each seeded flow has two gated branches**, because either recipient can legitimately be
absent:

```
trigger ─┬─ internal_gate (user_id is_not_empty)      ─→ create_notification
         └─ customer_gate (notify_customer == true
                           AND customer_email is_not_empty) ─→ send_email
```

Both gates are needed. A customer-only plan (`notify_internal = false`) emits `user_id: null`,
which `create_notification` rejected with `invalid input syntax for type uuid: "null"` — and
because a failed node **aborts the run**, opting out of the internal notification silently
disabled the customer email downstream of it. Every gate edge carries
`sourceHandle: 'output'`; without it the branch routes nowhere and the run still reports
`completed` (see §8a of the flows doc).

The warranty flow has the internal gate only — `asset.warranty_expiring` carries no
`customer_email`, since an expiring warranty is a prompt to call the customer about renewing,
not a notice to send them.

**De-duplication** is stamped on the row — `reminded_at` / `overdue_reminded_at` on the occurrence,
and a jsonb `offset -> timestamp` map on the warranty. A stamp is written **only after the emit
succeeded**; a transient failure leaves the row unstamped so the next tick retries instead of
losing the reminder for good. When several warranty windows have opened at once, all of them are
stamped but only the earliest applicable one is sent, so a late-entered warranty produces one
reminder rather than a burst.

### The silent-zero probe

Per `CLAUDE.md`, a new cron gets a probe on the mess it is supposed to clear.
`ops.asset_reminders_silent_zero` flags occurrences more than `lead_days + 2` past their reminder
window with `reminded_at` still null — the cron ran, exited 0, and told nobody. The two-day grace
absorbs one missed daily tick.

---

## Security

- Every RPC is `SECURITY DEFINER` with `SET search_path = ''`, `REVOKE EXECUTE FROM anon,
  authenticated, PUBLIC`, then a targeted grant. Only `register_customer_asset` and
  `complete_asset_service` are `authenticated`-executable, and both open with
  `assert_workspace_member`. The trigger-body function has no grant at all.
- `register_customer_asset` verifies that **every** id the caller supplied — company, contact,
  project, room, product, order, order line, supplier — lives in the asserted workspace. A
  mismatch raises `P0002`, which `customer-assets-api` maps to **404, never 403**, so the endpoint
  is not an id-enumeration oracle.
- All five tables have RLS with a `is_workspace_member(workspace_id)` policy;
  `customer_asset_service_due` is `security_invoker = on`.
- `customer-assets-api` runs reads and writes on the caller's RLS-bound client and builds
  allowlisted payloads (`ASSET_WRITABLE`, `WARRANTY_WRITABLE`, `PLAN_WRITABLE`,
  `DEFAULT_WRITABLE`) rather than spreading the request body.

---

## Surfaces

| Where | What |
|---|---|
| CRM contact → **Equipment** | units, warranty state, next service, mark done/skip, and the full service history across all their equipment |
| CRM company → **Equipment** | the same, for a company customer |
| Product → **Service** | `is_serviceable`, `default_warranty_months`, the default plans |

A notification deep-links to `/crm/companies/{id}?tab=equipment` (or `/crm/contacts/{id}?…`); both
detail pages read `?tab=` so the link lands on the right tab rather than on Activity.

### Warranty certificates

Attached from the Equipment tab, one per warranty. The file goes to the **private**
`pdf-documents` bucket under `warranties/{workspace_id}/{asset_id}/{warranty_id}-{filename}` —
feature identity in the top-level folder, not the bucket name.

Uploads go **through `customer-assets-api`**, not the browser's storage client: the bucket is
service-role-write, so ownership is proven server-side on the RLS-bound client before the
service-role write, rather than by widening client storage policies to a
caller-supplied folder segment. PDF or image, 5 MB.

The row stores `document_bucket` + `document_path` and **never a URL** (pipeline convention 7) —
reads mint a 5-minute signed URL on demand, so a link can never rot.

`customer_asset_warranties` is registered in `build_storage_reference_set()`. That is not
optional: `storage-orphan-cleanup-cron` reaps every object not in that set, so an upload feature
shipped without it would work perfectly and then lose every certificate overnight. It was
appended programmatically rather than by retyping an 11k-character function, because a
hand-copied rewrite is how you silently drop somebody else's branch and start reaping their files.

### Deleting a unit is refused once it has been serviced

`tg_block_asset_delete_with_history` raises when a `customer_assets` row has any non-open service
event. `status = 'removed' | 'replaced' | 'decommissioned'` already says "this unit is gone" while
keeping the record, and the Equipment dialog offers exactly that; the API surfaces the refusal as
**409** with a message naming the alternative.

A genuine purge (GDPR erasure, seeded test data) sets `app.allow_asset_purge` for the transaction.
Nothing in the application does — it exists so the guard never becomes the reason a legal request
cannot be honoured.
