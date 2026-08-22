# Blueprint Estimating & Project Plans (#242)

Parametric estimating: pick a **blueprint** (a reusable, formula-driven template), give it **dimensions** (floor area, wall area, number of points…), and it computes a priced **plan** — a tree of sections and lines — that can be versioned and turned into a real quote.

The same engine powers a public, anonymous lead-gen estimator at `/tools/project-plan`.

- **Authoritative compute**: [`supabase/functions/project-plan-engine/index.ts`](../supabase/functions/project-plan-engine/index.ts)
- **Public estimator**: [`supabase/functions/public-project-plan/index.ts`](../supabase/functions/public-project-plan/index.ts)
- **The math**: [`supabase/functions/_shared/blueprint/formula.ts`](../supabase/functions/_shared/blueprint/formula.ts)
- **Frontend**: [`PlanTab.tsx`](../src/modules/projects/components/tabs/PlanTab.tsx), [`PlanTreeEditor`](../src/components/features/blueprint/PlanTreeEditor.tsx), [`DimensionsPanel`](../src/components/features/blueprint/DimensionsPanel.tsx), [`BlueprintPickerDialog`](../src/components/features/blueprint/BlueprintPickerDialog.tsx), [`SectionLibraryPicker`](../src/components/features/blueprint/SectionLibraryPicker.tsx)

---

## Blueprint vs Plan

| | Blueprint | Plan |
|---|---|---|
| What | Reusable **template** | One **instance**, priced |
| Lines | `blueprint_items` (formulas, `default_quantity`, **no** money) | `project_plan_items` (resolved `quantity`, `unit_price`, `line_total`) |
| Scope | workspace-owned, or `is_platform_starter` | belongs to a project (or a user, for drafts) |

A blueprint carries a `dimensions_schema` (which dimensions it asks for). A plan carries the answers in `dimensions` **jsonb**. Every plan line's quantity comes from evaluating its `quantity_formula` against those dimensions.

Both item tables are **trees** (`parent_id` + `sort_order`). `blueprint_items.sub_blueprint_id` lets a blueprint compose another blueprint — that's how the Section Library works.

---

## The one rule: the engine owns the money

> **`project-plan-engine` is the ONLY writer of persisted plan-line prices, plan versions, and plan→quote items.**

The frontend *may* edit `project_plan_items` directly (RLS-gated) for **labels and quantities**, then calls the engine to (re)compute authoritative money. Do not write `unit_price`, `line_total`, or `project_plans.subtotal` from anywhere else — they are computed, not input.

This mirrors the pricing rule elsewhere in the platform: an editable surface can propose, but one server-side chokepoint decides the number that counts.

---

## Actions (`project-plan-engine`)

Auth: user JWT (or service role). Every write re-checks `userCanAccessWorkspace` — the service-role client bypasses RLS, so membership is verified manually (invariant 1).

| Action | Body | Returns |
|---|---|---|
| `create-from-blueprint` | `{ project_id?, blueprint_id, dimensions?, title? }` | `{ plan, items }` |
| `rescale` | `{ plan_id, dimensions }` | `{ plan, items }` |
| `reprice` | `{ plan_id }` | `{ plan, items }` |
| `save-version` | `{ plan_id, note? }` | `{ version }` |
| `restore-version` | `{ plan_id, version }` | `{ plan, items }` |
| `create-quote-from-plan` | `{ plan_id }` | `{ quote_id }` |

- **`rescale`** = dimensions changed → re-evaluate every formula → re-price.
- **`reprice`** = dimensions unchanged, underlying costs/rates changed → re-price at current rates.
- **`save-version`** snapshots the whole plan into `project_plan_versions.snapshot`; `restore-version` writes it back. That's the undo story for a plan you've hand-tuned.

---

## Formulas

A line may carry a `quantity_formula` like:

```
= floor_area + wall_area
= n_points * 1.1
= ceil(wall_area / 12)
```

`evaluateFormula` is a **safe evaluator, not `eval`**. Only numbers, the plan's named dimensions, parentheses, `+ - * /`, and a whitelist of functions (`min`, `max`, `ceil`, `floor`, `round`, `abs`, `sqrt`). Anything else — arbitrary JS, an unknown identifier, a missing dimension — **fails closed** to `ok: false`, and the caller falls back to the stored `default_quantity`. A broken formula degrades to a sane number; it never executes and never throws mid-plan.

### The mirror (and why CI guards it)

The math lives in **two byte-identical copies**:

- `supabase/functions/_shared/blueprint/formula.ts` — Deno, the authoritative writer
- `src/utils/blueprintFormula.ts` — Vite, for optimistic preview as the user types

The frontend must show the same number the engine will persist, but Vite can't import Deno edge code. So the duplication is deliberate — and [`tests/unit/blueprintFormula.test.ts`](../tests/unit/blueprintFormula.test.ts) is the **edge⇄frontend parity check** that keeps them honest. It runs in the un-gated `unit-tests` CI job. If you change the math, change both and let that test prove they agree.

---

## Composition — zones, appliances and the survey

A blueprint whose `composition_schema` is non-empty is driven by **zones** rather than by typed
scalars. The derivation lives in
[`_shared/blueprint/composition.ts`](../supabase/functions/_shared/blueprint/composition.ts) and is
mirrored to `src/utils/blueprintComposition.ts` by `npm run blueprint:mirror`. Three zone kinds:

| `kind` | What it holds | What it derives |
|---|---|---|
| `units` | module rows (kind × width × how many) | run length, unit counts, the hardware schedule |
| `surface` | one length × a material rate | its length, from an override, a **seat count**, or the run it sits on |
| `appliances` | appliance rows (what × who supplies it × where it goes) | the appliance list and the **service connections** |

