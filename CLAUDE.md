# Material KAI Vision Platform — Agent Instructions

> **What belongs in this file:** rules that change a decision you make *today*. Nothing else.
> Feature history, audit narratives, and version changelogs live in `docs/` — see the map at the bottom.
>
> **The test for adding anything here:** does it point at an enforcement mechanism (a semgrep rule, a unit
> test, an integrity probe), or is it a rule you would otherwise get wrong? If neither, it goes in `docs/`.
> Prose that is not enforced does not survive contact with a large context — it only dilutes the prose that is.

## Project Structure
- **Frontend**: React 18 + TypeScript + Vite + Shadcn/UI (`src/`)
- **Backend**: Python FastAPI (`mivaa-pdf-extractor/`) — **a separate git repo**, mounted as a submodule
- **Edge Functions**: Deno/TypeScript (`supabase/functions/`)
- **Database**: Supabase PostgreSQL 15 + pgvector 0.8.0
- **Design System**: `.claude/design-system.md` — full reference for all UI patterns, colors, components

## Workflow Rules
- **SQL / migrations**: ALWAYS apply via `mcp__supabase__apply_migration` (DDL) or `mcp__supabase__execute_sql`. NEVER create a local `supabase/migrations/*.sql` file. Run `mcp__supabase__get_advisors(security)` after any DDL.
- **MIVAA is a different repository** (`creativeghq/mivaa-pdf-extractor`, single-branch `main`). Backend changes get committed and pushed *there*, not here. Editing the submodule working copy without pushing to that repo ships nothing.
- **Git**: commit and push straight to `origin/main`. No feature branches. Pushed = done.
- **GitHub**: `gh` commands run without asking for permission. Repo: `creativeghq/material-kai-vision-platform`.
- **Before done**: `npm run typecheck && npm test`. Both must pass. `npm run typecheck` covers `src/` ONLY — `tsconfig.json` excludes `supabase/**`. Edge functions are checked by `npm run typecheck:edge` (`deno check`, gated in CI by `.github/workflows/edge-typecheck.yml`); run it when you touch one. It is baseline-relative — `.github/edge-typecheck-baseline.json` fails the build when a count rises, so ratchet the numbers down as you fix things rather than editing the baseline upward.
- **Codebase search**: Grep/Glob for known targets; Agent `subagent_type=Explore` for broad sweeps.
- **Plans and specs** go in a GitHub issue, never a file. `docs/` is for finalized reference only.

## Security Invariants (MUST follow — from pentest #250, 2026-07-05)
Hard rules. A change that violates one is a bug, not a style choice. Tracker: #250. Automated backstop:
`check_security_invariants()` RPC. The recurring root cause of the audit was "service-role client + trust a
body-supplied id" and "SECURITY DEFINER exposed to anon" — do not reintroduce either.

