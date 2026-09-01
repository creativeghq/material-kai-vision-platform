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
- **Design System**: [docs/design-system.md](docs/design-system.md) — full reference for all UI patterns, colors, components. Live specimen: `/design-system` in-app.

## Workflow Rules
- **SQL / migrations**: ALWAYS apply via `mcp__supabase__apply_migration` (DDL) or `mcp__supabase__execute_sql`. NEVER create a local `supabase/migrations/*.sql` file. Run `mcp__supabase__get_advisors(security)` after any DDL.
- **Never reference a column named `found` (or `row_count`, `sqlstate`, `sqlerrm`) unqualified inside a plpgsql function.** `FOUND` is a plpgsql BUILT-IN variable, so a bare `found` in a query is ambiguous between it and your column. Postgres accepts the `CREATE` and raises `42702 column reference "found" is ambiguous` at RUN TIME — so a migration applies clean, every test passes, and the function fails the first time a user calls it. `get_website_rank_summary` shipped exactly like that on 2026-08-29 and was caught post-deploy by `lint_plpgsql_errors()` (the `db.plpgsql-lint` smoke check), not by anything earlier. Table-qualify it.
- **After a migration that DROPS a column or makes one GENERATED, run `npm run schema:writers`.** The migration is live the moment you apply it and the code that writes that column is not — Postgres refuses a non-DEFAULT write to a generated column and PostgREST refuses an unknown one, so every stale writer is a hard runtime error from that second onward. On 2026-08-17 one such migration left three plpgsql functions, an edge function and two test fixtures behind; the edge one returned `not_found` with HTTP 200 on every shared quote link, and each was found separately by something breaking. `schema:writers` lints the whole checkout against the live column registry, `lint_plpgsql_errors()` covers the SQL side, and both run post-deploy as smoke checks — but the guard is only *preventive* if you run it when you apply the migration.
- **MIVAA is a different repository** (`creativeghq/mivaa-pdf-extractor`, single-branch `main`). Backend changes get committed and pushed *there*, not here. Editing the submodule working copy without pushing to that repo ships nothing.
- **Git**: commit and push straight to `origin/main`. No feature branches. Pushed = done.
- **GitHub**: `gh` commands run without asking for permission. Repo: `creativeghq/material-kai-vision-platform`.
- **Before done**: `npm run lint && npm run typecheck && npm test`. All three must pass. **`lint` is not optional and it is the one people skip** — the Deploy workflow depends on the unit-tests job, which runs `eslint . --max-warnings 0`, so a lint-only failure passes every other check here and still stops the deploy *silently*. On 2026-08-14 that shape blocked four merges in one day (unused imports left behind by a deletion, and template literals that lost their last `${}`) — all of them "green locally". `npm run typecheck` covers `src/` ONLY — `tsconfig.json` excludes `supabase/**`. Edge functions are checked by `npm run typecheck:edge` (`deno check`, gated in CI by `.github/workflows/edge-typecheck.yml`); run it when you touch one. It is baseline-relative — `.github/edge-typecheck-baseline.json` fails the build when a count rises, so ratchet the numbers down as you fix things rather than editing the baseline upward.
- **A closed value-set that BOTH runtimes need is declared ONCE and mirrored — never typed twice.** Put it in an **import-free** module under `src/`, add the pair to `VOCABULARIES` in `scripts/gen-vocabularies.mjs`, and run `npm run vocab:mirror` (part of `gen:all`); same-runtime consumers just import it. Vite resolves `@/` and Deno resolves by URL, so the copy has to be generated — and a hand-kept one drifts. Measured 2026-08-27: **59** value-sets duplicated across `src/` and `supabase/functions/`, **32** exactly matching a Postgres enum or CHECK — i.e. the DB enforces the fact and TypeScript restates it 2–6×. **#391 closed those 32** (31 unified onto 12 mirrored sources; one, `priority_level`, was a FALSE POSITIVE — matched on three literals against a heat-pump `GlazingExposure`, constrained zero columns, dropped). The rule stands for every new one. Drift wider = the UI offers a value the write rejects with a raw `23514`/`42501`; drift narrower = a valid option silently vanishes. Guarded by [tests/unit/vocabularyMirrors.test.ts](tests/unit/vocabularyMirrors.test.ts). **After moving a vocabulary a tool's `z.enum` reads, run `npm run tools:manifest` and check the param is still `type: 'enum'`** — the AST generator follows relative imports only one hop, and an unresolved enum degrades to `type: 'string'`, killing `autoFields` selects with every gate still green.
- **Codebase search**: Grep/Glob for known targets; Agent `subagent_type=Explore` for broad sweeps.
- **Plans and specs** go in a GitHub issue, never a file. `docs/` is for finalized reference only.

## Security Invariants (MUST follow — from pentest #250, 2026-07-05)
Hard rules. A change that violates one is a bug, not a style choice. Tracker: #250. Automated backstop:
`check_security_invariants()` RPC. The recurring root cause of the audit was "service-role client + trust a
body-supplied id" and "SECURITY DEFINER exposed to anon" — do not reintroduce either.

1. **Tenancy binding (BOLA).** Any edge function / route / RPC touching workspace-scoped data MUST derive `user_id`/`workspace_id` from the **verified JWT** and verify the caller owns the target object — `userCanAccessWorkspace(supabase, auth.userId, row.workspace_id)` (Deno, `_shared/auth.ts`) or `assert_workspace_member(workspace_id)` (SQL). NEVER trust `workspace_id`/`user_id`/`created_by` from the request body. Using the service-role client does NOT exempt you — it makes the manual check mandatory. Return 404 (not 403) on ownership mismatch to avoid id enumeration.
1b. **Never authorize on `user_metadata`.** `auth.jwt() -> 'user_metadata'` is the projection of `auth.users.raw_user_meta_data`, and `auth.updateUser({ data: … })` writes it **from the browser, as any signed-in user**. `app_metadata` is the admin-only twin. `is_admin()` read the writable one for months: 11 RLS policies across 9 tables plus `admin_ai_usage_summary` trusted it, so any authenticated account could self-promote with one client call — proven live, `false` → `true` on the claim alone. It now delegates to `is_platform_admin()`, which reads `user_profiles.role_id → roles.name`; one implementation, because two helpers answering "is this an admin" is how this happened. Caught by `check_security_invariants()` branch `1-jwt-metadata-authz`, which scans functions AND policies and excludes only itself.

