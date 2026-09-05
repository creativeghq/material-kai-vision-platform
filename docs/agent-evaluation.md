# Agent evaluation — does the agent see what the platform knows?

**Status:** live since 2026-09-05. **Guards:** [tests/unit/agentDataCoverage.test.ts](../tests/unit/agentDataCoverage.test.ts),
the `agent.reply_quality` nightly probe, the golden cases in `agent_eval_cases`.

## Why

Conversation `9225f61f` (2026-09-05) asked *which keywords does materialshub.gr rank for right now*.
The reply came from the DataForSEO Labs index: two keywords at positions 75 and 82, SERPs crawled
seven weeks earlier, presented as "right now", with a "Confidence: 88%" line. Meanwhile the
workspace's own rank tracker had checked 129 keywords 35 minutes before (brand at #1, a category
page at #24) and Search Console was connected and synced that morning. The reply even said
first-party data "would confirm" — one call away.

Three defects in one turn, each of a different kind:

| Kind | What it looked like | Where it hides |
|---|---|---|
| **No tool over the data** | `get_website_rank_summary` existed in SQL; nothing read it | Invisible: a tool that does not exist raises nothing |
| **Tool exists, model never reaches for it** | the two Search Console tools were named "striking distance" and "movers" | Invisible: the tool is bound, the log shows 0 calls |
| **Reply shape hides the fact** | the index card had no crawl date; a factual question wore the analysis framework | Invisible: a wrong reply is a valid string |

Hand-testing replies finds these one at a time, after they ship. The process below finds each
kind by a different instrument, because no single one sees all three.

## The four instruments

### 1. Data coverage — *is there a tool at all?* (static, deterministic)

`public.agent_data_coverage(p_exposed text[])` lists every derived read the platform holds
(`get_*`, `list_*`, `search_*`, `*_summary`, `*_overview`, `*_360` returning json or rows),
classified (`derived_read`, `ops`, `internal`, `account`, `config_status`, `search_primitive`,
`ui_primitive`, `pricing_primitive`), and marks which ones an agent tool reads.

```
node scripts/audit-agent-data-coverage.mjs            # exposed set from source + gap from the DB
node scripts/audit-agent-data-coverage.mjs --sql      # no key: prints the SELECT to paste in the SQL editor
node scripts/audit-agent-data-coverage.mjs --write-baseline
```

The committed baseline `.github/agent-data-coverage-baseline.json` records the exposed set and
every known gap **with a reason**. `todo: …` is a decision (build it later); `unreviewed` fails the
script. The vitest guard holds the baseline to the tool sources — an RPC a tool now reads must
leave the gap list, and the exposed list must equal what the sources read — so the file cannot rot.
The DB side (a *new* derived read with no tool) is caught by running the script; it needs the
service key, which lives only on the MIVAA host, hence `--sql`.

First run, 2026-09-05: 91 derived reads, 35 exposed, 56 gaps. The SEO family was 16 with 4
exposed and is now covered by `seo_my_rankings` + `seo_site_report`; the 56 remaining gaps sit in
the baseline, 42 of them `todo:` — finance derivations (`get_monthly_pnl`, `get_order_settlements`,
`get_quote_totals`), pipeline analytics (`get_deal_stage_funnel`, `get_deal_velocity`), project
finance (`get_project_pnl`), stock (`stock_overview`), real estate (`get_property_performance`).
Each is a question the agent cannot answer today; the rest are pickers, fallbacks and twins that
need no tool, with the reason recorded next to each.

### 2. Retrospective audit — *what actually happened in real conversations?* (SQL, free)

```sql
select * from public.agent_conversation_audit(30);
```

One row per conversation: the first question, the agent, every tool called (with `(0)` for an
empty result and `(x)` for a failure), whether **no tool was called at all**, every hedge the
assistant wrote (`would confirm`, `I don't have access`, `is not connected`, `switch agents`),
whether the MODE/Confidence framework was used, whether the reply was the literal
`No response from agent`, and what the turn cost. Operator-only: SECURITY DEFINER, executable by
the service role and from the SQL editor, not by signed-in users (an admin page would call it
through an edge function).

