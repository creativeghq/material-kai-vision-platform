# Prevention coverage — which defect shapes are actually guarded

**What this answers:** for each way this platform has historically broken, is there a mechanism that
would catch it again, and has that mechanism been *watched* to fire?

**Why the second half matters.** Every mechanism below reports "clean" today. So does a mechanism
that has silently stopped working — and this platform has shipped several:

| Guard | Looked like | Actually |
|---|---|---|
| semgrep ruleset | green CI for months | invalid YAML → **0 rules loaded**; `\|\| true` hid the non-zero exit |
| `dangerouslySetInnerHTML` rule | a valid, parsing rule | `{=~/.*/}` matched **nothing**, ever |
| `no-fail-open-in-gate` | a valid, parsing rule | scoped to `**/*auth*`, `**/*credit*` — camelCase filenames match none of those globs |
| `no-fail-open-in-gate` (v2) | filter removed, looked right | `catch (...)` is a **parse error** in JS *and* TS → semgrep rejected the rule and kept scanning |
| jsx-a11y plugin | installed and configured | every rule set to `'off'` under a comment reading "off for now" |
| edge typecheck sweeps | reported success | one exited 0 on an unresolved import, one OOM'd mid-batch, one used the wrong import maps |

The pattern is identical every time: **a guard that reports nothing is indistinguishable from a
clean codebase.** So "green" is not the question. "When did we last watch it fail on purpose?" is.

> **The rule this table exists to enforce:** a guard you have never watched fail is not a guard.
> Before trusting a new check, feed it the defect it was written for and confirm it fires. Two of
> the rules in the table above were caught that way in a single afternoon; neither was visible in
> a passing run.

---

## The seven defect shapes

Derived from the #293/#294 audit and the incident history in CLAUDE.md.

### 1. Side mismatch — money applied to the wrong side of a trade
A sales order settles on money **IN**, a purchase order on money **OUT**. One of five implementations
netted the two directions, so a fully-paid sales order displayed `Paid` beside an outstanding balance
that was really the supplier's.

- **Guarded by:** `get_order_settlements(uuid[])` as the single derivation + [tests/unit/moneyDerivation.test.ts](../tests/unit/moneyDerivation.test.ts)
- **Proven to fire:** 2026-08-01 — the test was verified against all five historical offenders, and its widened regex caught a live re-introduction at `OrdersPanel.tsx:1685` (`total − settled` recomputed in the frontend).
- **Blind spot:** derivation drift in SQL. The test reads TypeScript only.

### 2. Two doors — same data, one door checks and the other doesn't
`buildClientViewPdf` called `fetchSheets`/`fetchProductChips`/`fetchQuoteFfeItems` with no scope
argument while the sibling sheet path passed all three scopes. `catalog-translate-pdf` fetched a
source PDF by body-supplied id on the service-role client while **two** sibling doors for the same
action checked ownership.

- **Guarded by:** [scripts/check-tenancy-parity.mjs](../scripts/check-tenancy-parity.mjs) (`npm run lint:tenancy`) + [tests/unit/tenancyParity.test.ts](../tests/unit/tenancyParity.test.ts)
- **Proven to fire:** 2026-08-01 — the script's built-in self-test feeds it #294 S1 *as originally written* and the correct sibling door, asserting it flags one and ignores the other. It runs on **every** invocation, before the scan, so a broken detector can never report a clean codebase.
- **Current state:** 0 findings, baseline 0.
- **Blind spot:** resolved per file+table, so a file that checks ownership on one path to a table and forgets it on a second path is not reported. Also: a site that fetches `workspace_id` and never compares it reads as fetch-then-verify.

### 3. Dead input — a control that changes nothing
Lists and toggles that never reach the engine; a tool registered on an agent but absent from
`SERVER_TOOLKITS` is stripped and unreachable.

- **Guarded by:** [tests/unit/toolkitCoverage.test.ts](../tests/unit/toolkitCoverage.test.ts) (the two-copy rule), `AGENT_RESULT_TITLES` registration
- **Proven to fire:** not since it was written. **Weakest entry in this table.** Most "dead input" is UI-level and has no mechanism at all.
- **Blind spot:** large. Only agent toolkits are covered; a dead filter, a saved setting nothing reads, or a form field dropped before the write is invisible.

### 4. Ambiguous zero — a number that should be non-zero, sitting at zero, silently
`stamp_job_refresh_cost` referenced a column that did not exist, so billing sat at 0 with the
exception swallowed. An endpoint 404'd on 100% of calls for months. The Stripe webhook failed 100%
from the day it shipped.

