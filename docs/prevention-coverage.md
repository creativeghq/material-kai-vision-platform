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
| MIVAA's 23 guard tests | all green, all well-named, several genuinely well-scoped | **scope narrower than their names.** The SSRF gate declared ONE file; `test_paid_route_metering` 3 doors in 2 files; `test_no_silent_degradation` 5 subtrees. Every finding across #14 and #15 landed in the difference. The one guard using a full-tree walk covers the class with the least evidence of defects |
| outbound email | no alert of any kind | `default_from_email` sat on a domain Resend had dropped; **136 sends, 1 delivered** over three days in July and nobody was told. There was no guard at all — the gap was not a broken check, it was a missing one |
| `OrderLinkPicker` call-site guard | a real rule, correctly failing a real bug class, with two call sites passing it | **judged each mount by searching its file for the kind.** A same-shaped helper in the same file answered on the handler's behalf: `linkToColumns` was broken on purpose to watch the guard fire and it did not, because `linkKey` — same `switch (v.kind)`, same `case 'trip':` — satisfied the search. Also: its call sites were a hand-written array, so a new mount was exempt by not being typed into a constant. Found 2026-08-21 by breaking it; the mounts are now discovered, and exhaustiveness is proven by CALLING the mapping ([tests/unit/billLink.test.ts](../tests/unit/billLink.test.ts)) |

The pattern is identical every time: **a guard that reports nothing is indistinguishable from a
clean codebase.** So "green" is not the question. "When did we last watch it fail on purpose?" is.

> **The rule this table exists to enforce:** a guard you have never watched fail is not a guard.
> Before trusting a new check, feed it the defect it was written for and confirm it fires. Two of
> the rules in the table above were caught that way in a single afternoon; neither was visible in
> a passing run.

---

## The defect shapes

Derived from the #293/#294 audit and the incident history in CLAUDE.md.

### 1. Side mismatch — money applied to the wrong side of a trade
A sales order settles on money **IN**, a purchase order on money **OUT**. One of five implementations
netted the two directions, so a fully-paid sales order displayed `Paid` beside an outstanding balance
that was really the supplier's.

- **Guarded by:** `get_order_settlements(uuid[])` as the single derivation + [tests/unit/moneyDerivation.test.ts](../tests/unit/moneyDerivation.test.ts)
- **Proven to fire:** 2026-08-01 — the test was verified against all five historical offenders, and its widened regex caught a live re-introduction at `OrdersPanel.tsx:1685` (`total − settled` recomputed in the frontend).
- **Blind spot:** derivation drift in SQL. The test reads TypeScript only.