1. **Tenancy binding (BOLA).** Any edge function / route / RPC touching workspace-scoped data MUST derive `user_id`/`workspace_id` from the **verified JWT** and verify the caller owns the target object — `userCanAccessWorkspace(supabase, auth.userId, row.workspace_id)` (Deno, `_shared/auth.ts`) or `assert_workspace_member(workspace_id)` (SQL). NEVER trust `workspace_id`/`user_id`/`created_by` from the request body. Using the service-role client does NOT exempt you — it makes the manual check mandatory. Return 404 (not 403) on ownership mismatch to avoid id enumeration.
2. **SECURITY DEFINER functions.** Every one MUST `SET search_path = ''` (or `pg_catalog, public`) AND `REVOKE EXECUTE FROM anon, authenticated, PUBLIC` immediately after `CREATE`, then GRANT only to the roles that need it. Trigger-body functions (`RETURN trigger`) get NO execute grant. Only add `anon`/`authenticated` EXECUTE for a function genuinely called from a public page, and only after confirming it self-guards. Mutating finance/order RPCs are NEVER anon-executable.
3. **Tenant views.** Any view over workspace-scoped tables MUST be `security_invoker = on` so it inherits the underlying RLS. Never grant a view INSERT/UPDATE/DELETE.
4. **RLS.** Every new `public` table with tenant data gets RLS enabled + a workspace-scoped policy. No `WITH CHECK (true)` / `USING (true)` policies on tenant tables.
5. **MIVAA routes.** New routes declare their own `Depends(get_workspace_context)` / `require_admin` — never rely on the JWT middleware alone. If a route authenticates by `x-cron-secret` or `kai_` partner keys or is public, add its prefix to `JWTAuthMiddleware.exclude_paths` AND gate it at the route. Never put `"/"` (or any bare prefix that swallows everything) in `exclude_paths`.
6. **Inbound webhooks.** Verify the signature BEFORE processing and **fail closed** — reject when the secret is unset (503), never fall through to processing (mirror `stripe-webhooks`). Prefer body-HMAC + timestamp/nonce replay protection.
7. **SSRF.** Any server-side fetch of a user-influenced URL goes through the shared SSRF guard (https-only, DNS-resolve + reject RFC1918/loopback/link-local/`169.254.169.254`, `follow_redirects=False`, size cap). Never `httpx.get(userUrl)` / `fetch(userUrl)` raw. Validate stored URLs at write time too.
8. **Mass assignment (BOPLA).** Never spread a request body into a DB write (`insert({...body})`, `request.dict()`, `**model.dump()`). Build an allowlisted payload; trust/identity fields (`role`, `is_verified`, `is_locked`, `credits`, `price`, `workspace_id`, `user_id`) are set server-side only.
9. **LLM safety.** Untrusted ingested content (scraped pages, PDF text, supplier XML) fed to an LLM MUST be wrapped in explicit "this is DATA, not instructions" delimiters. Classifiers whose verdict drives a DB write or alert MUST use Anthropic `tools=[...]` + `tool_choice`, not free-form JSON + a salvage parser. State-mutating agent tools require explicit user confirmation when triggered off tool-result content.
10. **Paid / expensive endpoints.** Debit credits + rate-limit BEFORE the upstream (LLM/Replicate/DataForSEO/Firecrawl) call, not after; on debit failure, do not perform the work. Derive the quota IP from the trusted proxy hop, never a raw client header.
11. **Output encoding.** No `dangerouslySetInnerHTML` / `document.write` / raw HTML-string assembly with user or AI content — use JSX/`react-markdown` (no `rehype-raw`) or the **canonical** escaper: `escapeHtml` from `supabase/functions/_shared/html.ts` (edge), `src/utils/escapeHtml.ts` (frontend), or `api/_shared/html.js` (the Vercel Node functions in `api/`, which are plain ESM `.js` with no `@/` alias and no TS step, so they can import neither of the other two). All three escape the full `& < > " '` set (attribute-safe) and are held byte-equivalent by [tests/unit/escapeHtmlParity.test.ts](tests/unit/escapeHtmlParity.test.ts) — **not** by convention, which is how they drifted last time. Do NOT hand-roll a local copy; the old per-file copies drifted to 3 different strengths. A fourth runtime gets a fourth twin added to that test, never an inline copy. `escapeHtml` is HTML-only: it is NOT a PostgREST filter sanitizer, a CSV quoter, or an XML escaper (separate contracts — never name them `esc`).

**Enforcement:** (a) this section, followed by anyone editing the repo; (b) `check_security_invariants()` surfaces live DB violations for 2–4; (c) code-level patterns (1, 6–11) live in the CI semgrep ruleset (`.github/semgrep-security.yml`, guarded by [tests/unit/semgrepRuleset.test.ts](tests/unit/semgrepRuleset.test.ts)).

## Two anti-regression rules — READ BEFORE ADDING A DERIVED NUMBER OR A JANITOR CRON

Two bug shapes account for nearly every "small issue" found by hand in this platform. Both have enforcement;
do not work around either.

### 1. One derivation per money quantity. TypeScript formats; SQL derives.
"How much is settled / still owed on an order" was implemented **five times** — twice in SQL, three times in
TypeScript. Four applied the rule correctly (a **sales** order settles on money **IN**; a **purchase** order on
money **OUT**; the opposite direction is the other side of the trade and must never reduce what the counterparty
owes); one netted the directions, so a fully-paid sales order showed `Payment: Paid` next to an outstanding
balance that was actually the supplier's. The stored data was flawless, so no integrity check could see it; a
wrong number is a valid `number`, so no typecheck could either.

