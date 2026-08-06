# Data Integrity Framework

A registry of **detect / heal** check pairs, run nightly against the live database, surfaced to operators at `/admin/data-health`.

It exists because of a specific failure class this platform kept hitting: **a wrong number is still a valid number**. Typecheck can't catch it, RLS can't catch it, and no exception is raised. The only way to find it is to assert the invariant against the data itself, on a schedule.

- Runner: [`supabase/functions/data-integrity-runner/`](../supabase/functions/data-integrity-runner/index.ts) — auth boundary + thin dispatcher.
- Engine: `run_data_integrity_checks()` / `heal_data_integrity_check(key)` — all the work happens in Postgres.
- Registry: `data_integrity_checks`; results in `data_integrity_findings`.
- Cron: `data-integrity-daily`, 04:25 UTC.

---

## 1. How a check works

A check is a row in `data_integrity_checks` pointing at **two SQL functions**:

| Column | Meaning |
|---|---|
| `key` | e.g. `finance.order_payment_status_drift` — `domain.name`. |
| `domain` | Grouping: `finance`, `tenancy`, `credits`, `crm`, `security`, `ops`. |
| `severity` | `error` / `warning` / `info`. |
| `detect_fn` | Zero-arg function returning the current violations. |
| `heal_fn` | Zero-arg function that repairs them and returns `integer` (rows healed). |
| `can_autoheal` / `autoheal_enabled` | Whether a fix exists, and whether the nightly run is allowed to apply it unattended. |
| `is_enabled` | Off switch. |

**The contract is rigid and it is load-bearing.** `run_data_integrity_checks` calls `detect_fn()` and `heal_fn()` with **no arguments** and expects heal to return `integer`. A check registered with the wrong signature aborts the whole sweep — which then reports *nothing at all*, which looks exactly like a clean platform. That failure mode has its own check (`ops.integrity_registry_broken`) that validates the registry against `pg_proc` before anything else runs.

### Adding a check

Adding a check is a **migration**, not a row an admin types in. That is deliberate: a table of admin-editable SQL executed by a `SECURITY DEFINER` function is a privilege-escalation surface. Write the two functions, insert the registry row, apply via `mcp__supabase__apply_migration`.

---

## 2. The registry today

| Domain | Checks | Auto-healable |
|---|---|---|
| `finance` | 14 | 4 |
| `ops` | 14 | 0 |
| `tenancy` | 3 | 2 |
| `catalog` | 3 | 0 |
| `stock` | 2 | 1 |
| `credits` | 1 | 0 |
| `crm` | 1 | 0 |
| `security` | 1 | 0 |

**finance** — `order_total_mismatch`, `order_item_net_mismatch`, `order_over_settled`, `order_payment_status_drift`, `order_payment_party`, `order_payment_unallocated`, `payment_no_account`, `payment_over_allocated`.

`order_payment_status_drift` is the canonical example of the "wrong number" class. Order settlement was implemented five times across SQL and TypeScript; four applied the rule correctly (a **sales** order settles on money **in**, a **purchase** order on money **out**), one netted the two directions. The result was a fully-paid sales order showing `Payment: Paid` beside `Outstanding: €945` — the *supplier's* figure. The stored data was flawless, so no integrity check on the rows themselves could see it. The fix was to make `get_order_settlements(uuid[])` the single derivation and then add a drift check comparing every cached copy against it. See the anti-regression rules in [CLAUDE.md](../CLAUDE.md).

**tenancy** — `order_item_workspace`, `payment_order_workspace`: a child row whose `workspace_id` disagrees with its parent's. Cross-tenant contamination is silent by construction, so it must be asserted. `workspace_orphaned` (#211): a consumer workspace >7 days old with zero members — the shell left when an account is deleted (`workspace_members` cascades away, the workspace does not). Heal deletes only workspaces holding no business data and no claimable invites; one with data stays open for review.

**security** — `security.invariant_violation` wraps the `check_security_invariants()` RPC, which surfaces live DB violations of invariants 2–4 (SECURITY DEFINER without `search_path`/revoke, tenant views without `security_invoker`, tables without RLS).

---

## 3. The `ops` probes

These three watch the *monitoring*, not the data. They came out of a pattern review that found the dominant historical failure here was **a number that should be non-zero sitting at zero forever while nothing complains**.

### `ops.silent_zero`

Probes for: activity happened in the window, and the metric it should have produced is zero across the board. It also flags endpoints and cron jobs with a **<5 % success rate**.

The `<5 %` threshold rather than exactly 0 % is the whole point. An exact-zero test reported this platform clean while two endpoints sat at **0.8 %** and **4.5 %** — real breakage is near-total but rarely perfectly total, and a single stray success is enough to hide it from an `= 0` test.

Real instances this class covers: `stamp_job_refresh_cost` referencing a column that didn't exist (billing stuck at 0, exception swallowed); a model endpoint 404-ing on 100 % of calls for months; the Stripe webhook failing 100 % since the day it shipped; `xml-import-orchestrator` throwing before every handoff; customer margin reading €0 because "revenue" meant invoice lines in an order-driven business.

### `ops.test_artifacts_accumulating`

Watches the reaper's **output**, not its exit code. `cleanup-test-artifacts-daily` reported success every night while deleting nothing: its name pattern required `[._-]` and the harness emits `E2E wsA <rid>` with a **space**. 3,057 test workspaces accumulated under a green cron.

> **Rule: when you add a janitor cron, add a probe on the mess it is supposed to clear.** A cron's exit code tells you it ran, not that it worked.

### `ops.integrity_registry_broken`

Validates the framework itself (§1).

---

## 4. Operating it

**`/admin/data-health`** (admin / super_admin / owner) lists open findings by domain and severity, with per-check controls.

| Action | Effect |
|---|---|
| `run` | Run the battery now; optional `autoheal` and `domains[]` filter. |
| `heal_check` | Run one check's heal function on demand. |
| `ignore_finding` / `reopen_finding` | Accept a finding as won't-fix, or bring it back. |
| `set_autoheal` | Toggle whether the nightly run may fix this check unattended. |
| `toggle_check` | Enable / disable a check. |

The nightly cron path runs the full battery and auto-heals every check with `autoheal_enabled = true`. Auth is the shared cron gate (`x-cron-secret` **or** service-role bearer); the admin path requires a session JWT with an admin/owner role.

---

## 5. When to add one

Add a check when a value is **derived and cached**, when a relationship is **implicit** (no FK enforces it), or when a background job's success is measured by its exit code rather than its output. Concretely:

- You cached a derived number → add a drift check against the single derivation.
- You added a workspace-scoped child table → add a parent/child `workspace_id` check.
- You added a janitor cron → add a probe on the backlog it clears.
- You added a metered call path → add it to the silent-zero surface so a 0 % success rate is loud.

## Related

- [CLAUDE.md § Two anti-regression rules](../CLAUDE.md) — the two bug shapes this framework was built around
- [docs/monitoring-and-alerting.md](monitoring-and-alerting.md)
- [docs/finance-system.md](finance-system.md) — `get_order_settlements`, the single settlement derivation
