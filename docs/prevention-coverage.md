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

### 3. Dead input — a control that changes nothing
Lists and toggles that never reach the engine; a tool registered on an agent but absent from every
toolkit cluster is stripped and unreachable.

- **Guarded by:** [tests/unit/toolkitCoverage.test.ts](../tests/unit/toolkitCoverage.test.ts) (coverage, reachability, options, and — since the two-copy rule became a generated projection, #266 Phase 3.5 — projection freshness plus a check that no second cluster map has reappeared), `AGENT_RESULT_TITLES` registration, and — for the API half — [test_no_unread_request_fields.py](../mivaa-pdf-extractor/tests/unit/test_no_unread_request_fields.py), which fails the build on any `*Request` field no code reads.
- **Proven to fire:** 2026-08-09, all three new mechanisms mutation-tested by stashing the fix and confirming the failure (4 of 7, 3 of 9, and 6 of 14 assertions failed as intended).
- **Blind spot:** still large for UI-level controls, but the API half is now covered rather than absent.
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

### 4. Ambiguous zero — a number that should be non-zero, sitting at zero, silently
`stamp_job_refresh_cost` referenced a column that did not exist, so billing sat at 0 with the
exception swallowed. An endpoint 404'd on 100% of calls for months. The Stripe webhook failed 100%
from the day it shipped.

- **Guarded by:** `ops.silent_zero`, `ops.test_artifacts_accumulating`, `ops.integrity_registry_broken`, and the `no-swallowed-write` semgrep rule
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
| [tests/unit/zernioSecretResolution.test.ts](../tests/unit/zernioSecretResolution.test.ts) | `npm test`, blocking | shapes 3 + 4 — an admin-editable secret read through `Deno.env` on the edge, where the DB→env bootstrap cannot work | **yes** — mutation-tested by restoring one of the four original hand-rolled getters; 2 of 6 assertions failed, naming the file |
| `ops.page_embeddings_never_written` | nightly | shape 4, page channel (#239) | no — but it was run against the live DB on introduction and returned clean |
| [tests/unit/test_page_embeddings.py](../mivaa-pdf-extractor/tests/unit/test_page_embeddings.py) | `pytest`, blocking | shape 4e + Phase-0 isolation on `page_embeddings` | **yes** — every assertion was mutation-tested against a deliberately broken copy of the code it guards |
| [tests/unit/test_no_fallback_embedder.py](../mivaa-pdf-extractor/tests/unit/test_no_fallback_embedder.py) | `pytest`, blocking | shape 4e — a second embedding provider reappearing anywhere | **yes** — mutation-tested by editing the REAL files and running pytest, not by re-implementing the assertions. That distinction found two holes: stripping all string literals made it blind to a reintroduced API URL, and a `startswith` check missed the batch form `[[0.0] * 1024] * len(texts)` |
| [tests/unit/test_weight_profiles.py](../mivaa-pdf-extractor/tests/unit/test_weight_profiles.py) | `pytest`, blocking | a fusion vector scoring zero on a path someone missed | **yes** — the image-only weights are pinned to their pre-page values, so the #239 carve-out proved itself non-disruptive rather than being asserted to be |
| [tests/unit/test_ssrf_guard_coverage.py](../mivaa-pdf-extractor/tests/unit/test_ssrf_guard_coverage.py) | `pytest`, blocking | invariant 7 — any server-side fetch of a user-influenced URL that is not the guarded fetch, across the whole `app/` tree with **no allowlist** | **yes** — 2026-08-16: reverting `admin.py` alone makes it fail naming `reprocess_image_ocr()`, and it passes on the fixed tree. It also asserts `scanned > 100`, so an inert walk fails instead of reporting clean — which is precisely how its one-declared-file predecessor passed for as long as it did. `KNOWN_UNGUARDED` was **deleted**, not emptied, once its nine entries were fixed |
| [tests/unit/test_safe_fetch_bytes.py](../mivaa-pdf-extractor/tests/unit/test_safe_fetch_bytes.py) | `pytest`, blocking | the guarded fetch itself — per-hop re-validation of every redirect and the streaming byte cap. Now the single fetch path for 11 call sites, so a weakness here is a weakness in all of them at once | **yes** — 2026-08-16, mutation-tested in both directions on the REAL file: making validation hop-blind fails 2 tests, moving the cap to after the body is read fails 2. Driven by a stub client rather than `httpx.MockTransport`, because CI installs pytest and nothing else and a third-party import would make the module uncollectable |
| `ops.storage_paths_unregistered` | nightly | shape 4d | **yes** — reads `build_storage_reference_set()`'s own body, so it cannot drift from what the cron actually honours |
| `ops.money_without_currency` | nightly | shape 6 | no — but all three branches were watched to fire before shipping |
| `ops.unsent_queue_backlog` | nightly | shape 4c | no — but it fired on real production data on introduction |
| [tests/unit/edgeRequestSurface.test.ts](../tests/unit/edgeRequestSurface.test.ts) | `npm test`, blocking | shape 9 — eager-bundle pins + the SPA catch-all's 404 surface | **yes** — both regressions reintroduced into the real files on 2026-08-10 and watched to fail (1 assertion, then all 31), not re-implemented in the test |
| `pdf.product_resume_incomplete` | nightly | shape 4b | no — but it was watched to fire on a planted marker before shipping |
| [tests/unit/escapeHtmlParity.test.ts](../tests/unit/escapeHtmlParity.test.ts) | `npm test`, blocking | invariant 11 — the three `escapeHtml` twins (Vite / Deno edge / Vercel `api/`) stay byte-equivalent | **yes** — imports all three and diffs them over a shared corpus, so a twin that stops matching fails the build rather than reporting clean |
| [tests/unit/aiUsageAttribution.test.ts](../tests/unit/aiUsageAttribution.test.ts) | `npm test`, blocking | every `ai_usage_logs` insert sets `workspace_id` and `user_id` — a row with neither is owned by nobody, so it is invisible both to per-tenant cost views and to that table's own `auth.uid() = user_id OR is_workspace_admin(workspace_id)` policy, which cannot match on NULL | **yes** — a `workspace_id` line was deleted from `generate-vr-world` on 2026-08-12 and the guard failed with the right file and line, then passed again on restore. Parses each insert by brace matching rather than a regex that stops at the first `}` and silently passes a site it never read, and asserts it found >20 sites before trusting the verdict |
| `lint_plpgsql_errors()` via `db.plpgsql-lint` | smoke monitor, 2-hourly | every `public` plpgsql function still compiles against the live schema | yes — baseline is a strict **zero**, so any new breakage fails instead of blending into a known-broken list |
| [tests/unit/companyIdentity.test.ts](../tests/unit/companyIdentity.test.ts) | `npm test`, blocking | shape 8 — one identity lookup for every create-a-business surface, `crm_companies` direct-insert ratchet | **yes** — asserts its own scan matched >500 files before trusting the verdict, so an inert glob fails instead of reporting clean |
| [tests/unit/productRelationDerivation.test.ts](../tests/unit/productRelationDerivation.test.ts) | `npm test`, blocking | shape 1 off the money path — a second client-side derivation of "what relates to this product" (#267) | **yes** — asserts its scan matched >100 files, and was watched to fail on a planted violation before shipping |
| `product_edges` composite FKs | every write | invariant 1 — an edge's two products must both sit in the edge's workspace | n/a — declarative; unlike a trigger it cannot be disabled |
| `ops.product_edges_never_written` | nightly | shape 4 on the edge rebuild — it ran and wrote nothing, or has not run for 3 days | **yes** — both branches were watched to fire on planted state, and the healthy case was confirmed to return **0** rows first, so a probe that always fires would have been caught |
| [tests/unit/productFieldSensitivity.test.ts](../tests/unit/productFieldSensitivity.test.ts) | `npm test`, blocking | shape 10 — the product Details tab renders arbitrary jsonb keys, so it must withhold anything the registry has not vouched for; plus "no `select('*')` from `products` in the modal" | **yes** — 2026-08-16, mutation-tested on the REAL file in both places the walker enters (flat keys and nested groups) and on the three-valued verdict. Asserts the *unknown-with-no-pattern* case resolves to `null`, not `false`, because that is the branch a failed fetch takes |
| [tests/unit/productReadProjection.test.ts](../tests/unit/productReadProjection.test.ts) | `npm test`, blocking | shape 10's read side — no `select('*')` on `products` that returns rows, and no embedded `products(*)` reached through a join. Pinned at **zero**, because the class was emptied rather than baselined | **yes** — 2026-08-16, both branches watched to fire by reverting the real files. Two scanners on purpose: a `from('products')` search cannot see `select('*, product:products(*)')` on `quote_items`, which was the customer-facing one. Asserts it walked >500 files, so an inert scan fails instead of reporting clean |
| [tests/unit/categoryFieldRegistry.test.ts](../tests/unit/categoryFieldRegistry.test.ts) | `npm test`, blocking | one field registry — `UploadCategory` derived from the projection rather than typed out, no hardcoded facet array, and no per-category map of sections and field labels anywhere in `src/` | partly — the copy-detection is a source walk, so a copy in a shape it does not recognise is invisible. The category assertions are real: it fails if `resolveUploadCategory` cannot resolve a DB category, which is how `building_materials` sat unresolvable |

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
- **Blind spot:** identity beyond dimensions. A finish or colour mismatch is still not a filter; only width/length/thickness are.

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

## Not defects — checked, and deliberately left alone

Recording these so they are not re-raised every time an advisor runs.

| Looks wrong | Why it is not |
|---|---|
| `marketplace_public_listings` is a SECURITY DEFINER view (Supabase lint 0010, invariant 3) | It is cross-tenant BY DESIGN — a member of workspace A must see workspace B's listings, which RLS would correctly forbid. It self-guards with a caller-tied `WHERE` on `auth.uid()` plus approved marketplace participation on both sides, so `anon` (uid null) sees nothing. `check_security_invariants()` already exempts exactly this shape: *"a definer view WITH an explicit caller-tied WHERE is permitted"*. Turning `security_invoker` on would break the marketplace. |
| 87 of 106 active flows have never run | They are seeded defaults whose trigger events have not occurred on a platform holding 1 product — appointments, warranty expiry, card-spend thresholds. 12+ default flows HAVE fired, so the delivery mechanism is proven end to end. `flowEventContract.test.ts` already tracks emitter coverage informationally. |
| The `email_stranded_queued` findings were "two customers never told their order shipped" | **They were not.** `delivery_notes` is empty, no order is named `DN-*`, and all 136 rows carried `to_email = 'null'` — the four-character STRING, which is why Resend refused them. Two subjects repeated ~68 times each over 2026-07-26→28, then stopped: a dev loop. Deleted 2026-08-14 (they were 136 of 150 rows, so every delivery dashboard read as catastrophically broken). **The bug behind them is still real** — a failed send left the row at `queued` with no failure marker and nothing retried or reported it. Only the customer impact was imagined, by reading a subject line instead of checking the document it named. |
| `agent_memory_never_promoted` fires | The `runInBackground` repair shipped 2026-08-12 and **no agent chat has happened since 2026-08-08**. The probe is reporting pre-fix turns still inside its 30-day window. It cannot clear, or be validated, until someone sends one message. |