First run, 2026-09-05, 30 days: 23 conversations, 819 credits, **11 with no tool call at all**, 7
with an empty or failed call, 8 quick-start direct runs of which 3 ended in `No response from agent`.
Direct runs used to be invisible here — they never wrote to `agent_tool_call_logs`; they do now,
stamped `_via: 'direct_tool'`.

The hedge regex is ONE function, `agent_reply_hedge_pattern()`, shared by this audit, the nightly
probe and the eval runner — three consumers, one definition, so they cannot disagree about what a
hedge is.

### 3. Nightly probe — *did the agent tell someone it could not?* (integrity sweep)

`agent.reply_quality` (`dic_detect__agent_reply_quality`, domain `agent`, warning) raises one
finding per hedged or empty assistant reply in the last 7 days, with the question, the excerpt and
the conversation id. It runs with the other integrity checks and lands in `data_integrity_findings`.
Each finding is a case where the platform held the answer or the tool and the agent did not reach it.

### 4. Golden cases — *for THIS question, did the agent do THIS?* (costs a model turn each)

`agent_eval_cases` holds questions with expectations:

| Column | Meaning |
|---|---|
| `expect_tools_any` | at least one of these tools must be called, and must not fail |
| `expect_results` | when true, an expected tool that returns an empty result fails the case; default false, because an honestly reported empty pipeline is a correct answer |
| `expect_tools_none` | none of these may be called |
| `expect_reply_regex` / `forbid_reply_regex` | the reply must / must not match |
| `factual` | a factual question: the reply must not carry `MODE:` or `Confidence:` |
| `max_credits`, `max_seconds` | cost and latency ceilings |

The reply is also checked against the hedge pattern. Scoring is deterministic — tool called, text
present, text absent, cost — no model judges a model.

The `agent-eval` edge function runs **one case per call** (a turn is 20–60 s; the edge ceiling is
150 s) and writes one `agent_eval_runs` row. The turn is a real agent-chat turn — same router,
tools and model — persisted as a real conversation you can open at
`/agent-hub?conversation=<conversation_id>`, with one difference: `eval_run: true` switches off
memory promotion and next-step chips, so an eval question never becomes a "fact" about the user.

**Run it as a real user session.** agent-chat threads the caller's JWT into about thirty
user-scoped tools (`find_records`, `manage_deal`, `manage_finance`, `manage_flows`, the mention
and job-research tools). On the service-role path that JWT is empty and every one of them fails
with "Empty JWT" or "No active session" — the first sweep scored `records.find` as a pass on a
reply that told the user to sign in. So call `agent-eval` with a **platform operator's own
bearer**; it forwards that bearer to agent-chat and the turn is the one a user would get. The
service-role path (body `user_id`) still works for a smoke run and says `session: service_role`
on every result.

From the MIVAA host (the only place the service key lives), mint an operator session with the
magic-link flow, then run cases with it. Each turn is 20–60 s and the ssh tool's own limit is
30 s, so background the call and read the result from `agent_eval_runs`:

```sh
eval "$(systemctl show mivaa-pdf-extractor -p Environment --value | tr ' ' '\n' \
  | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' | sed 's/^/export /')"
# 1. operator session (1 h): hashed magic-link token → verify → access_token in the redirect fragment
H=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/generate_link" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
  -d '{"type":"magiclink","email":"<operator email>"}' | jq -r .hashed_token)
L=$(curl -s -o /dev/null -w '%{redirect_url}' "$SUPABASE_URL/auth/v1/verify?type=magiclink&token=$H&redirect_to=https://materialshub.gr/")
umask 077; printf '%s' "$L" | sed -n 's/.*[#&]access_token=\([^&]*\).*/\1/p' > /tmp/eval-jwt
# 2. one case, in the background
nohup curl -s -X POST "$SUPABASE_URL/functions/v1/agent-eval" \
  -H "Authorization: Bearer $(cat /tmp/eval-jwt)" -H 'Content-Type: application/json' --max-time 150 \
  -d '{"case_key":"seo.own_rankings","workspace_id":"<uuid>","batch_id":"<uuid>"}' > /tmp/eval-own_rankings.json 2>&1 &
# 3. read: select case_key, passed, failures, tools_called, credits from agent_eval_runs where batch_id = '<uuid>';
rm -f /tmp/eval-jwt   # when the sweep is done
```

