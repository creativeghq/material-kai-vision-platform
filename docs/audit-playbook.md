# Platform audit playbook

> Re-runnable. This is the method that produced #293–#310 (≈250 findings across 16 areas), plus
> every way the measurements lied to us on the way. **The traps section is the most valuable part
> — skip it and you will re-derive the same wrong numbers.**

## How to run it

Paste this into a fresh session:

```
Run the platform audit in .claude/audit-playbook.md.

Scope: <all | areas 1-16 | a named area>
Depth: <sweep = find and report | close = also fix, gate and push>

Follow the verification discipline exactly. Every count must be measured against the live
system or the actual linter, never inferred from a grep. Open one GitHub issue per area with
file:line proof, and end each with the sources that returned NOTHING.
```

**Do not run all 16 areas in one pass and one issue.** They were split because a 250-finding
document is unusable and because each area needs a different measurement tool. One issue per area,
linked from a master index.

---

## Why this works: find by class, not by clicking

The audit exists because hands-on use produced ~14 fixes in a day, and they were not 14 unrelated
bugs — they were **a handful of shapes repeating**. Fixing them as you hit them is why the platform
"seems almost impossible to work". Searching for the *shape* finds the other forty instances.

Every finding must sort into a shape below. **If it doesn't, either the shape list is incomplete
(add one, with its historical instance) or the finding is a one-off — say which.**

### The defect shapes

| # | Shape | Historical instance |
|---|---|---|
| 1 | **Side mismatch** — a concept rendered where it cannot exist for that variant | "Received from customer" on a purchase order |
| 2 | **Two doors** — two controls producing one record | Re-order + Duplicate; Add expense + Record supplier bill |
| 3 | **Dead input** — a value overwritten, dropped, or read by nobody | Cost overwritten on save; `in_discovery` with zero writers |
| 4 | **Ambiguous zero** — genuinely-zero indistinguishable from broken | `stamp_job_refresh_cost` billing stuck at 0, exception swallowed |
| 4b | **Resume gap** — a partial run recorded as finished | Stage 3 dies; rows written are non-zero, so resume short-circuits forever |
| 4c | **Queue that never drains** | `messaging-processor` cron `active:false`, nobody noticed |
| 5 | **Derived-copy drift** — a cached number diverging from its source | Supplier bill €3,000 vs its order's €2,580 |
| 6 | **Money without its currency** | `AgingRow` totalled every row as EUR |
| 7 | **Direction-blind roll-up** on a dual-role party | "Owed on orders €12,400" that cannot say which way |

### The two cross-cutting root causes

1. **Fail-open is the house default** — auth, entitlement, quota, credit and secret paths that
   return *allowed* / *success* when they fail.
2. **Money-write side-effects assume they worked** — `catch {}` followed by an unconditional
   success toast.

Everything found in #294–#308 was a symptom of one of these two, a schema drift, or a duplicated
derivation.

---

## Verification discipline

This is non-negotiable and it is what separates this audit from a plausible-sounding list. Five
findings in the original pass were **retracted or corrected** by following it, and three more were
caught during the fix phase.

1. **Measure against the artifact that decides, not a proxy.**
   A grep counts *candidates*; the linter counts *violations*. Audit #302 reported "1,325
   unlabelled inputs, 280 unnamed icon buttons". The linter's actual number was **407**, and 117
   of those were rule misconfiguration rather than defects. Report both if you like, but label
   which is which.

2. **Check the live system, not the repo's intent.**
   `requirements.txt` said `Pillow>=12.3.0`; the server ran `10.4.0`. `pip-audit` on the file
   said "no known vulnerabilities"; on the actual freeze it said **65 advisories across 5
   packages**. Committed ≠ deployed. Always.

3. **Before writing "0" anywhere, ask whether 0 can be distinguished from broken.**
   If it cannot, that IS the finding. `search_analytics` had 0 rows and three dashboards
   reporting off it; `email_analytics` read a 0% bounce rate during a total outage.

4. **A guard you have never watched fail is not a guard.**
   Construct the failing input — ideally the real historical one — and watch it fail. The
   money-without-currency probe's first version checked `currency IS NULL` across six tables;
   **five have the column `NOT NULL`**, so five sixths could never fire. It would have shipped
   looking like coverage. Only the attempt to make it fail revealed it.