2. **SECURITY DEFINER functions.** Every one MUST `SET search_path = ''` (or `pg_catalog, public`) AND `REVOKE EXECUTE FROM anon, authenticated, PUBLIC` immediately after `CREATE`, then GRANT only to the roles that need it. Trigger-body functions (`RETURN trigger`) get NO execute grant. Only add `anon`/`authenticated` EXECUTE for a function genuinely called from a public page, and only after confirming it self-guards. Mutating finance/order RPCs are NEVER anon-executable.
3. **Tenant views.** Any view over workspace-scoped tables MUST be `security_invoker = on` so it inherits the underlying RLS. Never grant a view INSERT/UPDATE/DELETE.
4. **RLS.** Every new `public` table with tenant data gets RLS enabled + a workspace-scoped policy. No `WITH CHECK (true)` / `USING (true)` policies on tenant tables. Write policies **one per command** — a permissive `FOR ALL` policy *also grants SELECT* and ORs away any narrower read policy sitting next to it. That silently defeated the deal-inheritance read rule on `crm_deal_tasks` (#311); nothing failed, the rows were just readable by people the SELECT policy excluded. **Scoping a table means DROPPING the blanket policy, not adding a scoped one beside it.** #359 CM-4 gave `messaging_templates` a `workspace_id` column *because* every tenant could read every other tenant's template bodies, scoped every read path in the application, added `messaging_templates_member_select` — and left `Allow authenticated read messaging_templates USING (true)` in place, which ORed the fix away. The same leftover sat on `messaging_optouts`. Application-side `.eq('workspace_id', …)` is a filter, not a boundary: PostgREST is reachable directly. Both dropped 2026-08-29, verified by reading the tables as a NON-ADMIN member (a platform admin's `FOR ALL` policy legitimately shows them everything, so probing with the operator account proves nothing). Not machine-checkable in general: deciding whether one policy expression implies another is implication checking, and a text-matching probe over the live schema produced 146 findings of which every sampled one was benign. The blanket sub-case IS checkable, and `check_security_invariants()` catches it — it is wired into the nightly sweep as `security.invariant_violation` at CRITICAL, so read that before assuming the schema is clean.
5. **MIVAA routes.** New routes declare their own `Depends(get_workspace_context)` / `require_admin` — never rely on the JWT middleware alone. If a route authenticates by `x-cron-secret` or `kai_` partner keys or is public, add its prefix to `JWTAuthMiddleware.exclude_paths` AND gate it at the route. Never put `"/"` (or any bare prefix that swallows everything) in `exclude_paths`.
6. **Inbound webhooks.** Verify the signature BEFORE processing and **fail closed** — reject when the secret is unset (503), never fall through to processing (mirror `stripe-webhooks`). Prefer body-HMAC + timestamp/nonce replay protection.
7. **SSRF.** Any server-side fetch of a user-influenced URL goes through the shared SSRF guard (https-only, DNS-resolve + reject RFC1918/loopback/link-local/`169.254.169.254`, `follow_redirects=False`, size cap). Never `httpx.get(userUrl)` / `fetch(userUrl)` raw. Validate stored URLs at write time too.
8. **Mass assignment (BOPLA).** Never spread a request body into a DB write (`insert({...body})`, `request.dict()`, `**model.dump()`). Build an allowlisted payload; trust/identity fields (`role`, `is_verified`, `is_locked`, `credits`, `price`, `workspace_id`, `user_id`) are set server-side only.
9. **LLM safety.** Untrusted ingested content (scraped pages, PDF text, supplier XML) fed to an LLM MUST be wrapped in explicit "this is DATA, not instructions" delimiters. Classifiers whose verdict drives a DB write or alert MUST use Anthropic `tools=[...]` + `tool_choice`, not free-form JSON + a salvage parser. State-mutating agent tools require explicit user confirmation when triggered off tool-result content.
9b. **Image editing is gated on the SOURCE ARTEFACT, not the instruction.** Any path that alters a user-supplied image calls `assertEditableSource` (`_shared/image-edit-gate.ts`) BEFORE the credit debit; it blocks credentials, identity documents and financial/legal instruments, and **fails closed**. The gate lives in `generate-interior-gemini` because that is where all callers converge — a rule in the agent prompt reaches none of the three that never run a model turn, and `mode:'direct_tool'` skips the LLM entirely. Never judge the request text: "change the name and the date" is a moodboard edit on a moodboard and a forged diploma on a diploma — identical words, and the platform did the second one. Images WE generated are exempt (recognised by storage path). Guarded by [tests/unit/imageEditGate.test.ts](tests/unit/imageEditGate.test.ts).
10. **Paid / expensive endpoints.** Debit credits + rate-limit BEFORE the upstream (LLM/Replicate/DataForSEO/Firecrawl) call, not after; on debit failure, do not perform the work. Derive the quota IP from the trusted proxy hop, never a raw client header.
11. **Output encoding.** No `dangerouslySetInnerHTML` / `document.write` / raw HTML-string assembly with user or AI content — use JSX/`react-markdown` (no `rehype-raw`) or the **canonical** escaper: `escapeHtml` from `supabase/functions/_shared/html.ts` (edge), `src/utils/escapeHtml.ts` (frontend), or `api/_shared/html.js` (the Vercel Node functions in `api/`, which are plain ESM `.js` with no `@/` alias and no TS step, so they can import neither of the other two). All three escape the full `& < > " '` set (attribute-safe) and are held byte-equivalent by [tests/unit/escapeHtmlParity.test.ts](tests/unit/escapeHtmlParity.test.ts) — **not** by convention, which is how they drifted last time. Do NOT hand-roll a local copy; the old per-file copies drifted to 3 different strengths. A fourth runtime gets a fourth twin added to that test, never an inline copy. `escapeHtml` is HTML-only: it is NOT a PostgREST filter sanitizer, a CSV quoter, or an XML escaper (separate contracts — never name them `esc`).

**Enforcement:** (a) this section, followed by anyone editing the repo; (b) `check_security_invariants()` surfaces live DB violations for 2–4; (c) code-level patterns (1, 6–11) live in the CI semgrep ruleset (`.github/semgrep-security.yml`, guarded by [tests/unit/semgrepRuleset.test.ts](tests/unit/semgrepRuleset.test.ts)).

## Anti-regression rules — READ BEFORE ADDING A DERIVED NUMBER, A JANITOR CRON, OR A SECOND WRITE

These bug shapes account for nearly every "small issue" found by hand in this platform. All have
enforcement; do not work around any of them.

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

### 1c. The PRINTED document must say what the TRANSMITTED one says.

An invoice exists twice: as the myDATA envelope built by `_shared/fiscal/invoice-builder.ts`, and
as the paper the customer holds. Until 2026-08-21 the two were built from different reads, and
every difference was invisible — a wrong document is a valid PDF.

- **The party comes from `resolvePrintedCounterparty`, never from a live `crm_companies` read.** It prefers `invoices.counterparty_snapshot.row` (frozen at issue) and applies the same `billing_*` precedence `partyFromCrm` applies. Reading the live row means renaming a customer rewrites every past PDF, and a re-homed customer re-renders with no name at all.
- **A figure that is stored and transmitted is PRINTED.** Per-line discount (`discounted_price` — a discount AMOUNT on an invoice line, a discounted unit PRICE on a quote line), per-line `vat_amount` and `other_taxes_amount`, the `vat_exemption_category` article on every 0% line, `fiscal_submissions.authentication_code`, the issue time, the document-type code. All six were captured, sent to AADE, and left off the customer's copy.
- **Every figure the reader can add up must add up.** The per-rate VAT total is the sum of the PRINTED rows, never a parallel running sum, and the fallback grand total is built from those same rows.
- **A myDATA CODE is a NAMED constant, never an integer literal.** AADE table 8.12 (payment method) was written out five times in TWO DIFFERENT ROTATIONS at once: the register, the storefront and the envelope used AADE's (3 cash, 7 POS/e-POS, 8 IRIS); the `mydata_reference` seed behind the manual invoice picker and the three maps that PRINT the result used the same eight labels shifted by two. So an operator picking "3 — On credit" transmitted **Cash**, and a POS receipt written as 7 printed as "Domestic account". Both halves were self-consistent and every value is a valid 1–8, so nothing raised — found 2026-08-29 by reading a competitor's public API docs. `MYDATA_PAYMENT_CODE` in [src/modules/finance/paymentVocabulary.ts](src/modules/finance/paymentVocabulary.ts) is the one table (mirrored to Deno by `vocab:mirror`); guarded by [tests/unit/paymentVocabulary.test.ts](tests/unit/paymentVocabulary.test.ts), which fails on a reappearing `Record<number, string>` or a bare `payment_method_code:` integer.
- **A credit note is the invoice it corrects, in reverse — same line anatomy, and its TYPE follows the credited document.** A retail receipt (11.x — what `buildInvoiceInputFromDb` emits for every counterparty with no VAT number, i.e. every register and storefront sale) is reversed by **11.4**, never by 5.1/5.2; only a wholesale invoice takes those. `credit_note_items` carries the `vat_exemption_category` and all five per-line tax pairs, **copied from the credited invoice line and pro-rated by net share by `issue_credit_note`** — never restated by the client, which has no business inventing a tax fact. Until 2026-08-29 the builder read an exemption column that did not exist, so every credited 0% line went to AADE with no article. Guarded by [tests/unit/creditNoteFiscalFields.test.ts](tests/unit/creditNoteFiscalFields.test.ts).
- **A MOVEMENT document states its purpose from AADE's table, and the table is 20 codes, not 7.** `MYDATA_MOVE_PURPOSES` in [src/services/fiscal/fiscalVocabulary.ts](src/services/fiscal/fiscalVocabulary.ts) is the one source (mirrored to Deno). The four hand-written copies it replaced all agreed and were all wrong from 6 on: 6 was offered as "Movement between premises" when AADE 6 is **Φύλαξη/Storage** and Ενδοδιακίνηση is **8**, 7 was offered as "Consignment" when AADE 7 is **Επεξεργασία**, and 9–20 did not exist. Purpose **19** takes `otherMovePurposeTitle` — name an unusual movement there rather than approximating it with a neighbour. **An unset purpose is REFUSED, never defaulted**: `move_purpose ? … : 1` filed every unclassified movement as a SALE. `startShippingBranch`/`completeShippingBranch` come from the document (they were hardcoded 0, so an inter-branch transfer read as HQ→HQ), and an incomplete loading/delivery address is refused rather than padded with the `'0'`/`'NONE'` counterpart fallback. Guarded by [tests/unit/movementDocumentFields.test.ts](tests/unit/movementDocumentFields.test.ts).
- **The quote→invoice writer is `_generate_order_from_quote_core`, NOT `issue_invoice_from_quote`.** Accepting a quote creates the order AND a draft pre-invoice, so `issue_invoice_from_quote` finds one already exists and returns early — every line below that check was unreachable for a normal quote, which is why fixing it alone changed nothing observable. Fiscal facts (VAT category/percent/amount, exemption cause, commodity code, origin) are written where the lines are CREATED, and the 0%-with-no-stated-cause gate sits ABOVE the early return in both entry points. `order_items.vat_percent` matters here too: NULL made every quote-born line read as 0% to `generate_invoice_from_order`'s own gate.
- **`counterparty.ts` and `mydataExemptionCategories.ts` are the sources; the Deno copies under `_shared/finance/` are GENERATED** — `npm run finance:mirror`, part of `gen:all`. Never hand-edit a mirror; both sources stay import-free so the mirror can be a byte copy.
- Guarded by [tests/unit/invoiceDocumentFields.test.ts](tests/unit/invoiceDocumentFields.test.ts) + [tests/unit/financeMirrors.test.ts](tests/unit/financeMirrors.test.ts).

### 1b. A date of record is the OPERATOR'S calendar day, never UTC.
`new Date().toISOString().slice(0, 10)` is the UTC date. Greek customers are UTC+2/+3, so between
local midnight and 02:00–03:00 it returns **yesterday** — on the invoice `issueDate` (a fiscal record
submitted to AADE, numbered sequentially *by date*), on `paidAt`, on the attendance date that feeds
payroll. It was hand-written at 25 sites because there was no helper. Same shape as a wrong money
number: a valid `YYYY-MM-DD`, nothing raised, typechecks clean.

- Use `todayLocalISO()` / `toLocalISODate(d)` / `localISODateOffset(n)` from `src/utils/datetime.ts`. Never `.toISOString().slice(0, 10)` on a local `Date`, and never `Date.now() ± n * 86400000` for a day offset — a DST day is 23 or 25 hours.
- Enforced by the semgrep rule `no-utc-today-as-local-date` (frontend only) + [tests/unit/datetimePrimitives.test.ts](tests/unit/datetimePrimitives.test.ts).
- **Do NOT "fix" this by deriving the date in SQL.** The DB session runs in UTC, so `current_date` is the same defect one layer down. There is no workspace business timezone; a server-stamped date is still UTC and that is a known gap, not something a probe can close.

### 2. Silent zero — check the world, not the exit code.
The dominant historical failure here is **a number that should be non-zero sitting at zero forever while nothing
complains**: `stamp_job_refresh_cost` referencing a column that did not exist (billing stuck at 0, exception
swallowed); an endpoint 404-ing on 100% of calls for months; the Stripe webhook failing 100% since it shipped;
`generate-pbr-maps` deleted so `metadata.pbr_maps` is never written.

- **`ops.silent_zero`** probes: activity happened in the window and the metric it should have produced is zero across the board; plus endpoints and cron jobs with a **<5%** success rate (not 0% — real breakage is near-total, and an exact-zero test reported this platform clean while two endpoints sat at 0.8% and 4.5%).
- **`ops.test_artifacts_accumulating`** watches the reaper's OUTPUT, not its exit code. **When you add a janitor cron, add a probe on the mess it is supposed to clear.**
- **`ops.integrity_registry_broken`** validates the registry itself: `run_data_integrity_checks` calls `detect_fn()` / `heal_fn()` with **no arguments** and expects heal to return `integer`. A wrong signature aborts the whole nightly sweep, which then reports nothing at all.
- Probes are **hardcoded in the detect function on purpose** — admin-editable SQL run by a SECURITY DEFINER function would be a privilege-escalation surface. Adding a probe is a migration.
- **Never rewrite `dic_detect__ops_silent_zero` with a whole-body `CREATE OR REPLACE` built from an older copy — append by surgery on `pg_get_functiondef`, with assertions.** The probes are inline and have accumulated across a dozen separate migrations, so a full replacement written from a stale source silently deletes the ones added since. That happened on 2026-08-10: three #342 probes landed at 12:16 and an unrelated migration erased them at 13:21; nobody noticed for ten days, because a detector with fewer probes just returns fewer rows. `ops.silent_zero_probe_missing` now holds the roster and fires when a name goes missing — **delete a probe deliberately and you must edit that roster too.**

### 3. A metric is a VALUE or a stated REASON there is no value — never a hidden row, never a 0.
The reader-facing half of rule 2. A silent zero is bad; a metric that quietly *vanishes* is worse, because
the surface still looks complete. `WebsiteDomainIntelPanel` rendered four tiles when it had four numbers and
eight when it had eight, so a backlink collector that had **never once succeeded** was pixel-identical to a
site with no backlinks. `seo-domain-tracker` had wrapped all three DataForSEO calls in `.catch(() => [])`,
which is why every stored snapshot's `backlinks`/`referring_domains`/`domain_rank` is NULL.
- **SQL derives the number AND the verdict on it; TypeScript only formats.** `public.seo_metric` returns `{value, previous, delta, delta_pct, status, note, series}`; `get_website_seo_overview` / `seo_website_health_summary` / `seo_website_gsc_summary` / `get_website_ai_visibility` are the callers. A tile and a report reading the same RPC then cannot disagree about whether a figure is real.
- **Statuses:** `ok` · `no_data` (source answered, genuinely nothing) · `collector_failed` (**unknown**, not zero) · `not_collected` (never run) · `not_connected` (needs a connection). An unrecognised status **fails closed** to "unknown" in `seoMetrics.ts` — never falls through to rendering the raw number as fact.
- **A collector records WHICH source failed** — `seo_domain_snapshots.source_errors` — so the panel can say "we could not fetch this". A call that succeeds but returns no row is *unverified*, not zero.
- **A rate is measured against attempts that SUCCEEDED.** All 212 `gpt-4o-mini` LLM probes returned HTTP 429; mentions ÷ probes-**sent** renders that as "0% AI visibility", which reads as "assistants never mention us". Divide by `answered`; report "No verdict" plus the upstream error when there is nothing to divide by.
- Same rule for feature detection: an absent featured snippet or an image pack you are not in is a **finding**, so `serpFeatures.ts` renders an inventory with present/absent verdicts, not a list of hits.

### 4. A create-then-stamp pair is ONE thing, and a retry must not do it twice.
Eight findings across #351 and #354 were one sentence: two writes with no transaction and a button
that stays armed. The first commits, the second fails, the screen says `Failed`, and the operator
does the only thing offered. That billed the same hours twice, booked a second supplier bill AND a
second payment for one cost, cut an invisible duplicate delivery note, re-issued transmitted credit
notes, took two POS receipts each holding its own legal ΑΑΔΕ number, and filed a second declaration
to ΕΡΓΑΝΗ. Nothing catches it: each half works, each error is reported accurately for the half that
failed, and `uncheckedSupabaseWrites` cannot see it because every write in the pair IS checked.
- **Naturally atomic → one SQL RPC**, and make the stamp the CLAIM: `where <marker> is null` plus a count check, so a lost race aborts instead of double-writing (`bill_time_entries_to_invoice`).
- **A retry is legitimate but the work is not repeatable → an idempotency key** minted per unit of work, replayed from what was stored (`pos_issue_receipt`'s `p_client_token`). A client-side `useRef` latch is NOT enough on its own: it closes the double-tap and cannot close the dropped connection, which is the case where the operator holds an error for a document that exists.
- **The second half cannot be rolled back → resumable and honest.** A filing to a ministry happened whatever the local row says. Record each leg, resume at the first that did not run, and NAME the half that failed: reported as a failure the operator re-files, reported as a clean success nobody repairs the record.
- **A duplicate guard reads the record written on the SUCCESS path**, never the local status column written after it — that column is exactly the one that can be missing (`hr_ergani_submissions`, not `hr_overtime.status`).
- Guarded by [tests/unit/financeAtomicity.test.ts](tests/unit/financeAtomicity.test.ts) and [tests/unit/hrFilingIntegrity.test.ts](tests/unit/hrFilingIntegrity.test.ts); both assert ORDER, because a check after the side effect is not a check. Full write-up: [docs/prevention-coverage.md](docs/prevention-coverage.md) shape 18.

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

## Prompts and extraction fields come from the DATABASE — never from code
**Never hardcode a prompt in a file that calls a model, and never write a fallback for one.**
Load it: `prompt_registry.load_prompt(...)` (Python) or `loadPrompt({...})` from
`_shared/prompt-registry.ts` (edge). A sync site uses `get_cached(...)` after its async entry
point called `prefetch(...)`. Both raise; there is no default. `PromptNotConfigured` ("add the
row") is deliberately distinct from `PromptStoreUnavailable` ("the DB is down") — the six loaders
this replaced returned `None` for both, so no caller could react correctly to either.
A fallback is invisible when it fires: `segmentation_service` caught every exception, logged at
DEBUG and used a 9,119-char constant, so an admin's edit saved and changed nothing forever while
every health signal stayed green. Guarded by
[tests/unit/test_prompts_come_from_the_database.py](mivaa-pdf-extractor/tests/unit/test_prompts_come_from_the_database.py).

**`material_metadata_fields` + `material_categories` are the field registry.** What fields exist,
which are canonicalizable, which are variant axes (`role='identity'`), and whether a value belongs
in `attributes` jsonb or a real column (`destination`) — all DB. There were SIX Python/TS copies
and they disagreed; `cladding` was offered by the extraction prompt and rejected by stage 4's
validator, so those products re-classified on every run. A field can mean different things per
category (`body_material` is vitreous china in sanitary, rattan in lighting) — that is
`description_by_category`, not a merge, and its NAME can differ per category too
(`label_by_category`: "Material" for kitchen, "Body Material" elsewhere). The client reads it at
runtime through `fieldRegistryService` — **never a hardcoded section/field/label map.** The seventh
copy was 900 lines of `CATEGORY_DISPLAY_REGISTRY`, disagreeing with the DB on 124 labels and missing
`building_materials` entirely, so a door rendered under General Materials (#368). Guarded by
[tests/unit/test_field_registry_is_the_source.py](mivaa-pdf-extractor/tests/unit/test_field_registry_is_the_source.py)
and [tests/unit/categoryFieldRegistry.test.ts](tests/unit/categoryFieldRegistry.test.ts).

**`sensitivity` decides what a viewer may see, and the gate must match the RENDERER's granularity.**
A surface that walks `attributes`/`metadata`/`properties`/`specifications` and renders every key it
finds is gated **per key** — section-level permission checks do not reach it, and supplier XML and AI
extraction both write there and may invent fields nobody has classified. Ask
`is_internal_product_field()` (SQL) or `useFieldRegistry().isInternalField()` (client): the registry
answers for a key it knows, `internal_product_field_pattern()` is the floor for one it does not, and
the client FETCHES that pattern rather than restating it. **An unresolved verdict (`null`) withholds**
— treating it as public is a filter that switches itself off exactly when the fetch fails. Reads of a
single product go through `get_product_detail()`, never `select('*')`: `products` carries `cost`,
`markup_percent`, `cost_source`, `supplier_company_id` and `attributes_raw` behind an RLS policy whose
only test is workspace membership. Guarded by
[tests/unit/productFieldSensitivity.test.ts](tests/unit/productFieldSensitivity.test.ts).

## Flows — notifications & automation (READ BEFORE adding any notification/email/automation)
**Never hardcode a `user_notifications` insert or an `email-api` call in new code.** Emit an event —
`flowEventService.emit(type, data)` (frontend) or `emitFlowEvent(type, data)` from `_shared/flow-events.ts`
(edge) — carrying the full payload (`user_id`, `title`, `body`, `action_url`, `type`). A seeded **active**
default flow (tag `system-default`, `is_locked=true`) delivers it, so admins can pause/edit/retarget without a
deploy. Adding a trigger: follow §8 of [docs/flows-notification-system.md](docs/flows-notification-system.md) —
`TriggerType` union + config interface + the exhaustive icon/label maps + a `paletteItems.ts` entry + a seeded
locked default flow + a `flow_area_registry` row. Typecheck before done.

**`is_global` flows are the OPERATOR's, and no tenant surface may ever show one.** The seeded
`system-default` set (114 rows, `workspace_id IS NULL`) is edited in ONE place — /admin → Flows, by a platform
admin — and applies everywhere: flow-engine matches `is_global.eq.true` for *every* workspace, so those flows
genuinely execute inside tenant workspaces while remaining invisible to them. That combination is what makes
the boundary easy to breach by accident. A tenant-facing read of `flows` therefore carries an **explicit**
`.eq('is_global', false)` even where RLS says the same thing — `manage_flows` can run under the service role
(partner `kai_` keys, admin-secret paths), and there RLS does not apply at all, so the filter *is* the
boundary rather than a duplicate of one. Deleting it as redundant discloses the whole operator automation set.
**There is exactly ONE sanctioned exception, and it is not a read of `flows`.** "Invisible to the tenant" was
also a real defect: a global flow raises that workspace's bells and mails its members, so the seeded
`inbox.message_received` flow emailed an owner on every WhatsApp reply with no off switch anywhere — 115 flows
existed, every one of them global, so Automations was structurally EMPTY for every workspace that has ever
existed. The fix is an OVERLAY, never a per-workspace copy of the defaults: `flows.tenant_configurable`
(default **false**, fail-closed) marks a global flow an owner may govern, `workspace_flow_preferences` records
only a workspace's DEVIATION (absent row = platform default, fully on), and the tenant surface reads
`get_workspace_flow_defaults` — a **projection** (title/description/channels/state) that never returns
`graph_definition`. One operator row stays the single source, so a fix to a default still reaches everyone.
Leave `tenant_configurable` OFF for the operator's own business, for an alarm about the platform failing a
legal or delivery obligation (myDATA rejection, email bounce, Ergani filing), and for delivery of a document
to a CUSTOMER — silencing one of those hides breakage rather than noise. The engine applies mutes in
`executeAction`, the one point both the BFS walk and the loop-node body pass through, keyed on the **event's**
workspace (a global flow's own `workspace_id` is NULL, so scoping to the flow would silently never match).
**Reusing a default means FORKING it** — `fork_workspace_flow_default` copies it into the workspace and
disables the global there in the SAME transaction (both live = every notification twice), and
`forked_flow_id` is `ON DELETE CASCADE` so deleting your copy restores the default instead of leaving the
global silently off. The copy is a tenant flow and is therefore BILLED per run where the default was free —
say so before the fork. Only the defaults whose trigger and actions are in the tenant vocabulary are forkable
(52 of 87 today); the UI reads the server-derived `forkable` flag, never its own list of editable triggers.
**`tenant_configurable` and `forkable` are different axes — do not reason about one from the other.** The
first says an owner may GOVERN a default, which leaves it as the operator's global row and works for any
trigger, because flow-engine matches `is_global.eq.true` for every workspace unconditionally. The second says
a workspace may OWN a copy, and a copy is `is_global=false`, matched ONLY as
`and(is_global.eq.false, workspace_id.eq.<ws>)`. So a trigger joins the vocabulary **only once its emitter
stamps `workspace_id` in the payload** — verify the payload, not that an emitter exists. Without it the fork
never fires AND `fork_workspace_flow_default` switches the default off in the same transaction, so the owner
ends up with FEWER notifications and nothing raises. `appointment_booked` shipped in exactly that state
(`appointments` has no `workspace_id` column). The vocabulary has FOUR copies, and the palette
(`TENANT_ALLOWED_SUBTYPES`) is the one that had drifted wider — offering nodes the table trigger rejects with
a raw `42501`. All four are pinned by [tests/unit/flowEventContract.test.ts](tests/unit/flowEventContract.test.ts),
which reads the emit payload and knows both emit shapes (the role-fanout form takes the event name THIRD).
Guarded by [tests/unit/workspaceFlowDefaults.test.ts](tests/unit/workspaceFlowDefaults.test.ts).
**The tenant vocabulary is ONE list and it was THREE.** `tenant_flow_allowed_triggers()` /
`tenant_flow_allowed_actions()` are the single SQL source, read by BOTH `create_simple_flow` and the
`enforce_tenant_flow_allowlist` table trigger; `TENANT_TRIGGERS`/`TENANT_ACTIONS` are the TypeScript mirror.
The trigger was the copy nobody had listed — it never received `payment_sent`, so that flow passed zod,
passed the RPC and died on a raw `42501` one layer below where the guard test can see. Never add a fourth
list. A trigger needs a union entry AND a workspace-stamping emitter; `manual` is the exception (no emitter
by design — `createFlowForWorkspace` stamps it on every empty automation, so dropping it breaks *New
automation*).
Tenant vocabulary is likewise two copies — `TENANT_TRIGGERS`/`TENANT_ACTIONS` (offered) vs
`create_simple_flow`'s `v_allowed_*` (enforced); change both in one go. Guarded by
[tests/unit/flowEventContract.test.ts](tests/unit/flowEventContract.test.ts).

## Agent tools — the tool file is the source, everything else is derived or guarded
A tool registered on an agent but absent from every toolkit cluster is silently stripped and unreachable.
Clusters are declared **once**, in the client `TOOLKITS` catalog (`agentToolsCatalog.ts`); agent-chat's binder
map is a generated projection of it (`_shared/toolkitClusters.generated.ts`). **Never hand-write a
`SERVER_TOOLKITS` map** — that hand-kept mirror is what this replaced, and a second copy is a red build. Every
new tool's `onChunk` type MUST be registered in `AGENT_RESULT_TITLES` in `AgentHub.tsx`, or the output is
silently dropped. **This bites hardest on a `run:` quick-start**, which calls the tool deterministically with no
model turn — so there is no prose to fall back on, and the user gets the quick-start's cheerful `done` copy over
an empty screen. "My flows", "Which job boards?", "Browse the radar" and "Track an entry" all shipped that way,
each logging its result to `console.debug` under a comment saying the agent's reply would summarize it. Note a
handler is NOT enough: a branch that only logs is the bug. Now guarded — for every `run:` quick-start, against
the chunks its tool actually emits for the action it pins — by the "direct-run quick-start renders its tool
output" case in [tests/unit/toolkitCoverage.test.ts](tests/unit/toolkitCoverage.test.ts).

**A `seo_*_card` chunk needs a branch in `SEOGenericCard.tsx`. `AGENT_RESULT_TITLES` does NOT render it.**
AgentHub routes every chunk whose type starts `seo_` and ends `_card` to `SEOGenericCard` *before* that titles
map is consulted, so an entry there has no effect on what the user sees. 14 of 51 SEO card types were listed in
the map, had no branch, and reached the chat as `JSON.stringify(data)` — AI Overview, GSC striking-distance,
keyword ideas, search volume among them. Two registries, and the complete-looking one was the decorative one.
Guarded by [tests/unit/seoCardCoverage.test.ts](tests/unit/seoCardCoverage.test.ts), which deliberately ignores
the titles map and also fails on a dead branch nothing emits.

**Run `npm run tools:manifest` after touching any `tool(fn, {...})` definition or the `TOOLKITS` catalog.** It
emits two committed files: `src/components/features/ai/toolManifest.generated.ts` (an AST projection of every
tool's name, factory and zod schema) and the edge-side `toolkitClusters.generated.ts` (issue #266). A stale one
is a red build.
[tests/unit/toolkitCoverage.test.ts](tests/unit/toolkitCoverage.test.ts) reads it and enforces, for **every**
toolkit: the tool is in a cluster; its factory is actually instantiated (a tool nothing constructs is
unreachable however good the picker looks); the projection is fresh and no second copy has reappeared; and a
quick-start's `run` sends only params the schema declares, supplies every REQUIRED one, coerces numbers,
doesn't let a form field overwrite a `fixedArgs` pin, and offers exactly the values its `z.enum` accepts.

**Never hand-mirror a tool's enum into a form.** Set `autoFields: true` on the quick-start and the fields come
from the manifest (enum → select, boolean → yes/no, number → number, `.describe()` → help). Hand-writing them
is how "Showroom Spots" and `'table list'` ended up as values no enum accepted, and how five tools' options
stayed invisible for months. `confirm` is on `NEVER_ASK` and must stay there — it is the human-in-the-loop
Approve/Decline gate (invariant 9), not a field a quick-start may pre-answer on the user's behalf.
Coverage and reachability have **no** escape hatch: `KNOWN_UNCLUSTERED` and `KNOWN_UNBOUND` were deleted, not
emptied, so both now fail outright. `OPTIONS_EXEMPT` is the one survivor — shrink-only, each entry with its
stated reason.

**A push site is not a binding. `AGENT_CONFIGS[agentId].tools` is.** Both binding paths read that list — the
startup `registerTools(new Set(config.tools))` and `load_toolkit`, which clamps to the same set — so a tool
with a perfect `if (config.tools.includes('x')) tools.push(...)` line that no agent *lists* is unreachable by
anyone. `price_my_spec` and `generate_video` were both live in that state; `generate_video`'s own earlier fix
stopped at the push site. Guarded by the "listed by at least one agent" case in `toolkitCoverage.test.ts`.

**Skills: `agents:` holds agent IDS, not display names** — JARVIS is `kai`, Trinity is `erp`. `getSkillsForAgent`
matches on the id, so a skill listing `trinity` is offered to nobody, silently. A skill also has to be imported
into `SKILL_FILES` (`skills-loader.ts`), and its `SKILL.md`/`skill.ts` twins must match — the `.md` is what gets
reviewed, the `.ts` is what ships. Run **`npm run skills:sync`** after editing any `SKILL.md`; never hand-edit
the `.ts`, and never use `String.raw` (it leaks the backslash of every escaped backtick into the prompt).
Guarded by [tests/unit/skillsRegistry.test.ts](tests/unit/skillsRegistry.test.ts).

**What the picker OFFERS must equal what the binder BINDS — on BOTH axes, and each is silent alone.**
`agentToolsCatalog` is the browse surface (`getAccessibleAgents`/`getAccessibleToolkits` drop what a role
may not have); `agent-chat` is the enforcer. Offered-but-not-bound never errors: the user clicks, a prompt is
sent, the model has no such tool and answers from memory or apologises for what the screen just advertised.
**Role axis** — a tool pushed inside `if (isAdmin)` gets `adminOnly: true` in the catalog, and a cluster whose
tools are all admin-gated gets it too (projected into `toolkitClusters.generated.ts`, so `load_toolkit`'s menu
leaves it out — an unfiltered menu is entries the model can only be refused on). 36 SEO tools and 6 clusters
sat offered-and-unbound; `web-research` sat the other way, `alwaysOn: true` with all three tools inside the
admin gate, so a member's agent could not search the web at all. Note `isAdmin` passed as an ARGUMENT
(`createKnowledgeBaseSearchTool(workspaceId, isAdmin, agentId)`) is not a gate. **Module axis** — a tool whose
entry declares a `moduleSlug` MUST call `moduleGate(workspaceId, slug)` (`_shared/tools/module-gate.ts`), which
asks the operator kill switch AND `is_workspace_entitled` and fails closed. `EntitlementGuard` on the page is
UX; the tool reaches the same tables without passing it. 10 of 19 files did not ask, five of them checking only
`modules.enabled` — the platform-wide flag, true for everyone, so it read like a gate and refused nobody. And a
`moduleSlug` naming no `public.modules` row is worse than no gate: `finance` (the slug is `sales-finance`) made
`enabledModules.includes()` false in every workspace, hiding the whole Expenses toolkit from everyone
including the operator, permanently. Guarded by [tests/unit/adminOnlyParity.test.ts](tests/unit/adminOnlyParity.test.ts)
and [tests/unit/toolModuleGates.test.ts](tests/unit/toolModuleGates.test.ts).

**Naming a place is LINKING to it, and a button must not ask the model for something no tool can do.**
`src/config/appDestinations.ts` is the one registry of in-app destinations; `linkifyDestinations` turns
`Profile → Social Accounts` (or the paraphrase, "the Social Accounts tab") into a real link inside every agent
reply, and `RESULT_SETUP_DESTINATION` makes the result card's action a LINK to the setup flow. Connecting a
social account or a WhatsApp number is an OAuth handshake that exists only in the app UI, so the generic
"Add {thing}" — derived from the payload's list key — sent `Add a new account.` to an agent that could only
answer with a paragraph telling the user where to go. Add a destination there rather than hardcoding a route,
keep the tool's own wording in the `Area → Tab` breadcrumb form so it linkifies, and put a result type in
`UNCREATABLE_RESULT_TYPES` when nobody can add one (search hits, inbox threads, reviews about yourself).
Guarded by [tests/unit/agentReplyDestinations.test.ts](tests/unit/agentReplyDestinations.test.ts), which also
fails when a registered route or `?tab=` stops existing.

## Templates — one table, one registry, an allowlist per type
"Reusable starting point for a record" is **one** system (`entity_templates`, issue #322), not a table per
entity. Adding a type = an adapter in `src/services/templates/` + a value in the CHECK constraint
`entity_templates_entity_type_check` — two copies, guarded by
[tests/unit/templateRegistry.test.ts](tests/unit/templateRegistry.test.ts). Do NOT add a `<thing>_templates` table.
- **`captureFields` is an allowlist and the guard test reads it.** Never capture ids, `status`, `*_token`, `fiscal_*`, `legal_number`, or a derived total (`total`, `vat_amount`, `amount_paid`) — a cloned MARK is a fake legal document, a cloned share token hands a stranger the new record, and a stored total is a second derivation of a money quantity.
- **`apply()` builds an explicit object literal.** A payload is stored jsonb = untrusted input; `.insert({...payload})` is mass assignment (invariant 8, semgrep `no-mass-assignment-from-stored-payload`). Narrow every enum value through `oneOf` in `templates/coerce.ts` — a value a CHECK rejects fails *partway* through and leaves half a record.
- **Money and legal documents return `{kind:'prefill'}`, never `{kind:'created'}`** — same reason `ordersService.reorderPrefill` returns a prefill: an invoice conjured behind the operator skips numbering, buyer-risk and myDATA classification. Invoice / order / expense / contract prefill; quote / project / moodboard / onboarding / listing create a draft outright.
- **Live types:** invoice, quote, project, moodboard, order, contract, expense, hr_onboarding, property_listing. `crm_company` is in the CHECK but deliberately unbuilt — a CRM party must go through the duplicate search first, never be created silently.
- The existing per-feature template systems (email, messaging, catalog design, PDF, XML mappings, blueprints) stay where they are; the hub link-outs to them live in `EXTERNAL_TEMPLATE_SOURCES`.

## Blueprints — zones DERIVE the quantities, and a bound option_group is priced ONCE
A blueprint's `composition_schema` describes ZONES (bottom units, top units, tall, island, worktop):
shared globals (height, depth, door model) plus module rows (kind × width × how many). The zone's
length and counts are **derived** and published under the same formula variables the old typed
scalars used (`run_length`, `wall_run_length`, `worktop_length`), so every per-metre task line keeps
working — now fed by a real layout instead of a number somebody typed. Before this, a kitchen was
three sliders and three copy-pasted "Drawer unit N" option groups, which is why it could never say
four drawer banks, a wall-unit count, or an island.
- **An option_group bound to a zone global is ABSORBED.** It stops being a priced line anywhere: its money arrives through the zone's derived lines and the zone owns the selection — which is exactly how bottom and top units share one price list and still pick different finishes. Leave it priced in both places and every cabinet front is charged twice. That is a valid number, so no typecheck and no integrity probe can see it.
- **A plan FREEZES its rate tables** (`project_plans.composition.rate_tables`). Re-opening a quote next month re-prices at the rates it was quoted on, never at whatever the price list has since become. Nothing in the plan path reads back to the blueprint.
- **Composition lines carry `source='composition'` and are regenerated wholesale on every reprice** — never carried over, or the plan silently doubles its cabinets. Restore-version and add-section drop them for the same reason.
- **`src/utils/blueprintComposition.ts` is GENERATED** from the edge copy — `npm run blueprint:mirror` (part of `gen:all`). Never hand-edit it: it exists only so an anonymous visitor sees the number the edge copy will record, and a hand edit is how the shown price and the recorded price start to differ.
- **The hardware SCHEDULE is derived too, and it is a count, not a price.** A module type declares what one piece is made of (`yields`: doors, shelves, legs); a runner choice declares its own (3 drawer boxes, 1 runner set); the zone turns doors into hinges through `hinge_bands`, because a 210cm larder door does not take two. Totals publish as `total_hinges`/`total_doors`/`total_legs`… and an `is_schedule` line counts them with an ordinary formula. Schedule lines add NOTHING to the plan subtotal — the plan counts, the quote prices — and `material_cost` NULL means *not priced yet*, never 0.
- **A derived count that no schedule line consumes raises an issue.** 30 hinges derived and nothing counting them is the silent-zero shape wearing a hat: the kitchen needs them, the schedule says nothing, the workshop finds out on fitting day. Checked in `computeBlueprint`, where both the totals and the lines are in scope.
- **An appliance is priced by WHO SUPPLIES IT and by nothing else.** `supply:'existing'` — the commonest answer on a kitchen survey — takes the money to zero and changes nothing about the 60cm aperture, the socket behind it, the duct through the wall or the tall housing it sits in. All of those keep counting, because a €0 line is a valid line and nothing downstream can otherwise tell "the customer already owns one" from "nobody thought about it". Housing and fitting are ours either way; only the machine and its own options follow the supply answer.
- **A placement is CHECKED against the layout, never satisfied by inserting a cabinet.** "Fridge in a tall unit" with no tall housing configured raises an issue naming both, and counts DEMAND (two fridges and one housing is the same problem as none). Auto-adding the housing changes somebody's price without them asking; pricing it anyway produces a confident total for a kitchen that cannot be built.
- **Service connections are schedule keys the way hinges are** — `socket`, `socket_dedicated`, `water_in`, `waste_out`, `gas_point`, `duct_run`, `carbon_filter` — so the completeness rule above covers them unchanged: derived and consumed by no schedule line is an issue. `SERVICE_YIELD_KEYS` is the ONE list separating them from hardware; a workshop reads one half of the schedule and an electrician reads the other, and a consumer that keeps its own idea of which is which is how a new key quietly stops reaching one of them.
- **A `choice` global is spec, not money.** It publishes `<zone>_<key>_<value>` flags a formula can multiply by, absorbs no option_group and reads no rate. `multi` holds several answers at once ("we have electricity AND gas"), and an unanswered multi global means NOTHING rather than its first answer — otherwise a survey nobody filled in claims there is gas.
- **`option_key` makes a line conditional on a CHOICE** — `= opt_gola * total_units`. An option_group is pick-one, so the four gola parts (profile, verticals, end caps, joiners) cannot be members of it; they are ordinary lines gated on the flag, which is what stops handleless fitting the bottom run and silently leaving the top with no profile. Keyed on a stable slug, not the label: renaming an option must not zero every line depending on it.
Guarded by [tests/unit/blueprintComposition.test.ts](tests/unit/blueprintComposition.test.ts).

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
| `page_multimodal_1024` | `page_embeddings` | 1024 (`voyage-multimodal-3.5`, whole rendered page) |

- **`page_embeddings` is keyed by PAGE, not image** — id is `"<document_id>:<page_number>"`, and `document_page_embeddings` is its serving row (`cache_status`, provenance, render path). It is the ONLY collection in a different latent space: **never query it with a voyage-4 text vector.** Both are 1024D, so the wrong vector is accepted and scores confident nonsense instead of raising — use `generate_page_query_embedding()`. Guarded by [tests/unit/test_page_embeddings.py](mivaa-pdf-extractor/tests/unit/test_page_embeddings.py).
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
`SKIPPED`/`FAILED` are in-memory-only enum members and must never be persisted. **There is no fallback embedder.** Voyage is the sole embedding provider; the
Voyage→OpenAI fallback was deleted 2026-08-08. Reintroducing one is a bug, not a
resilience win: two models at the same dimension are the same SHAPE and a different
SPACE, so a substituted vector is stored, indexed and ranked without anything
raising. `None` means NO VECTOR — never a vector from somewhere else. Guarded by
[tests/unit/test_no_fallback_embedder.py](mivaa-pdf-extractor/tests/unit/test_no_fallback_embedder.py).

## Which client makes the model call — three runtimes, three answers
There is no single AI client and no plan for one. Picking the wrong one is **silent**: the call
succeeds, it just skips whatever the right one gives you for free.

| You are writing | Use | Entry point |
|---|---|---|
| MIVAA / Python | **httpx, never a provider SDK** | `tracked_claude_call_async` (auto-logs) |
| An edge function needing ONE model turn (text / image / video) | **Vercel AI SDK, only through the shared client** | `generateWithClaude` / `generateWithGemini` / … from `_shared/ai-client.ts` |
| An agent loop — tools, state, streaming | **LangChain + LangGraph, and it already exists** | `agent-chat`; register the tool, never build a second loop |

- **Python has no SDK because of a pin trap** — the `anthropic` package broke the `tools` kwarg on upgrade and was removed 2026-05-23 (pipeline convention 10).
- **Edge does not import a provider SDK because `ai-client.ts` is the INTENDED chokepoint.** It constructs the providers **lazily**, so `platform_secrets` bootstrapped into env *at handler entry* is actually seen — a module-load capture reads `undefined` — and it logs token cost to `ai_usage_logs` priced against `ai_model_pricing`. Never `fetch()` a provider URL and never import a provider SDK into an edge function.
- **It is not yet the chokepoint in fact, so do not read a clean `ai_usage_logs` as complete.** 15 files still `fetch('https://api.anthropic.com/v1/messages')` directly (measured 2026-08-19); ten log cost by hand and **four do not log at all** — `flow-engine`, `stock-api`, `xml-import-orchestrator`, `_shared/image-edit-gate.ts`. (`next-steps` looks like a fifth and is not: agent-chat books its tokens into `agent_usage_logs`, a different ledger that also debits.) That spend is invisible to every cost view, which is the silent-zero shape: the number is a plausible zero, nothing raises. New code goes through the shared client; a raw fetch you touch gets migrated rather than copied.
- **`agent-chat` is not on the AI SDK because it is not a one-shot.** LangGraph owns checkpointing, the tool loop, RBAC and SSE streaming; it replaced Mastra, which is why a doc naming Mastra is out of date. A second agent runtime would need its own copy of all four.
- **The frontend does not call models at all** — zero `ai` / `@ai-sdk` / provider imports in `src/`. `@anthropic-ai/sdk` sat in `package.json` unused and was removed; do not re-add it to reach a model from a component.

**Enforced** for the import half by semgrep `no-provider-sdk-outside-ai-client` (`_shared/ai-client.ts` and `agent-chat/**` excluded, with the reason on each). The `fetch()`-a-provider half is not yet a rule.

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
Full reference: [docs/design-system.md](docs/design-system.md). Live specimen: **`/design-system`** in-app.
Guarded by [tests/unit/designSystem.test.ts](tests/unit/designSystem.test.ts).

The platform runs a **product-UI** language: flat opaque surfaces, hairline separation, dense
controls, underline tabs, one accent. It replaced a marketing language (glass panels, a brand
aurora behind every page, pill buttons that lifted on hover) that was being applied to screens
whose job is showing tables of money.

- **Colour is unchanged**: dark/light modes × green/blue accents, owned by `ThemeContext`. Dark = plum-black + magenta; light = olive/cream (green) or slate + blue. **Every surface must work in all four** — check at `/design-system`, which has the switcher.
- **Three surfaces, and that is the whole ladder**: `bg-background` (page, FLAT — no gradient, no aurora) → `bg-card` + `border-hairline` (panel) → `bg-surface-sunken` (toolbar / table header / footer). `--hairline` is the ONE rule colour in the app.
- **A panel is separated by a hairline, not a shadow, and does not move on hover.** Shadow (`shadow-overlay`) is only for things that genuinely float: dropdown, popover, dialog, toast. A panel that is itself a click target gets `panel-interactive`.
- **`.dashboard-card` / `<Card>` are the panel.** Never recreate one inline. The `--glass-*` tokens kept their names and now hold opaque values, which is why retiring glass did not need a 400-file sweep.
- **Headings**: Aleo (`font-display`) for `h1`/`h2` — identity only. `h3`–`h6` are sans (`--font-sans`), because a serif in a dense data UI is the loudest possible "this is not a product".
- **`--font-display` is `'Aleo', 'Averta', Georgia, ...` — do NOT drop Averta.** Aleo has ZERO Greek glyphs and only 24/128 latin-ext, so Greek party names in headings silently fell back to Georgia (absent on Linux). Font matching is per-character, so latin headings still get Aleo. Check any new display face's cmap for U+0370–U+03FF before adopting it.
- **No global font-weight override.** There used to be one (`.font-bold → 300 !important` and friends); it flattened every weight utility so a table header, a total and its caption rendered identically, and it could not be worked around per component. Weight IS the hierarchy here.
- **Buttons are rectangular** (`rounded-sm`, 4px), 36px tall, flat fill, no lift. **`rounded-full` is for avatars, dots and status pips only** — never a button, a tab or a chip. One solid button per screen; its partner is `secondary` (accent outline), everything else is `outline`/`ghost`.
- **Tabs are UNDERLINE, platform-wide** — the treatment is in `index.css` on `[role="tab"]`, so it reaches Radix Tabs, `HubTabNav` and every hand-rolled strip. Never a filled pill: that is the exact silhouette of a primary button, so "where I am" and "what to press" become the same object.
- **Tables**: sticky sunken header, hairline row separators, NO zebra striping, 11px semibold headers (never uppercase), right-aligned `tabular-nums` for money, an explicit empty state, `—` for an absent value. Status renders as a **tinted squared tag** (`<Badge variant="success|warning|error|info|neutral">`) — tinted, never a saturated fill, which would give every row the weight of a button.
- **A table in a Card gets its title + subtitle + actions inside a `CardHeader`** — never a bare heading above a header-less Card.
- **Every table scrolls horizontally, and every section rail becomes a strip below `lg`.** `<main>` is `overflow-x-hidden`, so a table wider than the viewport is CLIPPED, not scrolled: the right-hand columns are absent with no scrollbar and no swipe, and on a finance table the column that goes is the money. 58 hand-rolled tables were in that state. The `<Table>` primitive carries its own scroller; a raw `<table>` gets `<div className="table-scroll">`, which also pins `thead th` to one line — without that the browser "resolves" the overflow by wrapping every header into three lines, so nothing overflows, no scrollbar appears, and the table fits while being unreadable. Same shape one layer up: a vertical rail on a phone is 11–19 full-width rows stacked ABOVE the content, so the section you selected renders below the fold and the page reads as empty. `.section-rail` is the one implementation (`HubSideNav` + every vertical `TabsList`) and it collapses at `lg` in the CSS **and** in the utilities — a rail that goes `sm:flex-col` spends 640–1023px with the two disagreeing. The Finance-only version of this rule is why the other eight rails were broken. **The strip cannot be written as a plain class and left to win.** Radix keeps `data-orientation="vertical"` / `aria-orientation="vertical"` on the list at EVERY width, and the vertical treatment hangs off attribute-qualified selectors — the `data-[orientation=vertical]:*` utilities on `TabsList` and the leading-edge active marker in `index.css` — which outrank a single class AND are emitted after this file. Finance's rail was horizontal and still wrong for exactly that reason: stretched items, no gaps, no bottom rule, and a 3px accent bar down the LEFT EDGE of the selected chip. Both are `lg`-scoped now, and `.section-rail` is written doubled (`.section-rail.section-rail`) so it does not depend on which emission bucket a competing utility lands in. Guarded by [tests/unit/responsiveTableOverflow.test.ts](tests/unit/responsiveTableOverflow.test.ts).
- **Screen archetypes live in `src/components/core/hub/`** — `HubDataTable` + `HubToolbar` (list), `HubRecordLayout` (record), `HubStatGrid` (dashboard), `HubSideNav` (settings). Build the archetype; do not re-derive it per page.
- **An empty surface MUST offer the way out of being empty.** Use `<HubEmptyState>`, and pass the `action` — the create button is almost always already in scope. `ContractsSection` rendered a bare `No contracts yet.` eight lines below its own `canCreate`/`openCreate`; that exact shape repeated 116 times across 74 files, and it is only ever seen by a brand-new workspace on its first day. **Two variants, and the difference matters**: `empty` ("you have none") offers the create action; `filtered` ("your filters excluded all 4,000") offers *Clear filters* and must NEVER offer create — inviting someone with 4,000 contacts to add another is how duplicates get made. Module-not-entitled is a third case and already handled by `EntitlementGuard` (it upsells/enables). Ratcheted by [tests/unit/emptyStates.test.ts](tests/unit/emptyStates.test.ts) + `.github/empty-state-baseline.json`: a new one fails the build, the recorded count may only go down.
- **A raw palette shade is a light/dark PAIR, never one set of classes.** `text-amber-300` is pale BY DESIGN — chosen for plum-black — so on the light themes' cream it renders at **1.23:1**. That is what the Inbox source tag did for months: "Email" was an orange smudge, reported by the user, invisible to every check (a wrong colour is a valid class, and unlike an off-scale opacity step it emits CSS perfectly well). Write the pair the way `src/utils/statusTone.ts` does — `text-amber-800 dark:text-amber-300` — and **write it out**, because Tailwind's scanner reads source text and a class assembled from a template literal lands in no stylesheet at all. Which end of the ramp is not a matter of taste: **measure it**. [tests/unit/inboxChipContrast.test.ts](tests/unit/inboxChipContrast.test.ts) reads the real `--card` out of all four theme blocks in `index.css`, composites the chip's own tint over it at the declared alpha, and computes the WCAG ratio against `tailwindcss/colors` — so neither the palette nor the grounds is a second copy that can drift. A shade-band rule was the first version and it was not enough: it passed `amber-700`, which measures 4.43:1 on cream. Point that test at a new palette rather than eyeballing one.
- **Never use an off-scale opacity modifier** (`bg-white/8`, `border-white/12`). Tailwind only emits opacity variants for steps in `theme.opacity` (0,5,10,…,100); anything else compiles to NOTHING. The platform carried 74 of them, including 31 borders and 25 row dividers that had never rendered in dark mode. Use a token, or `bg-primary/[0.08]`.
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
| Deals & pipeline | [docs/deals-pipeline.md](docs/deals-pipeline.md) — **stages are per deal type**, enforced by a composite FK on `(deal_type_id, stage)`; a construction deal physically cannot sit in "Conveyancing". Weighted forecast is derived in SQL by `get_deal_forecast` |
| Bank feed & reconciliation (Revolut Business) | [docs/banking-revolut.md](docs/banking-revolut.md) — the feed is **per-leg**: match a row in isolation and an internal pocket move settles a customer invoice |
| CRM / HR / Projects / Real estate | [docs/crm-system.md](docs/crm-system.md), [docs/hr-system.md](docs/hr-system.md), [docs/projects.md](docs/projects.md), [docs/real-estate-system.md](docs/real-estate-system.md) |
| AI Assessment (projects) | [docs/project-ai-assessment.md](docs/project-ai-assessment.md) — the model **never counts**: 38 signals, the six dimension scores and the verdict are derived by `get_project_assessment_snapshot`; the Claude turn only writes about them. An action must name a signal its own report raised, and `dimension`/`impact`/`destination` are read off that signal, not off the model |
| Installed base — customer equipment, warranties, recurring service | [docs/installed-base.md](docs/installed-base.md) — there is **no `next_due_on`**: the next service date IS the plan's single open occurrence, and completing one is the only thing that opens the next |
| Knowledge base | [docs/knowledge-base-implementation.md](docs/knowledge-base-implementation.md) |
| XML import | [docs/xml-import-orchestrator.md](docs/xml-import-orchestrator.md) |
| Moodboard sheets & client views | [docs/moodboard-presentation-sheets.md](docs/moodboard-presentation-sheets.md) |
| Data integrity framework | [docs/data-integrity-framework.md](docs/data-integrity-framework.md) |
| Tenancy & capabilities | [docs/capabilities-and-tenancy.md](docs/capabilities-and-tenancy.md), [docs/role-access-matrix.md](docs/role-access-matrix.md) |
| Re-running the platform audit | **GitHub issue #314** — method, the 9 defect shapes, and the traps that produced wrong numbers. Kept as an issue, not a file: it is a plan, and the file version had already drifted to citing a path it no longer lived at |
| Which defect classes have a guard, and when it was last watched to fire | [docs/prevention-coverage.md](docs/prevention-coverage.md) |
| Everything else | [docs/INDEX.md](docs/INDEX.md) |