- **`get_order_settlements(uuid[])` is the single source.** It returns the DERIVED answer — `settled`, `outstanding`, and the `payment_status` the ledger implies. `recompute_order_payment_status`, `dic_detect__finance_order_over_settled` and `finance.order_payment_status_drift` all read it. Client code calls `ordersService.orderBalances()` and formats the result.
- **Never** re-pick a half by order type, re-compute `total − settled`, or hand-roll an allocation-by-direction query in the frontend. [tests/unit/moneyDerivation.test.ts](tests/unit/moneyDerivation.test.ts) fails the build if you do (verified against all 5 historical offenders).
- Applying this to a NEW money quantity: derive it in SQL, return it derived, and add a drift check comparing any cached copy against the derivation.

### 2. Silent zero — check the world, not the exit code.
The dominant historical failure here is **a number that should be non-zero sitting at zero forever while nothing
complains**: `stamp_job_refresh_cost` referencing a column that did not exist (billing stuck at 0, exception
swallowed); an endpoint 404-ing on 100% of calls for months; the Stripe webhook failing 100% since it shipped;
`generate-pbr-maps` deleted so `metadata.pbr_maps` is never written.

- **`ops.silent_zero`** probes: activity happened in the window and the metric it should have produced is zero across the board; plus endpoints and cron jobs with a **<5%** success rate (not 0% — real breakage is near-total, and an exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5%).
- **`ops.test_artifacts_accumulating`** watches the reaper's OUTPUT, not its exit code. **When you add a janitor cron, add a probe on the mess it is supposed to clear.**
- **`ops.integrity_registry_broken`** validates the registry itself: `run_data_integrity_checks` calls `detect_fn()` / `heal_fn()` with **no arguments** and expects heal to return `integer`. A wrong signature aborts the whole nightly sweep, which then reports nothing at all.
- Probes are **hardcoded in the detect function on purpose** — admin-editable SQL run by a SECURITY DEFINER function would be a privilege-escalation surface. Adding a probe is a migration.

## Data layering — the pipeline is Medallion; name the layers

**Every cache/pipeline bug we have hit has been a layer violation.**

| Layer | Tables / stores | Rule |
|---|---|---|
| **Bronze** (raw, immutable) | `pdf-documents` raw PDFs, `document_layout_analysis` | Never mutated. Re-run only when the source file changes. |
| **Silver** (clean, conformed) | `document_chunks`, `document_images` (+ OCR / `vision_analysis`), `products.attributes_raw` | Derived from bronze. Rebuildable without re-uploading. |
| **Gold** (business-ready) | `products`, `vecs.image_*_embeddings`, `products.attributes`, `facet_canonical_values`, `product_edges` | Derived from silver. Rebuildable without re-running OCR. |

**The rule: never re-derive from bronze what silver already holds; rebuild gold from silver.** A new consumer
that reaches past silver back to the PDF is a bug. Monitoring follows the same ladder: raw discovery hits →
classified/deduped history → the denormalized `current_*` cache on the subject row (a gold serving layer).

**Do NOT build analytics rollup tables yet.** Measured 2026-07-20: `ai_usage_logs` is 4,120 rows / $5.98 lifetime
— a rollup would be slower than the scan and pure maintenance overhead. Revisit only when it passes ~5M rows or
a cost-dashboard query exceeds ~500 ms. Same test before adding one for any other telemetry table.

