# AI Assessment (Projects)

> *"Is this project on track, and what do I do first?"*

A paid module (`project-assessment`) that answers that question for one project — as a verdict, a
written narrative, and a ranked list of actions you can turn into real tasks in one click.

**Route:** `/projects/:id?tab=assessment` (owner-only)
**Module slug:** `project-assessment` (pro add-on, consumes credits)
**Edge function:** [`supabase/functions/project-assessment`](../supabase/functions/project-assessment/index.ts)
**Agent toolkit:** `project-assessment` — `assess_project`, `get_project_assessment`,
`list_assessment_actions`, `apply_assessment_action`
**Guarded by:** [tests/unit/projectAssessment.test.ts](../tests/unit/projectAssessment.test.ts)

---

## The one design decision

**SQL derives every fact. The model writes about them.**

A model asked "is this project on track?" over raw tables will count things, and it will
occasionally count them wrong — producing a number that is a *valid* number. Nothing typechecks
it, no integrity probe can see it, and it reads exactly like a right one. That is the same class
of defect as the order that showed `Payment: Paid` next to an outstanding balance.

So the split is hard:

| | Who | What |
|---|---|---|
| **Signals** | `project_assessment_signals()` | 38 checks across six dimensions. Free. |
| **Scores + verdict** | `score_project_assessment()` | Dimension scores, overall score, verdict. Free, pure, `IMMUTABLE`. |
| **Headline, narrative, actions** | One Claude turn | Judgement and prose. Costs credits. |

The model receives the verdict as an **input** and explains it. It never decides one. Money comes
from `get_project_pnl` — the existing single derivation — and is never re-summed.

`get_project_assessment_snapshot(project_id, today)` is the composed answer, and it is what the
tab, the preview tile, the agent tool and the paid run all read. A screen and a report therefore
cannot disagree about whether a project is on track.

---

## The six dimensions

| Dimension | What it judges |
|---|---|
| `setup` | Is the project described well enough to be run at all — client, budget, deadline, rooms, and whether its status matches the record. |
| `commercial` | Quotes accepted / stale / expiring, contract signed, billing progress, an uninvoiced deposit. |
| `financial` | Budget consumed, forecast margin, WIP, overdue invoices, pending expenses, uncosted labour, mixed currencies. |
| `schedule` | Deadline, overdue / blocked / undated / unassigned tasks, milestones, dependency conflicts, progress vs elapsed, and whether anything is moving at all. |
| `delivery` | Open and severe snags, purchase items not ordered or not costed, unpriced products, site-log cadence, documents on file. |
| `client` | Open requests and approvals with their age, collaborator access, whether a published client view was ever opened, room coverage. |

Dimension weights (`financial` and `schedule` count double `setup` and `client`) live in
`score_project_assessment()` **and nowhere else**. A copy in TypeScript would be a second
derivation of one number.

---

## A signal is a value or a stated reason there is none

Every signal is emitted on every run, whatever the project looks like. There are four statuses:

- **`ok`** — measured, and fine.
- **`attention`** — measured, and a problem. The only status that costs score.
- **`no_data`** — the thing has never been recorded. Carries a `reason` (`budget_amount_not_set`,
  `no_tasks_recorded`, …).
- **`not_applicable`** — it cannot apply here. Carries a reason, most often
  `module_not_entitled`: a workspace without Contracts is never told to sign one.

`no_data` and `not_applicable` are **excluded from the denominator**, not scored as passes. A
dimension where nothing could be judged scores `null` and renders the words *"Not judged"* — never
`0`, because `0` is a score. Fewer than three judgeable dimensions makes the whole verdict
`not_enough_data`, which is the honest answer where "on track" would be a pass earned by having
recorded nothing.

This is the `WebsiteDomainIntelPanel` lesson applied up front: a panel that renders four tiles when
it has four numbers makes a collector that has never once succeeded pixel-identical to a clean
subject.

## Verdicts

`on_track` · `at_risk` · `off_track` · `stalled` · `not_enough_data`

`stalled` is its own verdict rather than a signal because a stalled project can fail no other check
at all — nothing has simply happened on it for over a month.

---

## Actions

The model proposes actions; the derivation supplies their facts. `record_project_assessment`
validates every one:

- Its `signal_code` must name a signal **in this report**. An unknown code is dropped.
- That signal's status must be `attention` or `no_data`. You cannot recommend fixing something
  that is fine, or something that cannot apply here.
- `dimension`, `impact` and `destination` are read **off the signal**, never off the model's claim
  about them. The model supplies the title, the rationale, the ordering and an optional due date.

`destination` is a project tab key, resolved to `/projects/:id?tab=<key>` by whatever renders it —
so an action that says "check the purchase items" is a link, not a sentence.
[tests/unit/projectAssessment.test.ts](../tests/unit/projectAssessment.test.ts) fails the build if
one names a tab the page does not render.

**Applying an action creates a real `project_tasks` row**, and completing that task marks the
action `done` (a trigger on `project_tasks` closes the loop both ways — reopening the task reopens
the action). `apply_assessment_action` **claims the action before it writes the task**
(`where state = 'open'` plus a row-count check), so a double-tapped button or a retry after a
dropped connection returns the task that already exists instead of cutting a second one — CLAUDE.md
anti-regression rule 4.