5. **Report what returned nothing.**
   Every issue ends with a "sources that returned nothing" section. "0 dangling `aria-*`
   references" and "0 defects in `src/components/core/ui/`" are findings — they tell you the
   primitives are sound and the defects are all in feature code.

6. **When a claim is wrong, retract it in the issue with the corrected measurement.**
   Do not quietly delete it. The retractions are how a reader calibrates the rest.

7. **"Blocked on someone else" needs the same proof as any other claim.**
   It is the least falsifiable status an issue can carry — nobody re-tests it, and it survives
   every sweep. `ALTER TABLE net._http_response …` is genuinely refused (`supabase_admin` owns
   it), and that was recorded as "needs a superuser or a Supabase ticket". But setting a storage
   parameter was never the goal — *reclaiming the space* was, and `postgres` already held PG17's
   `MAINTAIN` privilege, so a plain `VACUUM` ran fine and a daily cron closed it outright.
   **When a command is refused, ask what it was FOR and whether the goal has another route,
   before recording the goal as blocked.**

---

## Known traps in THIS platform

Each of these produced a wrong number or a green build that was lying. They are ordered by how
badly they mislead.

| Trap | What happens |
|---|---|
| **`cmd \| tee log`** | Pipeline exit status is `tee`'s, i.e. `0`, even when `cmd` died. This is why every Python security bump was silently discarded for months. Always `set -o pipefail`. |
| **A semgrep rule that fails to parse** | Loads, matches **nothing**, and the scan looks clean. `catch (...)` is a parse error in JS *and* TS. The whole ruleset once loaded **0 rules** behind a `\|\| true`. |
| **`manualChunks: {'pkg': 'vendor-x'}`** | Does not *organise* a dependency, it **pins** it — the chunk becomes a static import of the entry and every visitor downloads it. Hit three times: `@sentry/react`, `@tanstack/*`, `recharts` (362 KB on anonymous landing pages). |
| **`overflow-x-hidden` on `<main>`** | `documentElement.scrollWidth` can never detect a responsive defect. A sweep reported "45 tables clipped"; element-level measurement at 375px found **one**. |
| **Local build ≠ deployed build** | A sweep reported a 993 KiB payload with 1.37 MB of three.js on every page; the deployed `index.html` preloaded neither. Real figure ~501 KiB. Diff the deployed asset list. |
| **`.single()` on a query returning 2 rows** | Errors with a non-`PGRST116` code, which prompt/config loaders treat as *transient* and silently fall back — forever, uncached. A duplicate row makes an admin-editable config permanently inert. |
| **`NOT NULL DEFAULT 'EUR'`** | A missing currency never arrives NULL to be noticed; it arrives *silently, confidently* EUR. A `IS NULL` probe over such a column is dead code. |
| **A probe with no recency gate** | Reports a *fixed* incident as live until its rows age out of the window. A probe that cries wolf gets muted, and is then worth nothing on the day it is right. Require a failure in the last 24h **and** zero successes in the last 24h. |
| **`cron.job_run_details.status`** | For `SELECT net.http_post(...)` it reflects only whether the **enqueue** succeeded. pg_net is fire-and-forget. Measured: 0 failed cron runs against **261 real HTTP 500s**. Judge dispatch crons by their target's `api_usage_logs` rows. |
| **Global aggregates in a probe** | One healthy module masks a dead one. `ai_spend_never_debited` stayed quiet because `crm` debited credits, while `job-research` sat at exactly 0.00 across 1,792 calls. `GROUP BY module_slug`. |
| **Exact-zero thresholds** | Real breakage is near-total, not total. An exact-zero test reported the platform clean while two endpoints sat at **0.8%** and **4.5%** success. Use `<5%`. |
| **`get_edge_function`** | Returns only the **current** version. Deploying a tombstone that says "the original is recoverable via the Management API" destroys exactly that. |
| **`pip install -r`** | Never *removes* a package that left the file. `pypdf` stayed installed with 35 advisories after being deleted from `requirements.txt`. |
| **`{/* comment */}` inside a ternary branch** | A second child where one expression is allowed — breaks `tsc` and `npm run build` **tree-wide**. Made three times in one session. |
| **`const { data } = await supabase…`** | Discards `error`. supabase-js *resolves* on error, so a failed query is indistinguishable from an empty result. This is half the "dead input" class. |
| **Text-pattern guards** | Only as strong as the identifiers people pick. The `outstanding` guard missed a live reintroduction because the local helper was named `orderSettled`, not `settled`. Assert *structure* (one source is read), not arithmetic. |
| **0 rows ≠ not needed** | This platform is pre-catalog. 0 rows measures current **adoption**, not whether a capability belongs. "Measure before building" governs *optimisation* (rollup tables), never core capability. |