## Pipeline conventions
1. **Explicit failure markers, not empty returns** — e.g. `OCRResult.method='paddleocr_failed'`. Consumers check the marker; emptiness alone is ambiguous.
2. **`cache_status` on every persisted-result row** — distinguish "ran clean and found nothing" from "ran but failed and should be retried".
3. **Atomic two-phase writes via SQL RPC** — `update_checkpoint_and_append_history` is the pattern. No two-call patterns that can crash mid-way.
4. **Per-attempt metrics in dedicated tables** — apply anywhere you have a retry loop.
5. **`current_slow_operation` for legitimate long stages** — set it before the slow op so auto-recovery does not false-positive. Stack-based: `set_slow_operation(...)` pushes, `clear_slow_operation(...)` pops.
6. **Per-product cost attribution** — every `ai_usage_logs` insert that knows the product/image sets those FKs.
7. **Never persist `file_url` on private buckets** — store `storage_bucket` + `storage_object_path`, mint signed URLs on read. Persisted URLs expire; re-deriving is free.
8. **JWT auth on every job-spawning route** — `workspace_id` form fields are reconciled against the JWT; mismatch returns 403. The cron path uses `x-cron-secret`.
9. **Explicit `stage_history` boundary events on every stage** — `in_progress` at start + `completed`/`failed` at end. The audit log must show why a job ended.
10. **No SDK clients for AI providers — standardize on httpx.** The `anthropic` SDK was removed 2026-05-23 (pin-trap broke the `tools` kwarg). New code calls `tracked_claude_call_async` for auto-logging.
11. **`chunk_type_status ∈ {pending, classified, failed}`** — distinguishes "the classifier returned 'unclassified' as a valid verdict" from "the classifier crashed mid-batch".

## Flows — notifications & automation (READ BEFORE adding any notification/email/automation)
**Never hardcode a `user_notifications` insert or an `email-api` call in new code.** Emit an event —
`flowEventService.emit(type, data)` (frontend) or `emitFlowEvent(type, data)` from `_shared/flow-events.ts`
(edge) — carrying the full payload (`user_id`, `title`, `body`, `action_url`, `type`). A seeded **active**
default flow (tag `system-default`, `is_locked=true`) delivers it, so admins can pause/edit/retarget without a
deploy. Adding a trigger: follow §8 of [docs/flows-notification-system.md](docs/flows-notification-system.md) —
`TriggerType` union + config interface + the exhaustive icon/label maps + a `paletteItems.ts` entry + a seeded
locked default flow + a `flow_area_registry` row. Typecheck before done.

## Agent tools — the two-copy rule
A tool registered on an agent but absent from **`SERVER_TOOLKITS`** is silently stripped and unreachable.
Adding a tool requires updating `SERVER_TOOLKITS` **and** the client `TOOLKITS` catalog — two copies that must
stay in sync (guarded by [tests/unit/toolkitCoverage.test.ts](tests/unit/toolkitCoverage.test.ts)).
Every new tool's `onChunk` type MUST be registered in `AGENT_RESULT_TITLES` in `AgentHub.tsx`, or the output is
silently dropped.

