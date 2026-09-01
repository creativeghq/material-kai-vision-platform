# AI Assessment

> *"Is this on track, and what do I do first?"*

Three paid modules over **one system**: a verdict, a written narrative, and a ranked list of
actions — for a **project**, for the **books**, or for one **property listing**.

| Subject | `subject_id` is | Module | Surface | Edge function |
|---|---|---|---|---|
| `project` | `projects.id` | `project-assessment` | `/projects/:id?tab=assessment` | `project-assessment` |
| `finance` | `workspaces.id` — the books ARE the workspace | `finance-assessment` | `/finance?tab=assessment` | `finance-assessment` |
| `real_estate` | `properties.id` | `real-estate-assessment` | `/properties/:id?tab=assessment` | `real-estate-assessment` |

**Agent toolkits:** one per module, sharing two tools —
`assess_project` · `assess_finance` · `assess_property` (paid) ·
`get_*_assessment` · `list_assessment_actions` · `apply_assessment_action` (free)
**Guarded by:** [tests/unit/aiAssessment.test.ts](../tests/unit/aiAssessment.test.ts)

---

## The one design decision

**SQL derives every fact. The model writes about them.**

A model asked "how are the books?" over raw tables will count invoices, and it will occasionally
count them wrong — producing a number that is a *valid* number. Nothing typechecks it, no
integrity probe sees it, and it reads exactly like a right one.

| | Who | What |
|---|---|---|
| **Signals** | `project_assessment_signals` · `finance_assessment_signals` · `real_estate_assessment_signals` | 38 / 21 / 18 checks across six dimensions. Free. |
| **Scores + verdict** | `score_assessment()` | Dimension scores, overall score, verdict. Free, pure, `IMMUTABLE`. |
| **Headline, narrative, actions** | One Claude turn | Judgement and prose. Costs credits. |

The model receives the verdict as an **input** and explains it. It never decides one.

Every figure comes from the derivation that already owns its quantity, and none is re-summed:
`get_project_pnl`, `get_quote_billing_progress`, `vw_ar_aging`, `vw_ap_aging`, `get_monthly_pnl`,
`get_order_settlements`, `vw_uninvoiced_sales_orders`, `report_cashflow_per_day`,
`get_property_performance`.

`get_assessment_snapshot(subject_type, subject_id, today)` is the composed answer, and it is what
every surface reads — the panel, the preview, the agent tool and the paid run. A screen and a
report therefore cannot disagree.

---

## One system, not three

The Projects version shipped first and was generic in everything that mattered. Copying it per
module would have produced three `*_assessments` tables, three claim implementations and three
ways to validate an action — the shape CLAUDE.md's template rule exists to prevent. So the
**subject became a column**:

```
assessments(subject_type, subject_id, …)      one table, one claim, one lifecycle
assessment_actions(subject_type, subject_id, …)
```

Adding a fourth assessable thing is: a signal function, a branch in `assessment_signals()`, a
value in two CHECK constraints, and an entry in each map in
[assessmentVocabulary.ts](../src/services/assessment/assessmentVocabulary.ts).

There is deliberately **no foreign key on `subject_id`** — it points at three different tables.
Every write goes through an RPC that resolves the subject, and `_assessment_subject_visible()`
resolves it per type for RLS.

### What is shared, and where

| Layer | File |
|---|---|
| Vocabulary (subjects, dimensions, verdicts, destinations) | [src/services/assessment/assessmentVocabulary.ts](../src/services/assessment/assessmentVocabulary.ts) — import-free, mirrored to Deno |
| Destination → URL | [src/services/assessment/assessmentDestinations.ts](../src/services/assessment/assessmentDestinations.ts) |
| The run (reserve → start → model → claim → settle) | [supabase/functions/_shared/assessment.ts](../supabase/functions/_shared/assessment.ts) |
| The HTTP door (JWT, tenancy, entitlement, preview/run) | [supabase/functions/_shared/assessment-http.ts](../supabase/functions/_shared/assessment-http.ts) |
| Agent toolkit (all 8 tools) | [supabase/functions/_shared/tools/assessment-tools.ts](../supabase/functions/_shared/tools/assessment-tools.ts) |
| Client service | [src/services/assessment/assessmentService.ts](../src/services/assessment/assessmentService.ts) |
| The panel, mounted three times | [src/components/features/assessment/AssessmentPanel.tsx](../src/components/features/assessment/AssessmentPanel.tsx) |

Each edge function is ~20 lines: it resolves its subject and hands off.

---

## The six dimensions, in three languages

The six are structural slots — one CHECK, one scorer, one weight table. What differs is what they
**mean**, so the labels are per subject. A tile called "Delivery" on a set of books is unactionable;
"Filing & reconciliation" is not.

| Slot | Project | Finance | Real Estate |
|---|---|---|---|
| `setup` | Setup & alignment | Configuration | Listing completeness |
| `commercial` | Commercial | Pipeline | Pricing & offers |
| `financial` | Financial | Profitability & cash | Returns |
| `schedule` | Schedule | Obligations | Dates & expiries |
| `delivery` | Delivery | Filing & reconciliation | Condition |
| `client` | Client | Debtors | Interest & follow-up |

Weights (`financial` and `schedule` count double `setup` and `client`) live in
`score_assessment()` **and nowhere else**.

### What each subject actually checks