---

## Money

Order is `reserve → start → model → claim → settle`, and the order is the point (invariant 10):

1. `reserveCredits(..., 20)` — the ceiling. A wallet that cannot cover it is refused *before* any
   upstream spend.
2. `start_project_assessment` — derives and **stores the signals immediately**, `run_status='running'`.
   A second request inside five minutes gets that same run back and its reservation refunded, so a
   double-click cannot buy the same answer twice.
3. One `callClaudeMessages` turn with a forced `tool_choice` (invariant 9 — no free-form JSON, no
   salvage parser). No tool call is a real failure, not prose to fall back on.
4. `record_project_assessment` — claims on `run_status='running'` and writes the model half.
5. `settleCredits` against the real token cost, through `creditsForTokens` (the one token-price
   derivation). **A model with no `ai_model_pricing` row keeps the ceiling** and the response says
   `unpriced_model: true` — an unpriced call is a gap in the price table, not a free one.

On failure the whole ceiling is refunded and the run is marked `failed` **with the reason**. The
derived half stays readable; the tab shows failed runs in the history rather than leaving a gap
nobody can explain.

Typical run: ~5k input / ~1.5k output tokens on `claude-opus-5` — about **9 credits**. The
preview, the reader tools and applying an action cost **nothing**.

---

## Tables

### `project_assessments`
One run. `facts` / `signals` / `scores` / `verdict` are the derivation **frozen at run time** —
never re-read from the live tables, for the same reason `resolvePrintedCounterparty` exists: a
report written in March must not start describing April. `headline` / `narrative` are the model
half. `run_status ∈ running | complete | failed`, with `error_message` on the last.

### `project_assessment_actions`
The ranked plan. `state ∈ open | task_created | done | dismissed`, `task_id` pointing at the
`project_tasks` row it created.

**RLS is owner-only on both, and deliberately has no collaborator-read overlay.** An assessment
names margin, uncosted labour and overdue invoices; the collaborator on a project is the *client*.

---

## Where the moving parts are

| Piece | File |
|---|---|
| Vocabulary (dimensions, verdicts, statuses, destinations) | [src/modules/projects/assessmentVocabulary.ts](../src/modules/projects/assessmentVocabulary.ts) — mirrored to Deno by `npm run vocab:mirror` |
| The run, shared by the edge function and the agent tool | [supabase/functions/_shared/project-assessment.ts](../supabase/functions/_shared/project-assessment.ts) |
| HTTP door (auth, tenancy, entitlement) | [supabase/functions/project-assessment/index.ts](../supabase/functions/project-assessment/index.ts) |
| Agent toolkit | [supabase/functions/_shared/tools/project-assessment-tools.ts](../supabase/functions/_shared/tools/project-assessment-tools.ts) |
| Client service | [src/modules/projects/services/projectAssessmentService.ts](../src/modules/projects/services/projectAssessmentService.ts) |
| The tab | [src/modules/projects/components/tabs/AssessmentTab.tsx](../src/modules/projects/components/tabs/AssessmentTab.tsx) |
| Prompt | `prompts` where `prompt_type='tool' AND category='project_assessment'` — DB only, no code fallback |

### SQL

| Function | Purpose |
|---|---|
| `project_assessment_signals(project_id, today)` | The 38 signals + the facts behind them. |
| `score_project_assessment(signals)` | Pure scorer. The only home of the weights. |
| `get_project_assessment_snapshot(project_id, today)` | The composed answer every surface reads. |
| `start_project_assessment(project_id, today, requested_by)` | Opens a run, stores the derived half, returns an in-flight run rather than starting a second. |
| `record_project_assessment(assessment_id, …)` | Claims the run and writes the model half + validated actions. `service_role` only. |
| `fail_project_assessment(assessment_id, error)` | Names the failure on the row. |
| `apply_assessment_action(action_id, due_date, room_id)` | Claim-then-create the task. Idempotent. |
| `resolve_assessment_action(action_id, state)` | Done / dismissed / reopened. |

### `today` is the operator's calendar day

`current_date` in Postgres is the **UTC** day, and between local midnight and 03:00 in Greece that
is yesterday — on a derivation whose entire job is deciding what is overdue (CLAUDE.md rule 1b).
The browser sends `todayLocalISO()`; the RPC bounds it to ±2 days of the server date so a
body-supplied value cannot move a verdict.

---

## Integrity probes

Registered in `data_integrity_checks` under domain `projects`:

| Key | Fires when |
|---|---|
| `projects.assessment_action_broken` | An action says it is on the task list and the task is gone, or it names a signal its own report never raised. **Auto-heals** by re-arming the action to `open` — the recommendation is still valid, it is the task that vanished. |
| `projects.assessment_run_stuck` | A run has sat in `running` for over 30 minutes. The credit was reserved and the report will never appear. |
| `projects.assessment_actions_silent_zero` | Three or more runs in 30 days raised findings and produced **no action at all**. Every action is validated against its report's own signals, so a drifted signal code silently empties the plan while each run still completes and still charges. Judged across the board, never on one run — an assessment that genuinely finds nothing to do is a real result. |