## Templates — one table, one registry, an allowlist per type
"Reusable starting point for a record" is **one** system (`entity_templates`, issue #322), not a table per
entity. Adding a type = an adapter in `src/services/templates/` + a value in the CHECK constraint
`entity_templates_entity_type_check` — two copies, guarded by
[tests/unit/templateRegistry.test.ts](tests/unit/templateRegistry.test.ts). Do NOT add a `<thing>_templates` table.
- **`captureFields` is an allowlist and the guard test reads it.** Never capture ids, `status`, `*_token`, `fiscal_*`, `legal_number`, or a derived total (`total`, `vat_amount`, `amount_paid`) — a cloned MARK is a fake legal document, a cloned share token hands a stranger the new record, and a stored total is a second derivation of a money quantity.
- **`apply()` builds an explicit object literal.** A payload is stored jsonb = untrusted input; `.insert({...payload})` is mass assignment (invariant 8, semgrep `no-mass-assignment-from-stored-payload`). Narrow every enum value through `oneOf` in `templates/coerce.ts` — a value a CHECK rejects fails *partway* through and leaves half a record.
- **Money documents return `{kind:'prefill'}`, never `{kind:'created'}`** — same reason `ordersService.reorderPrefill` returns a prefill: an invoice conjured behind the operator skips numbering, buyer-risk and myDATA classification.
- The existing per-feature template systems (email, messaging, catalog design, PDF, XML mappings, blueprints) stay where they are; the hub link-outs to them live in `EXTERNAL_TEMPLATE_SOURCES`.

## Workspace roles — the vocabulary lives in four places at once
`src/auth/workspaceRoles.ts` is the catalog (label + portal + description + module gate). A role must ALSO exist
in `workspace_members_role_check`, `workspace_invites_role_check`, and the allowlists inside
`create_workspace_invite` / `set_workspace_member_role`, plus get a `resolvePersona` branch. Skip one and it
fails silently in a specific way: `sales`, `realestate_agent` and `employee` were invitable but not *storable*
until 2026-07-30, so `redeem_workspace_invite` threw a CHECK violation on every one of those invites; a role
with no `resolvePersona` branch instead falls through to `staff` and hands out finance/CRM/warehouse access.
Guarded by [tests/unit/workspaceRoles.test.ts](tests/unit/workspaceRoles.test.ts).
**Functional roles are WORKSPACE roles, never account tiers.** `public.roles` (`/admin/crm` → Users) is the
global account tier — supplier/architect/admin — and a value there is true in EVERY workspace the user belongs
to. "Runs HR", "warehouse team", "sales manager" are per-workspace facts: they live only in
`workspace_members.role`, assigned from Profile → Team. Five were briefly added to `roles` and withdrawn
(2026-07-31); the guard test now fails if any reappears.
**Every business function gets a role; none of them gets workspace administration.** `sales`/`sales_manager`,
`hr`/`hr_manager`, `warehouse`, `marketing`, `accountant`, `realestate_agent`. Each persona holds ONLY its own
module capability + `agent.use` — never `platform.admin`/`network.manage`/`pricing.manage`/`catalog.import`
(pinned by the test). Before these existed the only way to let someone run HR was making them an `admin`, which
handed over finance, pricing and the team. A role whose portal is a paid module MUST set `requiresModule`, and
that slug MUST be in `ROLE_MODULE_SLUGS` or the invite form has no `useModule` call and offers it regardless.
**Who someone *is* is never re-typed by hand.** "Who is an employee / a sales manager" is answered by
`workspace_members.role` (access role → portal) and `hr_employees` (the HR roster); the `/admin/crm?tab=categories`
lists of kind `role` / `employment` are DERIVED from those by `crm_resync_auto_category_members`. Never create a
`manual` category that restates one of them.

## Embeddings & VECS — footguns
**VECS is the single source of truth for image embeddings.** All vectors are halfvec.

| Producer key | VECS collection | Dim |
|---|---|---|
| `visual_768` | `image_slig_embeddings` | 768 (SigLIP2 via SLIG on Modal) |
| `color_aspect_1024` | `image_color_embeddings` | 1024 (Voyage) |
| `texture_aspect_1024` | `image_texture_embeddings` | 1024 |
| `style_aspect_1024` | `image_style_embeddings` | 1024 |
| `material_aspect_1024` | `image_material_embeddings` | 1024 |
| `understanding_1024` | `image_understanding_embeddings` | 1024 (Voyage from Claude `vision_analysis`) |

- **Never use `*_siglip_1152`, `*_clip_512`, or the legacy `*_slig_768` aspect keys** — removed; no consumer accepts them.
- **Boolean presence flags on `document_images`** (`has_slig_embedding`, `has_understanding_embedding`, `has_*_slig`) are the canonical O(1) "does this image have embedding X?" check. Do not round-trip to VECS.
- **Dropped columns — do NOT reference:** `document_images.{visual_clip_embedding_512, color_embedding_256, texture_embedding_256, application_embedding_512, multimodal_fusion_embedding_2688}`; `products.{embedding, *_clip_embedding_512, multimodal_fusion_embedding_2048}`; `document_vectors.visual_clip_embedding_512`.
- **Products** carry only `text_embedding_1024`; visual product embeddings derive from associated images via `image_product_associations`.
- Drop indexes BEFORE altering a vector column type, then recreate with `halfvec_cosine_ops`.

## Vision is Anthropic-only
There is no third-party vision model in this platform and none should be added casually. Segmentation,
classification, `vision_analysis`, and material analysis all run on Claude. The ingestion path uses **real
Anthropic tool_use** (`tools=[VISION_ANALYSIS_TOOL]` + forced `tool_choice`) — no regex repair, no JSON-parse
fallback. `document_images.vision_provider` is CHECK-constrained to `claude` | `claude_fallback`;
`SKIPPED`/`FAILED` are in-memory-only enum members and must never be persisted. The Voyage→OpenAI fallback is
**disabled** for the understanding path so the two never co-exist in one VECS collection.

## Storage — routing rule
6 buckets; routing is path-based and feature identity lives in the **top-level folder**, not the bucket name.
`pdf-documents` and `quote-templates` are private (signed URLs, re-signed on every read); `pdf-tiles`,
`generation-images`, `moodboard-sheet-references`, `profile-avatars` are public-read with service-role writes.
**Entity-delete cleanup is GC-based, not trigger-based** — deleting a row drops the file out of
`build_storage_reference_set()` and `storage-orphan-cleanup-cron` reaps it. If you add a table holding a storage
path, add it to `build_storage_reference_set()` or the cron will delete live files.
Full bucket/folder map: [docs/storage-buckets.md](docs/storage-buckets.md).

## Secrets — env first, DB second
`_shared/secrets.ts → resolveSecret(supabase, key)` (Deno) and `platform_secret_resolver.py` (Python) resolve
`os.getenv(key)` > `platform_secrets.value` > `default_value` > missing. Env always wins because it represents an
explicit deployer choice; the DB store lets admins configure keys without a redeploy. Call the resolver rather
than `Deno.env.get()` directly. **Never capture env at module load** (`const X = Deno.env.get('Y')`) — the
bootstrap populates env at handler entry, so a module-load capture reads `undefined`. Use a lazy getter.
Per-workspace BYOK (AADE, Resend, myDATA) lives in per-workspace tables surfaced at **Profile → Keys**;
a tenant NEVER falls back to the operator's master credentials.

## Edge function observability
Every edge function is wrapped with `withApiLogging('<fn-name>', handler)` from `_shared/api-logger.ts` — the
single chokepoint for request logging (`api_usage_logs`) AND Sentry capture.
- **Do NOT call `captureException` yourself for top-level request failures** — the wrapper reports them. 4xx are intentionally never reported (client errors, not bugs).
- For correct status codes on validation/auth failures, `throw new HttpError(400, 'msg')` — the wrapper returns that status AND skips Sentry.
- **New functions**: wrap the `Deno.serve(...)` handler with `withApiLogging`. That is all; logging + Sentry come for free.
- Deep/background captures (errors swallowed mid-pipeline that never reach the wrapper) still call `captureException` directly from `_shared/sentry.ts`.

## Telemetry retention
Log tables are bronze and need a TTL enforced in SQL — never assume the writer is well-behaved. `system_logs`
(INFO 7d / WARNING+ 30d), `api_usage_logs` (90d), `cron.job_run_details` (succeeded 7d / failed 30d — pg_cron
never prunes its own run log). `ai_usage_logs` / `credit_transactions` have **no** TTL by design (billing).

**Distinguish the two failure modes before reaching for a fix:** unbounded *rows* need a retention cron;
unbounded *disk against few rows* is bloat and needs `VACUUM FULL` / `REINDEX CONCURRENTLY` (prefer the latter
on hot tables — no exclusive lock). A retention cron does nothing for bloat, and vacuuming does nothing for a
table with no TTL.

**The DB log sink is filtered at the source.** `SupabaseLoggingHandler` is attached to the **root** logger, so
without a denylist every third-party library logging at INFO writes a Postgres row. `_is_noise()` drops
sub-WARNING records from `_DEFAULT_DENY_PREFIXES`; **WARNING and above is never dropped, from any logger.**
Tunable via env `SUPABASE_LOG_DENY_PREFIXES` without a deploy. **If you add a chatty INFO logger, add its
prefix — do not widen retention.**

## Design System Summary
Full reference: `.claude/design-system.md`.
- **Dark** = plum-black command center (`--background: 258 22% 5%`), flat **magenta** primary (`--primary: 335 74% 60%`). **Light** = warm olive/cream (`--background: 42 27% 93%`), muted **khaki-olive** primary, terracotta destructive.
- **Headings** use **Bricolage Grotesque** (`font-display`); Open Sans for body/UI.
- **The brand gradient is reserved for IDENTITY surfaces** (PageHeader, logo, hero). Primary fills are flat accent — the old global "`bg-primary` → brand-gradient" rule was removed.
- **Glass cards**: use the `.dashboard-card` class. Never recreate inline.
- **Buttons** are pill-shaped (`rounded-full`). **NEVER add `rounded-full` to a TabsTrigger** — that is Buttons only.
- **Tables**: `<CardContent className="p-0">`, no wrapper div, no fixed column widths. Status/type render as **plain colored words, never a Badge/pill with a colored background**.
- **A table in a Card gets its title + subtitle + actions inside a `CardHeader`** — never a bare heading above a header-less Card.
- **English is the default for all UI and documents.** Never default a language field to `'el'`.

## Where the rest lives

| Topic | Doc |
|---|---|
| PDF pipeline (PaddleOCR-VL, stages, OCR) | [docs/pdf-processing-pipeline.md](docs/pdf-processing-pipeline.md) |
| Agents, tools, JARVIS roster | [docs/agent-system.md](docs/agent-system.md), [docs/agent-and-tools-reference.md](docs/agent-and-tools-reference.md) |
| Background agents framework | [docs/background-agents.md](docs/background-agents.md) |
| Job tracking / `background_jobs` | [docs/unified-job-tracking.md](docs/unified-job-tracking.md), [docs/job-queue-system.md](docs/job-queue-system.md) |
| Price monitoring (+ version history) | [docs/price-monitoring-system.md](docs/price-monitoring-system.md) |
| Mention monitoring | [docs/mention-monitoring-system.md](docs/mention-monitoring-system.md) |
| Job research | [docs/job-research-system.md](docs/job-research-system.md) |
| Storage buckets & cleanup | [docs/storage-buckets.md](docs/storage-buckets.md) |
| Flows / notifications | [docs/flows-notification-system.md](docs/flows-notification-system.md) |
| Secrets & per-workspace BYOK | [docs/platform-secrets.md](docs/platform-secrets.md), [docs/per-workspace-byok.md](docs/per-workspace-byok.md) |
| Units of measure / quantity pricing | [docs/units-and-quantity-pricing.md](docs/units-and-quantity-pricing.md) |
| Customs / TARIC codes | [docs/taric-customs-classification.md](docs/taric-customs-classification.md) |
| Finance / orders / quotes | [docs/finance-system.md](docs/finance-system.md), [docs/orders-system.md](docs/orders-system.md), [docs/quotes-system-architecture.md](docs/quotes-system-architecture.md) |
| Bank feed & reconciliation (Revolut Business) | [docs/banking-revolut.md](docs/banking-revolut.md) — the feed is **per-leg**: match a row in isolation and an internal pocket move settles a customer invoice |
| CRM / HR / Projects / Real estate | [docs/crm-system.md](docs/crm-system.md), [docs/hr-system.md](docs/hr-system.md), [docs/projects.md](docs/projects.md), [docs/real-estate-system.md](docs/real-estate-system.md) |
| Knowledge base | [docs/knowledge-base-implementation.md](docs/knowledge-base-implementation.md) |
| XML import | [docs/xml-import-orchestrator.md](docs/xml-import-orchestrator.md) |
| Moodboard sheets & client views | [docs/moodboard-presentation-sheets.md](docs/moodboard-presentation-sheets.md) |
| Data integrity framework | [docs/data-integrity-framework.md](docs/data-integrity-framework.md) |
| Tenancy & capabilities | [docs/capabilities-and-tenancy.md](docs/capabilities-and-tenancy.md), [docs/role-access-matrix.md](docs/role-access-matrix.md) |
| Re-running the platform audit | **GitHub issue #314** — method, the 9 defect shapes, and the traps that produced wrong numbers. Kept as an issue, not a file: it is a plan, and the file version had already drifted to citing a path it no longer lived at |
| Which defect classes have a guard, and when it was last watched to fire | [docs/prevention-coverage.md](docs/prevention-coverage.md) |
| Everything else | [docs/INDEX.md](docs/INDEX.md) |
