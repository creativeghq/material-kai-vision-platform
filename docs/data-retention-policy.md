# Data Retention Policy

Documents which database tables are automatically cleaned, which are kept indefinitely, and the rationale for each decision.

Cleanup is performed by two mechanisms:
- **Weekly edge function** — `job-cleanup-cron` runs every Sunday at 03:00 UTC
- **Daily pg_cron SQL job** — `system-logs-daily-cleanup` runs every day at 02:00 UTC (handles high-volume `system_logs` directly in the DB)

---

## Tables That Are Cleaned

| Table | Retention | Trigger | Reason |
|---|---|---|---|
| `background_jobs` | 5 days | completed or failed | Short-lived job records; no value after completion. Note: `stage_history`, `recovery_history`, and `last_checkpoint` JSONB columns on this table supersede the dropped `job_checkpoints` and `job_progress` tables (both dropped 2026-04-25). |
| `scraping_sessions` | 5 days | completed or failed | Temporary session state; content is already in products |
| `data_import_jobs` | 5 days | completed/failed + non-scheduled | One-off import runs; scheduled jobs are kept |
| `vr_worlds` (failed only) | 7 days | status = failed | Failed renders have no asset URLs; safe to discard |
| `generation_3d` (unsaved) | 15 days | not saved to moodboard | Unsaved renders are temp workspace; storage files also deleted |
| `data_import_history` | 30 days | age | Import audit trail useful short-term; not needed long-term |
| `agent_checkpoints` | 30 days | age | Conversation state snapshots; stale after a month |
| `flow_run_steps` | 30 days | age | Step-level execution details; parent run is enough after 30 days |
| `flow_runs` | 30 days | completed/failed/cancelled | Old automation run history; summarised by stats |
| `system_logs` | 30 days | age | Operational Python API logs (~77k rows/day); kept 30 days for debugging |
| `ai_call_logs` | 30 days | age | Raw per-call AI API debug logs with request/response payloads; distinct from billing logs |
| `search_query_tracking` | 90 days | age | Search analytics; longer window useful for trend analysis |

---

## Tables That Are Kept Indefinitely

| Table | Reason |
|---|---|
| `ai_usage_logs` | **Billing audit log.** Every credit debit is recorded here. Required for business analytics, dispute resolution, and revenue reporting. Deleting these would remove visibility into platform usage and revenue patterns. |
| `agent_chat_conversations` | User conversation **text** is kept indefinitely (small volume; users refer back). **Generated media is not** — see the storage-retention note below. |
| `agent_chat_messages` | Individual messages within conversations. Kept together with parent conversations. |
| `products` | Core product catalogue. Never cleaned automatically. |
| `user_credits` | Credit balances. Financial data, never deleted. |
| `credit_transactions` | Credit debit/top-up history. Financial audit trail, never deleted. |
| `vr_worlds` (non-failed) | Saved 3D world assets. Tied to user work; only failed ones are cleaned. |
| `generation_3d` (saved) | 3D renders saved to moodboard by the user. User-owned content. |
| `flow_definitions` | Automation flow blueprints. Configuration data, not transient. |
| `data_import_jobs` (scheduled) | Recurring import jobs. Kept because they run repeatedly on a schedule. |

---

## pg_cron Jobs

| Job Name | Schedule | Type | What It Does |
|---|---|---|---|
| `job-cleanup-weekly` | `0 3 * * 0` (Sun 03:00 UTC) | Edge function | Full multi-table cleanup pass via `job-cleanup-cron` edge function |
| `system-logs-daily-cleanup` | `0 2 * * *` (daily 02:00 UTC) | Direct SQL | `DELETE FROM system_logs WHERE created_at < NOW() - INTERVAL '30 days'` — handles bulk purge without edge function overhead |
| `purge-orphan-agent-projects` | `30 3 */2 * *` (every 2 days, 03:30 UTC) | Direct SQL | `DELETE FROM agent_projects WHERE workspace_id IS NULL` — removes unreachable orphan Agent Fabric projects (NULL workspace can never satisfy the `is_workspace_admin(workspace_id)` RLS). CASCADEs to that project's secrets/deployments/snapshots. Same purge runs in `reset-platform` STEP 1.6. |
| `retention-sweep-daily` | `30 3 * * *` (daily 03:30 UTC) | Direct SQL | `SELECT run_storage_retention_sweep(false, 30)` — see storage-retention note below. |

---

## Storage retention — generated files (2026-07-24)

DB rows above are only half the story; **generated files in storage** need their own ceiling or the buckets grow unbounded. The one garbage collector is `storage-orphan-cleanup-nightly` (04:00 UTC), which deletes any object **not referenced** by `build_storage_reference_set()` and older than its bucket grace (pdf-documents 72h, pdf-tiles 48h, generation-images 14d). Because it is reference-based, finished work stays referenced — and therefore alive — forever. `retention-sweep-daily` (03:30 UTC, `run_storage_retention_sweep`) closes that gap by **expiring references** so the nightly GC can reclaim the bytes. No second deleter.

**Phase 1 (shipped 2026-07-24) — agent chat media.** The sweep stamps `agent_chat_conversations.files_purged_at` on conversations idle > **30 days** (`updated_at`). `build_storage_reference_set()` skips purged conversations (session-prefix branch + both message-URL-scan branches), so their `generation-images/u/{uid}/sessions/{cid}/` media (AI generations + uploads) falls out of the reference set and the nightly GC deletes it. **The conversation text is untouched** — only the heavy media goes. Media the user promoted to a moodboard is safe: promotion copies the bytes to `u/{uid}/moodboards/{mid}/`, protected by a separate `moodboard_items.media_url` branch. `agent_uploaded_files` protection is time-gated inline (30d on its own `updated_at`) since it has no `conversation_id`. Idle days are a function arg (`run_storage_retention_sweep(dry_run, idle_days)`) — tune without a redeploy.

**Phase 2 (planned) — regenerable deliverable PDFs.** Quote / sheet / client-view / catalog PDFs would purge on **~1 week idle OR parent closed/completed/deleted**, re-rendering on demand. Blocked on adding **auto-regenerate-on-open** to the viewers/share endpoints (today `refreshPdfUrl()` returns null when the path is gone — it does not lazily rebuild), plus wiring a "Mark as Done" control for `moodboards` (the `status`/`completed_at` columns are already added). `files_purged_at` columns exist on those tables as scaffolding but are not yet consumed. Finance/tax PDFs (invoices, credit/delivery notes, statements) and KB source PDFs are **hard-exempt**.

---

## Notes

- `ai_call_logs` vs `ai_usage_logs`: These are **different tables**. `ai_usage_logs` is the billing record (kept forever). `ai_call_logs` contains raw request/response payloads used for debugging (cleaned after 30 days).
- `generation_3d` storage: When unsaved renders are deleted, the corresponding crop image files are also removed from the `generation-images` Storage bucket (under the `product-crops/` prefix, post 2026-05-23 consolidation) before the DB rows are deleted (CASCADE removes `generation_3d_segments`).
- `flow_run_steps` are always deleted before their parent `flow_runs` to avoid foreign key conflicts.
- `data_import_jobs` with `is_scheduled = true` are excluded from cleanup because they represent recurring cron-driven jobs that must persist.
