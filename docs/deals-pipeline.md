# Deals & pipeline

The one pipeline object across the platform. Real Estate was its first consumer, not its owner.

Issue: [#311](https://github.com/creativeghq/material-kai-vision-platform/issues/311). Master gap analysis: #279.

## The shape

| Table | What it holds |
|---|---|
| `crm_deals` | the deal. `deal_type_id` (NOT NULL), `stage`, `status` (open/won/lost), `value`, `currency`, `probability`, `expected_close_date`, `lost_reason`, `notes`, `contact_id`, `company_id`, `property_id`, `project_id`, `owner_user_id` |
| `crm_deal_types` | the typology. `workspace_id IS NULL` = platform default, non-null = the tenant's own |
| `crm_deal_stages` | the stage set **for one type**, each row carrying `is_won` / `is_lost` |
| `crm_deal_tasks` | the per-deal checklist |
| `crm_deal_members` | the deal team — a label, granting nothing |

Platform-default types: **Real Estate** (property), **Project** (project), **Construction**, **General**.

## Three rules that are not style choices

**1. Stages are DATA, per type — never a constant in a component.**

The property stage set ends `conveyancing → exchanged → completed`. Those are property-transfer
terms; a construction deal must never land in one. This is enforced by the database, not by
convention:

```sql
crm_deals_stage_fkey FOREIGN KEY (deal_type_id, stage)
  REFERENCES crm_deal_stages (deal_type_id, key)
```

So a deal can only ever sit in a stage its own type defines. Which stage *wins* is
`crm_deal_stages.is_won`, never `stage === 'completed'`.

**2. `deal_type` and `subject_kind` are different things.**

- `crm_deal_types.label` / `.key` — open. A tenant adds "Kitchen Fit-out" and it segments the board.
- `crm_deal_types.subject_kind` — closed (`property` | `project` | `none`). Code branches on it to
  render a panel and populate an FK. A tenant adding a type has not created a new table, so a
  tenant-made type defaults to `none` and can only opt into a subject the code can already resolve.

**3. One visibility rule.**

RLS on `crm_deals` carries the Real Estate agent-scoping (`open_for_all` / listing agent / creator /
broker), so the CRM board cannot show a listing Real Estate would hide. That is why `real-estate-api`
has **no deal endpoints** — they were deleted rather than left as a second copy of the rule. Tasks
and team inherit the deal's visibility through an RLS subquery rather than restating it.

Write policies are **one per command**. A permissive `FOR ALL` also grants SELECT and ORs away the
inheritance — that shipped once on `crm_deal_tasks` and made every member able to read the checklist
of a deal they could not see.

## Money

`get_deal_forecast(workspace_id, deal_type_id?)` is the single derivation of weighted pipeline. It
returns the answer **already derived** and TypeScript only formats it — the same contract as
`get_order_settlements`. Never recompute `value × probability` client-side.

Two details worth knowing: a deal with no `probability` falls back to its stage's position in its own
type's ladder, so a pipeline nobody scores still forecasts honestly; and results are grouped **by
currency**, because summing EUR into GBP would be a made-up number.

## Surfaces

| Where | What |
|---|---|
| `/crm?tab=pipeline` | the board, with a deal-type switcher and (for admins) type/stage management |
| `/crm/deals/:id` | the record: stage control, activity timeline, deal team, details |
| `/properties` → Pipeline | the same board, pinned to the `real_estate` type |
| contact & company records | "Deals" — the reverse side of `contact_id` / `company_id` |
| agent | `manage_deal` — list / forecast / create / move / lose, for every deal type |

`Pipeline` is the FIRST tab in `/crm` but **not** the landing tab: bare `/crm` is the main nav
target, and defaulting to a module-gated tab would put an upsell behind the front door of a free
module.

## Packaging

One `deals` add-on, `MODULE_DEPENDENCIES.deals = ['crm']` — **not** `['crm','real-estate']`, which
would lock out every non-RE tenant. It is offered from both the CRM and Real Estate surfaces, and
because both write the same `workspace_module_entitlements.module_slug` there is a single
entitlement: enabling from either lights up both. Every workspace holding `real-estate` when this
shipped was granted `deals`, so nobody lost the board they already had.

## Notifications

`deal_stage_changed`, `deal_won` and `deal_lost` are **flow events**, never hardcoded notification
inserts. Each has a seeded active, locked `system-default` flow and a `flow_area_registry` row, so an
admin can retarget or pause them without a deploy. They are emitted as **string literals** in
`dealsService` on purpose — `tests/unit/flowEventContract.test.ts` can only check literals, and an
event name that drifted out of the `TriggerType` union would emit into nothing silently.

## Guards

- [tests/unit/dealPipelineDerivation.test.ts](../tests/unit/dealPipelineDerivation.test.ts) — stages stay data, the object stays single, `subject_kind` stays closed, every writable column has an input, every service method has a caller, and the lifecycle filter reaches the server.
- `db.deals.selects-resolve` in [scripts/smoke/smoke.mjs](../scripts/smoke/smoke.mjs) — the PostgREST select strings still parse and resolve against production. They are runtime strings; a renamed constraint is a 400 that reads exactly like an empty board.
- The composite FK and the `crm_deals_party_check` CHECK reject bad writes rather than reporting them.

## Not built

Association labels on the party link, deal splits, and a per-stage duration/velocity report. Field
history is not kept: `crm_activities` records what people did, not a diff of every column.