- **Guarded by:** `ops.silent_zero`, `ops.test_artifacts_accumulating`, `ops.integrity_registry_broken`, and the `no-swallowed-write` semgrep rule
- **Proven to fire:** 2026-08-01 — `no-swallowed-write` found 9 sites, 7 genuine: three lost `ai_usage_logs` billing rows, a lost ERGANI submission audit row, a lost `last_digest_at` double-notify guard, a lost `embedding_status='failed'` write, and a recovery cron incrementing its counter after an unchecked update.
- **Note:** the **<5%** success-rate threshold matters. An exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5%.
- **Blind spot:** `ops.silent_zero` probes are hardcoded (deliberately — admin-editable SQL run by a SECURITY DEFINER function would be a privilege-escalation surface). A new metric gets no probe until someone writes a migration.

### 4c. Queue that never drains — items enqueued, nothing consuming them
The `messaging-processor` cron sat `active:false` and nothing noticed. `email_logs` held 134
`failed` / 2 `queued` / 1 `delivered` while the Email Analytics dashboard read a **0% bounce
rate**, because nothing writes `email_analytics` at all — an operator watching that dashboard
would have concluded email was healthy during a total outage.

- **Guarded by:** `ops.unsent_queue_backlog` over `email_logs`, `messaging_logs`, `campaign_recipients`, `background_jobs`
- **Proven to fire:** 2026-08-02 — `stuck_backlog` by planting six 2-day-old pending jobs, `delivery_collapse` by planting twelve failures in the last hour, both inside rolled-back transactions.
- **It was wrong on its first run, and the correction is the useful part.** It fired immediately on `email_logs` — 123 failures, 0 successes, 100% — which read as a live outage. It was not: those rows span 2026-07-26..28 and their own `error_message` records the cause (a flow template rendering `customer_email` as the literal string `"null"`) and the fix, applied 2026-07-28. Real history, resolved incident. **Reporting a fixed incident as a current one is not a harmless false positive** — a probe that cries wolf gets muted, and is then worth nothing on the day it is right, which is the failure `ops.silent_zero` exists to avoid. Both branches now require a failure in the last 24h AND zero successes in the last 24h, so a resolved outage ages out on its own. That condition was already present on `silent_zero`'s endpoint branch; it should have been copied the first time.
- **Why two branches:** `stuck_backlog` measures queue *depth*; `delivery_collapse` measures *outcome*. A fast-failing queue never accumulates depth, so a depth check alone is blind to exactly the shape that actually happened here.
- **Deliberately not auto-healed:** re-queueing a message whose failure cause is unknown risks duplicate sends to real recipients.
- **Blind spot:** the status vocabularies are hardcoded per table. A queue that invents a new status string lands in none of the three buckets and is silently under-counted.

### 4b. Resume gap — a partial run recorded as a finished one
A worker dies partway through a stage. The rows it managed to write are non-zero, so the resume
path reads "already done" and short-circuits the stage on every future run — the product stays
permanently under-processed while the job completes green.

- **Guarded by:** `pdf.product_resume_incomplete` (data-integrity registry, surfaces on `/admin/data-health`), plus the checkpoint's own `completed_empty` status
- **Proven to fire:** 2026-08-02 — planted a product carrying `metadata.resume_incomplete`, confirmed the detect function returned it with the right entity and counts, confirmed `run_data_integrity_checks` recorded it in the nightly sweep alongside the existing checks, then deleted the probe and re-verified the table was clean.
- **Deliberately not auto-healed:** repair means re-running Stage 3, which re-bills Claude vision for every image on the product. `heal_fn` is NULL so the registry cannot silently re-bill a catalog; a human decides.
- **Blind spot:** the check only sees products a resume *noticed* were partial. Chunks are repaired in place (deleted and rebuilt), so they never reach this marker — a different and better outcome, but it means this check is image-side only.

### 5. Derived-copy drift — a cached number diverging from its source
Any `total`, `status` or count stored alongside the data it summarises.

- **Guarded by:** `finance.order_payment_status_drift`, `dic_detect__finance_order_over_settled`, the quote-totals drift check
- **Proven to fire:** 2026-07-26 (quote totals drift check, on introduction)
- **Blind spot:** only finance quantities. A cached count anywhere else has no drift check.

### 6. Money without currency — an amount compared or summed across currencies
`AgingRow` carried no currency field, so AR/AP totalled every row as EUR whatever the document
actually said.

- **Guarded by:** `ops.money_without_currency` — three branches: a quote total with no currency; a payment settling a document in a *different* currency at an absent or identity `fx_rate`; a workspace holding open balances in more than one currency.
- **Proven to fire:** 2026-08-02 — all three branches watched, each inside a transaction that was rolled back: nulled a quote's currency, flipped one open payable to USD, set a cross-currency allocation to `fx_rate = 1`. Verified afterwards that nothing survived the rollbacks.
- **The first version of this probe was wrong, and that is worth recording.** It checked `currency IS NULL` across six money tables. **Five of the six columns are `NOT NULL`**, so five sixths of it could never fire — it would have sat in this table looking like coverage. Worse, NULL was the wrong thing to look for at all: those columns are `NOT NULL DEFAULT 'EUR'`, so a document created without an explicit currency does not arrive NULL and get noticed — **it arrives silently, confidently EUR.** That default *is* the AgingRow bug one level down, and no NULL check can ever see it. Caught only because step 2 below forced an attempt to make it fail.
- **Blind spot:** the `DEFAULT 'EUR'` itself. Nothing distinguishes "the user chose EUR" from "nobody chose anything", so a wrong single-currency figure stays invisible. Closing that needs a nullable column and an explicit choice at write time — a schema change, not a probe.

