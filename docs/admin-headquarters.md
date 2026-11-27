# Headquarters (operator admin), Agent Harness and Agent Ops

Every `/admin/*` route renders inside `AdminLayout` (`src/components/Admin/HQ/AdminShell.tsx`): the HQ
rail on the left and the page's own sections as top tabs (`HqTabbedPage`). The rail is ONE list,
`ADMIN_NAV` in `src/components/Admin/HQ/adminNav.ts`; the Overview's area cards read the same list.
All pages sit behind `AdminGuard`; the RPCs behind them are SECURITY DEFINER and self-guard on
`is_platform_operator()` / `is_platform_admin()`, so a non-operator member is refused server-side.

## The rail

| Group | Page | Route |
|---|---|---|
| — | Overview | `/admin` |
| Agents | Agent Harness | `/admin/agents` |
| Agents | Agent Ops | `/admin/agent-ops` |
| Agents | AI Configurations | `/admin/ai-configs` |
| Data & Pipeline | Job Queue | `/admin/async-queue-monitor` |
| Data & Pipeline | Ingestion Quality | `/admin/ingestion-quality` |
| Data & Pipeline | Materials Data | `/admin/materials-data` (source documents open at `/admin/documents/:documentId`) |
| Data & Pipeline | Knowledge Base | `/admin/knowledge-base` |
| Data & Pipeline | Data Health | `/admin/data-health` |
| Operations | System Health | `/admin/system-health` (Services / Generation Providers / Capabilities / Storage) |
| Operations | Search Analytics | `/admin/search` |
| Operations | Services & Billing | `/admin/billing` (prices read from `ai_model_pricing`) |
| Operations | Platform Overview | `/admin/platform` |
| Operations | Approvals | `/admin/approvals` (one page, a tab per queue with pending counts) |
| Platform | Modules & Plans | `/admin/modules` (Modules, Subscribers, Plans, Platform Keys, API Keys) |
| Platform | Master Catalog | `/catalog-master` |

Rail badges come from one read, `admin_hq_attention()`.

**Retired addresses.** `/admin/operations?tab=…` redirects to the page that tab became
(`OperationsRedirect`), so stored notification links still land. `/admin/background-agents` redirects
to `/admin/agent-ops?tab=background-agents`, `/admin/supplier-claims` to
`/admin/approvals?tab=supplier-claims`. `/admin/logs` is gone: `system_logs` is read as evidence by the
Ops desk (`ops_recent_errors`, `ops_case_evidence`), WARNING and above only. Push Notifications moved
to the operator-only **Operator Hub** in the Apps menu, beside Emails and WhatsApp Campaigns.

## Overview (`/admin`)

An attention-first list: verified Agent Ops cases waiting on the operator, open cases waiting for a
review, failing generation providers, jobs that stopped reporting or failed in 24h, critical integrity
findings, catalogues waiting on a quality review, pending approvals, integrity warnings and enabled
providers with no health probe. Then headline numbers (from `admin_agent_harness_overview`) and an
Explore card per rail destination, plus links to Sentry and the MIVAA / edge API docs.

## Agent Harness (`/admin/agents`)

One dense page derived in SQL by `admin_agent_harness_overview(p_days)`, with sections Needs
Attention, Health, Agents & Models, Work & Quality, Tools, Failures, Quality, Automation, Memory &
Knowledge and Conversations. Rates divide by what succeeded and render `—` when there is nothing to
divide by.

- **Turn spine — `agent_turns`.** agent-chat opens a `running` row when a turn's stream starts and
  closes it on every exit with a status (`ok`, `error`, `refused`, `max_tokens`, `empty`,
  `invalid_tool_call`, `cancelled`), plus stop reason, model steps and time to first output.
  A row still `running` after 5 minutes is a lost turn (the isolate died).
  `agent_tool_call_logs.turn_id` ties every tool call to its turn.
- **Trace.** `admin_agent_conversation_trace(id)` returns one conversation as a single timeline of
  messages, model turns (tokens, cache, cost, latency), turn records with their verdict, and tool calls
  with arguments and results. Opened as a sheet; `?trace=<conversation id>` deep-links it.
- **Work & Quality.** `admin_agent_work_quality(p_days)` groups every `ai_usage_logs` operation into
  areas through the `ai_work_areas` / `ai_work_operations` registry (longest prefix wins; an unmatched
  operation is listed as unclassified, never dropped), compares each area to the previous window, and
  reports content quality per writer from `ai_content_outputs` (one row per generated social post or
  email copy: check status, warning codes, avoid-list hits, outcome, edited before it went out) and SEO
  article scores.