**Project** — client/budget/deadline/rooms set and the status coherent · quotes accepted, stale
or expiring, contract signed, billing progress, uninvoiced deposit · budget consumed, forecast
margin, WIP, overdue invoices, pending expenses, uncostable labour, mixed currencies · deadline,
overdue/blocked/undated/unassigned tasks, milestones, dependency date conflicts, progress vs
elapsed, stalled · open and severe snags, purchase items unordered against lead time, unpriced
products, site-log cadence, documents · client requests and approvals with their age,
collaborator access, whether a published client view was ever opened, room coverage.

**Finance** — business VAT, bank account, payment terms, categories · accepted quotes never
invoiced, uninvoiced deposits, sales orders with no invoice, invoices stuck in draft · gross
margin, overdue receivables and the 90+ bucket, overdue payables, 30-day cash in vs out,
over-settled orders · bills due this week, recurring expenses past their run date · **fiscal
transmissions that FAILED**, unmatched bank lines, receipts that could not be read · the worst
debtor by name and how widely the debt is spread.

**Real Estate** — photos, cover photo, description length, price, energy class, area and town ·
time on market with no price change, offers awaiting a decision, listing-agreement expiry ·
gross yield, rent arrears, unprotected deposits · tenancy end date · open and urgent maintenance ·
unanswered enquiries with their age, completed viewings with no feedback, and traffic-without-
enquiries stated separately from no-traffic-at-all, because the two need opposite responses.

---

## A signal is a value or a stated reason there is none

Every signal is emitted on every run. Four statuses:

- **`ok`** — measured, and fine.
- **`attention`** — measured, and a problem. The only status that costs score.
- **`no_data`** — never recorded. Carries a `reason` (`no_investment_record`,
  `no_transmissions_attempted`, …).
- **`not_applicable`** — cannot apply here (`no_active_tenancy`, `not_on_the_market`,
  `module_not_entitled`). A workspace without Contracts is never told to sign one; a sale listing
  is never asked about rent arrears.

`no_data` and `not_applicable` are **excluded from the denominator**, not scored as passes. A
dimension where nothing could be judged scores `null` and renders *"Not judged"* — never `0`,
because `0` is a score. Fewer than three judgeable dimensions makes the verdict
`not_enough_data`.

**Verdicts:** `on_track` · `at_risk` · `off_track` · `stalled` · `not_enough_data`

---

## Actions

The model proposes; the derivation supplies the facts. `record_assessment` validates every one:

- Its `signal_code` must name a signal **in this report**. Unknown codes are dropped.
- That signal's status must be `attention` or `no_data`. You cannot recommend fixing something
  that is fine, or something that cannot apply here.
- `dimension`, `impact` and `destination` are read **off the signal**, never off the model.

`destination` is a tab key on the subject's own page, resolved by `assessmentDestinationHref`.
The guard test holds each subject's key set against that subject's page — which is where the
Finance keys matter: the Orders pane is `doc_orders`, not `orders`.

**Only a project action can become a task.** `project_tasks` is the only task table this platform
has, and inventing a finance or property target would be worse than not offering one — so
`apply_assessment_action` **refuses the other two with a stated reason** and the panel shows
Done / Dismiss instead of Add-as-task. (A workspace-level task table would close this; it does
not exist today.)

For projects: applying an action claims it (`where state='open'` + row-count) **before** writing
the task, so a double-tap or a retry returns the task that exists. Completing that task marks the
action done; reopening it reopens the action.

---

## Money

`reserve(20) → start → model → claim → settle`, and the order is the point (invariant 10):

1. `reserveCredits` — a wallet that cannot cover the ceiling is refused *before* any upstream spend.
2. `start_assessment` — derives and **stores the signals immediately**, `run_status='running'`.
   A second request within five minutes gets that run back and its reservation refunded.
3. One `callClaudeMessages` turn with forced `tool_choice` (invariant 9).
4. `record_assessment` — claims on `run_status='running'`, writes the model half.
5. `settleCredits` against real tokens via `creditsForTokens`. **An unpriced model keeps the
   ceiling** and reports `unpriced_model: true` — unpriced is a gap in the price table, not free.

On failure: the ceiling is refunded and the run is marked `failed` **with the reason**. The
derived half stays readable, and the panel shows failed runs in the history.

Typical run: ~9 credits on `claude-opus-5`. Preview, the readers and acting on an action are free.

Prompts: `prompts` rows `project_assessment` / `finance_assessment` / `real_estate_assessment`.
DB only, no code fallback. Each shares the hard rules and differs only in the closing brief —
what matters in that domain.

---

## RLS

`_assessment_subject_visible(subject_type, subject_id, workspace_id)` is the one predicate, used
by all eight policies (one per command, per table):

- **project** — owner-only, matching every other project child table, and deliberately **no**
  collaborator overlay: the collaborator is the client.
- **finance** — `is_workspace_finance_manager`. Narrower than membership on purpose: this report
  states margin, debtors and fiscal failures.
- **real_estate** — any member of the property's workspace.

---

## Integrity probes

Domain `projects` in `data_integrity_checks`:

| Key | Fires when |
|---|---|
| `projects.assessment_action_broken` | An action says it is on the task list and the task is gone, or names a signal its own report never raised. **Auto-heals** back to `open`. |
| `projects.assessment_run_stuck` | A run has sat in `running` for over 30 minutes. |
| `projects.assessment_actions_silent_zero` | Three or more runs in 30 days **of the same subject type** raised findings and produced no action at all — what a drifted signal code looks like while every run still completes and still charges. Judged per subject so a healthy project derivation cannot average away a broken finance one. |