`action: "list"` returns every case with its last run. `model_override` (`claude-sonnet-5`,
`claude-haiku-4-5`, `claude-opus-5`) pins the model for a cheaper sweep — honoured for the service
role and for a platform operator's session, silently ignored for anyone else; the default is the
production router, which is what you actually want to measure.

Cost, measured 2026-09-05: an Opus turn is 29–38 credits, a Sonnet turn 14–27 (the KAI prompt is
36 KB, so a "cheap" model is not that cheap). Fourteen cases on the default router is roughly
500 credits; on Sonnet roughly half. A Sonnet sweep still finds every *structural* gap — a missing
tool is missing on every model — and `agent_eval_runs.credits` is the per-case bill either way.
Check the operator wallet before a sweep: the credit floor lets one turn of overage through.

**Adding a case:** insert a row. Name the tools that MUST be the source, the facts the reply must
contain, and mark it `factual` if it is a lookup. A case that fails today is a finding, not a
mistake — that is what the first 14 were for.

### Reading a batch — repeats, failure classes, and what a zero means

Adopted 2026-09-05 from the GAIK toolkit's extraction-evaluation method, whose authors published
a wrong finding first: a newer model looked markedly less stable than its predecessor, and the
whole gap was eight rate-limited documents out of 180. Four rules keep a comparison honest here:

1. **Five repeats minimum.** One run per case has no spread, so a difference between two batches
   has no noise floor under it and is not a result. `scripts/run-agent-eval-batch.mjs` runs
   every active case `--repeats` times under one `batch_id` and prints the summary; a case with
   fewer repeats than `AGENT_EVAL_MIN_REPEATS` is flagged `att!` and must not be compared.
2. **A failed run says WHICH WAY it failed.** `agent_eval_runs.failure_class` is the first class
   by precedence and `failure_classes` is every one, from the closed list in
   [src/config/agentEvalVocabulary.ts](../src/config/agentEvalVocabulary.ts) (mirrored to the
   edge; the DB CHECK is the enforcer). `transport` — agent-chat unreachable, a non-2xx, a cut
   stream — is the harness or the network, and the summary reports it BESIDE agent failures,
   never folded in. Read the failure column before calling anything unstable.
3. **The denominator does not move.** Every attempt in the batch counts; a case that produced no
   run is listed with zero attempts (`cases_missing`) rather than dropped. A pipeline must not
   raise its own average by crashing on the hard cases.
4. **Stability is measured without ground truth, and never read alone.** `tools_agreement` is
   the share of a case's repeats that called the modal SET of tools — "did the same thing happen
   each time", answerable the same day, with no labelling. It rewards silence (an empty reply is
   perfectly repeatable), so it is printed next to the pass rate and `reply_completeness`.

```sh
node scripts/run-agent-eval-batch.mjs --user <uuid> --workspace <uuid> --repeats 5 --model claude-sonnet-5
curl -s -X POST "$SUPABASE_URL/functions/v1/agent-eval" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' -d '{"action":"summary","batch_id":"<uuid>","user_id":"<uuid>","workspace_id":"<uuid>"}'
```

Guarded by [tests/unit/agentEvalSummary.test.ts](../tests/unit/agentEvalSummary.test.ts).

## Before a manual test session

1. `npm test` — the coverage baseline is honest.
2. `select * from agent_conversation_audit(7)` — what real users hit this week; open anything
   hedged or with no tool call.
3. Run the golden cases (all, or the family you changed); open the failures' conversations.
4. Check `data_integrity_findings where check_key = 'agent.reply_quality'`.

What is left for a person: the *quality* of a correct reply — tone, ordering, what it chose to
emphasise. That is what your manual pass is for, and it is a far shorter list once the four
instruments have cleared everything they can see.

## Related

- [agent-system.md](agent-system.md), [agent-and-tools-reference.md](agent-and-tools-reference.md)
- [prevention-coverage.md](prevention-coverage.md) — which defect classes have a guard
- `scripts/sweep-agent-tools.mjs` — calls every read-only tool once through `mode: 'direct_tool'`
  (finds a broken tool; this doc's instruments find a missing or unreached one)