- **Quality.** Golden eval cases (`agent_eval_cases`) are created, edited, deactivated and re-run from
  the inline case manager; see [agent-evaluation.md](agent-evaluation.md). The **Unmet Requests** panel
  reads `agent_conversation_audit(p_days)`.
- **Automation.** Background agents and flows, including stuck runs. A background agent's cost is
  derived from the log (`ai_usage_logs.agent_run_id` → `agent_run_cost_usd()`); there is no stored
  run-cost column.

## AI Configurations (`/admin/ai-configs`)

Tabs: **Prompts** (one editor for every `prompts` row — agent, tool, extraction and template prompts —
with Type / Stage / Category / Status filters derived from the rows; writes go through
`create_prompt_with_history` / `update_prompt_with_history`, so every change lands in
`prompt_history`), **Chat Starters** (same audited RPCs), **Writing Rules** and **Model Pricing**
(`ai_model_pricing`, the one USD source).

## Agent Ops (`/admin/agent-ops`)

Where JARVIS hands platform problems to two sub-agents, Stark and Veritas. Tabs: **Cases**,
**Agents**, **Background Agents**, **Servers**, **Processes**; window 24h / 7d / 30d.

**Cases.** `ops_sync_cases()` runs every 15 minutes and opens ONE case per problem source in
`ops_cases`: an integrity check with open findings, a failing generation provider, a failed or stalled
job, a failing background agent, an agent tool failing 20%+ of its calls, and a server (a non-ok
maintenance run, no run for 7 days 8 hours, an open nginx.org advisory, disk over 80%). A case
resolves itself when its source clears. Statuses: `open`, `investigating`, `awaiting_review`,
`escalated` (shown as **Needs You**), `resolved`, `dismissed`. `ops_record()` is the one place a case
changes hands; every step is an `ops_case_events` row linked to the turn's trace.

**A review is one JARVIS turn** in toolkit `ops-desk` (platform operator only), started by **Run
Review** or, when the **Scheduled Review (Every 3h)** switch is on (`ops_desk_settings`, off by
default), by `ops_review_cron`; server cases are reviewed automatically when `auto_review_server` is
on. Each review is an `ops_reviews` row; one that never became a turn counts as failed.

- `ask_stark` — a real tool loop bound to one case: reads the evidence and logs, re-checks, applies a
  fix ONLY where the operator already enabled an unattended heal, and files an outcome: `fixed`,
  `not_a_problem`, `needs_operator` or `needs_code_change`.
- `ask_veritas` — re-reads the evidence, re-checks a claimed fix and confirms or rejects. Rejected
  twice, the case goes to a person. On a server case Veritas judges by `server_probe` (an outside check
  of the public health URL that must report `healthy`), never by the server's own report.
- Both see cron jobs and recent migrations. Every sub-agent step is logged to `agent_tool_call_logs`
  under its own agent id and its cost to `ai_usage_logs`.
- The operator can **Mark resolved** or **Dismiss** a case from its sheet (Timeline, Evidence).

**Agents** lists JARVIS, Stark, Veritas, the four analysis sub-agents and every background agent:
runs, failure rate, latency, cost; Veritas's confirm/reject split is how often Stark is right.
**Background Agents** is the editor described in [background-agents.md](background-agents.md).
**Processes** lists reviews, background agent runs and cron jobs.

**Servers** (#590). The MIVAA server maintains itself every Sunday night and reports to the
`server-maintenance-report` edge function: HMAC over `timestamp.body` per server, checked before the
body is parsed, failing closed; `action=poll` hands the server an on-demand run requested with **Run
Now**. Runs land in `server_maintenance_runs` (service-role only; read through
`admin_server_maintenance`, which never returns the secret). After storing a run the function probes the
server from outside and emits `server_maintenance_completed`; `ask_veritas` emits the same event when it
rules on a server case. A locked system-default flow delivers it to the root workspace's owners and
admins; a resent report is ignored, so each run rings once. JARVIS has `server_maintenance_status` and
`request_server_maintenance` (Approve/Decline).

## Related

- [agent-system.md](agent-system.md) — agents, routing, approvals
- [agent-evaluation.md](agent-evaluation.md) — coverage baseline, audit, golden cases
- [background-agents.md](background-agents.md) — the runner framework
- [data-integrity-framework.md](data-integrity-framework.md) — the checks that open integrity cases