---

## The 16 areas

Each is one issue. The tool named is the one that *decides* — not a proxy for it.

### 1. Security: authorization and tenancy
**Decides:** `.github/semgrep-security.yml`, `check_security_invariants()`, `npm run lint:tenancy`, manual read of every `switch (action)` edge function.

- Any route/RPC touching workspace data deriving `workspace_id`/`user_id` from the **body** instead of the verified JWT. Service-role client does not exempt — it makes the manual check mandatory.
- `SECURITY DEFINER` without `SET search_path=''`, or still granted to `anon`/`authenticated`/`PUBLIC`. Check *pairs*: a function and its sibling over the same table disagreeing about who may execute is the tell.
- Views over tenant tables without `security_invoker = on`.
- **Read/write scope parity inside one file** — four of six holes were a function correctly scoping its `list` actions and missing the `send`/`update` in the same `switch`.
- Inbound webhooks that fall through when the secret is unset instead of failing closed (503).
- SSRF: any `fetch`/`httpx` of a user-influenced URL not going through the shared guard.
- Mass assignment: `insert({...body})`, `**model.dump()`.
- Fail-open gates: a `catch` in an auth/entitlement/quota/credit path returning a permissive value.

### 2. Wiring dead-ends
**Decides:** reference counting across `src/`, `supabase/functions/`, `cron.job`, `pg_proc.prosrc`, flow graphs, `api_endpoints`.

- Exported functions whose only reference is their own definition. (Found 11 mention bindings, 3 search-service methods.)
- Edge functions deployed with **no source in the repo** — unreadable, unreviewable, service-role capable.
- Tables with readers and no writers, or writers and no readers.
- UI controls that call nothing; settings nothing reads on the next operation.
- Agent tools absent from `SERVER_TOOLKITS` (silently stripped) or `AGENT_RESULT_TITLES` (output dropped).

### 3. Finance — documents, orders, settlement
**Decides:** `get_order_settlements`, `tests/unit/moneyDerivation.test.ts`, live row comparison.

- Any *re-derivation* of settled/outstanding outside `get_order_settlements`.
- A **sales** order settles on money IN; a **purchase** order on money OUT. Netting the directions is the historical bug.
- Cached totals vs their source (shape 5). Money without currency (shape 6). Direction-blind roll-ups (shape 7).
- `qty_on_hand` written outside `record_stock_movement` — eleven functions did, three decrementing for the same sale with idempotency keys that cannot see each other.

### 4. MIVAA pipeline internals
**Decides:** reading the Python, plus `background_jobs` / `document_chunks` / `document_images` row counts.

Stage guards that cannot fire, checkpoints that mark partial runs complete (shape 4b), OCR failure markers vs empty returns, `cache_status` on persisted rows, per-attempt metrics, `current_slow_operation` around genuinely long stages.

### 5. Database performance
**Decides:** `pg_stat_statements`, `pg_stat_user_indexes`, `pg_stat_user_tables`, `pg_publication_tables`.

- Idle realtime polling. Measured once at **57.9% of all DB time** — 3,335,799 WAL polls returning 2 rows total. **Check for live subscribers before dropping a table from the publication.**
- Zero-scan indexes on hot insert paths — confirm `stats_reset IS NULL` first or the zero is an artefact.
- `select('*')` detoasting large columns to paint a table that shows none of them; missing `LIMIT`.
- Bloat vs unbounded rows: they need *different* fixes. A retention cron does nothing for bloat; vacuuming does nothing for a table with no TTL.
- Autovacuum scale factors that never fire on small high-churn tables — use absolute thresholds.

### 6. Frontend performance
**Decides:** the **deployed** `index.html` preload list and `dist/assets` byte counts.

`manualChunks` pinning (see traps), eagerly-imported heavy libraries, unbounded lists, N+1 query loops in components, full-resolution images in thumbnail grids.

