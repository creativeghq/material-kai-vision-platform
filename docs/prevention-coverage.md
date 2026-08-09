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

- **Guarded by:** [tests/unit/toolkitCoverage.test.ts](../tests/unit/toolkitCoverage.test.ts) (the two-copy rule), `AGENT_RESULT_TITLES` registration, and — for the API half — [test_no_unread_request_fields.py](../mivaa-pdf-extractor/tests/unit/test_no_unread_request_fields.py), which fails the build on any `*Request` field no code reads.
- **Proven to fire:** 2026-08-09, all three new mechanisms mutation-tested by stashing the fix and confirming the failure (4 of 7, 3 of 9, and 6 of 14 assertions failed as intended).
- **Blind spot:** still large for UI-level controls, but the API half is now covered rather than absent.
- **Worked example, 2026-08-09 (#277/#338):** the Search page offered Color/Texture/Style/Material modes that were **not differentiated at the backend at all** — every one returned the same fused result. Fixing that surfaced the same shape four more times. `visual_search` sent `aspect` to `strategy=image`, a branch that never reads it: Pydantic validated the field, the branch dropped it, and every "find a similar texture to this image" returned plain visual similarity. A sweep of all 132 `*Request` models then found **ten** fields accepted and never read, two of them harmful — `include_content` was sent by the frontend on *every* search and read nowhere, and `enable_embedding` defaulted true and unread, so passing `false` billed the caller for embeddings they had declined. Six belonged to models **no route referenced at all** and were deleted; the rest are honored. `KNOWN_UNREAD` is now empty and asserted `== 0` — a floor, not a ceiling.
- **The detector's own blind spot, worth stating because it produced two false positives:** it reasons about NAMES, and `request.dict()` / `.model_dump()` reads every field without naming one. `CreateCategoryRequest.icon` and `.parent_category_id` were reported dead while working perfectly — stored via a mass assignment that was itself an invariant-8 bug (`kb_categories` carries server-owned `is_locked` and `material_category_id`, so the spread was one same-named model field away from letting a request body set either). The false positive was worth more than the defect it wasn't. `_models_consumed_wholesale()` now recognizes the pattern.
- **Worked example of that blind spot, 2026-08-08 (#234):** "Custom Monitoring" let a user paste a retailer URL to watch. `add_url_only()` stored it in `tracked_queries.pinned_url` and **no backend code ever read the column** — the only reader in the repo was a React component using it as a label. `refresh()` had no `mode` branch, so the row ran the full Perplexity + DataForSEO + Haiku discovery pass keyed on the product *name*, re-billed every 24h by the cron, while the pinned page went unfetched. The saved setting nothing reads, exactly as described above, and it survived three months because every observable signal was healthy: the row refreshed, prices appeared, the cron reported success. They were prices for other pages. Now guarded by [tests/unit/test_url_only_is_firecrawl_only.py](../mivaa-pdf-extractor/tests/unit/test_url_only_is_firecrawl_only.py), which asserts the mode branch sits *before* `search_prices()` — a branch placed after reads as correct and still pays for the pass. **Proven to fire:** 2026-08-08, mutation-tested against both original shapes (branch moved after the discovery call; `mode` filter dropped from `find_for_product`), 2 of 5 assertions failed as intended. Note what made this findable at all: the column was the evidence. A dead *input* leaves a written-but-unread field behind, which is greppable; a dead *control* that was never persisted leaves nothing.

### 4. Ambiguous zero — a number that should be non-zero, sitting at zero, silently
`stamp_job_refresh_cost` referenced a column that did not exist, so billing sat at 0 with the
exception swallowed. An endpoint 404'd on 100% of calls for months. The Stripe webhook failed 100%
from the day it shipped.

- **Guarded by:** `ops.silent_zero`, `ops.test_artifacts_accumulating`, `ops.integrity_registry_broken`, and the `no-swallowed-write` semgrep rule
- **Proven to fire:** 2026-08-01 — `no-swallowed-write` found 9 sites, 7 genuine: three lost `ai_usage_logs` billing rows, a lost ERGANI submission audit row, a lost `last_digest_at` double-notify guard, a lost `embedding_status='failed'` write, and a recovery cron incrementing its counter after an unchecked update.
- **Note:** the **<5%** success-rate threshold matters. An exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5%.
- **Blind spot:** `ops.silent_zero` probes are hardcoded (deliberately — admin-editable SQL run by a SECURITY DEFINER function would be a privilege-escalation surface). A new metric gets no probe until someone writes a migration.
- **Worked example of paying that cost, 2026-08-08 (#239):** the page-embedding channel shipped with `ops.page_embeddings_never_written` in the same change. Worth noting *why* it needed one at all: the fusion weights make its silent failure actively misleading rather than merely invisible. The `page` channel carries 8–15% of every weight profile, so with no vectors written, search reports eight healthy channels while ranking on seven — and because `multi_vector_search` normalizes by *active* weights, the scores stay plausibly scaled and nothing looks off. A feature whose absence degrades a number without changing its shape is exactly this defect class, and the probe is the only thing that can see it.

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
| `ops.page_embeddings_never_written` | nightly | shape 4, page channel (#239) | no — but it was run against the live DB on introduction and returned clean |
| [tests/unit/test_page_embeddings.py](../mivaa-pdf-extractor/tests/unit/test_page_embeddings.py) | `pytest`, blocking | shape 4e + Phase-0 isolation on `page_embeddings` | **yes** — every assertion was mutation-tested against a deliberately broken copy of the code it guards |
| [tests/unit/test_no_fallback_embedder.py](../mivaa-pdf-extractor/tests/unit/test_no_fallback_embedder.py) | `pytest`, blocking | shape 4e — a second embedding provider reappearing anywhere | **yes** — mutation-tested by editing the REAL files and running pytest, not by re-implementing the assertions. That distinction found two holes: stripping all string literals made it blind to a reintroduced API URL, and a `startswith` check missed the batch form `[[0.0] * 1024] * len(texts)` |
| [tests/unit/test_weight_profiles.py](../mivaa-pdf-extractor/tests/unit/test_weight_profiles.py) | `pytest`, blocking | a fusion vector scoring zero on a path someone missed | **yes** — the image-only weights are pinned to their pre-page values, so the #239 carve-out proved itself non-disruptive rather than being asserted to be |
| `ops.storage_paths_unregistered` | nightly | shape 4d | **yes** — reads `build_storage_reference_set()`'s own body, so it cannot drift from what the cron actually honours |
| `ops.money_without_currency` | nightly | shape 6 | no — but all three branches were watched to fire before shipping |
| `ops.unsent_queue_backlog` | nightly | shape 4c | no — but it fired on real production data on introduction |
| `pdf.product_resume_incomplete` | nightly | shape 4b | no — but it was watched to fire on a planted marker before shipping |
| [tests/unit/escapeHtmlParity.test.ts](../tests/unit/escapeHtmlParity.test.ts) | `npm test`, blocking | invariant 11 — the three `escapeHtml` twins (Vite / Deno edge / Vercel `api/`) stay byte-equivalent | **yes** — imports all three and diffs them over a shared corpus, so a twin that stops matching fails the build rather than reporting clean |
| `lint_plpgsql_errors()` via `db.plpgsql-lint` | smoke monitor, 2-hourly | every `public` plpgsql function still compiles against the live schema | yes — baseline is a strict **zero**, so any new breakage fails instead of blending into a known-broken list |
| [tests/unit/companyIdentity.test.ts](../tests/unit/companyIdentity.test.ts) | `npm test`, blocking | shape 8 — one identity lookup for every create-a-business surface, `crm_companies` direct-insert ratchet | **yes** — asserts its own scan matched >500 files before trusting the verdict, so an inert glob fails instead of reporting clean |

**"Self-proving"** means the mechanism demonstrates it can still detect, rather than only reporting
what it found. Nine of eighteen qualify. That is the gap.

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