### 7. Direction-blind roll-up — a sum that ignores in/out
Closely related to shape 1, but at the aggregate rather than the row.

- **Guarded by:** `get_order_settlements` for orders only
- **Blind spot:** any new aggregate. The rule in CLAUDE.md ("derive it in SQL, return it derived, add a drift check") is prose, not a mechanism.

---

## Mechanism inventory

| Mechanism | Runs | Enforces | Self-proving? |
|---|---|---|---|
| `.github/semgrep-security.yml` (8 rules) | CI, blocking | invariants 1, 6–11 | partly — [tests/unit/semgrepRuleset.test.ts](../tests/unit/semgrepRuleset.test.ts) checks parse validity and rejects `catch (...)`, but cannot prove a rule *matches* |
| `check_security_invariants()` RPC | nightly | invariants 2–4, live DB | no |
| `run_data_integrity_checks` | nightly cron | detect/heal registry | yes — `ops.integrity_registry_broken` validates the registry's own signatures |
| `npm run typecheck` | CI, blocking | `src/` types | n/a |
| `npm run typecheck:edge` | CI, blocking | edge types, baseline-ratcheted | yes — re-runs quiet files alone, because `deno check` prints nothing on a cache hit |
| `npm run lint:a11y` | CI | jsx-a11y, per-rule ratchet | partly — [tests/unit/a11yRatchet.test.ts](../tests/unit/a11yRatchet.test.ts) fails if a rule returns to `'off'` |
| `npm run lint:tenancy` | CI | invariant 1, two-doors | **yes** — self-test runs before every scan |
| `ops.silent_zero` | nightly | shape 4 | no |
| `ops.money_without_currency` | nightly | shape 6 | no — but all three branches were watched to fire before shipping |
| `ops.unsent_queue_backlog` | nightly | shape 4c | no — but it fired on real production data on introduction |
| `pdf.product_resume_incomplete` | nightly | shape 4b | no — but it was watched to fire on a planted marker before shipping |
| [tests/unit/escapeHtmlParity.test.ts](../tests/unit/escapeHtmlParity.test.ts) | `npm test`, blocking | invariant 11 — the three `escapeHtml` twins (Vite / Deno edge / Vercel `api/`) stay byte-equivalent | **yes** — imports all three and diffs them over a shared corpus, so a twin that stops matching fails the build rather than reporting clean |
| `lint_plpgsql_errors()` via `db.plpgsql-lint` | smoke monitor, 2-hourly | every `public` plpgsql function still compiles against the live schema | yes — baseline is a strict **zero**, so any new breakage fails instead of blending into a known-broken list |

**"Self-proving"** means the mechanism demonstrates it can still detect, rather than only reporting
what it found. Five of thirteen qualify. That is the gap.

> **`db.plpgsql-lint` has one known false-positive shape: runtime-created temp tables.**
> `plpgsql_check` analyses statically, so a `create temporary table X` inside a function makes it
> report the whole function broken on a relation that only exists at runtime. That is not a reason
> to add the function to `KNOWN_BROKEN_FUNCTIONS` — the zero baseline is the point. Remove the temp
> table instead (a jsonb local works, costs no `pg_class` row per call, and does not raise
> "already exists" when the function is called twice in one transaction). Done once for
> `pos_issue_receipt`, 2026-08-03.

---

## Known gaps, in priority order

1. **Shape 3 (dead input)** — covered only for agent toolkits. Now the broadest untested surface, since shape 6 has a probe.
2. **Semgrep rules cannot prove they match.** The ruleset test verifies patterns *parse*; it cannot verify they *fire*. Every rule in the table at the top of this file parsed fine. Closing this means fixture files a rule must match, scanned in CI — the same trick `check-tenancy-parity.mjs` already uses.
3. **Shapes 5 and 7 are finance-only.** Both rules generalise; neither mechanism does.
4. **41 files partially unparsed by semgrep** — its TSX parser chokes on raw `&` in JSX text (`&mode=smart`, `& business platform`) and on `export type *`. It skips the region and scans the rest, so coverage is reduced, not absent. No action available beyond avoiding raw `&`.

---

## Adding a mechanism

1. Write the check.
2. **Feed it the defect.** Construct the failing input — ideally the real historical one — and watch it fail. If you cannot make it fail on demand, you do not have a guard.
3. Wire the "make it fail" case in as a permanent self-test, so a future edit that breaks detection breaks the build instead of going quiet.
4. Add a row here, with the date you watched it fire.
5. If it needs a baseline, ratchet **down** only. A baseline edited upward is how a gate dies.