### An appliance is priced by who supplies it

`supply: 'ours' | 'existing'`. That single answer decides the **money and nothing else**:

- **`ours`** — the machine is priced, from a flat `unit_price` or from an `option_group` model list
  (absorbed exactly like a zone global's rate table, so it can never be charged twice).
- **`existing`** — the customer already owns it. Nothing is charged for the machine. The aperture,
  the housing, the fitting and every connection it needs are unchanged.

That asymmetry is the point. "I already have a fridge-freezer, a hob and a washing machine" is the
commonest answer on a kitchen survey, and a €0 line is a valid line — without the connections still
being counted, nothing downstream can distinguish *the customer owns one* from *nobody thought
about it*.

A **placement** (`tall unit` / `highboard` / `under the worktop` / `stand alone`) may declare the
`housing` module it needs. That is **checked** against the configured layout and reported as an
issue when it is missing or short — never satisfied by inserting the cabinet, which would change
the customer's price without them asking.

An appliance's `energy` is cross-checked against the zone's energy **choice global**: a gas hob in a
kitchen that only lists electricity is a survey problem, and the moment to say so is while somebody
is still specifying it.

### Choice globals — the answers that carry no price

`type: 'choice'` globals are spec: open-plan or separate, 45cm or 60cm, which supplies the property
has. They publish `<zone>_<key>_<value>` flags a formula can multiply by, may contribute to the
schedule through `yields`, and absorb nothing. `multi: true` holds several answers at once; an
unanswered multi global resolves to **nothing**, never to its first answer.

### The schedule has two audiences

`socket`, `socket_dedicated`, `water_in`, `waste_out`, `gas_point`, `duct_run` and `carbon_filter`
are service connections; everything else is hardware. `SERVICE_YIELD_KEYS` is the single list that
splits them, because a workshop reads one half of the schedule and an electrician reads the other.
Both halves are subject to the same completeness rule: a quantity derived and consumed by no
schedule line raises an issue rather than sitting at zero unnoticed.

### What a plan says about it

`_shared/blueprint/plan-rows.ts` materializes a derived composition into `project_plan_items` —
one section per enabled zone, its priced lines beneath it, all carrying `source='composition'` and
regenerated wholesale on every reprice. That is what makes quotes, material lists, versions and
change orders work through the single path they already use.

An appliance the customer already owns produces **no priced line and still gets a row**: a
`is_schedule` scope line at €0, `"Fridge-freezer — in a tall unit (supplied by the client)"`. It is
what tells the fitter to leave the aperture and the electrician to leave the socket. Dropping it
because it costs nothing is the same €0 blind spot that once hid these appliances from the enquiry
email, and it produces a quote nobody can fit a kitchen from. The fitting of that same appliance is
a separate, priced row — we hang the door whoever bought the machine.

Guarded by [`tests/unit/blueprintComposition.test.ts`](../tests/unit/blueprintComposition.test.ts).

---

## Public estimator — `/tools/project-plan`

Anonymous lead-gen, same family as the other [public tools](#related):

- **Actions**: `starters {}` → `{ starters }` · `estimate { blueprint_id, dimensions, turnstile_token }` → `{ result }`
- **In-repo, not MIVAA**, deliberately: the compute is **pure** — no paid upstream API — so there's nothing to bill and no reason to cross the boundary.
- **Turnstile-gated** and metered against the same `public_lookup_log` table as the other public tools (combined **2/day per IP**). The function enforces the IP limit itself and logs a success row so the shared quota stays consistent; the frontend re-reads the MIVAA quota afterwards.
- Reads **`is_platform_starter`** blueprints via the service role and computes a **read-only** estimate from default inline rates. No save, no workspace data, no access to a tenant's real pricing.

---

## Tables

| Table | Purpose |
|---|---|
| `blueprints` | `id`, `workspace_id`, `created_by`, `title`, `description`, `project_type`, `source_currency`, `dimensions_schema`, `is_platform_starter`, `version`, `status`, … |
| `blueprint_items` | template lines — `blueprint_id`, `parent_id`, `sub_blueprint_id`, `sort_order`, `kind`, `label`, `unit`, `quantity_formula`, `default_quantity`, `line_kind`, `service_id`, `product_id`, `material_cost`, `labor_rate`, `margin_pct`, `option_group`, `tier`, `is_allowance`, `allowance_amount`, `source` |
| `project_plans` | `id`, `project_id`, `workspace_id`, `user_id`, `blueprint_id`, `quote_id`, `title`, `brief`, `dimensions`, `source_currency`, `status`, `subtotal`, `version`, … |
| `project_plan_items` | priced lines — same shape as `blueprint_items` plus resolved `quantity`, `unit_price`, `line_total`, `is_selected` |
| `project_plan_versions` | `plan_id`, `version`, `snapshot`, `note`, `created_by`, `created_at` |

`option_group` + `tier` + `is_selected` are how a plan offers alternatives (good/better/best) without duplicating the tree. `is_allowance` + `allowance_amount` mark a placeholder budget line rather than a real priced item.

`project_plans.quote_id` is set by `create-quote-from-plan` — that's the link from estimate to real [quote](quotes-system-architecture.md).

---

## Related

- [projects.md](projects.md) — the Plan tab lives on the project detail page
- [quotes-system-architecture.md](quotes-system-architecture.md) — where `create-quote-from-plan` lands
- [public-tools-api.md](api/public-tools-api.md) — the shared Turnstile + `public_lookup_log` quota model
- [pricing-api.md](api/pricing-api.md) — service/product rates the engine prices against