**The same shape, off the money path (2026-08-10, #267):** "what relates to this product" had two
derivations. Search enrichment, agent tools and the admin backfill read the gold-layer `product_edges`
(derived once by `rebuild_product_edges`); the product-detail *Related* tab called
`find_similar_products` / `find_complementary_products`, which re-derived it live per query from a
different signal mix — and scored same-name variants with `random()`, then fell through to "most
recently added products" at 0.50 when nothing matched. Both RPCs are dropped;
`get_related_products` is the only read path.

- **Guarded by:** [tests/unit/productRelationDerivation.test.ts](../tests/unit/productRelationDerivation.test.ts)
- **Proven to fire:** 2026-08-10 — a planted `src/services/__guardProbe.ts` naming a dropped RPC failed 2 of the 5 assertions before being removed.
- **Blind spot:** same as above — TypeScript only. A new SQL function that re-derives relationships is invisible to it.

### 2. Two doors — same data, one door checks and the other doesn't
`buildClientViewPdf` called `fetchSheets`/`fetchProductChips`/`fetchQuoteFfeItems` with no scope
argument while the sibling sheet path passed all three scopes. `catalog-translate-pdf` fetched a
source PDF by body-supplied id on the service-role client while **two** sibling doors for the same
action checked ownership.

- **Guarded by:** [scripts/check-tenancy-parity.mjs](../scripts/check-tenancy-parity.mjs) (`npm run lint:tenancy`) + [tests/unit/tenancyParity.test.ts](../tests/unit/tenancyParity.test.ts)
- **Proven to fire:** 2026-08-01 — the script's built-in self-test feeds it #294 S1 *as originally written* and the correct sibling door, asserting it flags one and ignores the other. It runs on **every** invocation, before the scan, so a broken detector can never report a clean codebase.
- **Current state:** 0 findings, baseline 0.
- **Blind spot:** resolved per file+table, so a file that checks ownership on one path to a table and forgets it on a second path is not reported. Also: a site that fetches `workspace_id` and never compares it reads as fetch-then-verify.

**The same shape on the METER instead of the guard (2026-08-10):** `svc.refresh()` in job-research
spends real money — DataForSEO SERP, Perplexity Sonar, Firecrawl scrapes, Haiku classification —
and had three doors. The partner API-key route debited 5 credits up front; `/cron-refresh` charged
per subject via `charge_cron`; `POST /track/{id}/refresh`, **the one the app's Refresh button
calls**, debited nothing. The cheapest way to spend the operator's upstream budget was to press the
button instead of calling the API that charges for it. Neither the tenancy-parity script (it looks
for ownership checks, not meters) nor `ops.silent_zero` could see it — its `ai_spend_never_debited`
probe reads `ai_usage_logs.credits_debited`, and job-research charges through
`credit_transactions`, so a module that meters perfectly and one that does not meter at all are
indistinguishable from there.

- **Guarded by:** [test_paid_route_metering.py](../mivaa-pdf-extractor/tests/unit/test_paid_route_metering.py) — every door onto `svc.refresh()` must call its metering function, and must call it BEFORE the refresh (invariant 10). It also pins that the debit is not wrapped in `if user_id and not debit(...)`, the partner route's form, which reads as metering and behaves as a free pass whenever the identity is missing.
- **Proven to fire:** 2026-08-10 — the debit was deleted from the session door and 1 of 6 assertions failed; the file was restored byte-identical.
- **Blind spot:** source-level, so it pins the shape of the three doors it knows about. A *fourth* caller of `svc.refresh()` is only caught because the test enumerates doors by decorator — add one and you must add it to `PAID_REFRESH_DOORS`, which nothing forces.

**And the same shape on the edge side, found by #365 `AD-13` (2026-08-16):** ~50 SEO agent tools
reach DataForSEO through MIVAA on the operator's `x-cron-secret`, and **no layer debited anybody**.
Four audits looked for the meter and each concluded it must be somewhere else — #352 `A18` at the
tool wrappers, #361 `EG-4` in `seo-api`, the MIVAA route review, `AD-13` in the raw client. It was
nowhere: `dataforseo` had no row in `ai_model_pricing` at all, so there was no price to charge,
while `seo_site_crawl_start` accepted `max_pages` up to 1000. The "Audit now" button on the SEO
dashboard was free for the same reason the hourly cron behind it was not — the cron branch charged
`seo-toolkit-audit`, the manual branch checked entitlement and stopped there. Entitlement answers
"may this workspace use the module", never "has it paid for this run".

- **Guarded by:** [tests/unit/dataforseoSpendGate.test.ts](../tests/unit/dataforseoSpendGate.test.ts) — every dispatcher in `_shared/tools/seo-agent-tools.ts` that fetches the SEO gateway must open a spend gate BEFORE the fetch, read its answer, and settle on both the success and the failure path. It also pins the $0.001 billing unit against the `dataforseo-request` pricing row (the two are one constant expressed twice), that no ceiling is 0, and that a response reporting no cost keeps its reserve rather than settling to free.
- **Proven to fire:** 2026-08-16 — the gate was deleted from `callDataForSEO` and 2 of 8 assertions failed; the file was restored byte-identical.
- **Blind spot:** it enumerates dispatchers by "top-level `async function` containing `await fetch(`", so a paid call made from inside a *tool body* rather than a dispatcher is invisible to it. MIVAA is a separate repo and empty in CI, so nothing here says what `/seo-agent/*` does once the request lands.

### 3. Dead input — a control that changes nothing
Lists and toggles that never reach the engine; a tool registered on an agent but absent from every
toolkit cluster is stripped and unreachable.

- **Guarded by:** [tests/unit/toolkitCoverage.test.ts](../tests/unit/toolkitCoverage.test.ts) (coverage, reachability, options, and — since the two-copy rule became a generated projection, #266 Phase 3.5 — projection freshness plus a check that no second cluster map has reappeared), `AGENT_RESULT_TITLES` registration, and — for the API half — [test_no_unread_request_fields.py](../mivaa-pdf-extractor/tests/unit/test_no_unread_request_fields.py), which fails the build on any `*Request` field no code reads.
- **Proven to fire:** 2026-08-09, all three new mechanisms mutation-tested by stashing the fix and confirming the failure (4 of 7, 3 of 9, and 6 of 14 assertions failed as intended).
- **Blind spot:** still large for UI-level controls generally. Two surfaces are now swept rather than trusted — agent toolkits (`toolkitCoverage`) and `inbox-api` (`inboxApiReachability`) — and the pattern generalizes to any action-router edge function, but nothing sweeps the rest yet.
- **Worked example, 2026-08-09 (#277/#338):** the Search page offered Color/Texture/Style/Material modes that were **not differentiated at the backend at all** — every one returned the same fused result. Fixing that surfaced the same shape four more times. `visual_search` sent `aspect` to `strategy=image`, a branch that never reads it: Pydantic validated the field, the branch dropped it, and every "find a similar texture to this image" returned plain visual similarity. A sweep of all 132 `*Request` models then found **ten** fields accepted and never read, two of them harmful — `include_content` was sent by the frontend on *every* search and read nowhere, and `enable_embedding` defaulted true and unread, so passing `false` billed the caller for embeddings they had declined. Six belonged to models **no route referenced at all** and were deleted; the rest are honored. `KNOWN_UNREAD` is now empty and asserted `== 0` — a floor, not a ceiling.
- **The detector's own blind spot, worth stating because it produced two false positives:** it reasons about NAMES, and `request.dict()` / `.model_dump()` reads every field without naming one. `CreateCategoryRequest.icon` and `.parent_category_id` were reported dead while working perfectly — stored via a mass assignment that was itself an invariant-8 bug (`kb_categories` carries server-owned `is_locked` and `material_category_id`, so the spread was one same-named model field away from letting a request body set either). The false positive was worth more than the defect it wasn't. `_models_consumed_wholesale()` now recognizes the pattern.
- **Worked example of that blind spot, 2026-08-08 (#234):** "Custom Monitoring" let a user paste a retailer URL to watch. `add_url_only()` stored it in `tracked_queries.pinned_url` and **no backend code ever read the column** — the only reader in the repo was a React component using it as a label. `refresh()` had no `mode` branch, so the row ran the full Perplexity + DataForSEO + Haiku discovery pass keyed on the product *name*, re-billed every 24h by the cron, while the pinned page went unfetched. The saved setting nothing reads, exactly as described above, and it survived three months because every observable signal was healthy: the row refreshed, prices appeared, the cron reported success. They were prices for other pages. Now guarded by [tests/unit/test_url_only_is_firecrawl_only.py](../mivaa-pdf-extractor/tests/unit/test_url_only_is_firecrawl_only.py), which asserts the mode branch sits *before* `search_prices()` — a branch placed after reads as correct and still pays for the pass. **Proven to fire:** 2026-08-08, mutation-tested against both original shapes (branch moved after the discovery call; `mode` filter dropped from `find_for_product`), 2 of 5 assertions failed as intended. Note what made this findable at all: the column was the evidence. A dead *input* leaves a written-but-unread field behind, which is greppable; a dead *control* that was never persisted leaves nothing.

- **Worked example, 2026-08-15 — the secret that saved and was never read (Sentry KAI-RD/KAI-RC).** `/admin/modules/messaging/settings → Keys` offered a `ZERNIO_API_KEY` field. It saved to `platform_secrets` correctly. Nothing read it. Every Zernio consumer resolved the key as `Deno.env.get('ZERNIO_API_KEY')`, in **four** hand-rolled copies (`_shared/zernio.ts`, `zernio-webhook-handler`, and both social-media sync agents), and `platform_secrets` reaches `Deno.env` only through `_shared/secrets-bootstrap.ts` — which is a **documented no-op on the Supabase edge runtime**, where `Deno.env.set` throws "The operation is not supported". So the 503 the admin got told them to go and set the value in the one place that could not take effect, and the loop closed: paste, save, 503, paste again.
  - **What made it invisible:** every observable signal was *correct*. The row saved. The settings page re-rendered the saved value. The 503 was a clean, deliberate, well-worded not-configured response — not a crash, not a swallowed exception, and 5xx-with-a-code is exactly what a healthy guard looks like. The failure was in the **link between two working halves**, which is the part no single-component check inspects.
  - **The severe half was silent, not loud.** `zernio-webhook-handler` read the webhook secret the same way and fails its HMAC check **closed** (correctly — invariant 6). With the secret DB-only, every inbound WhatsApp reply was rejected `401` at the door. Rejecting is the right behaviour for a bad signature and indistinguishable from it here, so the inbox simply stayed empty and no error was raised on our side at all.
  - **Generalization: env-first/DB-second is a two-step contract, and the second step is the one that silently no-ops.** Any `Deno.env.get('<ADMIN_CONFIGURABLE_KEY>')` on the edge is this bug. The admin UI half is the *evidence* — if a key is editable in `platform_secrets` and read anywhere via `Deno.env`, it is already broken; look for the resolver, not for a stack trace.
  - **Guarded by:** [tests/unit/zernioSecretResolution.test.ts](../tests/unit/zernioSecretResolution.test.ts) — no file outside the canonical resolver may name a Zernio key in `Deno.env.get`, the resolver must route every key through `resolveSecret`, and every consumer of `zernioKey()`/`zernioApi()`/`zernioWebhookSecret()` must `await ensureZernioSecrets()` first (the third case is what catches a *new* function reintroducing env-only reads without copying a getter).
  - **Proven to fire:** 2026-08-15 — the fix was reverted in `social-insights-sync-agent.ts` (getter restored, `ensureZernioSecrets` call removed) and 2 of 6 assertions failed, naming the file and both keys. Restored byte-identical afterwards.
  - **Blind spot:** the guard is Zernio-specific by name. The same shape is live for any other admin-editable secret read through `Deno.env` on the edge, and nothing sweeps for that generally yet — see Known gaps.

- **Worked example, 2026-08-20 (#342) — the handler with no screen.** Order intake shipped with six `inbox-api` actions. Two of them, `update_intake_items` and `search_intake_products`, were complete: routed, workspace-guarded, re-resolving each repointed line's price server-side, typed client wrappers and all. Nothing called them. The rail offered assign-customer and approve/dismiss, so a reviewer looking at a five-line intake with one wrong line could accept the model's whole reading or throw all five away — and the two actions built to fix exactly that were unreachable from every screen. Nothing failed: the router routed, the wrappers typechecked, the suite was green. It is shape 3's UI-level half, and it survived ten days in exactly the state the previous comment described as shipped.
  - **A `case` is not a caller, and a typed wrapper is not a surface.** This is the same thing `toolkitCoverage` enforces on the agent side (a tool in no cluster is stripped; a factory nothing instantiates is unreachable however good the picker looks) — the difference is only that an edge action fails by doing nothing rather than by being stripped.
  - **Guarded by:** [tests/unit/inboxApiReachability.test.ts](../tests/unit/inboxApiReachability.test.ts) — every `case '<action>'` in `inbox-api` must have a real caller in `src/`, counting either a direct action literal (which is how `marketplaceService` invokes two of them) or a client wrapper method that something actually calls. Comments are stripped first: `inbox-api` *discusses* `remove_participant` in a comment about AI takeover, and a guard that accepts prose as a call site would have reported the file green while the two intake actions sat unreachable. `NO_CALLER_EXPECTED` holds exactly two entries, each with its reason, and a third assertion fails if an entry ever gains a caller — so the list can only shrink.
  - **Proven to fire:** 2026-08-20 — the two calls were renamed in `InboxPage.tsx` and the payload's `unit_price` guard removed; 3 of 5 assertions failed, naming both actions and the offending line. Restored byte-identical.
  - **It found two more on introduction**, both recorded rather than hidden: `mark_read` is redundant (`get_thread` already stamps `last_read_at` on open) and `remove_participant` has no affordance in the rail at all — participants can be added and never removed.
  - **The second assertion is about provenance, not reachability.** Sending `unit_price` back is exactly what stamps `unit_price_source='manual'`, and a manual line stops re-pricing when the customer is assigned — which is the one thing assigning a customer does. So an editor that echoes the resolver's own price into its payload silently freezes every line, and the frozen number is a perfectly valid number: shape 5 wearing shape 3's clothes, invisible to typecheck and to every integrity probe.

### 4. Ambiguous zero — a number that should be non-zero, sitting at zero, silently
`stamp_job_refresh_cost` referenced a column that did not exist, so billing sat at 0 with the
exception swallowed. An endpoint 404'd on 100% of calls for months. The Stripe webhook failed 100%
from the day it shipped.

- **Guarded by:** `ops.silent_zero`, `ops.test_artifacts_accumulating`, `ops.integrity_registry_broken`, `ops.silent_zero_probe_missing` (shape 4g — the detector's own probes going missing), and the `no-swallowed-write` semgrep rule
- **Proven to fire:** 2026-08-01 — `no-swallowed-write` found 9 sites, 7 genuine: three lost `ai_usage_logs` billing rows, a lost ERGANI submission audit row, a lost `last_digest_at` double-notify guard, a lost `embedding_status='failed'` write, and a recovery cron incrementing its counter after an unchecked update.
- **Note:** the **<5%** success-rate threshold matters. An exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5%.
- **Blind spot:** `ops.silent_zero` probes are hardcoded (deliberately — admin-editable SQL run by a SECURITY DEFINER function would be a privilege-escalation surface). A new metric gets no probe until someone writes a migration.
- **Worked example of paying that cost, 2026-08-08 (#239):** the page-embedding channel shipped with `ops.page_embeddings_never_written` in the same change. Worth noting *why* it needed one at all: the fusion weights make its silent failure actively misleading rather than merely invisible. The `page` channel carries 8–15% of every weight profile, so with no vectors written, search reports eight healthy channels while ranking on seven — and because `multi_vector_search` normalizes by *active* weights, the scores stay plausibly scaled and nothing looks off. A feature whose absence degrades a number without changing its shape is exactly this defect class, and the probe is the only thing that can see it.

- **A second worked example, 2026-08-10 (#233) — the gate that admitted nothing.** Agent long-term memory had every part an architecture review looks for: a typed, workspace-scoped table, a write path invoked on every turn, a read path spliced into every system prompt. The write path was three regexes over the user message (`/i (?:prefer|like|want)…/`) plus an `if (toolResult.tool === 'material_search')` ladder; the read path was `order by created_at desc limit 20`. Across **801 agent runs / 30 conversations / 45 user messages** it had promoted **one** memory — "User generated 3D design for room", with `style` empty. Nothing could see it: the stored row was consistent, so no integrity check applied; a regex that matches nothing is a valid regex, so no typecheck applied; and recency retrieval *returns rows*, so the prompt always looked populated. It was found by counting rows by hand.
  - **The generalization: a filter whose accept rate is ~0 and whose output nobody counts is indistinguishable from an empty input stream.** Ambiguous zero usually shows up as an unstamped *number*; here it was an unwritten *row*, and the two are the same defect. Any promotion/classification/dedup step needs a probe on what it emitted, judged against the activity that should have fed it — which is necessarily **cross-table**, since the write lands somewhere other than the trigger.
  - **Guarded by:** `ops.silent_zero` probes `agent_memory_never_promoted` (turns happened, nothing stored), `agent_memory_never_embedded` (recall has silently degraded to recency), `agent_memory_never_recalled` (memories exist, none has ever reached a prompt) + [tests/unit/agentMemory.test.ts](../tests/unit/agentMemory.test.ts).
  - **Proven to fire:** 2026-08-10 — `agent_memory_never_promoted` returned `activity 31 / signal 0` against the live DB on introduction, i.e. it reported the very defect being fixed *before* the fix shipped. The unit guard was mutation-tested by planting a regex promoter, a `JSON.parse` salvage and a `created_at` read back into the module: 3 of 27 assertions failed, and the module was restored byte-identical.
  - **Calibration is part of the guard, not a detail.** The three probes were first written at a 7-day window / `min_activity` 20 — thresholds this platform's chat volume (31 user turns per *month*) can never reach, so they would have reported clean forever. A probe that cannot attain its own minimum is the defect it is meant to catch, wearing a badge. Re-cut to 30 days with reachable minimums and confirmed firing.
  - **Blind spot:** the probes measure *volume*, not *quality*. A promotion gate that faithfully stores 5 useless memories per turn passes all three, and only `recall_count` staying low would hint at it.

### 4f. Guarded twice — a definer function whose callee re-checks the caller it can no longer see
`create_order_from_thread_intake` (#342) exists so **sales** members can approve an Inbox order into
a draft sales order — the one path that lets them write `orders` at all. It called
`recompute_order_totals`, which self-guards on `is_workspace_finance_manager`. SECURITY DEFINER
changes the ROLE, not the JWT, so `auth.uid()` inside it is still the caller: approval raised
`order not found` for exactly the role it exists to empower, and **passed for an owner**, which is
how the first pass of testing missed it entirely.

The wrong fix is to recompute the money locally — that is shape 5, a second derivation of a money
quantity. The right one is to split: `_recompute_order_totals_core` holds the arithmetic and is
REVOKEd from every client role, `recompute_order_totals` keeps the gate at the public entry point.
Same shape as `_deliver_order_line_core`.

- **Guarded by:** [tests/integration/order-intake-approval.test.ts](../tests/integration/order-intake-approval.test.ts) — approves as a **real signed-in `sales` user** under real RLS, and separately asserts that same user still cannot INSERT into `orders` directly, so the RPC stays the only door.
- **Proven to fire:** 2026-08-10 — found live. The owner-path test passed; the sales-path run raised `P0002 order not found` from inside `recompute_order_totals`, which is what surfaced the bug. Re-run after the split: draft sales order, total 37.20, and the public wrapper still refuses a non-finance-manager.
- **Current state:** fixed; the core is REVOKEd from `anon` and `authenticated` (verified via `has_function_privilege`).
- **Blind spot:** the integration tier self-skips without `SUPABASE_SERVICE_ROLE_KEY`, so this only actually runs in CI. A local `npm test` reports it as skipped, not passed.

- **A third worked example, 2026-08-10 — the janitor that aborted on its own first branch.** `run_storage_retention_sweep` set `quotes.pdf_generation_status = 'expired'` when purging a stale PDF; the CHECK constraint allowed only `pending|generating|completed|failed`. So the UPDATE threw, and because the sweep is one plpgsql function in one transaction, the exception rolled back **every** branch — agent conversation media, moodboard sheet PDFs, client-view PDFs and catalog PDFs had never been purged either. `QuotePDFService.refreshPDFUrl`'s "if it expired, rebuild it on open" branch was correspondingly dead code, because no quote could ever reach that status. The cron had failed 100% of its runs since it shipped. Fixed by widening the constraint to the vocabulary the code already used — narrowing the code instead would have left old quotes permanently without a PDF.
  - **What caught it, and what nearly didn't:** only the generic `<5%` cron-success probe, and only because pg_cron recorded a *hard error*. Had the sweep instead purged nothing quietly — a narrowed window, a wrong `WHERE` — it would have reported success forever. That is the janitor rule in CLAUDE.md: watch the OUTPUT, not the exit code.
  - **Guarded by:** `ops.silent_zero` probe `storage_retention_never_purges` — files past their retention window versus anything the sweep actually purged in the last 7 days.
  - **Proven to fire:** 2026-08-10 — returned `activity 6 / signal 0` on introduction. The constraint fix itself was verified by running the real (non-dry) sweep inside a deliberately-aborted transaction, since `p_dry_run` only *counts* and never exercises the UPDATE that was throwing.

- **A shape mismatch reads exactly like an absence, 2026-08-10.** Auditing which metered crons had ever charged returned "none, ever, for all fourteen keys" — via `credit_transactions.metadata->>'cron_key'`. That was wrong: `seo-website-crawl` had charged 29 times. Two sibling debit functions wrote the same logical field at two different JSON depths — `debit_credits` (workspace router) flat, `debit_user_credits` (personal wallet) nested one level under `'metadata'`. Every personal-wallet charge was therefore invisible to the obvious query, and nothing errored; the number was simply zero. Flattened to match, with the existing rows backfilled.
  - **Worth stating as its own hazard:** the first version of this section asserted "the entire cron-billing system has never charged anything" on the strength of that query. It survived one round of review because a zero from a wrong path and a zero from a real absence are the same character on screen. When a probe reports total absence across *every* member of a set, suspect the query before the system.
  - **Guarded by:** the flattening itself (one shape, so the divergence cannot recur silently) + the `cron_metering:*` probe below, which reads the flat shape.

- **And the probe that could not see the ledger it was judging, 2026-08-10.** `ai_spend_never_debited` reads `ai_usage_logs.credits_debited`. Cron-metered modules charge through `credit_transactions` and never touch that column, so for them the probe was structurally blind in one direction and a false positive in the other — it flagged `job-research` while `seo-website-crawl`, which *was* charging, would have been flagged identically had its volume crossed the threshold. Replaced for those modules by `cron_metering:*`, which joins `cron_billing_registry.expected_module_slug` (new) to the module's real spend and asks the ledger cron billing actually writes to.
  - **Proven to fire:** 2026-08-10 — surfaced `job-research-refresh` ($4.00/30d), plus `mention-monitoring` and `llm-mention-probe` ($0.41) that the old probe never reached. Mutation-tested in the other direction too: inserting one charge for `job-research-refresh` made its finding disappear, so the probe goes quiet when the defect is fixed rather than latching.
  - **The finding it produced was NOT the bug it looked like.** The job-research metering existed in the MIVAA repo from 2026-07-25 but only reached the server on 2026-08-08 (`stat` on the deployed file), and all of the unbilled spend ran between 2026-07-25 and 2026-08-06. The charge path was correct and simply had not shipped. Confirming that took reading deploy-file mtimes and systemd restart times — worth doing before "fixing" a working system, and a reminder that for the separate MIVAA repo *committed is not deployed*.
  - **Following it through to every key found four more, 2026-08-10.** Auditing all fourteen registered keys against their callers: `seo-toolkit-audit` (hourly cron, DataForSEO composite site-review per domain) and `job-research-digest` had **no caller in either repo** — an admin-visible price governing nothing while the work ran free. Both are now wired (per-domain and per-send respectively). `user-website-recrawl` was a *duplicate*: its cron dispatches to `crawl-user-website`, which already charges under `seo-website-crawl` at 5 credits, so the 3-credit row was a second price for one job — wiring it would have double-charged. Retired to `metered=false` with a tombstone description rather than deleted, so the next person finds the answer instead of re-adding it.
  - **Guarded by:** `ops.cron_key_unwired` — `cron_billing_registry.caller_ref` (new) names the code that charges each key; NULL on a metered row is the finding. Deliberately a required field on the registry row rather than a key list in a test file: there is one place a key exists, and that place now has to say who calls it.
  - **Proven to fire:** 2026-08-10 — nulling one `caller_ref` in an aborted transaction produced exactly 1 finding; 0 with all keys wired. `dic_detect__ops_integrity_registry_broken` confirms the new check's signature, so it cannot abort the nightly sweep.
  - **Blind spot, and it is a real one:** `caller_ref` proves a caller was *declared*, not that it still exists. Nothing offline can join a DB column to two repos, so a deleted call site leaves the row looking healthy. `cron_metering:*` covers that for the keys whose work leaves an `ai_usage_logs` footprint; keys priced for a *send* rather than a spend (`job-research-digest`, `hr-checkin`, `email-campaign`) have no such backstop.

### 4g. Guard erased by a rewrite that never mentioned it
On 2026-08-10, migration `20260810121617` appended three `ops.silent_zero` probes for #342 — inbound
email that never reaches a thread, order intakes that never produce a line, approved Inbox orders
whose customer was never told. It did the append by **surgery** on `pg_get_functiondef`, asserted
each probe had landed, and ran the detector once to prove it still executed. All three were watched
to fire. Seventy minutes later, `20260810132154` — an unrelated change adding cron-metering probes —
did a full `CREATE OR REPLACE` of the same function from a source that predated them, and dropped
all three. Two further full replacements on 2026-08-16 kept them gone. The probes were absent for
**ten days**, and the issue comment recording them as shipped was, by then, describing a database
that no longer had them.

Nothing could see it. A detect function with fewer probes returns fewer rows, and fewer rows is
precisely what a healthy platform looks like — this is shape 4 turned on the machinery that exists
to catch shape 4. Two properties of this repo make it specific rather than hypothetical: migrations
are applied through MCP and never written to files, so **no repo-side test can read the SQL that is
actually running** (`grep` over the checkout sees nothing); and `CREATE OR REPLACE` is by design a
whole-body overwrite, so a stale source is not an error, it is a silent revert. Any function that
accumulates inline entries across many separate migrations has this exposure — the silent-zero
detector is simply the one with fifteen of them.

- **Guarded by:** `ops.silent_zero_probe_missing` — a hardcoded roster of the probe names the detector is supposed to carry, compared against the live `pg_get_functiondef`. Hardcoded for the same reason the probes themselves are (an admin-editable roster run by a SECURITY DEFINER function is a privilege-escalation surface). Adding a probe needs no edit here; **deleting** one deliberately does, which is exactly the asymmetry wanted — an accidental deletion comes with no such edit and fires.
- **Proven to fire:** 2026-08-20 — the detector was stubbed to an empty body inside an aborted subtransaction: 0 findings before, **15** during, 0 after, with the real definition restored. Verified separately that `dic_detect__ops_integrity_registry_broken` accepts the new check's signature, so it cannot abort the nightly sweep.
- **Current state:** the three #342 probes are restored and the roster covers all 15.
- **Blind spot:** the roster proves a probe is *present*, not that it is *calibrated*. A probe whose window or `min_activity` can never be reached passes this check while reporting clean forever — the failure mode already recorded under the agent-memory example above. It also covers only this one detector; the general hazard (an inline registry rebuilt from a stale source) has no automated coverage elsewhere.

### 4e. Wrong latent space — a vector that is the right SHAPE and the wrong MEANING
Dimension is not identity. `voyage-4` and `voyage-multimodal-3.5` both return 1024D, so querying
`vecs.page_embeddings` with an ordinary text embedding is accepted by Postgres, returns neighbours
from the HNSW index, and produces confidently-scored nonsense. No typecheck, no dim check, and no
integrity probe can see it — every artifact involved is individually valid.

- **Guarded by:** [tests/unit/test_page_embeddings.py](../mivaa-pdf-extractor/tests/unit/test_page_embeddings.py) — pins that the page query goes to `/multimodalembeddings`, that the model comes from one setting so ingest and query cannot be pointed at different models independently, and that the path has no fallback provider.
- **Proven to fire:** 2026-08-08, on introduction — mutation-tested by rewriting `generate_page_query_embedding` to call `_generate_text_embedding`, confirmed the guard catches it; likewise for the workspace stamp, the fail-closed read, the row-outruns-vector case, the silver-layer read and the page cap.
- **Precedent it generalizes:** audit gap B, where the Voyage→OpenAI fallback was disabled on the understanding path for the same reason — a mixed-provider collection corrodes cosine similarity while every row in it remains individually well-formed.
- **Found and closed the same day (2026-08-08), by asking whether the hazard was live rather than assuming the guard settled it:** gap B's containment was a per-call `allow_openai_fallback=False`, and **seven** call sites passed it. `generate_understanding_query_embedding` did not — so the five collections gap B had purified on the WRITE side could still be QUERIED with an OpenAI vector, which `rag_service` then fanned across all five. Gap B did not merely miss this; it *created* it: before, both sides could fall back, so a fallback query at least had a chance of matching a fallback-written row. Purifying one side of a comparison turns a partial mismatch into a guaranteed one.
- **The lesson is about the SHAPE of the containment, not the miss.** A per-call opt-out is correct only while every author remembers it, and it is load-bearing at exactly the moment nobody is thinking about it. It held for seven call sites and failed on the eighth. The fallback was therefore **deleted outright** (MIVAA `dda5efa`) rather than defaulted off: there is now no parameter to forget. Guarded by [tests/unit/test_no_fallback_embedder.py](../mivaa-pdf-extractor/tests/unit/test_no_fallback_embedder.py).
- **It was latent, and that is the point.** 2,003 embedding calls since 2026-06-22, all `voyage-4-1024d`, zero OpenAI — the fallback never fired. It could only bite during a Voyage outage, and it is self-healing, so the one occasion it mattered would have left no evidence afterwards. Verified reachable, not dead: `OPENAI_API_KEY` is non-empty in the deployed systemd unit and `VOYAGE_FALLBACK_TO_OPENAI` was unset, so the `True` code default applied.
- **Blind spot:** the guard is source-level, so it protects the two call sites it names. Nothing stops a *new* consumer from querying `page_embeddings` with whatever 1024D vector it has to hand; the collection itself cannot reject a wrong-space query, because there is nothing about the vector to reject.
- **That blind spot was live, and the vector did not even need to come from the wrong MODEL — 2026-08-09 (#277).** The right model embedding meaningless *content* fails identically. The Search page requires an image for its aspect modes and sent the image's **filename** as the query text, so `image_texture_embeddings` was searched with `voyage("IMG_2831.jpg")` — correct model, correct space, correct dimension, no meaning — while `aspect_bias_weights` put 0.55 of the ranking on that channel. Measured across the balanced profile, **41.5%** of every image search on that page was ranked against a filename (18 points of it `understanding` alone). Underneath sat a second instance: `b64decode` does not reject a data URL, because every character of `dataimagejpegbase64` and `/` is in the base64 alphabet — so a browser `readAsDataURL` payload decoded to ~175 bytes of *shifted noise* instead of 160 bytes of JPEG, PIL failed on it, the caller caught the exception, and the visual channel quietly substituted a text embedding of the same filename. Five of that page's seven modes required an image and none of them ever looked at one.
- **Guarded by:** [test_aspect_query.py](../mivaa-pdf-extractor/tests/unit/test_aspect_query.py) (image-derived aspect + understanding vectors, text channels stand down with no text) and [test_image_payload.py](../mivaa-pdf-extractor/tests/unit/test_image_payload.py) — whose first assertion pins that the naive decode is silently **wrong** rather than raising, since that is the premise the whole normalizer rests on. **Proven to fire:** 2026-08-09, both stash-tested against the pre-fix code.
- **The generalization:** this shape is usually described as *wrong model, right dimension*. It is really **anything that yields a well-formed vector carrying no relevant meaning** — wrong model, wrong content, or corrupted input that still decodes. All three are indistinguishable downstream, because a vector has no field that says what it is about.

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

### 4d. Unregistered storage path — the GC deletes a file the DB still points at
`build_storage_reference_set()` is the allow-list `storage-orphan-cleanup-cron` sweeps against. A
table that stores an object path but never got a branch in it has its files treated as orphans and
deleted. The row survives, still holding the path, so nothing looks wrong.

- **Guarded by:** `ops.storage_paths_unregistered` — scans `public` base tables for `%storage_path%` / `%storage_object_path%` columns and fails any whose table is absent from the function body.
- **Proven to fire:** 2026-08-04, on introduction, against **real loss**. `public.payments` wrote receipt PDFs into `pdf-documents` (swept on a 72h grace) and was never registered; **both** payment-receipt PDFs on this project had already been deleted while their rows still referenced them. Six more tables were latent (`hr_documents`, `hr_accounting_documents`, `material_images`, `property_documents`, `property_photos` — all empty at the time). All registered in the same change; the probe was then re-run against a simulated pre-fix definition and confirmed to return `payments`.
- **Match on the QUALIFIED name.** The first hand-written version of this check tested `position(table_name in def)` and reported `uploaded_files` as registered — because it is a substring of `agent_uploaded_files`. An unqualified match hides exactly the tables most likely to be missed: the ones whose names resemble a table that *is* registered.
- **Deliberately not auto-healed:** the fix is a new branch in a SECURITY DEFINER function, and the deleted files are already gone. Nothing to heal, only to prevent.
- **Second instance, found 2026-08-04 while wiring room plans:** `moodboard_presentation_sheets` was registered only through `pdf_storage_path`, but every image a sheet uses lives inside its `data` jsonb — plan backdrops, annotated-render images, elevation pairs, concept-board collages, deck covers, all uploaded to `generation-images/u/{uid}/sheet-uploads/`. That bucket IS swept (14-day grace), so each would have been deleted while its sheet still referenced it. Closed with a `regexp_matches` scan over `data::text`, mirroring the existing `agent_chat_messages` branch; the pattern excludes `?` so a signed URL's token never ends up in the object path.
- **Blind spot:** columns holding a storage path under a name matching neither pattern. Paths inside jsonb are no longer a blind spot for sheets specifically, but the probe still cannot see them generally — **it scans column names, so any NEW table stashing a URL in jsonb repeats this exact bug undetected.** Closing that needs a value-level scan across every jsonb column, which is a different and much more expensive probe.

### 5. Derived-copy drift — a cached number diverging from its source
Any `total`, `status` or count stored alongside the data it summarises.

- **Guarded by:** `finance.order_payment_status_drift`, `dic_detect__finance_order_over_settled`, the quote-totals drift check, and — for `product_prices.discount_price` — a **generated column**, which removes the cache rather than watching it
- **Proven to fire:** 2026-07-26 (quote totals drift check, on introduction)
- **Blind spot:** only finance quantities. A cached count anywhere else has no drift check.
- **Worked example, 2026-08-16 (#367) — delete the copy instead of guarding it.** `product_prices.discount_price` was `list_price × (1 − discount_percent/100)` derived in THREE TypeScript places; two rounded to 2dp, one did not. A drift check was never going to be justified for it, because **nothing read the column** — not one SQL function, not one client. It was written by three sites and consumed by none, so the only thing it could do was leak. And it did: the unrounded copy travelled out of `PriceLookupDrawer` into `quote_items.discounted_price` and `order_items.unit_price`, both *unconstrained* `numeric`, which store the float tail verbatim where `numeric(12,2)` would have rounded it away. `67.00000000000001` next to `67` satisfies `discounted_price !== unit_price`, so a quote line rendered a discount badge striking through 67 to show 67.00.
  - The fix is `GENERATED ALWAYS AS (round(list_price * (1 - discount_percent / 100.0), 2)) STORED`. A fourth copy is now impossible in **every** runtime at once — Postgres rejects the write with 428C9 — which is the only form of coverage that also reaches the MIVAA writer, in a submodule CI never checks out.
  - **The general rule this is worth remembering for:** before writing a drift check for a cached number, find its readers. If there are none, the cache is not a performance decision anybody made — it is an accident, and the cheapest correct guard is deletion or a generated column, not a nightly probe reporting that two numbers nobody uses still agree.

### 6. Money without currency — an amount compared or summed across currencies
`AgingRow` carried no currency field, so AR/AP totalled every row as EUR whatever the document
actually said.

- **Guarded by:** `ops.money_without_currency` — three branches: a quote total with no currency; a payment settling a document in a *different* currency at an absent or identity `fx_rate`; a workspace holding open balances in more than one currency.
- **Proven to fire:** 2026-08-02 — all three branches watched, each inside a transaction that was rolled back: nulled a quote's currency, flipped one open payable to USD, set a cross-currency allocation to `fx_rate = 1`. Verified afterwards that nothing survived the rollbacks.
- **The first version of this probe was wrong, and that is worth recording.** It checked `currency IS NULL` across six money tables. **Five of the six columns are `NOT NULL`**, so five sixths of it could never fire — it would have sat in this table looking like coverage. Worse, NULL was the wrong thing to look for at all: those columns are `NOT NULL DEFAULT 'EUR'`, so a document created without an explicit currency does not arrive NULL and get noticed — **it arrives silently, confidently EUR.** That default *is* the AgingRow bug one level down, and no NULL check can ever see it. Caught only because step 2 below forced an attempt to make it fail.
- **Blind spot:** the `DEFAULT 'EUR'` itself. Nothing distinguishes "the user chose EUR" from "nobody chose anything", so a wrong single-currency figure stays invisible. Closing that needs a nullable column and an explicit choice at write time — a schema change, not a probe.

### 6b. UTC "today" on a date of record — right format, wrong day
`new Date().toISOString().slice(0, 10)` is the **UTC** calendar date. This platform serves Greek
customers (UTC+2 winter, UTC+3 summer), so between local midnight and 02:00–03:00 it returns
*yesterday*. It was written by hand at **25 sites** because `src/utils/datetime.ts` held only
display formatters and there was nowhere to send them. The distribution is what made it High: the
invoice `issueDate` (a fiscal document of record submitted to AADE via myDATA, numbered sequentially
**by date**), `paidAt` (feeds `get_order_settlements`), and the attendance date that feeds payroll.

Exactly the shape of a wrong money number, applied to dates: it produces a perfectly valid
`YYYY-MM-DD`, raises nothing, logs nothing, and typechecks. An invoice issued at 01:30 on 1 August
is stamped 31 July — wrong fiscal period, and out of order against its own sequence.

- **Guarded by:** `todayLocalISO()` / `toLocalISODate()` / `localISODateOffset()` in [src/utils/datetime.ts](../src/utils/datetime.ts), the semgrep rule `no-utc-today-as-local-date`, and the `local calendar dates` block in [tests/unit/datetimePrimitives.test.ts](../tests/unit/datetimePrimitives.test.ts).
- **Proven to fire:** 2026-08-16 — the rule was run against a probe file holding all five offending spellings and matched exactly those five, while leaving the two deliberate-UTC shapes (`new Date(ms)`, `new Date(t + n)`) alone. Re-run over the whole of `src/` afterwards: 0 findings, i.e. the 25-site sweep is complete.
- **Deliberately narrow.** The rule matches only `new Date()` and `Date.now() ± n`. Three modules do all their arithmetic in UTC and are self-consistent (`projects/lib/schedule.ts`, `financeService.nextRecurrenceDate`, and `ordersService`'s alignment with the DB aging view's UTC session); widening the rule would flag those, and the fix would be to suppress it, which is how a rule stops being read. Pinned by a `semgrepRuleset.test.ts` case so the narrowness is a decision rather than drift.
- **Blind spot:** the server side. Edge functions and MIVAA run in UTC by definition, and there is no workspace-pinned business timezone to resolve against, so `current_date` in SQL is the same defect one layer down. Any date stamped server-side is still UTC. Closing that is a schema + settings change, not a probe.

### 6c. Compliance control keyed on a client-declared class
Email suppression ran only inside `if (body.emailType === 'marketing')`, and `emailType` is a
**request-body field** that defaults to `'transactional'`. So omitting it skipped the unsubscribe
check, and so did setting it — and the freeform CRM composer, the meeting-invite sender and the
real-estate buyer digest all declared `'transactional'`. The lookup also destructured `{ data }`
and dropped `{ error }`, so a failed query let the send proceed: a control that switches itself off
exactly when it cannot do its job.

- **Guarded by:** suppression is now the default for every send; exemption requires **both** an allowlisted `tags.feature` **and** `isAdminAccess(auth)` — a server-to-server bearer. A browser session authenticates at `level: 'user'`, so nothing a page can send buys the exemption. Pinned by [tests/unit/emailSuppression.test.ts](../tests/unit/emailSuppression.test.ts), which asserts the lookup sits *before and outside* the marketing branch, reads its error, and returns 503.
- **Proven to fire:** 2026-08-16 — the ordering assertion failed on first run against the real file (it matched the sentence in the comment describing the old shape, not the branch), which is the guard demonstrating it reads position rather than presence; anchored to a line start and re-run.
- **Blind spot:** a send with no `workspace_id` and no `attribution_workspace_id` has no workspace-scoped list to check against. Those are platform system sends (password resets), but the gap is real.

### 7. Direction-blind roll-up — a sum that ignores in/out
Closely related to shape 1, but at the aggregate rather than the row.

- **Guarded by:** `get_order_settlements` for orders only
- **Blind spot:** any new aggregate. The rule in CLAUDE.md ("derive it in SQL, return it derived, add a drift check") is prose, not a mechanism.

### 8. Parallel create — the same record, made N ways, each one thinner
A sibling of shape 1, but on the WRITE side and with no wrong number to find. "Create a company"
existed three times: CRM → Add company ran ΑΑΔΕ → ΓΕΜΗ → web research and produced ~25 populated
columns; Expenses → payee wrote a name and two booleans; Invoices → add client wrote a name, an
**unverified** VAT and an email — on the buyer of a fiscal document, headed for myDATA. Same table,
same counterparty, three depths of record depending on which screen you were on.

Nothing can see this from the data: a thin row is a *valid* row. No typecheck, no integrity probe
and no drift check fires, because nothing is inconsistent — the CRM is just quietly worse, and only
where the record was born.

- **Guarded by:** [tests/unit/companyIdentity.test.ts](../tests/unit/companyIdentity.test.ts) — pins the payload/dedupe derivations, asserts each create-a-business surface routes through the shared `CompanyIdentityLookup`/`QuickAddCompanyDialog`, and **ratchets the set of files inserting `crm_companies` directly** (one entry: the own-workspace business profile).
- **Proven to fire:** 2026-08-07 — a throwaway `src/__ratchet_probe.ts` with a raw `crm_companies` insert was added and the ratchet named it, then removed. The test also asserts its own source scan matched >500 files first, so an inert glob fails loudly instead of passing vacuously (shape 4, applied to the guard itself).
- **Blind spot:** `crm_contacts` has the same shape and no ratchet. The guard is per-table and per-verb — a thin create that goes through an RPC or an edge function rather than a client-side `.insert(` is invisible to it.

### 9. Silent cost regression — correct code that bills you
A close relative of shape 1's "a wrong number is a valid number", moved to the infrastructure bill.
A `manualChunks` entry does not *organise* a dependency, it **PINS** it: the named chunk becomes a
static import of the entry, so `index.html` emits a `modulepreload` and every anonymous visitor
downloads it on first paint. Audit #308 found `recharts` pinned that way — 362,395 bytes of charting
library shipped to landing pages that render no charts — and removed it, leaving a 15-line comment
explaining why. It was re-added on 2026-08-09 under a comment about `forwardRef` safety, which was
*true and irrelevant*: the question is never "is this chunk safe to split", it is "does every visitor
need these bytes".

Nothing could see it. The build succeeds, the bundle works, every test passes, the typecheck is clean
and the page renders correctly — it is simply 24% heavier for everyone, forever, and the only symptom
is a line on a usage dashboard nobody reads until a quota email arrives. **The comment was the guard,
and the comment lost.**

The same window produced the sibling shape on the request side: the SPA catch-all in `vercel.json`
answered **200 with the full 5.5 KB app shell for every URL in existence**, so `/wp-login.php`,
`/.env` and `/.git/config` all read as valid pages to a scanner — and on Vercel a cache HIT is billed
identically to a MISS, so a 97.5% hit rate reduced the meter by exactly zero.

- **Guarded by:** [tests/unit/edgeRequestSurface.test.ts](../tests/unit/edgeRequestSurface.test.ts) — asserts no optional package is pinned into `manualChunks` (`recharts`, `@sentry/react`), and that the catch-all still serves all 37 real client-side routes while 404-ing 31 scanner paths. Both directions matter: over-widening the exclusions 404s a real customer, which is worse than the traffic it saves.
- **Proven to fire:** 2026-08-10 — both regressions were reintroduced into the real files and the suite run. The recharts assertion failed; restoring the old permissive rewrite regex failed all 31 scanner assertions. Green again on restore.
- **Why it is a source-text check, not a build check:** the defect is visible in `vite.config.ts` and `vercel.json` without a 93-second build, so the guard costs milliseconds and runs in the normal unit suite. The cost is that it reasons about config, not the emitted artifact — see the blind spot.
- **Blind spot:** it pins a **named list** of packages. A *new* heavy dependency pinned for the first time is invisible, as is a chunk that lands in the eager path through a static import chain rather than a `manualChunks` entry. Closing that properly means asserting a byte budget on `dist/index.html`'s modulepreload set in CI, which needs a build step. Also unguarded: `@mdxeditor/editor` pulls 1.2 MB plus 75 CodeMirror language-mode chunks (`apl`, `brainfuck`, `commonlisp`, …) for one component — correctly lazy, so it costs no visitor anything today, but nothing stops it becoming eager.

### 10. Gate and renderer at different granularities — per-section access, per-key rendering
Audit #368 found this in the best-reasoned access control in the codebase, which is the point:
`ProductDetailModal` gates stock, cost, listings and movements on **both** ownership and capability,
with the persona reasoning written down. Then the Details tab renders `attributes` + `metadata` +
`properties` + `specifications` by **walking the keys** — so the gate asks about sections and the
renderer asks about keys, and anything sensitive that lands in jsonb instead of a dedicated column
falls through the gap. It is not a missing check; it is a check at the wrong granularity, which is
why reviewing the permission model finds nothing wrong.

The platform makes it concrete rather than theoretical: `attributes_raw` is where supplier XML lands,
`attributes` is where AI extraction writes, and extraction is *explicitly allowed* to produce fields
the registry has never seen. A feed carrying `cost`, `wholesale` or `margin` renders to whoever can
see the product, project clients included.

The same audit found the read-side twin. The Related tab opened a stacked product with
`.from('products').select('*')` — and that table carries `cost`, `cost_source`, `markup_percent`,
`supplier_company_id` and the raw supplier feed, behind an RLS policy whose only test is workspace
membership. Everything the modal gates, handed over by one click on a recommendation.

- **Guarded by:** `material_metadata_fields.sensitivity` + `internal_product_field_pattern()` as the floor for keys the registry has never seen, applied server-side by `get_product_detail()` / `redact_internal_product_fields()` and in the browser by [tests/unit/productFieldSensitivity.test.ts](../tests/unit/productFieldSensitivity.test.ts). The client fetches the pattern rather than restating it, so the two engines evaluate one string.
- **Proven to fire:** 2026-08-16 — the `withholdKey(ik)` line was deleted from the nested-group walk and the three-valued verdict collapsed to `verdict === true`, in the real file; two assertions failed naming both, and passed again on restore.
- **Why the verdict is three-valued:** `null` means "the registry loaded, the pattern did not, and this key is unknown". Collapsing that to "public" is a filter that turns itself off in precisely the situation nobody notices — the fallback-fires-invisibly shape from the prompt-registry incident, moved to access control.
**The read side of the same shape: what is SENT, not what is shown.** The sweep for other wide
product reads found five, and the worst was invisible to a search for `from('products')` — it is an
EMBED, `select('*, product:products(*)')` on `quote_items`, and `getQuote` backs the customer quote
page as well as the admin one. `quote_items`' RLS asks for workspace membership, which a project
client has, so procurement cost reached the customer reading their own quote. Every one of the five
scrubbed correctly before rendering — `convertToDisplayProduct` sets `wholesale: 0` under a comment
naming the *previous* leak — which is exactly the point: reading the JSX tells you what is displayed
and never what crossed the wire.

- **Guarded by:** [tests/unit/productReadProjection.test.ts](../tests/unit/productReadProjection.test.ts), pinned at zero.
- **Ruled out:** column-level `REVOKE SELECT (cost, …) ON products FROM authenticated` would close the class in one statement regardless of call site. Privileges are per **role**, and admins read cost through the same `authenticated` role, so it would break the surfaces that need it.
- **Blind spot:** the client half of the render side only covers the walker in this one modal, and the read-side guard is source text — a wide read assembled at runtime from a variable is invisible to it. Narrowing what a page ASKS for is also not a server boundary: `products` RLS still answers a hand-made request from any member.

### 11. Grant that answers WHO, response that answers WHAT
Audit #364 found three instances at once, and the reason they read as correct is that the check
that ran was genuinely the right check — for a different question.

`catalog-access` proves an email may see a catalog, then returns `cover_data` / `body_data` /
`back_cover_data` as the raw jsonb the builder wrote: every material carrying `provenance` (the
source PDF id and page it was lifted from), `price_source_ref`, `image_source_ref` (a product id,
or the supplier URL an image was scraped from) and `specs_raw`. None of it renders. jsonb also
accepts whatever a future writer adds, so a denylist would have been a list of the keys somebody
already thought of.

`customer-assets-api` proves the caller owns a warranty ROW, then hands that row's
`document_bucket` / `document_path` — both client-writable through `warranty.save` — to the
**service-role** storage client to sign and to remove. Owning one warranty was enough to read, or
delete, any object in any bucket. RLS never saw it: the row was legitimately theirs.

The third is the scoping half. The same function resolved its CRM and membership lookups against
the catalog OWNER's earliest active workspace membership rather than the catalog's own
`workspace_id` — the `CM-22` first-workspace shape from #359, except here it decides who may read.
With no workspace resolved it fell through to an UNSCOPED lookup: any platform user's email on the
instance matched, and the CRM searches spanned every tenant. A filter that widens when it cannot
resolve its scope is the fallback-fires-invisibly shape again.

- **Guarded by:** [tests/unit/grantedAccessProjection.test.ts](../tests/unit/grantedAccessProjection.test.ts) — the viewer payload is built from a named allowlist, no unscoped `crm_*` / `user_profiles` lookup survives, and the privileged storage handle is re-derived (`warrantyObjectRef`: our bucket, this workspace's prefix) rather than read off the row.
- **Why the read side is re-checked as well as the write side:** rows written before the fix still carry whatever was set then. Removing the columns from the allowlist alone would leave every existing row exploitable, which is the difference between closing a hole and closing the way it was dug.
- **Blind spot:** source text. A projection assembled at runtime, or a fourth surface that signs a stored path, is invisible to it.

### 12. Body-supplied tenant on a service-role write — bounded by SQL, still cross-tenant
`workspace_id` arrives in the request body of every paid generation endpoint and then decides which
credit pool is debited, which workspace owns the `generation_3d` / `generation_videos` / `vr_worlds`
row, and which admins can read the `ai_usage_logs` row through its `is_workspace_admin(workspace_id)`
policy. Five of eight had no membership check (#364 EX-1).

**What makes this worth a section rather than a line:** it reads as Critical in the application code
and is bounded in SQL. `debit_credits` detects the non-member case and falls back to the caller's
personal wallet, so it was never credit theft — the attacker paid, and the ROWS landed in a
stranger's tenant, on their cost dashboard and in their generation history. That is the fourth time
in one engagement a finding's real severity was set by a guard one layer down, and it is an argument
for reading the SQL before writing the severity, not for leaving the check out.

- **Guarded by:** [tests/unit/generationEndpointTenancy.test.ts](../tests/unit/generationEndpointTenancy.test.ts) — every listed generator calls `userCanAccessWorkspace` and answers 404 (never 403 — a distinguishable "not yours" is a workspace-id oracle), plus a sweep that fails when a NEW `generate-*` function both debits credits and reads a body workspace id without appearing in the list.
- **The sweep is the point.** EX-1 was reported against `generate-interior-gemini` in an earlier sweep and closed nowhere, while four siblings had the identical shape and three others had already been fixed. A hand-kept list of call sites is a list of the sites somebody already looked at.
- **Also covered there:** the provider hop (a body URL handed to Replicate / Veo / Kling is fetched from THEIR network before we download anything, so it is validated at the input, not at the download), the provider-output download (`fetchBinaryGuarded` — these were bare `fetch().arrayBuffer()`, so a redirect or an HTML error page went into the bucket as an mp4), a `succeeded` prediction with no output returning `success: true`, and an `ai_usage_logs` insert ending in `.then(() => {}, () => {})`.

### 13. Link that does not travel — attached upstream, dropped downstream

A record is deliberately attached to a parent (an order booked to a project), a second record is
generated from that parent, and the generator does not copy the link down. Found 2026-08-21, #378.

`get_project_pnl` reads a job's revenue from `invoices.project_id`, its cost from
`supplier_bills.project_id`, its labour from `time_entries.project_id` and its committed cost from
`orders.project_id`. Five functions that *create* those documents never named the column:
`generate_invoice_from_order`, `generate_supplier_bill_from_order`, `delivery_note_to_invoice`,
`generate_order_from_invoice`, `commit_sourcing_options`.

**Why it is worse than an ordinary missing field.** The two halves fail in opposite directions and
the error compounds: attach a purchase order to a job and its total lands as *committed* cost; bill
it and the committed figure falls away while the actual cost never arrives to replace it. The margin
therefore **improves as you spend**. Nothing raises, because a missing uuid is a valid null — the
same reason shape 4 exists, one layer up.

- **Guarded by:** `finance.project_attribution_drift` (a child with no job whose parent has one — auto-heals by copying the parent's down; a child pointed at a *different* job is an operator decision and is left alone) and `ops.chain_fn_drops_project` (any function inserting into `invoices` / `supplier_bills` / `orders` without naming `project_id`, minus a hardcoded exemption list with a stated reason per entry).
- **Proven to fire:** 2026-08-21 — both, in rolled-back transactions. The drift check: a bill raised from a project-linked order carried the job (the fix), then had it nulled; detector 1 → heal 1 → detector 0. The shape check: a function inserting an invoice with no `project_id` was reported, and stopped being reported once it named the column.
- **The exemption list is the interesting half.** Six functions legitimately create a document with no job, and two of them matter: `_generate_pre_invoice_on_accept` and `handoff_purchase_order_to_supplier` write into **another tenant's workspace**, where carrying the source project id would be a cross-tenant leak rather than a fix. `_inbound_doc_to_supplier_bill_core` and `create_order_from_thread_intake` have no upstream job to carry at all — for those the answer is letting the operator attach one afterwards (#378 L1), not inventing a source. `pos_issue_receipt` and `reorder_warehouse_item` are genuinely not job work.
- **Blind spot:** a document created directly by the client rather than by a SQL function. The probe reads `pg_proc` only.

**The other half — the link that can never be answered again (#378 L1).** Propagation only helps a
document that had a parent. A cost that arrives on its own — a transport invoice a week after the
goods, customs, an installer, a second supplier on the same job — could be pointed at its order
only at the moment it was created, or afterwards from the ORDER's side, which requires already
knowing which order it was. That is the direction an operator looking at an unattributed row in
Payables does not have. `EditSupplierBillDialog` now mounts the same `OrderLinkPicker`, so the
question can be re-answered.

- **Guarded by:** [tests/unit/billLink.test.ts](../tests/unit/billLink.test.ts) — every kind the picker can emit lands in the right column *and leaves every other one null* (a leftover from the previous answer books a bill to a job AND to somebody else's sales order), plus the precedence that decides which stored column the control displays; and the call-site rules in [tests/unit/orderLinkTargets.test.ts](../tests/unit/orderLinkTargets.test.ts), whose mounts are now **discovered rather than listed**.
- **Proven to fire:** 2026-08-21 — `linkToColumns` broken for `trip`; two behavioural tests failed naming the exact column. The same break against the pre-existing *text* guard passed, which is the row added to the table at the top of this file.
- **Blind spot:** a future mount that hand-rolls its own kind→column mapping instead of importing `billLink.ts` is covered only by the weaker text rule.

### 14. "No caller" measured with a tool that cannot see the callers

`generate_order_from_quote` was reported as dead — a complete, idempotent RPC with no reference
anywhere in `src/` or `supabase/functions/`. It is not dead. `quote_accepted_create_order`, an
`AFTER UPDATE OF status` trigger on `quotes`, calls it every time a quote is accepted, and the
whole chain (confirmed sales order → draft pre-invoice → 30-day pay token → the public page's "Pay
now") runs on it. **A repo-file scan cannot see a `pg_proc` caller**, and this platform keeps a
large amount of behaviour in `pg_proc`.

- **Rule:** before calling any SQL function unused, query `pg_proc` for callers *and* `pg_trigger` for triggers — `where pg_get_functiondef(oid) ilike '%fn_name%'`. The same applies in reverse to guard tests: `moneyDerivation.test.ts` and friends read TypeScript, so "no offender found" means "none in TypeScript".
- **Already recorded as a trap** in the audit playbook (#314) and in the variants work, where repo-file guards were noted as blind to `pg_proc`. It cost a wrong finding again anyway, which is why it is a numbered shape now rather than a footnote.

**The second lesson, which cost more:** adding the missing ownership check to that function
*broke quote acceptance*, and only a probe caught it. The trigger does not wrap the call in an
exception handler, so `assert_workspace_member` raising inside it fails the entire `UPDATE` — and
a customer accepting from the public quote page has no JWT at all. Fixed by the core/wrapper split
(`_generate_order_from_quote_core` for the trigger, a guarded entry point for PostgREST), the same
shape `inbound_doc_to_supplier_bill` already uses.

- **Rule:** a SECURITY DEFINER function reached BOTH by a trigger and by PostgREST cannot carry one gate. The trigger's caller has already passed RLS on the row; the API's caller has not. Split it.
- **Proven to fire:** 2026-08-22 — accept-with-no-JWT reproduced the break before the split and passes after it; a stranger calling the RPC is refused; a member calling twice gets the same order.
- Two live BOLA holes were found this way and fixed: `generate_order_from_quote` (minted an order, burned an invoice number and issued a **live pay token** in any workspace) and `generate_supplier_bill_from_order` (booked a **payable** in any workspace). Both were `authenticated`-executable with a caller-supplied id and no check at all. A sweep for the same shape leaves ~10 more candidates, listed in #378 — mostly job/telemetry writers, one (`append_project_event`) able to forge an audit entry with an arbitrary `actor_id` and prune a project's history.

### 15. Two files, one policy — and the contradiction has no observable

`public/robots.txt` blocked `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot` and `Perplexity-User`
alongside `GPTBot` and `CCBot`. Those four are RETRIEVAL agents — they fetch a page to answer a
question someone is asking now, or to keep the index an answer cites from — so the platform was
absent from every answer engine **by configuration**. Meanwhile `public/llms.txt` sat there
addressed to exactly those agents, describing public surfaces they were forbidden to read.

Two files, two contradictory policies, and nothing anywhere that could notice: robots.txt has no
schema, no build step and no test. You find out by measuring an AI-visibility metric that has been
structurally zero the whole time — **which reads identically to being genuinely invisible.** It is
shape 4 (ambiguous zero) hiding in configuration rather than in code, and the ambiguity is worse
here because the "fix" you reach for is to work harder on visibility.

- **The generalisation:** whenever one policy is written down twice for two audiences, the copies are a drift surface, and a config file with no parser has no drift detector by default. The mechanism is the parser you write for the test.
- **Guarded by:** [tests/unit/crawlPolicy.test.ts](../tests/unit/crawlPolicy.test.ts) — parses robots.txt into groups (multi-`User-agent:` groups included, RFC 9309 §2.2.1), applies longest-match Allow/Disallow, asserts every retrieval agent can read the public surface and *cannot* reach a tokenised share URL or the app, asserts every training crawler is blocked by a group **of its own** (a crawler with no group falls through to `*` and is allowed — the trap the file's own header documents), and pins llms.txt to the same allow-set.
- **Proven to fire:** 2026-08-23, twice. (a) `Perplexity-User` moved back to the training block → the "may read the public surface" case failed, naming it. (b) The allow group's Disallow list deleted, leaving `Allow: /` — the exact "named group with no Disallow lines is an unrestricted crawl" trap — → **18 of 54** failed, every share-URL and app-surface case. Restored byte-identically both times; 54/54 green after.
- **Blind spot:** llms.txt is prose. The test can stop it disagreeing with robots.txt on the agent list; it cannot check that the surfaces it advertises still exist.

### 16. One addressing mode has a screen and the other does not

Shape 3's bigger brother. `tracked_mentions` is reached two ways — `/products/{id}/…` for a
product enrolment, `/track/{id}/…` for a free brand/keyword subject — and MIVAA has served
both since the feature shipped. The client implemented every reader once, in its product
form, so the subject arm had no screen; and `createTrackedMention`, the only way to make a
subject, had no caller either. The internal flow therefore held **zero** subjects: not
"none openable", none created and none creatable. `shareOfVoice()` had zero callers on the
day it was fixed, as did both opportunity readers — the read side of a ~2,000-line service
scoring AI Overview presence, PAA gaps and competitor rankings.

**The measurement trap, worth recording because it produced a wrong first reading.** There
ARE 17 rows in `tracked_mentions`, with 636 probe rows behind them, and the obvious reading
is "17 subjects nobody can open". They all carry `api_key_id` — they arrived through the
`kai_*` partner API, and the admin dashboard filters `.is('api_key_id', null)` deliberately,
because a partner's rows are not the operator's. So the count that matters is the filtered
one, and the honest statement is stronger, not weaker: the internal surface had no rows at
all. Counting a table without applying the screen's own filter is the same error shape as
`reltuples` (audit trap, #314) — a real number answering a different question.

Nothing failed. Every wrapper typechecked, every route routed, the suite was green, and the
admin page rendered a clean empty state.

- **Why it is worse than a dead action.** `inboxApiReachability` catches a single unreachable action. Here the unreachable thing was a *category of row*, and the guard you would naturally write — "does this reader have a caller?" — passes as soon as any one screen calls it with the kind it does support.
- **The tell:** a reader whose only parameter is one kind's id. `getProductLlmVisibility(productId)` cannot serve a subject however many callers it has.
- **Guarded by:** [tests/unit/mentionApiReachability.test.ts](../tests/unit/mentionApiReachability.test.ts) — every exported reader has a real caller (comments stripped); no reader is named `get*Product*`; `MentionSubjectRef` covers both modes AND both are built into a URL; the tab takes the ref; the admin list constructs a `{kind:'subject'}` ref; the create dialog collects `homepage_domain`.
- **Proven to fire:** 2026-08-23 — the pre-fix shape restored across three files (dashboard linking a product, tab taking a bare `productId`, one reader renamed back to `getProduct…`); 3 of 8 failed, naming each. Restored byte-identically; 8/8 green after.
- **Blind spot:** it knows about this one API. The same shape is available to any service with two id families — and `priceMonitoringApi` has exactly that structure.

### 17. A link that is a STRING, addressed from a runtime that cannot see the router

`user_notifications.action_url` is written by four runtimes — edge functions, MIVAA (Python),
frontend services, and a plpgsql trigger — and read by one line in the bell:
`navigate(n.action_url)`. `navigate()` treats ANY string as a PATH. So MIVAA's
`https://app.materialshub.gr/agent-hub?…`, correct as the CTA of the email carrying the same
digest, became the path `/https://app.materialshub.gr/agent-hub` and landed on the 404 catch-all.
Nineteen job digests stored that way; `projectRequestsService` wrote `${appUrl()}/…` at four more
sites.

The other half of the same click: `fn_notify_agent_completed` wrote a bare `/agent-hub` when the
finished run had no conversation to return to. From another page that opens an empty new chat;
from `/agent-hub` itself `navigate('/agent-hub')` is a **literal no-op** — the user clicks
"finished" and nothing moves, while the report sits in `agent_runs.output_data` with nothing
linking to it. A destination that exists is not the same as a destination that shows the thing.

Nothing could see either. The row is well-formed, the URL is valid, it is the right notification
sent to the right person at the right moment. TypeScript sees a string; an integrity probe sees a
populated column. Both were found by a person clicking the bell.

- **Why the existing guard missed it.** [deepLinkTargets.test.ts](../tests/unit/deepLinkTargets.test.ts) was written for exactly this class, and its scan was `action_url:\s*['"](/[^'"]*)['"]` — it matched only literals that ALREADY looked like a path. An absolute URL matched nothing and was therefore silently vouched for, which is the failure the file's own header says it must refuse. A guard that skips what it cannot parse reports clean on the defect it was written for.
- **The tell:** a destination addressed by string from outside the module that owns the destination, where the SAME string is also consumed by a second channel with a different contract (a bell path vs an email URL). One of the two is always wrong and neither runtime can tell.
- **Guarded by:** producer side — a new case in `deepLinkTargets.test.ts` failing any non-path `action_url` literal, plus [test_bell_action_url_is_a_path.py](../mivaa-pdf-extractor/tests/unit/test_bell_action_url_is_a_path.py) (AST, stdlib-only) for the Python half. Read side — `resolveNotificationTarget` ([src/utils/notificationLink.ts](../src/utils/notificationLink.ts), [tests](../tests/unit/notificationLink.test.ts)), because a producer fix cannot reach rows written months ago.
- **Proven to fire:** 2026-08-26 — a planted `src/__tmp_absurl_probe.ts` holding one absolute `action_url` failed the new case, naming the file and line; removed after. Both trigger branches were then live-fired against the real database inside a rolled-back `DO` block.
- **Blind spot:** `action_url: url` is an identifier, and source cannot judge it — the moodboard dormancy warning legitimately points at a `/functions/v1/…` endpoint that is not a route here. Those are only caught at read time. And nothing checks that a link which *resolves* actually **shows the thing**: `/agent-hub` was a real route the whole time.

---

---

### 18. Half-finished flow with a retryable button — the write committed, the screen says Failed

The dominant shape of the finance and HR audits: **eight findings across #351 and #354 were one
sentence.** A create-then-stamp pair with no transaction; the first write commits, the second
fails, the screen says `Failed`, and the operator does the only thing offered — presses it again.

| Where | The second copy |
|---|---|
| `billToInvoice` / `billToClient` (#351 S4) | the same hours, billed twice |
| `createExpense` (#351 C3) | a second supplier bill AND a second payment for one cost |
| `NewDeliveryNoteDialog` (#351 C4) | a second delivery-note header, the first invisible |
| `ReturnPaymentDialog` (#351 A1) | credit notes re-issued — transmitted legal documents |
| `pos_issue_receipt` (#351 C1) | two receipts, two payments, two stock reductions |
| ΕΡΓΑΝΗ separation / overtime / schedule / retry (#354 HR-2) | a second declaration to the ministry |

**Why nothing catches it.** Each half works. The types check, the tests pass, the error is
reported — accurately, for the half that failed. What is wrong is the *pair*, and the tell is not
in either statement: it is that the failure message and the button do not agree about what
happened. `uncheckedSupabaseWrites` cannot see it, because every write here IS checked.

**Three fixes, and the choice between them is the finding.**

1. **One transaction** where the work is naturally atomic — the CLAUDE.md prescription, a SQL RPC.
   `bill_time_entries_to_invoice` and `bill_trip_expenses_to_invoice` are the shape: the stamp is
   also the CLAIM (`billed_invoice_id is null` in the WHERE plus a count check), so a lost race
   aborts instead of double-billing.
2. **An idempotency key** where a retry is legitimate and the work is not repeatable — `pos_issue_receipt`
   takes a token minted per BASKET and replays the stored receipt for it. The client latch is not
   enough on its own: it closes the double-tap and cannot close the dropped connection, which is
   the case where the operator has an error message for a document that exists.
3. **Resumable and honest** where the second half cannot be rolled back — a filing to a ministry
   has happened whatever the local row says. Each leg records that it ran, the retry resumes at
   the first one that did not, and the toast names the half that failed. Reporting it as a failure
   makes the operator re-file; reporting it as a clean success means nobody repairs the record.

**The rule that falls out of it:** an action that cannot be undone must never be reported as
either a plain success or a plain failure when only half of it happened. And a duplicate guard
must read the record written on the SUCCESS path, not the local status column written after it —
that column is precisely the one that can be missing.

- **Guarded by:** [tests/unit/financeAtomicity.test.ts](../tests/unit/financeAtomicity.test.ts) (20 cases) and [tests/unit/hrFilingIntegrity.test.ts](../tests/unit/hrFilingIntegrity.test.ts) (27 cases). Both check the ORDER of things — the latch before the first `await`, the guard before the settle, the punch read before the credit debit — because a check that exists after the side effect is not a check.
- **Proven to fire:** 2026-08-29 — every marker confirmed absent at the pre-fix commit, and the negative assertions target code that still existed there (`settled: 0` fallback, `const requirePin = !!settings…`, `round2(weekly_hours / 5)`, the empty `catch { }`).
- **The SQL half is invisible to both.** `pos_issue_receipt`'s token, `issue_credit_note`'s cumulative cap and the `hr_time_punches` sequence trigger live in `pg_proc`, where no repo-file test can see them; they are asserted in [tests/integration/fiscal-derivations.test.ts](../tests/integration/fiscal-derivations.test.ts) and were verified against the live database with rolled-back fixtures.
- **Blind spot:** both guards are per-file and per-finding. The shape is available to every "create then stamp" pair in the codebase, and neither test would notice a NEW one. The cheap search is a `await` that writes, followed by another `await` that writes, inside one `try` whose `catch` shows a single generic toast.

### 19. One rule, two shared helpers, and the wrong one is imported

`_shared/client-ip.ts` says never key a rate limit on the leftmost `x-forwarded-for` hop, because
Cloudflare APPENDS the connecting IP and the left end is whatever the caller prefixed.
`_shared/turnstile.ts` exported a `clientIp` that took the leftmost hop — **citing the same
invariant, in a comment asserting the opposite fact**. Both are shared helpers, both look
canonical, and the public forms imported the second: the careers board, the storefront, the embed
and products-3d all keyed their per-IP limits on a value the caller chooses. Rotating one header
minted a fresh bucket per request.

This is shape 15 (two files, one policy) with the contradiction moved up a level: not two call
sites disagreeing, two *canonical helpers* disagreeing, so the fix everyone reaches for — "use the
shared helper" — was already what both sides had done.

- **The tell:** two exports with the same NAME in different shared modules. `escapeHtml` has three
  copies and is safe only because [tests/unit/escapeHtmlParity.test.ts](../tests/unit/escapeHtmlParity.test.ts) holds them byte-equivalent — which is the mechanism this needed and did not have.
- **Fixed by deletion, not by a parity test:** `turnstile.ts`'s copy now delegates to
  `getTrustedClientIp`. One implementation cannot disagree with itself.
- **Not yet guarded.** The parity-test approach fits a family that must stay separate for runtime
  reasons; two helpers in the SAME runtime should simply be one, and a test that pins two
  implementations together would legitimise the duplicate. The check worth writing is different:
  a shared module exporting a name another shared module already exports.


### 20. A migration that verifies its own edit by looking for a STRING

Surgery on a live `pg_proc` definition is the sanctioned way to change a long accumulated function
here — a wholesale `CREATE OR REPLACE` from a stale copy is how the silent-zero probes were once
deleted. The pattern comes with a verify block, and on 2026-08-30 four functions shipped broken
because the verify block asked the wrong question.

Adding `deal_id` to the chain functions (#378 C3) meant editing two lists per INSERT: the column
list and the VALUES list. Two of the four edits landed on the column list only. The verify block
asserted `position('deal_id' in def) > 0` — **that the string appears** — which a column list
naming a value that is not there satisfies perfectly.

`generate_order_from_invoice` and `issue_invoice_from_quote` were then broken outright: every call
raised `42601 INSERT has more target columns than expressions`. Two more functions in the same
batch used `min(uuid)`, which does not exist, and would have raised the first time anyone billed
logged time.

**Every one of the four passed `CREATE`, passed lint, passed typecheck, and passed a full 3,793-test
suite**, because the suite reads TypeScript and the SQL is never committed. This is the shape
CLAUDE.md already records for `get_website_rank_summary`: the migration applies clean and the
function fails the first time a user calls it.

- **What caught it:** `lint_plpgsql_errors()` — the `db.plpgsql-lint` smoke check — run by hand
  after the migrations rather than waiting for the nightly. All four appeared in one query.
- **The rule:** a verify block that greps the function's TEXT proves the edit was written, not that
  it works. **Call the function.** The repaired migration ends with a rolled-back probe that
  invokes all four end to end and asserts the deal and the job actually arrive on the row.
- **Corollary for `INSERT` surgery specifically:** anchor on BOTH lists, and make the anchor for
  the values list a string that could only appear there. An edit to one list and not the other is
  invisible to any text search for the column name.
- **Run `lint_plpgsql_errors()` in the same session as the migration.** It is already wired as a
  post-deploy smoke check, but a defect that reaches a smoke check has already been merged; run at
  authoring time it costs one query.


### 21. A fix whose cost scales with the data, in a place that is never tested with any

`job-cleanup-cron` deleted `flow_run_steps` by age alone, so a run still in flight after 30 days
lost its history. AD-28 fixed that properly: resolve the finished parents first, delete only their
steps. The new query passed one uuid per finished run into a PostgREST `in.(…)` filter — and that
filter travels in the URL.

Measured against production: **900 uuids is a 33,399-byte URL and the gateway answers 400**; 20
uuids answers 200. The reaper returned 200 every Sunday until 2026-08-16 and 500 on 08-23 and
08-30 — it broke the week flows got busy, not the week the code changed. Nothing about the code
looked different at 20 rows and at 900.

- **The tell:** a filter built by `.map()` over a previous query's rows, where that query carries
  `.limit(1000)`. The URL length is then set by how busy the platform is, which is the one variable
  a test never has.
- **The repair was a deletion.** `flow_run_steps.flow_run_id` is `ON DELETE CASCADE`, so deleting
  the finished runs already removes exactly their steps — atomically, with no id list and no window
  in which the parent is gone and the children are not. Before reaching for chunking, check whether
  the database already does the work.
- **Counting is not exempt.** The replacement counts through an inner join on the parent
  (`flow_runs!inner(status,created_at)`), so the reported number stays true with a fixed-length URL.
- **What caught it:** `ops.cron_reported_success_but_no_effect`. pg_cron reported `succeeded` for
  two weeks because it only sees that `net.http_post` was enqueued — the invocation's own status is
  invisible to it. That probe is the only thing standing between this class and silence.
- **Guarded** by [tests/unit/jobCleanupCron.test.ts](../tests/unit/jobCleanupCron.test.ts), which
  also counts `console.error` calls against `failures.push` calls — `generation_3d` was still
  swallowing its error two months after AD-29 removed that shape from the other ten blocks.


## Mechanism inventory

| Mechanism | Runs | Enforces | Self-proving? |
|---|---|---|---|
| `.github/semgrep-security.yml` (9 rules) | CI, blocking | invariants 1, 6–11, plus shape 6b | partly — [tests/unit/semgrepRuleset.test.ts](../tests/unit/semgrepRuleset.test.ts) checks parse validity, rejects `catch (...)`, and pins the UTC-date rule's shape, but cannot prove a rule *matches*. `no-utc-today-as-local-date` was probe-run against a file of known offenders before being trusted |
| [tests/unit/paymentDestinationGuards.test.ts](../tests/unit/paymentDestinationGuards.test.ts) | `npm test`, blocking | an IBAN is mod-97 checked on every service write path; "set primary" goes through one SQL transaction | partly — the mod-97 half is behavioural (published specimen IBANs plus their single-digit typos); the atomicity half is source shape |
| `crm_bank_accounts_iban_mod97_check` + `public.iban_is_valid(text)` | every write, DB | shape: a typo'd payment destination | **yes** — watched to reject a single-digit typo and accept the real IBAN, as `authenticated`, inside a rolled-back transaction (2026-08-16) |
| [tests/unit/emailSuppression.test.ts](../tests/unit/emailSuppression.test.ts) | `npm test`, blocking | shape 6c — the unsubscribe check cannot move back inside the marketing branch, must read its lookup error, and the periodic pushes stay off the transactional allowlist | **yes** — the ordering assertion was watched to fail against a decoy match before being anchored |
| `check_security_invariants()` RPC | nightly | invariants 2–4, live DB | no |
| [tests/unit/realEstateSubmoduleGates.test.ts](../tests/unit/realEstateSubmoduleGates.test.ts) | `npm test`, blocking | a paid Real Estate add-on is enforced where the query runs. Membership is DERIVED from the table each handler touches, so a new action is covered the day it is written, not the day someone remembers the list | **yes** — the pre-fix sets restored; the test named all seven unguarded actions (`update-tenancy-lifecycle`, `rotate-tenant-portal-token`, the inspection pair, all three deletes) and passed again on the fix (2026-08-30) |
| [tests/unit/projectTabLinks.test.ts](../tests/unit/projectTabLinks.test.ts) | `npm test`, blocking | a `/projects/:id?tab=…` link lands on that tab: every link site in the repo names a declared tab, the page actually reads the URL, and the declared list equals the rendered triggers AND contents | **yes** — written against the defect: the page held its tab in `useState` and ignored `?tab=` entirely, so all seven links (a button in `BillingTab`, four `project_request_*` notifications, the sheet-share function) landed on Overview (2026-08-30) |
| [tests/unit/inboxChipContrast.test.ts](../tests/unit/inboxChipContrast.test.ts) | `npm test`, blocking | a colour is a light/dark PAIR and clears WCAG AA against the REAL `--card` of all four themes — palette and theme tokens both read from source, so neither is a copy that can drift | **yes** — extended 2026-08-30 to `statusTone` (the platform-wide helper: `emerald-600` measured 3.57:1 on cream, `amber-600` 3.02:1, `red-500` 3.57:1) and to the Projects + Real Estate modules, and it failed on all three before the fix |
| `run_data_integrity_checks` | nightly cron | detect/heal registry | yes — `ops.integrity_registry_broken` validates the registry's own signatures |
| `npm run typecheck` | CI, blocking | `src/` types | n/a |
| `npm run typecheck:edge` | CI, blocking | edge types, baseline-ratcheted | yes — re-runs quiet files alone, because `deno check` prints nothing on a cache hit |
| `npm run lint:a11y` | CI | jsx-a11y, per-rule ratchet | partly — [tests/unit/a11yRatchet.test.ts](../tests/unit/a11yRatchet.test.ts) fails if a rule returns to `'off'` |
| `npm run lint:tenancy` | CI | invariant 1, two-doors | **yes** — self-test runs before every scan |
| `ops.silent_zero` | nightly | shape 4 | no |
| [tests/unit/inboxApiReachability.test.ts](../tests/unit/inboxApiReachability.test.ts) | `npm test`, blocking | shape 3 — an `inbox-api` action no screen can reach, and an intake price echoed back as the member's own | **yes** — mutation-tested by renaming both call sites and dropping the price guard; 3 of 5 assertions failed, naming the actions (2026-08-20) |
| `ops.silent_zero_probe_missing` | nightly | shape 4g — a probe silently dropped from the detector by a full `CREATE OR REPLACE` | **yes** — watched to go 0 → 15 → 0 with the detector stubbed inside an aborted subtransaction (2026-08-20); re-watched 2026-08-23 for the `seo #349` roster entry specifically |
| [tests/unit/mentionApiReachability.test.ts](../tests/unit/mentionApiReachability.test.ts) | `npm test`, blocking | shape 16 — a reader, or a whole addressing mode, with no screen | **yes** — pre-fix shape restored across three files; 3 of 8 assertions failed, naming each (2026-08-23) |
| [tests/unit/crawlPolicy.test.ts](../tests/unit/crawlPolicy.test.ts) | `npm test`, blocking | shape 15 — robots.txt and llms.txt expressing two different crawl policies, and retrieval agents blocked as if they were training crawlers | **yes** — two mutations, 1 and 18 assertions failed as intended (2026-08-23) |
| [test_llm_visibility_is_a_measurement.py](../mivaa-pdf-extractor/tests/unit/test_llm_visibility_is_a_measurement.py) | MIVAA CI, blocking | shape 3 + shape 4 on the LLM-probe pipeline — a `days` param never applied, a sentiment score diluted by the probes that never mentioned the subject, a ghost citation nothing could see, a substring domain match | **yes** — three mutations restoring the original defects; 3, 3 and 1 assertions failed as intended (2026-08-23) |
| `ops.silent_zero` probe `seo_article_refresh_due_never_emitted` | nightly | shape 4 — generated articles aging past their refresh cadence while the weekly sweep tells nobody | **yes** — 4 overdue fixtures inside a rolled-back transaction produced the finding; the same fixtures with `refresh_notified_at` set produced none (2026-08-23) |
| [tests/unit/zernioSecretResolution.test.ts](../tests/unit/zernioSecretResolution.test.ts) | `npm test`, blocking | shapes 3 + 4 — an admin-editable secret read through `Deno.env` on the edge, where the DB→env bootstrap cannot work | **yes** — mutation-tested by restoring one of the four original hand-rolled getters; 2 of 6 assertions failed, naming the file |
| `ops.page_embeddings_never_written` | nightly | shape 4, page channel (#239) | no — but it was run against the live DB on introduction and returned clean |
| [tests/unit/test_page_embeddings.py](../mivaa-pdf-extractor/tests/unit/test_page_embeddings.py) | `pytest`, blocking | shape 4e + Phase-0 isolation on `page_embeddings` | **yes** — every assertion was mutation-tested against a deliberately broken copy of the code it guards |
| [tests/unit/test_no_fallback_embedder.py](../mivaa-pdf-extractor/tests/unit/test_no_fallback_embedder.py) | `pytest`, blocking | shape 4e — a second embedding provider reappearing anywhere | **yes** — mutation-tested by editing the REAL files and running pytest, not by re-implementing the assertions. That distinction found two holes: stripping all string literals made it blind to a reintroduced API URL, and a `startswith` check missed the batch form `[[0.0] * 1024] * len(texts)` |
| [tests/unit/test_weight_profiles.py](../mivaa-pdf-extractor/tests/unit/test_weight_profiles.py) | `pytest`, blocking | a fusion vector scoring zero on a path someone missed | **yes** — the image-only weights are pinned to their pre-page values, so the #239 carve-out proved itself non-disruptive rather than being asserted to be |
| [tests/unit/test_ssrf_guard_coverage.py](../mivaa-pdf-extractor/tests/unit/test_ssrf_guard_coverage.py) | `pytest`, blocking | invariant 7 — any server-side fetch of a user-influenced URL that is not the guarded fetch, across the whole `app/` tree with **no allowlist** | **yes** — 2026-08-16: reverting `admin.py` alone makes it fail naming `reprocess_image_ocr()`, and it passes on the fixed tree. It also asserts `scanned > 100`, so an inert walk fails instead of reporting clean — which is precisely how its one-declared-file predecessor passed for as long as it did. `KNOWN_UNGUARDED` was **deleted**, not emptied, once its nine entries were fixed |
| [tests/unit/test_safe_fetch_bytes.py](../mivaa-pdf-extractor/tests/unit/test_safe_fetch_bytes.py) | `pytest`, blocking | the guarded fetch itself — per-hop re-validation of every redirect and the streaming byte cap. Now the single fetch path for 11 call sites, so a weakness here is a weakness in all of them at once | **yes** — 2026-08-16, mutation-tested in both directions on the REAL file: making validation hop-blind fails 2 tests, moving the cap to after the body is read fails 2. Driven by a stub client rather than `httpx.MockTransport`, because CI installs pytest and nothing else and a third-party import would make the module uncollectable |
| `dic_detect__schema_workspace_fk_missing` | nightly (integrity registry) | a `workspace_id` column with no FK to `workspaces` — rows that outlive their workspace, unreadable by RLS (fail-closed on a dead id) and unreachable by FK-walking cleanup | **yes** — watched to fire 2026-08-18 on a canary table created for the purpose, naming it and the `ON DELETE` its nullability implies, then clean again once dropped. Reads `pg_catalog` live rather than a remembered table list, so it cannot go stale; the three exemptions (`prompts`, `payment_audit_log`, `data_integrity_findings`) each carry their reason in the function body |
| `ops.storage_paths_unregistered` | nightly | shape 4d | **yes** — reads `build_storage_reference_set()`'s own body, so it cannot drift from what the cron actually honours |
| `ops.money_without_currency` | nightly | shape 6 | no — but all three branches were watched to fire before shipping |
| `ops.unsent_queue_backlog` | nightly | shape 4c | no — but it fired on real production data on introduction |
| [tests/unit/edgeRequestSurface.test.ts](../tests/unit/edgeRequestSurface.test.ts) | `npm test`, blocking | shape 9 — eager-bundle pins + the SPA catch-all's 404 surface | **yes** — both regressions reintroduced into the real files on 2026-08-10 and watched to fail (1 assertion, then all 31), not re-implemented in the test |
| `pdf.product_resume_incomplete` | nightly | shape 4b | no — but it was watched to fire on a planted marker before shipping |
| [tests/unit/escapeHtmlParity.test.ts](../tests/unit/escapeHtmlParity.test.ts) | `npm test`, blocking | invariant 11 — the three `escapeHtml` twins (Vite / Deno edge / Vercel `api/`) stay byte-equivalent | **yes** — imports all three and diffs them over a shared corpus, so a twin that stops matching fails the build rather than reporting clean |
| [tests/unit/aiUsageAttribution.test.ts](../tests/unit/aiUsageAttribution.test.ts) | `npm test`, blocking | every `ai_usage_logs` insert sets `workspace_id` and `user_id` — a row with neither is owned by nobody, so it is invisible both to per-tenant cost views and to that table's own `auth.uid() = user_id OR is_workspace_admin(workspace_id)` policy, which cannot match on NULL | **yes** — a `workspace_id` line was deleted from `generate-vr-world` on 2026-08-12 and the guard failed with the right file and line, then passed again on restore. Parses each insert by brace matching rather than a regex that stops at the first `}` and silently passes a site it never read, and asserts it found >20 sites before trusting the verdict |
| Column GRANTs on `invoice_items` + `order_items` | every read, DB | #358 — `unit_cost_snapshot` / `line_cost` / `line_margin` and `unit_cost` are not selectable by `authenticated`; `get_invoice_item_costs()` / `get_order_item_costs()` gate on `is_workspace_sell_side`. `issue_invoice_from_quote` copies the quote line's cost onto the invoice line, so locking `quote_items` alone just moved where the customer read it from | **yes** — `has_column_privilege` verified false for all four and true for `line_total` / `unit_price`; guarded in source by `quoteCostBasis.test.ts`, mutation-tested by putting `unit_cost` back into `getOrderSupplierExposure` |
| Column GRANTs on `public.products` | every read, DB | #358 — `cost`, `cost_currency`, `cost_updated_at`, `cost_source`, `markup_percent` and `attributes_raw` are not selectable by `authenticated`/`anon` at all; `get_product_costs()` is the only browser-reachable path and gates on `is_workspace_sell_side`. RLS could not express it: the table's one SELECT policy is workspace MEMBERSHIP, which a `client` project customer has | **yes** — `has_column_privilege('authenticated', …)` verified false for all six and true for the other 77, and `service_role` retains the whole table. Paired with a source-side scanner in `productReadProjection.test.ts` so a reintroduced column name fails CI instead of failing on the user's screen |
| [tests/unit/quoteCostBasis.test.ts](../tests/unit/quoteCostBasis.test.ts) | `npm test`, blocking | #358 PQ-2/6/9/13/14 — no `quote_items` payload carries `cost_snapshot` or `line_total`, no quote write carries `margin_pct`, the pricing RPC is not handed a client-computed total, the share page derives its money, the pickers are workspace-scoped and fail closed, and site photos are signed rather than public | **yes** — mutation-tested 2026-08-17 by putting `line_total` + `cost_snapshot` back into `QuotesService.addItem`; both assertions failed naming the file. Anchors on the named payload BUILDER (not the insert call), because two of the four writers build their rows in a helper and an insert-site regex would have found neither — and it asserts every anchor still matches, so a restructure fails instead of scanning nothing |
| [tests/unit/workspaceRoles.test.ts](../tests/unit/workspaceRoles.test.ts) — the tier cross-product | `npm test`, blocking | #358 PQ-1 — the workspace role beats EVERY account tier, for every role, and no scoped role can reach `platform.admin`/`network.manage`/`pricing.manage`/`catalog.import` through one | **yes** — mutation-tested 2026-08-17 by moving the account-tier switch back above `TEAM_ROLE_PERSONA`; 3 assertions failed. The pre-existing per-role test passed `accountRole: null`, which is exactly why it never fired on the real bug — the cross-product is the whole point |
| `lint_plpgsql_errors()` via `db.plpgsql-lint` | smoke monitor, 2-hourly | every `public` plpgsql function still compiles against the live schema | yes — baseline is a strict **zero**, so any new breakage fails instead of blending into a known-broken list |
| [tests/unit/companyIdentity.test.ts](../tests/unit/companyIdentity.test.ts) | `npm test`, blocking | shape 8 — one identity lookup for every create-a-business surface, `crm_companies` direct-insert ratchet | **yes** — asserts its own scan matched >500 files before trusting the verdict, so an inert glob fails instead of reporting clean |
| [tests/unit/profileBusinessIdentity.test.ts](../tests/unit/profileBusinessIdentity.test.ts) | `npm test`, blocking | "am I a business?" has ONE derivation (`public.user_business_identity()`) and no TypeScript twin — the card calls the RPC, no client file touches the `business_*_en` columns, and the role gate reads the derivation instead of `entity_type` | partly — the parser half is behavioural (including the half-identity case, which must fall back to solo rather than render a company card with a blank VAT number); the SQL half cannot run here (it lives only in `pg_proc`) and was verified live against the MATERIALS BANK ΕΕ row when it shipped. What this test actually guards is the copy growing back |
| [tests/unit/productRelationDerivation.test.ts](../tests/unit/productRelationDerivation.test.ts) | `npm test`, blocking | shape 1 off the money path — a second client-side derivation of "what relates to this product" (#267) | **yes** — asserts its scan matched >100 files, and was watched to fail on a planted violation before shipping |
| `product_edges` composite FKs | every write | invariant 1 — an edge's two products must both sit in the edge's workspace | n/a — declarative; unlike a trigger it cannot be disabled |
| `ops.product_edges_never_written` | nightly | shape 4 on the edge rebuild — it ran and wrote nothing, or has not run for 3 days | **yes** — both branches were watched to fire on planted state, and the healthy case was confirmed to return **0** rows first, so a probe that always fires would have been caught |
| [tests/unit/productFieldSensitivity.test.ts](../tests/unit/productFieldSensitivity.test.ts) | `npm test`, blocking | shape 10 — the product Details tab renders arbitrary jsonb keys, so it must withhold anything the registry has not vouched for; plus "no `select('*')` from `products` in the modal" | **yes** — 2026-08-16, mutation-tested on the REAL file in both places the walker enters (flat keys and nested groups) and on the three-valued verdict. Asserts the *unknown-with-no-pattern* case resolves to `null`, not `false`, because that is the branch a failed fetch takes |
| [tests/unit/productReadProjection.test.ts](../tests/unit/productReadProjection.test.ts) | `npm test`, blocking | shape 10's read side — no `select('*')` on `products` that returns rows, and no embedded `products(*)` reached through a join. Pinned at **zero**, because the class was emptied rather than baselined | **yes** — 2026-08-16, both branches watched to fire by reverting the real files. Two scanners on purpose: a `from('products')` search cannot see `select('*, product:products(*)')` on `quote_items`, which was the customer-facing one. Asserts it walked >500 files, so an inert scan fails instead of reporting clean |
| [tests/unit/categoryFieldRegistry.test.ts](../tests/unit/categoryFieldRegistry.test.ts) | `npm test`, blocking | one field registry — `UploadCategory` derived from the projection rather than typed out, no hardcoded facet array, and no per-category map of sections and field labels anywhere in `src/` | partly — the copy-detection is a source walk, so a copy in a shape it does not recognise is invisible. The category assertions are real: it fails if `resolveUploadCategory` cannot resolve a DB category, which is how `building_materials` sat unresolvable |
| [tests/unit/moneyDerivation.test.ts](../tests/unit/moneyDerivation.test.ts) — *the product catalog price* block | `npm test`, blocking | shape 5 + shape 4 on `product_prices`: no TypeScript may write or derive `discount_price`, and every upsert must name the real unique index `(workspace_id, product_id, variant_key)` | **yes** — 2026-08-16, both regressions replanted in the REAL files and watched to fail naming file and line, then restored. The upsert scanner is scoped to the `product_prices` statement, not the file: a file-wide first draft flagged `storefrontService.saveConfig`, whose `onConflict: 'workspace_id'` is correct for `workspace_storefront`. It also flags a **missing** onConflict, which infers the primary key `id` and duplicates instead of updating |

| [tests/unit/installedBaseDerivation.test.ts](../tests/unit/installedBaseDerivation.test.ts) | `npm test`, blocking | shape 1 off the money path — a cached `next_due_on` or a client-side recomputation of a service date (#343), plus a hardcoded notification/email send in the reminder cron | **yes** — the banned-identifier regex was checked in BOTH directions against the realistic spellings (a snake_case-only first draft waved `nextDueOn` straight through), then a real violation was appended to `customerAssetsService.ts` and watched to fail before being reverted |
| `ops.asset_reminders_silent_zero` | nightly | shape 4 on the equipment reminder cron — it ran, exited 0, and told nobody | **yes** — watched to fire on a planted 30-day-overdue occurrence AND watched to stay silent once that row was stamped, so a probe that always fires would have been caught. Fixing the second half changed the probe: the overdue-only path leaves `reminded_at` null by design, which the first draft reported as neglect |

| `ops.flow_condition_edge_unrouted` | nightly | a flow branch that evaluates and routes nowhere — the engine matches a condition's outgoing edges by `sourceHandle`, so an edge without one silently reaches no action while the run reports **completed** | **yes** — and the first cut was WRONG in the informative direction: it fired on 9 healthy `loop → notify` flows, because `loop` runs its children inline with no handle check. Corrected to exclude `loop`/`stop`, then watched to return 0 on the real graph AND to fire on a deliberately stripped handle |

| `ops.email_delivery_failing` | nightly | outbound mail failing at scale — the sender domain stops being verified and every send 403s | **yes, against real history** — returns 0 today, and the same predicate over the window ending 2026-07-28 gives 137 attempts / 1 delivered / **0.7%** -> fires. Uses a RATE, not zero, for the reason recorded above: an exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5% |
| `ops.crm_company_embeddings_never_written` | nightly | shape 4 on the company lookalike engine (#289) — the drain cron stops and `crm_company_lookalikes` returns nothing forever, which the Market tab renders as *"nothing in your CRM stands out as similar"*: a statement about the customer's data that is really a statement about our pipeline | **yes, both halves** — fired on 2026-08-15 before the first drain (42 embeddable, **0** embedded, coverage 0%) and returned **0** rows after it (42/42), so a probe that always fires would have been caught. Uses a rate, not an exact zero, for the reason recorded above |

**"Self-proving"** means the mechanism demonstrates it can still detect, rather than only reporting
what it found. **Twenty-two of thirty-two** qualify. That is the gap.

(That sentence read "fifteen of twenty-five" until 2026-08-16, by which point the table held thirty
rows. Recounted rather than incremented. A summary line that drifts from the table above it is a
small instance of the thing this document is about, and the fix is to derive the number from the
rows each time it is touched, not to trust the previous author's arithmetic. This paragraph earned
itself immediately: the edit that added it first wrote "twenty-one", counted by hand, and was one
short.)

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

---

## Integrity-detector verification sweep — 2026-08-12

The 57-check `data_integrity_checks` registry had never been held to the rule at the top of this
file. Of 57 enabled checks, **9 had ever produced a finding** in 59 sweeps since 2026-06-26; the
other 48 were clean and unproven — indistinguishable states.

Method: plant the defect inside a transaction, run the detector, `ROLLBACK`. Verified in one call,
no trace left. Where a write-time trigger blocks the plant (`enforce_allocation_not_over_total`),
`ALTER TABLE … DISABLE TRIGGER USER` inside the same transaction — which is what proves the detector
is a genuine *backstop* rather than a restatement of the constraint.

**Watched to fire (defect planted, detector returned it, rolled back):**

| Check | Planted |
|---|---|
| `tenancy.order_item_workspace` | order_item whose `workspace_id` ≠ its order's |
| `tenancy.payment_order_workspace` | payment in workspace A tagged to an order in workspace B |
| `finance.order_item_net_mismatch` | `net_value` ≠ qty × unit_price |
| `finance.order_payment_status_drift` | cached `payment_status='paid'` on an unsettled order |
| `finance.order_over_settled` | allocation > order total (trigger disabled in-txn) |
| `finance.payment_over_allocated` | allocation 500 against a payment of 100 |
| `finance.quote_totals_drift` | `grand_total` moved off its derivation |
| `ops.integrity_registry_broken` | registry row naming a `detect_fn` that does not exist |
| `ops.cron_reported_success_but_no_effect` | fired on the real 2026-08-12 sweep failure; cleared on the fix |
| `ops_upsert_arbiter_uninferable` | fired on `uq_customer_assets_order_item`; cleared on the fix |
| `ops.silent_zero_probe_missing` | detector stubbed to an empty body in-txn — 15 findings, one per rostered probe |

**Two checks were found broken by this exercise — the reason it was worth doing:**

- **`ops.monitoring_stalled` (job-research:digest) was VACUOUS.** It watched
  `job_listings.digest_included_at`, a column nothing writes: delivery in that design is a *purge*
  (row deleted, tombstone written to `job_research_sent`). It read all-null forever and could not
  distinguish a working digest from a dead one — it had been firing for weeks as a true statement
  about a meaningless number, occupying the place a real check should have had. Rewritten to watch
  in-window matches left unpurged after a digest ran, plus a separate signal for matches that aged
  out undelivered.
- **`finance.money_fn_bypasses_derivation` matched a variable name, not a defect.** Its predicate
  required `v_quote.grand_total` — the local used by the one historical offender. Proven brittle:
  two functions planted in a rolled-back transaction, doing the identical wrong thing, differing
  only in whether the local was `v_quote` or `q` — it found exactly one. This is the same
  false-negative [tests/unit/moneyDerivation.test.ts](../tests/unit/moneyDerivation.test.ts)
  documents in its own header ("a text pattern rule is only ever as strong as the names people
  happen to pick"). Re-keyed on the shape. **Broadening it immediately surfaced two live violations
  the narrow rule had been missing for as long as it existed** — `generate_order_from_quote` and
  `materialize_upstream_orders`, both minting invoice `subtotal_net` / `vat_amount` / `total`
  straight from the cached `quotes` columns.

  **Resolved the same day.** `generate_order_from_quote` now reads `get_quote_totals` for BOTH the
  order and the pre-invoice (it read the cache four times: order totals, invoice totals, and a
  vat_rate hand-derived from cached vat/subtotal), and fails closed rather than falling back to the
  cache — a wrong total is a valid `numeric`, so nothing downstream would raise. Verified by
  corrupting the cached columns to 1/1/2 inside a rolled-back transaction and confirming the order
  and invoice still came out at the derived 3000/720/3720.

  `materialize_upstream_orders` was a FALSE POSITIVE and is now exempted by name with its reason:
  it mints an inter-tier reseller invoice whose money is summed from item COSTS, reading the quote
  only for currency and numbering. Exempted explicitly rather than by re-narrowing the pattern —
  that would have silently restored the false negative which hid a live defect for months. The
  exemption list may shrink, never grow without a reason written beside it.

**Still unproven:** the remaining ~13 `critical` checks (catalog ×3, credits, embed,
`finance.derived_doc_drift`, `finance.stock_bypasses_document_gate`, `ops.email_delivery_failing`,
`ops.storage_paths_unregistered`, `realestate.commission_over_allocated`, `stock.reservation_missing`)
and all `warning`-severity checks. A clean run from any of them still means nothing.

### Completing the sweep — 21 of 22 `critical` checks now watched to fire

Same method (plant inside a transaction, detect, `ROLLBACK`). Added to the ten recorded above:

| Check | Planted |
|---|---|
| `stock.reservation_missing` | confirmed sales line with free stock, allocation deleted to simulate the reserve that never ran |
| `finance.derived_doc_drift` | supplier bill of 9,999 against a 2,580 purchase order |
| `finance.stock_bypasses_document_gate` | a non-document function calling `_deliver_order_line_core(..., true)` |
| `credits.pool_ledger_drift` | pool balance moved away from its transaction sum |
| `catalog.price_world_readable` | a `*_cost` column added to the world-readable `catalog_master_products` |
| `catalog.publish_writes_cost` | a `publish_*` function writing `supplier_products` |
| `catalog.claim_without_contact` | supplier claimed with `claim_contact_id` null |
| `realestate.commission_over_allocated` | a 999,999 fixed split against a 2,000 commission base |
| `ops.storage_paths_unregistered` | a new table with a `storage_path` column, absent from `build_storage_reference_set()` |
| `ops.email_delivery_failing` | 20 sends, 2 delivered, in-window |

**Still unverified: `embed.spec_offer_match_drift`.** Not for lack of trying — the offering
(`get_embed_spec_options`) and the matcher (`resolve_product_spec`) both derive from the same
product data, so clearing a product's attributes removes the value from *both* and they stay
consistent. Planting a genuine divergence needs the `in_catalog` computation understood well enough
to desynchronise the two halves deliberately. Its clean run still means nothing.

**Two things the sweep incidentally established:**

- The **auto-reserve trigger works.** The first `stock.reservation_missing` plant did not fire
  because inserting a confirmed sales line *correctly* created a reserved `stock_allocations` row
  and decremented free stock (10 → 8). The detector only fired once that allocation was deleted —
  which is the right behaviour, and confirms both halves.
- **`ops.email_delivery_failing` has no workspace scope.** Its 14-day window aggregates
  `email_logs` platform-wide, so one tenant's outbound collapsing is diluted by everyone else's
  successful sends. With a single active workspace this is invisible; with fifty tenants a
  workspace whose sender domain has been dropped will never reach the <20% global threshold. It had
  to be isolated (delete in-window rows inside the transaction) before it would fire at all.

  **Fixed the same day.** The check now buckets by workspace, with unattributed rows judged as their
  own bucket rather than vanishing. Verified with the case the old rule could not see: one tenant at
  2/20 delivered beside a healthy tenant at 200/200 — the new rule fires on the collapsed tenant,
  while the old platform-wide rule computed **91.8% delivered and would have reported clean**.

  Scoping it exposed the next layer: `email_logs.workspace_id` is populated ONLY from a
  caller-supplied body field (`body.workspace_id ?? body.attribution_workspace_id ?? null` in
  email-api), so any caller that omits it writes an unattributed row — **145 of 147 rows**. A column
  that exists and is never written, the same shape as `digest_included_at`. Per-workspace delivery
  monitoring stays blind for those sends and per-tenant email volume cannot be answered at all, so
  the check now reports the attribution gap itself as a second branch. Open finding; the remedy is
  threading workspace_id through the email-api callers (Flows send_email, send-quote-email, the
  price/mention alerts).

---

## Probes added 2026-08-13/14 — each watched to fire before being trusted

Four new mechanisms. Per the rule at the top of this file, none is listed as a guard on the
strength of a passing run: each was fed the defect it exists for and confirmed to fail.

### `ops.email_stranded_queued` — a send that failed and left no failure marker
`email_logs` rows are written `queued` and flipped to `sent` after the Resend call in the SAME
request. Nothing drains, retries or reaps the table, so a row still `queued` an hour later did not
wait — its send threw and the error was discarded. Two *"Your order DN-2026-000x has shipped"*
mails had sat that way since 2026-07-28 with `error_message` NULL: the customer was never told and
nothing anywhere said so.

- **Guarded by:** the probe, plus the `try/catch` in `email-api` that now marks the row `failed`.
- **Proven to fire:** 2026-08-13 — reproduced all five stranded rows before the backfill; reads 0 after.
- **Blind spot:** a send that Resend accepts and then drops. That is the delivery-rate check above, not this one.

### `ops.provider_webhook_rejected` — money we were told about and refused
435 genuine Stripe deliveries were answered 400 across July, and 12 more in a three-hour window on
2026-08-01. A provider retries for a limited period and then drops the event for good.

- **Proven to fire:** 2026-08-13 — replaying its logic over 2026-08-01 returns exactly the 12-rejection finding, while the live 7-day window is clean.
- **Why the existing checks could not see it:** `ops.silent_zero`'s endpoint branch needs a sub-5% success rate over a long window; `stripe-webhooks` sits at 12.5% lifetime and a three-hour outage cannot move a 30-day rate. A burst needs a burst probe.
- **Blind spot:** scoped to the providers' own user-agents on purpose, so a provider that changes its UA goes unwatched.

### `ops.registry_field_unreachable` — a registry field no consumer can reach
`material_metadata_fields` rows are reached via `is_global` or a non-empty `applies_to_categories`.
16 rows had neither. Not inert: `dealerProductsService` read an empty scope as *"applies to all"*,
so sanitary's `bowl_shape` and `flush_type` were offered on tiles products and `wood_type` /
`weave` / `upholstery` on lighting. Nine were `role='identity'` — what phases 5/6 key stock on.

- **Proven to fire:** 2026-08-13, and it earned its place immediately. The migration written to fix the 16 used `is_global = false`, which is NULL-blind, and its verification query used the same predicate — so the fix reported success while 11 rows were still broken. The probe uses `coalesce(is_global,false)` and found all 11.
- **Paired with:** [tests/unit/categoryFieldRegistry.test.ts](../tests/unit/categoryFieldRegistry.test.ts) for the TypeScript half.

### `ops.warehouse_identity_less_movement` — the right count on the wrong shelf
Dispatch picked the warehouse row with the most stock for a product, across every variant of it:
`order by … wi.qty_on_hand desc limit 1`. Shipping 300x300 decremented the 600x600 row *because*
that row was better stocked — the ordering actively preferred the wrong one. Receiving had the same
shape with `limit 1`.

Variant equality is now a FILTER in both (`_variant_dims`), so a contradicting row cannot be chosen
at any stock level; `qty_on_hand desc` survives only to break ties among rows that are this variant.
Dimensionless rows are still accepted — they predate variant tracking and refusing them would strand
real stock — and this probe watches exactly that remaining tolerance.

- **Proven to fire:** 2026-08-14 — with a 999-unit `600x600` row beside a 5-unit `300x300`, a line naming `300x300` now selects the 5-unit row; before the fix the ordering chose the 999. A line naming nothing still falls back to best-stocked, so existing behaviour is unchanged.
- **Re-proven 2026-08-20 (#374), on the rewritten form.** In a rolled-back transaction: a line choosing `color=Nero` with stock shipped and only an *unvarianted* warehouse row present → the probe fires; attribute that row to `color=nero` → **the finding clears**. Both halves matter — a probe only watched to fire can still be one that never stops firing.
- **Blind spot CLOSED by #374.** ~~identity beyond dimensions~~ — the match now filters on
  `variant_key`, so finish, wood species, bowl shape and every other registry identity axis
  disqualify a contradicting row, not just width/length/thickness. The dimensions filter survives
  underneath it as the legacy path for rows that predate the column.
- **The probe itself had to be rewritten, not merely re-pointed.** Its old test — "*every* warehouse
  row for this product is dimensionless" — is close to unreachable once rows are created per
  variant, so it was drifting toward reporting clean for structural reasons: the exact silent-zero
  shape it exists to catch, inside the guard. It now asks whether any row carries the variant the
  line chose.
- **Remaining blind spot:** a line that chose NOTHING. An unvarianted line may still be filled from
  any row, deliberately — refusing would strand real stock in a workspace mid-migration — so the
  units can come off a varianted row and this cannot tell. That tolerance is the price of not
  breaking dispatch, and it is why the picker's job is to stop lines being unvarianted in the first
  place.

### `catalog.variant_price_unreachable` — a surcharge that can never be charged
#374 made prices settable per variant. The failure mode it introduces is this platform's dominant
one: an operator sets "Nero costs €5 more", every screen looks right, and it is never charged once —
because the *lines* for that product carry no variant, so the resolver falls back to the
product-wide row every time. A plausible number sitting at zero forever, with nothing complaining.

Not decidable from the price row alone: a freshly configured variant price is legitimately unused.
So it carries the activity guard `ops.silent_zero` uses — the product has REAL lines, and every one
of them is unvarianted.

- **Proven to fire:** 2026-08-20 — in a rolled-back transaction, a product with a `color=nero` price row plus one order line with no `selected_attributes` produces the finding.
- **Blind spot:** it cannot see a line that chose the *wrong* variant, only one that chose none. A key that no longer matches the registry (an axis renamed from `available_sizes` to something else) reads as "varianted" and passes.

### `catalog.price_read_variant_blind` — the SQL half of the variant guard
`product_prices` holds one row per variant since #374. Any SQL function that reads it without
naming a variant therefore gets an arbitrary one — and the two offenders found on the day chose it
by RECENCY (`order by updated_at desc limit 1`), so the number on a document depended on which
variant an operator had edited most recently: `delivery_note_to_invoice` took an invoice line's
unit price that way, `get_catalog_prices_for_workspace` took a currency.

This is the same defect the TypeScript guard catches with its `.maybeSingle()` case. That test
scans **repo files**, and this project's SQL lives only in `pg_proc` — so all of these were
invisible to it. The SQL half needs a guard in SQL, exactly as `finance.money_fn_bypasses_derivation`
is the SQL half of the money-derivation test.

- **Proven to fire:** 2026-08-20 — flagged all four live offenders before they were fixed, and returns empty after.
- **v1 was wrong in both directions, which is the point worth recording.** It required `limit 1` anywhere in the function. That MISSED `resolve_product_spec` and `get_embed_spec_options`, which read the table via a JOIN with no `limit` in sight — and `resolve_product_spec` selects the price from the joined row, so on an anonymous embed the same product came back once per variant at a different price each time. It also FLAGGED `list_granted_catalog_products`, whose `limit 1` belonged to an unrelated image subquery. Same over-broad-window mistake the TypeScript guard made in ITS first cut, two hours earlier, in a different language.
- **The distinction that actually works** is not "does it limit" but "does it USE the row": `select 1 from product_prices` is an existence test and cannot return a wrong price however many variant rows exist; anything else must say which one it means.
- **Blind spot:** it reasons about function text, so a reader that means "any variant" must SAY so (`and variant_key is null`) to clear — which is the correct thing to write anyway.

### `ops.upsert_arbiter_uninferable` — the guard that flagged the fix
Worth recording as a guard-on-guard finding. The probe flags a partial unique index whose predicate
is exactly `(col IS NOT NULL)` for a column already in the index, because a b-tree unique index
treats NULLs as non-conflicting anyway — so the `WHERE` buys nothing and breaks `ON CONFLICT`
inference. Correct, for a **default** unique index.

It inverts under `NULLS NOT DISTINCT` (PG15+), where NULLs *do* conflict and the predicate is the
only thing keeping many NULL-`col` rows legal. It fired on
`warehouse_items_ws_wh_product_variant_key` (#374 Phase 0) and its own stated fix — "recreate the
index without the WHERE clause" — would have broken unmatched intake rows, which arrive in bulk with
a legitimately NULL `product_id`.

- **Resolved by:** teaching the probe about `indnullsnotdistinct` rather than by changing the index. Verified empirically first, in a rolled-back transaction: the real writer converges on one row for a repeated variant and splits a distinct one, with **no 42P10** — because the `ON CONFLICT` restates the predicate, which is what such an index requires of its callers.
- **The lesson generalises:** three findings survived the change and are genuine. A probe that is right three times out of four is exactly the kind that gets ignored on the fourth — the false positive was worth more than the true ones.

  **Measured, not assumed (2026-08-14).** The filter only engages when the line's size actually
  parses, so the parser's real-world coverage IS the guard's coverage. Against 266 sized rows in
  `warehouse_pending_items` — live inbound supplier lines — it parsed **86**. The dominant miss was
  a unit suffix (`2800x2070x18mm`, `23x0.8mm`), so those rows were silently falling back to
  matching on product alone: the pre-fix behaviour, for exactly the input a supplier document
  produces. Widening it to convert `mm`/`cm`/`m` took coverage to **119**. The suffix is CONVERTED,
  not stripped — `60x60cm` stripped to `60x60` would compare against `width_mm` and be wrong by a
  factor of ten, which would have introduced the very defect the filter exists to remove. Bare
  numbers (`25`), weights (`20kg`, 29 rows) and imperial pipe sizes (`1/2"`) still refuse to parse,
  deliberately: a wrong parse ships the wrong variant, an absent one merely falls back.

### `ops.field_role_mismatch` — a field classified against the evidence
"Identity" means a product can be more than one of these at once, so a buyer must pick. A field
marked identity that **no product ever offers twice** is a property, not an axis: it splits stock
into duplicate rows. A field marked descriptive that products **do** offer several of is the
dangerous direction — it merges stock that should be separate, invisibly, which is the defect
phase 6 closed at the dispatch end.

- **Proven to fire:** 2026-08-14 — on a synthetic product with a scalar `color` and an array
  `room`, it reports over-splitting and under-splitting respectively. Silent on the empty corpus,
  so it will not cry wolf before there is anything to measure.
- **Blind spot:** it can only judge fields products actually carry. With 0 documents ingested it
  is watching nothing today; its first real verdicts arrive with the first catalogue — which is
  also when phase 4's plurality and SKU-correlation thresholds get tested for the first time.

### `ops.messaging_processor_disabled` — an accepted send with nothing to send it
`messaging-api` accepts a send and returns success whether or not
`messaging-processor-every-minute` is running, and that cron sits at `active=false`. Harmless
while every messaging table is empty; the moment a channel is connected, sends queue into a
processor that never runs and nothing says so.

- **Proven to fire:** 2026-08-14 — silent with zero channels, reports the moment one exists.
- **Why a probe rather than enabling the cron:** turning it on would burn a call a minute for a
  module nobody uses, and turning the module off is a product decision. The probe stays quiet
  until the combination actually matters.

### `ops.prompt_required_but_inactive` — a prompt something depends on, switched off
Prompts have no code fallback by design (3P.4): a deactivated or empty row does not degrade the
output, it RAISES and the work stops. Correct — and it makes "which prompt got turned off" a
question worth answering before the ingest does.

This is the opposite direction to `ops.prompt_never_read` (3P.7), which reports an *orphan*
prompt nobody reads. Here the prompt is claimed by a call site in `used_in` and is off or empty.

- **Proven to fire:** 2026-08-14 — switching off the `field_role` classifier prompt reports it;
  silent otherwise.
- **Prerequisite fixed first:** one row ("PDF Processing Agent") named two call sites that no
  longer exist — `agent-chat/index.ts` records the agent as removed. It was correctly deactivated
  and `used_in` was never cleared, so it read as a live dependency that had been turned off. A
  probe reading a column that lies is worse than no probe, so the column was cleaned before the
  probe was trusted.
- **Overlaps, deliberately, with `/health` + `REQUIRED_PROMPTS` (3P.6)** — and does not replace
  it. That one derives required keys from the Python call sites and runs at DEPLOY, which is
  stronger. This one runs nightly, comes from the data side, and therefore also covers prompts
  no Python call site declares (the Deno/edge sites) and the "active but empty" case.

---

### `ops.silent_zero` cron-metering arm — the exemption list nobody extends

**Fired on `seo-toolkit-audit` every night, and it was a false positive.** `seo_tracked_domains` is
empty, so the audit loop iterates nothing and correctly charges nothing; the €/$ the probe
attributed to the module came from the OTHER `seo-toolkit` work, because the module slug is shared
and the cron key is not.

The probe already anticipates exactly this and asks `cron_has_internal_subjects(cron_key)` first.
That helper is a `CASE` over **four** cron keys with `ELSE true` — strict by default, which is the
right default, and precisely why a metered cron whose subject table it has never heard of reports
forever. `seo-toolkit-audit` was the fifth and nobody added it.

- **The rule:** registering a cron in `cron_billing_registry` with an `expected_module_slug` is
  only half the job. If its work comes from a subject table that can legitimately be empty, it
  needs a `WHEN` clause in `cron_has_internal_subjects` in the same change.
- **Why it matters more than one wrong row:** a nightly finding that is always there is the thing
  real findings hide underneath. This one sat at CRITICAL-adjacent alongside the genuine
  `ops.provider_credit_exhausted` entries.
- **Fixed 2026-08-29**, and verified both ways: the cron-metering arm now returns 0 findings, an
  unknown key still answers `true`, and `ops.silent_zero_probe_missing` still reports 0 — so the
  edit added a branch without dropping a probe.
- **Blind spot:** nothing checks the helper's coverage against the registry. The metered crons with
  a NULL `expected_module_slug` are exempt from that arm by design, so today the list is complete;
  the next metered cron with a module slug will need the same clause and nothing will say so.

### `ops_upsert_arbiter_uninferable` — and the index this session's own fix added

Three unique indexes were partial on nothing but their own column's nullability
(`seo_articles_idempotency_key_uniq`, `blueprint_items_option_key_unique`,
`crm_deal_types_workspace_key_uniq`). A b-tree unique index already treats NULLs as distinct, so
the predicate enforces the same pairs and buys nothing — while making `ON CONFLICT (a, b)`
impossible to infer, so an upsert naming those columns raises 42P10 on every row and names an
index its author has never heard of. No caller named them, so nothing had broken yet.

**The detail worth recording is what happened next.** Recreating them non-partially cleared all
three — and the detector immediately reported a FOURTH: `invoices_pos_client_token_uniq`, created
hours earlier by the POS idempotency work in #351 C1, with the identical `WHERE … IS NOT NULL`.

- **Proven to fire, on the same day, against a change made by the person reading it.** That is the
  strongest evidence this table asks for, and it arrived unprompted.
- Fixed the same way. The trade is index size — every invoice gets an entry rather than only the
  POS ones — against a silent write failure for the next author.

### Invariant 5 — a route excluded from the JWT middleware, gating nothing

`JWTAuthMiddleware.exclude_paths` is matched by PREFIX, so everything under an entry is outside the
middleware and its only remaining protection is whatever the route declares. CLAUDE.md invariant 5
says exactly that, and **nothing enforced it** while the list grew to 39 prefixes covering 225
routes — several of which spend real money (`/api/v1/seo-agent/*` is DataForSEO,
`/api/v1/modules/*/search` is Firecrawl).

The failure mode is silent in the direction that matters: a new route under an existing excluded
prefix inherits the exclusion automatically and announces nothing. Nobody has to make a decision
for the gap to open.

**The audit result was the reassuring one — all 225 are gated.** What was missing was any record of
HOW, and any way to learn when that stops being true.

- **Guarded by:** `mivaa-pdf-extractor/tests/unit/test_excluded_routes_gate_themselves.py`. It reads
  the exclusion list OUT OF THE MIDDLEWARE rather than restating it (a copy would drift and the test
  would then check a list nobody uses), walks every `@router` decorator, and requires each route
  under an excluded prefix to name a gate — `require_rag_resource_access`, `require_trusted_service`,
  `require_deploy_token`, `_check_secret`, `_admin_user_id_from_request`, `get_workspace_context`,
  … — or sit on a 9-entry public-by-design list. It also refuses a bare `/`, `/api` or `/api/v1`
  prefix, and fails if a public exemption stops resolving to a real route, so a stale entry cannot
  end up covering something else.
- **Proven to fire:** 2026-08-29 — `Depends(require_trusted_service)` removed from
  `/api/internal/classify-images/{job_id}`; the guard named that exact route. Restored
  byte-identically, 4/4 green.
- **Why the marker list is a feature:** adding a new way to authenticate means adding its name.
  Having to write it down is what turns "how does this route authenticate" from folklore into a
  line someone reviewed.
- **Blind spot:** it proves a gate is NAMED, not that the gate is correct. `require_rag_resource_access`
  could be a no-op and this test would still pass. It also cannot see a route mounted outside the
  `@router` idiom.

## Shapes closed 2026-08-30 — #294, and the edge-typecheck baseline read as a defect list

### `2-definer-authenticated-unscoped` — a function with nothing to scope by and nobody to scope to

`check_security_invariants()`'s invariant-2 branch tested only `has_function_privilege('anon', …)`,
so the platform's own backstop returned near-clean while two SECURITY DEFINER functions granted to
`authenticated` returned cross-tenant data to everyone.

- **Why not a blanket branch:** 433 DEFINER functions are executable by `authenticated`, and 87 of
  those never read the caller — nearly all benign (pricing helpers, public sitemap, published KB).
  That is the 146-finding shape this document already warns about, and a check nobody reads is
  worse than no check.
- **The precise sub-case instead:** zero arguments + DEFINER + executable by `authenticated` +
  reads a workspace-scoped table + never reads the caller (following ONE hop into another public
  function) + no publication filter. A function with no parameter to scope BY and no caller to
  scope TO returns the same answer to every tenant — definitional, not heuristic.
- **Precision, measured:** selects exactly `tenant_purity_audit` and `get_distinct_factory_names`
  and nothing else. The one-hop rule is what spares `my_customer_account_summary`, which delegates
  to `my_customer_scope()` — the same delegation blind spot that made `deliver_order_line` read as
  unguarded. The publication filter spares `public_sitemap_entries` and `kb_list_brands`.
- **Proven to fire:** 2026-08-30 — re-granting `tenant_purity_audit` to `authenticated` inside a
  rolled-back transaction convicted it by name; 0 findings before, 1 after.
- **Blind spot:** one hop only. A function delegating two levels deep to reach `auth.uid()` would
  read as unguarded; nothing in the schema does that today.

### `4-entitlement-write-gap` — a paid gate on the read side only

Every `hr_*` SELECT policy carried `AND is_workspace_entitled(workspace_id,'hr')`. The 56
INSERT/UPDATE/DELETE policies beside them, across 19 tables, did not. A workspace whose HR
subscription lapsed could no longer READ its HR data but could still write it — the gate existed
only inside `hr-api`, and PostgREST is reachable without it. Application-side filtering is a
filter, not a boundary.

- **The rule generalizes past hr:** if the SELECT policy on a table gates on
  `is_workspace_entitled`, every write policy on that table must too.
- **Guarded by:** `check_security_invariants()`, wired into the nightly sweep as
  `security.invariant_violation` at CRITICAL. A repo test cannot see this — the policies live in
  `pg_policy`, not in any file.
- **Proven to fire:** 2026-08-30 — reverting `hr_absences_insert` to its pre-fix expression in a
  rolled-back transaction named that exact policy.
- **Verified by writing, not by reading:** in a rolled-back transaction a non-operator workspace
  admin of a NON-entitled workspace was refused `42501` on `hr_departments`, and the same admin of
  an entitled workspace wrote successfully — so the gate closed without locking out a paying tenant.
- **Blind spot:** it matches `is_workspace_entitled` by name. A module gating entitlement some
  other way is invisible to it.

### A successful `authenticate()` is not a user

`_shared/auth.ts` has five success paths and only one populates `user`; `secret`, `anon` and
`api_key` all return `success: true, user: null`. `requireUser` defaults to false and
`allowedRoles` is applied only to user tokens, so neither keeps those callers out. Six handlers
wrote `created_by: user.id` / `email: user.email` and threw a TypeError 500 for exactly the
callers the helper exists to serve. `api_key` is the sharp case — `userId` IS set, so the author
was available at every one of those sites.

- **Invisible behaviourally**, because the platform's own traffic is all user-level. It is the
  partner-key and service-role paths that were broken, and those are the quiet ones.
- **Guarded by:** [tests/unit/edgeAuthUserNullable.test.ts](../tests/unit/edgeAuthUserNullable.test.ts),
  which accepts the three correct forms (`requireUser`, an explicit null check, optional chaining)
  and asserts its own premise against `_shared/auth.ts`, so changing the helper reopens the
  question instead of silently voiding the rule.
- **Proven to fire:** 2026-08-30, against all five pre-fix handlers.

### `allowedRoles: ['admin']` is not a platform gate

`authenticate()` matches `allowedRoles` against `workspace_members.role` as well as the global
role, and grants if either matches — deliberately, so a dealer who owns a workspace is allowed
business ops. But `'admin'` is also an ordinary WORKSPACE role, handed out by any tenant from
Profile → Team, so a *platform*-scoped function gated that way is reachable by any tenant's
workspace admin. `platform-secrets-admin` writes the store every tenant's integrations resolve
through. `reset-platform` had already been moved off the identical gate.

- **Latent, not live:** the only active workspace-`admin` row belongs to the operator. It arms
  itself the first time a tenant uses an ordinary product feature.
- **Guarded by:** [tests/unit/platformScopedAuthGates.test.ts](../tests/unit/platformScopedAuthGates.test.ts),
  which also pins that `platform_secrets` is UPDATEd rather than upserted (an upsert let a caller
  invent a key that `resolveSecret()` would then serve) and that the ownership check in
  `catalog-translate-pdf` precedes the private-bucket download, the credit debit and the model
  call — a check after the side effect is not a check.
- **Blind spot:** it names two functions. There is no general list of which edge functions are
  platform-scoped, so a third one gated the same way would not be caught.

### The edge-typecheck baseline is a defect list, not a debt number

Read rather than lived with, the 50-error baseline yielded two live bugs — `crm-lead-score`, whose
whole real-estate enrichment block had never run (`interests`/`viewings` bound to the
PostgrestResponse, `.map` undefined, throwing into a `catch` that only warned), and
`check-material-alerts`, whose `.insert().select().onConflict().ignore()` is not valid supabase-js
and threw on the first saved search that matched a product, aborting the run for every user. That
cron had returned 200 daily for 69 runs because the platform has zero saved searches, so it had
never reached the line.

- **What separated the bugs from the noise:** TS2339 (property does not exist) and TS18047
  (possibly null) point at values that are `undefined` at runtime. TS2345 null-vs-undefined,
  Fontkit, and the many-to-one embed shapes are type artefacts — `hr-checkin-cron` was spared that
  way, verified against production PostgREST rather than assumed.
- **Locked in by ratcheting** 50 → 24 across 15 files: a regression takes the count back up and
  fails the build.

### A flat-rate provider call was billed even when it failed

`log_external_call` (MIVAA) computed `billed = raw_cost_usd * markup` whatever `success` said, and
`success` went only into `metadata`. 598 rows since 2026-06-26 carried **$1.86 raw / $2.79 billed
of spend nobody made** — mostly Perplexity 401s and DataForSEO refusals — overstating lifetime AI
cost by ~3.6%.

- **Why it looked like four separate provider quirks:** token-priced models were never affected.
  Their cost derives from `response.usage`, and a failed call returns no tokens, so the arithmetic
  already produced zero. Only the flat `per_call` component survives a failure. It was one line in
  the shared writer that `job_cost_logger` and `mention_cost_logger` both delegate to.
- **Found by** asking why a 401 had a price, after `ops.silent_zero` reported `sonar` at 35 calls /
  0 successes / $0.2625 billed. The probe was right and had been right for weeks; nobody had read
  the cost field next to it.
- **The fix keeps the evidence:** cost goes to zero, `unbilled_reason = 'call_failed'` says why, and
  `metadata.would_have_cost_usd` holds the price it would have carried. Zeroing must not erase the
  difference between "this provider is free" and "this provider charges real money and refused us
  598 times" — that difference is the whole signal when a metric goes flat.
- **Guarded by** `mivaa-pdf-extractor/tests/unit/test_failed_calls_are_not_billed.py`. The
  derivation lives in `app/modules/_core/cost_accounting.py`, which imports nothing, because
  MIVAA's CI installs pytest and no application dependencies — a test can only exercise real logic
  if that logic sits somewhere importable without a database client.
- **Blind spot:** it pins the shared writer. A module that grows its own `ai_usage_logs` insert
  escapes the rule entirely.

### "We never called them" was recorded as "they rejected us"

When a deployment has no token for a provider, the model-health agent wrote
`last_probe_status = 'auth_failed'` — which claims we asked and were refused. On 2026-08-30 that
cost a real investigation: 18 Replicate rows read as a rejected key while the account was funded
and the token worked.

- Deploying a secret and rotating one are different jobs for different people, so `not_configured`
  is now its own status: DB CHECK, the mirrored vocabulary, the agent, and the admin panel.
- **Deliberately not authoritative.** The model was never asked anything, so letting it flip
  availability would let one missing env var retire a working roster — the same reason
  `schema_rejected` is excluded.
- On the panel it is the FIRST verdict, ahead of credit and auth: if the token is not deployed,
  every other status on that provider is stale — the last thing learned before the secret went
  missing, not the state now. Reporting "out of credit" off that sends someone to top up an
  account that is fine.
- The vocabulary's own docblock had named `tests/unit/probeVocabulary.test.ts` as its guard. No
  such file has ever existed; the real one is `paymentVocabulary.test.ts`. **A file that names a
  guard nobody can find is worse than naming none** — the reader concludes it is covered.

### A deterministic failure that threw its reason away

`agent_tool_call_logs` holds seven `b2b_manufacturer_search` failures whose entire recorded cause is
`Web search failed: 400`. Both call sites read Anthropic's error body, passed it to
`console.error`, and returned the bare status.

- **Transient and deterministic are different.** 429/529/5xx: the status IS the story, and leaking
  a body there would invite the agent to blame a query that was fine. 400/401/403/404/422: the body
  is the only actionable part, and the failure will recur identically until the request changes.
- Console output in an edge worker is not somewhere anyone looks, and the log stores the RETURNED
  string — so the only way to learn why those seven failed is to reproduce them.
- **The guard found a second instance the fix had missed**: the progress emitter recorded the same
  bare string on the step trail the USER watches.
- Guarded by [tests/unit/anthropicFailureDetail.test.ts](../tests/unit/anthropicFailureDetail.test.ts).

### A dead API surface hid its own table from the dead-schema guard

`proposals` — a second, abandoned quoting system — had 0 rows ever, 0 requests in the whole lifetime
of `api_usage_logs`, and no UI. It survived because `deadSchema.test.ts` convicts a table that no
SOURCE TEXT mentions, and `quotes-api` still served three routes over it.

- So the dead code was not merely untidy — **it was what kept the table invisible to the check
  written to find exactly this.** Removing the routes without dropping the table would only have
  moved the problem, and that registry is deliberately shrink-only ("wire it or drop it").
- Same trap in reverse when writing the removal: a comment that names the table counts as a
  reference. The name had to leave `types.ts` too.

### A link that only worked in the direction that writes it

`projects.property_id` shipped with a writer — the project's property picker — and no reader, so a
building could be told which jobs happen there and could never say so.

- Invisible from the writing side: the picker saves, the value persists, every screen that writes
  it looks correct. That is #378's one-way-link class.
- The issue asked for `properties.project_id`. **That is the wrong direction** — a building hosts
  many jobs over its life, a job happens at one — and the FK already existed correctly. What was
  missing was the read, not the relationship.
- Guarded by [tests/unit/propertyLinkReaders.test.ts](../tests/unit/propertyLinkReaders.test.ts),
  which guards REGRESSION rather than absence: deleting the reader or unmounting it restores the
  exact original state, and nothing else would notice.

## The third prefix collision of the day — 2026-08-30

`computeBlueprint`'s completeness check asks whether any schedule line references a derived count,
so that "30 hinges derived and nothing counting them" is reported rather than discovered on fitting
day. It asked with a SUBSTRING:

```ts
if (!referenced.includes(`total_${row.key}`)) issues.push(...)
```

`total_socket` is a prefix of `total_socket_dedicated`. So a kitchen whose only electrical schedule
line counted the oven's dedicated circuit ALSO satisfied the check for ordinary sockets — nine of
them derived, nothing counting them, no issue raised. Of every key pair in the schema this is the
one that can collide, and it is the one that reaches an electrician.

Now word-anchored (`` does not match between `socket` and `_dedicated`, because `_` is a word
character), with the key escaped because it comes from the blueprint author's schema. Guarded by
"a dedicated circuit does not answer for the general sockets" in
[tests/unit/blueprintComposition.test.ts](../tests/unit/blueprintComposition.test.ts), which
asserts both directions — the counted key is not reported, the uncounted prefix still is —
and mutation-tested by restoring the `.includes()`.

**This is the third instance of one shape in a single session**, which is the reason it is written
up as its own entry rather than folded into the blueprint notes:

| where | the collision |
|---|---|
| `dic_detect__ops_storage_paths_unregistered` | `public.generation_3d` read as registered because `public.generation_3d_segments` was |
| `tests/unit/rateLimitFailsClosed.test.ts` (my own first draft) | the ceiling matcher required a character before the keyword, so `MAX_FLOW_RUNS_PER_MINUTE` never matched |
| `computeBlueprint` | `total_socket` satisfied by `total_socket_dedicated` |

Each was a name-matching check that was ALMOST right, each failed silently in the safe-looking
direction (reporting clean), and none of them could be caught by a type or a lint. When a check
asks "does this name appear", anchor both ends.

## A channel link that reported someone else's double booking — 2026-08-30

`real-estate-ical` pulls every active short-let channel calendar in one pass and stamps each link
with `last_sync_status` / `last_sync_message`. The conflict counter — the one that means *these
nights are already held, someone has double-booked* — was declared once, outside the per-link loop,
and never reset:

```ts
let imported = 0, skipped = 0, failed = 0;
for (const link of links) {
  for (const ev of events) { if (error.code === '23P01') skipped++; }
  await finish(skipped > 0 ? 'partial' : 'ok', `${skipped} date conflict(s) — check for a double booking`);
}
```

So the first genuine conflict anywhere in the run stamped **every link processed after it** as
`partial`, telling the operator to go and find a double booking on a property that has none — and
quoting the running total across all links rather than that link's. The one link that really had a
conflict was reported correctly and buried among false ones.

Nothing could catch it: every value is a valid integer, every status is a valid status, and the
only reader is a person looking at a list and believing it.

Now a per-link `linkConflicts` decides the stamp, while the run total is returned to the cron
caller — both numbers are wanted, and conflating them is what broke. Guarded by
[tests/unit/realEstateChannelSync.test.ts](../tests/unit/realEstateChannelSync.test.ts), which
asserts the counter's SCOPE structurally (its declaration must appear after the `for (const link`
that owns it) rather than by name, because scope is the whole defect. Mutation-tested by hoisting
the declaration back above the loop.

## Rewriting a project plan was two statements — 2026-08-30

`writePlanItems` in `project-plan-engine` replaced a plan's lines as
`delete().eq('plan_id', …)` then `insert(rows)`, two statements over the wire. The delete commits
on its own, so a failing insert — one bad row, a constraint, a dropped connection — left the plan
with **zero items** and an error message.

The retry could not undo it. Reprice rebuilds the composition lines from
`project_plans.composition`, but the MANUAL lines it preserves come from `loadPlanItems`, which by
then returns nothing. A hand-built section and every task under it was gone for good, and the
failure was reported as a write error rather than as the data loss it was. CLAUDE.md rule 4:
naturally atomic → one SQL RPC.

`public.replace_plan_items(uuid, jsonb)` does both in one transaction, `SECURITY INVOKER` because
RLS on `project_plan_items` is the boundary and the engine calls it with the caller's client. It
does NOT re-sort the array: `parent_id` is a self-FK checked per row on insert, so the caller's
topological sort is load-bearing, and the guard pins both halves.

**Watched to hold**, on a seeded plan inside an aborted transaction: a write whose second row
violates the parent FK leaves the original rows intact — `[Hand-added task, Kitchen]`, where the
two-statement version left zero — and a good write still replaces wholesale. Mutation-tested in
[tests/unit/financeAtomicity.test.ts](../tests/unit/financeAtomicity.test.ts) by restoring the
delete-then-insert pair.

**A second defect came out of writing the test rather than the code.** The first version of the RPC
used `jsonb_populate_recordset` and listed columns straight through, which fills an ABSENT key with
NULL rather than the column DEFAULT — and eleven of these columns are NOT NULL with a default. That
is not what the PostgREST `.insert()` it replaced did, where an omitted key takes the default.
Today's only caller happens to send every column, so nothing broke; the next caller would have got
a bare `23502`. Found by writing the fixture the way a person would, not the way the current caller
does. Every such column is now coalesced to its default.

## Two Real Estate paths that were wrong about what they handed out — 2026-08-30

**An unmatched lead that reported `matched_listing: true`.** `real-estate-inbound-lead` places a
forwarded portal enquiry by the agency's `reference_code`, and falls back to the most recent live
listing when it cannot — writing a "please re-point this lead" banner so an agent can fix it. The
banner was gated on `!parsed.reference` — whether the email CONTAINED a reference — not on whether
that reference matched anything. An enquiry quoting a code no listing carries took the fallback
listing with no banner and a `matched_listing: true` response. The two unmatched states are now
reported apart, because they need different people: no reference means the portal does not send
one; a reference that matched nothing means that listing's `reference_code` is wrong here, and
every future lead for it will misfile the same way.

**A social post published with an expired image URL.** `property-media` is private, so
`real-estate-listing-social` signed the cover photo and stored the URL in `social_posts.image_urls`;
`zernio-api` handed that stored URL to the provider whenever the draft was eventually approved. A
post reviewed after the signature lapsed went out with a link the provider gets a 403 for — or
failed — and neither function could tell. Pipeline convention 7 exactly.

**The fix for the second one introduced a worse bug, and it is the more useful half of this
entry.** The first version stored `{bucket, path}` in `metadata.media_refs` and had the publisher
re-sign from it. But `social_posts` carries a `FOR ALL` policy for workspace members, so its
metadata is **user-writable** — while the publisher runs under the **service role**. Any member
could have rewritten it to `{bucket: 'pdf-documents', path: '<another tenant's invoice>'}` and been
handed a signed URL for it. A path taken from a row the user controls and resolved with elevated
privilege is invariant 8 wearing a jsonb hat, and it was caught by asking who can write
`social_posts` — not by any check, because the change passed lint, typecheck, edge typecheck and
its own new guard.

The reference is now an **ID**: `{kind: 'property_photo', id}`, resolved against `property_photos`
filtered by the post's own `workspace_id`. The bucket and path come from the DB row, so the worst a
rewritten id can name is a photo that member could already see. A ref that cannot be resolved or
signed refuses the publish rather than falling through to the stale URL — falling through is what
produced the original defect.

Guarded by [tests/unit/realEstateOutboundMedia.test.ts](../tests/unit/realEstateOutboundMedia.test.ts),
which asserts the flag is derived from the lookup, that no raw bucket is persisted into
user-writable metadata, that the publisher accepts only an id and scopes the lookup to the post's
workspace, and that an unresolvable ref returns rather than continues.

## Nine rate limits that failed open — 2026-08-30

Every rate limit here is two steps: count what this caller has already done, compare it to a
ceiling. The count IS the enforcement decision, and

```ts
const { count } = await supabase.from('…').select('id', { count: 'exact', head: true })…;
if ((count ?? 0) >= SOME_LIMIT) return refuse();
```

reads "I could not answer that" as "this caller has done nothing". The brake comes off for
everybody, silently — and the load most likely to break the count query is the abuse the limit
exists to stop, so the failure is self-reinforcing rather than random. Nothing was failing when
this was found. That is the shape: it is invisible until the day the query breaks, and on that day
it produces no error of its own.

`real-estate-public.enforceLeadRateLimit` already carried the reasoning at length — the COUNT fails
closed, the bookkeeping INSERT never blocks a legitimate caller — and it was the only one that had
adopted it. Found while auditing the Projects estimator; the sweep that followed found the rest.

| function | limiter | what failing open meant |
|---|---|---|
| `public-project-plan` | anonymous daily quota; kitchen-lead cap | unmetered use of the public estimator |
| `flow-engine` | per-flow AND cross-flow **loop breakers** | unbounded execution and spend, released by the very load a runaway loop creates |
| `hr-kiosk` | per-IP throttle; **PIN lockout** | unlimited attempts against a 4-digit PIN — the attack the lockout's own comment says it exists to blunt |
| `hr-careers` | per-IP and per-workspace application caps | unlimited public form submissions |
| `inbox-api` | public-profile contact form (sender + recipient); per-token challenge codes | a stranger's inbox as the attack surface |
| `workspace-webhooks-api` | endpoints per workspace | unbounded endpoint registration |

The `flow-engine` change is the one with a real trade-off, stated in the code: a transient error now
refuses ONE run rather than allowing an unbounded number. Flow runs are re-triggered by their
events, so a refusal is a delay; the other direction is unmetered execution.

Guarded by [tests/unit/rateLimitFailsClosed.test.ts](../tests/unit/rateLimitFailsClosed.test.ts),
which flags any count compared against a NAMED ceiling (`*MAX*`, `*CAP*`, `*QUOTA*`, `*LIMIT*`,
`*THRESHOLD*`) whose query error was discarded. Informational counts — "does a row already exist" —
are deliberately out of scope, because a guard that flags those gets suppressed.

**Two things the guard got wrong first, both worth keeping in mind when writing this kind of scan:**

- the ceiling matcher was `[A-Z][A-Z0-9_]*(?:MAX|CAP|…)[A-Z0-9_]*`, which requires a character
  BEFORE the keyword — so it could not match `MAX_FLOW_RUNS_PER_MINUTE` and reported the loop
  breaker's file clean. It is now two steps: an all-caps token that CONTAINS the keyword.
- finding the query behind a count by taking the last `const` in the window flags every
  already-fixed limiter, because the comparison is often itself written
  `const limited = (count ?? 0) >= CAP`. It now takes the latest `const … = await …` that mentions
  the count, and the lookback is generous, because a limiter that has been fixed carries the
  reasoning between its query and its comparison.

Mutation-tested by returning the PIN lockout to its fail-open form; the guard names the file and
line.

## Billing a quote by stage had no running total — 2026-08-30

`create_project_progress_invoice` validated that ONE percentage was in `(0,100]` and nothing else.
The Billing dialog opened on a hardcoded `50` every time, and neither side had any notion of what
had already been billed. So:

- 30% + 40% + 50% bills **120%** of the job, silently;
- a retry after a dropped connection bills the same stage twice — the dialog closes only on
  success, but the RPC may already have committed;
- each invoice is individually valid and consumes its own number, so no integrity check, no
  typecheck and no drift probe could see it. `finance.order_payment_status_drift` compares a
  cached status against a derivation; there was no derivation here to compare against.

Its sibling `issue_invoice_from_quote` has had a "does an invoice already exist" early return since
it shipped. **The path meant to be called repeatedly was the one with no guard**, which is the
inversion worth remembering.

`public.get_quote_billing_progress(uuid[])` is now the single derivation — `billed_pct`,
`remaining_pct`, `invoice_count`, `has_full` — and it gates BOTH writers and feeds the dialog, so
what is offered and what is allowed cannot disagree. `SECURITY INVOKER`, because it reads
`invoices` and RLS there is the boundary.

**What counts is asymmetric, and getting it wrong broke the feature outright.** The first version
of this function counted any non-void invoice. Accepting a quote runs
`_generate_order_from_quote_core`, which inserts a pre-invoice **without setting `invoice_kind`**,
so it takes the column default `'full'` — meaning every accepted quote in the system already has a
`full/draft` invoice against it. `billed_pct` came back **100 on a quote nobody had billed a cent
of**, and the gate refused *every* progress invoice with "already invoiced in full". A total
regression of the feature the gate exists to protect.

It survived the first round of checks because those built their fixture with a direct
`INSERT INTO quotes (… status='accepted')`, which does not fire the accept trigger and so has no
pre-invoice. It was caught by accepting a quote the way the app does —
`update quotes set status='accepted'` — and reading what came back. **A fixture that skips the
trigger is not the state the code runs in.**

So:

- a **stage** invoice (`progress`/`milestone`/`final`) counts in any non-void status, draft
  included — creating one is a deliberate operator act, and counting drafts is precisely what
  closes the double-submit hole;
- a **full** invoice counts only once **issued**. While it is a draft it is the accept trigger's
  placeholder, not a claim on the customer.

`void` releases a share — the operator's escape hatch from an over-billed stage. `credit_noted`
deliberately does not, because a credit note can be partial and reading it as a full release hands
back more room than was actually returned, which is the direction that over-bills.

Both gates spliced by surgery on the live `pg_get_functiondef`, anchored and asserted — neither
body was reauthored, because `issue_invoice_from_quote` carries the VAT-exemption gate whose own
comment pins it ABOVE the existing-invoice check, and that ordering is exactly what a rewrite from
a partial read loses.

**Watched, on a quote accepted through the trigger**, impersonating the workspace owner inside an
aborted transaction:

| scenario | result |
|---|---|
| fresh accepted quote (pre-invoice present) | `billed=0 remaining=100 has_full=false count=0` |
| first 30% stage | **allowed** — the normal path, and what the first version broke |
| 30 + 40, then ask for 50 (=120) | **refused**, naming what is billed and what remains |
| full invoice on top of 70 billed by stage | **refused**, pointing at a final invoice instead |
| exactly the remaining 30 | **allowed** |
| any stage after the full invoice is **issued** | **refused** |

Guarded in the repo by three cases in
[tests/unit/moneyDerivation.test.ts](../tests/unit/moneyDerivation.test.ts), mutation-tested by
putting `max="100"` back on the percent input. Note what those source-shape guards can and cannot
do: they hold the derivation in one place and keep the dialog reading it, and they would **not**
have caught the pre-invoice mistake. Only running the thing did.

## Four silent-zero probes for Real Estate and Projects — 2026-08-30, each watched to fire

Between them these two modules run four crons, an append-only timeline and a rent→Finance
bridge, and had **no silent-zero probe at all**. Running the detectors returned nothing, which
reads as "clean" and meant "nobody is looking" — the reading shape 4 exists to prevent. Worse,
this platform's own data floor for Real Estate is empty, so there was no live defect to find
either: the honest state was *unobserved*, not *healthy*.

Each probe requires DEMONSTRATED ACTIVITY before it can fire, so a module nobody has used yet
stays silent rather than alarming about its own emptiness.

| Probe | Activity | Signal | Fires when |
|---|---|---|---|
| `realestate_ical_sync_never_lands` | an active `property_channel_links` row with an import URL | that link syncing within 3 days | an hourly cron is green 178/178 and no feed has actually been read |
| `realestate_rent_never_invoiced` | charges ≥2 days past due on an active tenancy with a tenant | any charge on those tenancies reaching an invoice | `createRentInvoiceForCharge` fails into the `failed` counter the cron returns inside its 200 |
| `realestate_buyer_digest_never_sent` | ≥1 consenting digest subscriber **and** ≥3 listings published in 14 days | any `last_digest_at` inside the window | the consent capture regresses, or the send breaks — the two flags are written by different paths |
| `project_timeline_never_appends` | project tasks created in 14 days | the `task.%` events that creation emits | `_project_log_task` is detached or raising; the tab keeps rendering, just with nothing after a date nobody notices |

**Appended by surgery on the live `pg_get_functiondef`, with assertions** — the probes are inline
and have accumulated across a dozen migrations, and a whole-body replace from a stale source
deletes whichever landed since. The floor assertion is worth reading: the first version counted
occurrences of `'silent_zero_probe'` and aborted, because probes do **not** share one
`entity_table` — that literal appears 7 times against a roster of 22. It now pins body size plus
the presence of named probes from several different eras. All four names are in the
`ops.silent_zero_probe_missing` roster, so removing one is now deliberate rather than free.

**Watched to fire, both directions, inside aborted transactions:**

- `project_timeline_never_appends` — cleared the window, disabled the `project_tasks` triggers,
  inserted 3 tasks → **fired**. Re-enabled the triggers, inserted 3 more → **silent**.
- `realestate_ical_sync_never_lands` — active link with `last_synced_at IS NULL` → **fired**;
  stamped it → **silent**.
- `realestate_buyer_digest_never_sent` — consenting subscriber + 3 listings published, no digest →
  **fired**; stamped `last_digest_at` → **silent**.
- `realestate_rent_never_invoiced` — 3 charges past due, none invoiced → **fired**; one charge
  invoiced → **silent**; back to none invoiced but only 2 overdue (under `min_activity`) →
  **silent**. The first attempt at this control was a no-op — `select id from invoices` returned
  NULL because the table is empty, so `invoice_id` was set to NULL and nothing changed. The probe
  was right and the test was wrong, which is the usual direction and worth stating.

Nothing leaked: every fixture rolled back, and the 9 real task events are intact.

## `ops.storage_paths_unregistered` — both arms rewritten 2026-08-30, and watched to fire

The probe existed and reported clean while two tables sat outside `build_storage_reference_set()`
with live files 6 days from the reaper. Two independent blind spots, either of which alone was
enough to hide them:

1. **It only looked at columns NAMED `%storage_path%`.** `generation_3d` records every AI image
   this platform generates as `models_results -> <model> -> image_url` — the `image_urls` column
   is `[]` on every row — and `project_purchase_items.design_image_url` holds the product shot the
   purchase spec sheet embeds. Neither name matches, so neither was ever a candidate.
2. **The registration test was a substring match with a collision in the direction nobody had
   considered.** Its own comment warns about the short-name-satisfied-by-long-name case
   (`documents` satisfying `hr_documents`) and qualifies the name to close it. But
   `public.generation_3d` is a PREFIX of `public.generation_3d_segments`, registered for months —
   so even once `generation_3d` became a candidate, `strpos()` said it was covered.

Now: a **name** arm (unchanged semantics — an object-path column is reported whether or not the
table has rows, because the latent case is most of the value) and a **data** arm, which samples up
to 500 rows of any `%url%` / jsonb / array column for `/storage/v1/object/` and reports only what
it can prove. Name alone cannot separate `design_image_url` from `virtual_tour_url`, and a probe
that flags every `*_url` column in the schema is one nobody reads. The registration test is now
`\M`-anchored at both ends.

**Watched to fire.** Inside an aborted subtransaction, the `generation_3d` branch was cut back out
of `build_storage_reference_set()`: the set lost all 16 of its `gemini/` rows and the probe went
from reporting nothing to naming `generation_3d.models_results [data x14]`. Against the fixed
function it reports nothing, and `find_orphan_storage_objects('generation-images', …)` returns 0.

`credit_transactions.metadata` is exempt with the reason recorded in the function body: it quotes a
past generation's source image as billing evidence, does not own the file (`vr_worlds` and
`generation_3d` do, both registered), and has no TTL by design — registering it would pin every
source image forever.

## Not defects — checked, and deliberately left alone

Recording these so they are not re-raised every time an advisor runs.

| Looks wrong | Why it is not |
|---|---|
| `marketplace_public_listings` is a SECURITY DEFINER view (Supabase lint 0010, invariant 3) | It is cross-tenant BY DESIGN — a member of workspace A must see workspace B's listings, which RLS would correctly forbid. It self-guards with a caller-tied `WHERE` on `auth.uid()` plus approved marketplace participation on both sides, so `anon` (uid null) sees nothing. `check_security_invariants()` already exempts exactly this shape: *"a definer view WITH an explicit caller-tied WHERE is permitted"*. Turning `security_invoker` on would break the marketplace. |
| 87 of 106 active flows have never run | They are seeded defaults whose trigger events have not occurred on a platform holding 1 product — appointments, warranty expiry, card-spend thresholds. 12+ default flows HAVE fired, so the delivery mechanism is proven end to end. `flowEventContract.test.ts` already tracks emitter coverage informationally. |
| The `email_stranded_queued` findings were "two customers never told their order shipped" | **They were not.** `delivery_notes` is empty, no order is named `DN-*`, and all 136 rows carried `to_email = 'null'` — the four-character STRING, which is why Resend refused them. Two subjects repeated ~68 times each over 2026-07-26→28, then stopped: a dev loop. Deleted 2026-08-14 (they were 136 of 150 rows, so every delivery dashboard read as catastrophically broken). **The bug behind them is still real** — a failed send left the row at `queued` with no failure marker and nothing retried or reported it. Only the customer impact was imagined, by reading a subject line instead of checking the document it named. |
| `agent_memory_never_promoted` fires | The `runInBackground` repair shipped 2026-08-12 and **no agent chat has happened since 2026-08-08**. The probe is reporting pre-fix turns still inside its 30-day window. It cannot clear, or be validated, until someone sends one message. |
