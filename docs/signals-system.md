# Signals — hiring, technology, intent and described signals (#462, #499)

A signal is a saved question about the market — "who starts hiring a BIM coordinator", "who runs SAP",
"who is in market for e-commerce", or a plain-language description — checked every hour against a
shared corpus of company websites and job boards. New matches land in the workspace and, when the
signal notifies, raise a bell.

## Surfaces

- **`/signals`** (`src/pages/SignalsPage.tsx`) — tabs **Matches**, **Saved signals**, **Explore**,
  under coverage tiles (Companies Tracked, Websites Read, With a readable job board, Open postings).
  Explore runs a one-off search (kind, Last 30 Days / 90 Days / Year, Only my CRM) and **Save as
  signal** turns it into a saved one. Nav entries sit in the Marketing hub, one per module (Hiring /
  Technology / Intent / Described Signals), each requiring `crm.view`.
- **Signal editor** (`SignalEditorDialog`) — Kind, Name, the values to watch, Location Contains, and
  Scope and Alerts (Only companies already in my CRM; Notify me when it finds something new).
- **CRM company → Signals tab** (`CompanySignalsPanel`) — open roles (open / opened / closed in 30
  days), technologies, buying intent with the evidence link, and why a section is empty (`pending`,
  `none`, `unreadable`, `unreachable` website reads).
- **Agent** — toolkits `signals-hiring`, `signals-technographics`, `signals-intent` (tools
  `find_hiring_companies`, `find_companies_using_technology`, `find_companies_in_market`,
  `company_signals`, `manage_signal`) and `signals-described` (`describe_signal`), on Pepper and JARVIS.
  Every tool calls `moduleGate` and reads as the caller through self-guarding RPCs; deleting a signal
  needs `confirm: true`. An undefined technology or use case falls back to a job-ad text search.

## Modules

`signals-core` (the corpus), `signals-hiring`, `signals-technographics`, `signals-intent`,
`signals-described`, `signals-notifications`. A kind is offered only where its module is held.

## Corpus

Global, service-role-only tables: `company_profile` (one row per company domain, seeded from the CRM
websites of every workspace and re-read monthly), `company_ats_accounts` (the job boards found on a
site) and `market_job_postings`. `company_technologies` and `company_intent_signals` are derived
inside ingest from postings and homepage code against `technology_dictionary` and
`intent_definitions`. The sweep is MIVAA `/api/v1/signals/cron-corpus`, dispatched by
`monitoring-cron?task=signals-corpus` (cron `signals-corpus-hourly`, time-boxed under the edge
ceiling). Integrity check `signals.ats_corpus_stalled` watches it.

## Saved signals and matches

`signals` (workspace-scoped: kind, name, filter jsonb, `is_active`, `notify`, `last_evaluated_at`,
`last_match_count`, `paused_reason`) and `signal_matches` (`company_domain`, payload, `matched_at`,
`dismissed_at`). RLS allows select; writes go through `signals_save`, `signals_delete` and
`signal_match_dismiss`. Reads: `signals_dictionary`, `signals_search`, `signals_company_overview`.
`evaluate_signals` (cron `signals-evaluate-hourly`) writes matches and emits `signal.matched`, a
server-only flow trigger delivered by a locked system-default flow.

## Described signals

A description is drafted into rules by AI (`POST /api/v1/signals/described/compile`): a question the
AI answers for each item, keywords, and exclusions. The editor requires **Draft Rules** and then
**Test on Last 30 Days** (`/described/backtest`, free: sample verdicts Match / No Match / Check
Failed with a verbatim evidence quote, plus an estimate of first-run and weekly credits) before it
will save. Live checking (`monitoring-cron?task=signals-described`, cron `signals-described-hourly`,
MIVAA `/cron-described`) prefilters `signal_observations` for free by keyword and meaning, then judges
each candidate with Haiku into `signal_judgements`; each AI check costs 1 credit, debited before the
call.

## Related

- [crm-system.md](crm-system.md), [job-research-system.md](job-research-system.md)
- [agent-and-tools-reference.md](agent-and-tools-reference.md#calculator-signals-and-operator-toolkits)