### 7. Accessibility
**Decides:** `npm run lint:a11y` — **not** a grep.

Unlabelled controls, unnamed icon buttons (weight the *destructive* ones — 130 of 280 were `Trash2`/`X`), mouse-only handlers, hand-rolled modals with no Escape/focus-trap/restore, dialogs with no accessible name, colour-only status, skip link, landmark coverage.
**Rules configured wrong produce phantom findings** — check `controlComponents`, `ignoreElements`, `depth` before believing a count.

### 8. Dependencies and supply chain
**Decides:** `npm audit` resolved to *installed* versions, and `pip-audit` against the **live server freeze**.

Most npm noise is `node_modules/.deno` (Deno edge deps) and stale install debris conflated into one number. Resolve every high/critical to what is actually bundled. Then do the Python side against the server, not the file.

### 9. Monitoring and observability
**Decides:** `ops.silent_zero`, `api_usage_logs`, `cron.job_run_details` **plus** the target endpoint's real status.

Endpoints failing at <5% success, dispatch crons judged by effect not enqueue, log levels that preserve noise forever (4xx at WARNING was the largest producer of retention-exempt rows — the commonest message was a vulnerability scanner probing `/term.php`).

### 10. Mobile responsiveness
**Decides:** element-level measurement at 375px on the running app. Not `scrollWidth`.

### 11–16. Feature areas
Real Estate + Marketplace · Designer/3D/AR/media · Inbox/Social/SEO/Email · Warehouse/Quotes/POS/Payments · CRM/HR/Projects · Knowledge base and search.

For each: walk the primary verb (open an order, send a campaign, receive stock) and ask at every step — *can this fail silently?* *is this number derived twice?* *does this control exist for the other variant?*

---

## Output contract

One GitHub issue per area, linked from a master index. Each finding carries:

- **What** — one sentence, no hedging
- **Proof** — `file:line` links, or the SQL and its result
- **Consequence** — what the user or operator experiences. "A keyboard user cannot open a single order from any list view" beats "accessibility issue"
- **Fix** — and whether it is *mechanical* or *needs judgement*. Say when the mechanical version is a trap (`tabIndex` on a `<tr>` is invalid ARIA and yields a focus stop with no name)
- **Shape** — which of the nine

Then: **sources that returned nothing**, and **coverage gaps inside what was swept** (what you did *not* measure, stated as a limit rather than a clearance).

---

## Closing the loop: the prevention layer

A fix-once list is worth less than a rule. For each defect class that has now been fixed twice,
add the mechanism — and record the date you **watched it fire** in
[docs/prevention-coverage.md](prevention-coverage.md).

Existing mechanisms, and whether they can prove themselves:

| Mechanism | Self-proving? |
|---|---|
| `.github/semgrep-security.yml` | partly — `semgrepRuleset.test.ts` proves rules *parse*, not that they *fire* |
| `check_security_invariants()` | no |
| `run_data_integrity_checks` | **yes** — `ops.integrity_registry_broken` validates the registry's own signatures |
| `npm run typecheck:edge` | **yes** — re-runs quiet files alone, because `deno check` prints nothing on a cache hit |
| `npm run lint:tenancy` | **yes** — self-test runs before every scan |
| `npm run lint:a11y` | partly — the ratchet test fails if a rule returns to `'off'` |

**Adding one:** write the check → *feed it the defect and watch it fail* → wire that failing case in
as a permanent self-test → add a row to the coverage doc with the date → ratchet baselines **down
only**. A baseline edited upward is how a gate dies.

Adding a DB probe is a migration — probes are hardcoded in the detect function on purpose, because
admin-editable SQL run by a `SECURITY DEFINER` function is a privilege-escalation surface.

---

## Gates that must be green before "done"

```
npm run typecheck        # src/ only
npm test
npm run lint             # ceiling is DERIVED: a11y baseline + declared non-a11y debt
npm run typecheck:edge   # baseline-relative; ratchet down, never up
npm run lint:a11y
npm run lint:tenancy
```

Plus, after any DDL: `mcp__supabase__get_advisors(security)`.

**Never raise a baseline or a `--max-warnings` ceiling to go green.** Both numbers are guarded by
tests precisely because that is the tempting move at 2am.
