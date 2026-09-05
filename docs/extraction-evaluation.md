# Extraction evaluation — is what the pipeline wrote what the page says?

**Status:** built 2026-09-05, adopted from the GAIK toolkit's extraction-evaluation method and
its `LLMJudge`. **Not yet watched to fire on live data:** the product tables were empty on the
day it shipped (0 products, 0 documents), so the first catalogue run through stage 5 is the
first real judgement. **Guards** (in the MIVAA repository):
[tests/unit/test_extraction_eval.py](https://github.com/creativeghq/mivaa-pdf-extractor/blob/main/tests/unit/test_extraction_eval.py),
[tests/unit/test_field_judgement.py](https://github.com/creativeghq/mivaa-pdf-extractor/blob/main/tests/unit/test_field_judgement.py),
and the `extraction.*` integrity probes here.

## Three instruments

| Instrument | Question | Needs ground truth? | Where |
|---|---|---|---|
| **Golden cases** | For THIS product on THIS page, did the pipeline write what a person read? | Yes, one row per case | `extraction_eval_cases` → `POST /api/internal/extraction-eval/run` |
| **Agreement across runs** | Did the same thing come out each time? | No | `GET /api/internal/extraction-eval/agreement/{case_id}` |
| **Page judge** | Does the rendered page support each extracted field? | No — a second model reads the pixels | stage 5, `product_field_judgements` |

Plus two nightly probes that need neither cases nor a judge (below).

## 1. Golden cases

A case says what a person read on one page for one product:

```sql
insert into extraction_eval_cases (workspace_id, document_id, key, product_match, expected, strict, notes)
values ('<ws>', '<doc>', 'p12-beige-60x60',
        '{"sku": "TL-6060-BG"}',
        '{"name": "Beige Stone 60x60", "colour": "beige", "size_cm": "60x60", "finish": "matt", "price_per_m2": "18,50"}',
        false, 'page 12, bottom-left cell of the table');
```

- `product_match` finds the product **inside that document and workspace** by `product_id`,
  `sku`, `external_sku` or `name` (case-insensitive). Two matches is no match: the run records
  `no_product` rather than picking one.
- `expected` holds only fields the page actually carries. An expected `null` for a field the
  source system does not record scores a correct `"KG"` as a mistake — that is the trap the
  method's authors fell into first. Leave such fields out.
- `strict=true` makes extracted fields that are not in `expected` count as hallucinations. Use
  it only when the expectation is complete; a partial expectation with `strict` punishes the
  pipeline for reading more of the page than you wrote down.

A run compares `expected` with the product's **gold** view — scalar columns plus `attributes`
(never `attributes_raw` or `metadata`) — and writes one `extraction_eval_runs` row per case:
the field verdicts, the counts, and the derived precision / recall / F1 / hallucination rate /
exact-match rate. Values are compared as VALUES: `1000` = `"1000.0"` = `"1.000,00"`,
`"Beige"` = `" beige "`, `["a","b"]` = `["B","A"]`; `"60x60"` is not `60`.

```sh
curl -s -X POST "$MIVAA_URL/api/internal/extraction-eval/run" -H "x-cron-secret: $CRON_SECRET" \
  -H 'Content-Type: application/json' -d '{"workspace_id":"<ws>","document_id":"<doc>"}'
curl -s "$MIVAA_URL/api/internal/extraction-eval/summary/<batch_id>" -H "x-cron-secret: $CRON_SECRET"
```

`pipeline_version` defaults to the running MIVAA version, so a number can be reproduced.

## 2. Reading a number honestly

Every rule below is encoded in `app/evaluation/extraction_eval.py` and pinned by its test.

- **The denominator does not move.** Metrics are counted over every (case, field) pair with a
  non-empty expectation, then summed across cases and derived once (micro-average). Averaging
  per-case averages lets one 1-of-1 case and one 0-of-9 case read as 50%.
- **A failed case scores zero and stays in the sample.** `failure_class` is `no_product`,
  `no_extraction` or `pipeline_failed` — three different findings with three different fixes —
  and the row is written with zero credit. Dropping it would let a pipeline raise its own average
  by crashing on the hardest pages.
- **A wrong value is both a false positive and a false negative;** a missing value is one false
  negative; a correct absence (both empty) is a true negative that only exact-match rate counts.
- **Agreement is measured without ground truth, and never read alone.** `cell` agreement folds
  values (`1000.0` = `1000`); `byte` agreement does not, and says whether outputs can be diffed.
  Both are reported beside `completeness`, because a configuration that leaves fields empty is
  perfectly repeatable — empty is always the same empty.
- **Rows are addressed by field name, never by position.**

## 3. The page judge (stage 5)

For the products of a document whose `confidence_score` is below the extraction floor (0.75,
capped at 10 per job), `ProductFieldJudge` renders the product's page from the source PDF and
shows the judge model the page image beside the extracted fields, as data. The judge answers
through a **forced tool call** with one verdict per field:

| verdict | score | meaning |
|---|---|---|
| `ok` | 4–5 | the value is printed on the page for this product |
| `suspect` | 2–3 | close but not exact, or a neighbouring product's value |
| `wrong` | 1 | the page contradicts it; `suggested_value` carries what the page shows |
| `absent_on_page` | — | the page does not carry this field for this product |

Rows land in `product_field_judgements` (one set per product, replaced on re-run), and every
product touched gets `products.metadata.field_judgement = {status: ok|skipped|failed, …}` with
the reason — so a judge that did nothing is distinguishable from one that found nothing wrong.
A verdict on a field the judge was never shown, an out-of-enum verdict, or one without a reason
is dropped and counted, never coerced. The prompt is `prompts` row
`extraction / product_field_judge / stage=quality`; there is no fallback in code.

The judge renders pages itself because `document_page_embeddings` renders were never written
(`ops.page_embeddings_never_written`). It never fails the job: a judge failure is recorded on
the stage result as `field_judgements.status`.

## 4. Two probes that need no cases

- **`extraction.confidence_uninformative`** — an `ai_usage_logs.operation_type` whose
  `confidence_score` took at most 3 distinct values across 50+ rows in 30 days. Fired on first
  run for four operation types: the health check logs one constant, the embedding paths one of
  two. A threshold on such a series is a switch, not a gate. Count distinct values before
  thresholding on a confidence.
- **`extraction.field_registry_too_wide`** — a category whose extraction schema (its fields plus
  the globals) exceeds 150 properties. Provider tool schemas are refused by property COUNT, not
  size, and `$ref` reuse does not help (measured elsewhere: 200 pass, 250 fail). Highest today:
  tiles at 137.

## What was deliberately not taken from the source

- Silent coercion of a bad value to a default (`apply_field_policies`): the platform's rules
  require a status, never a plausible-looking default.
- Year repair on dates (`1004 → 2004`): a valid, wrong date on a fiscal document.
- The provider SDK layer: MIVAA calls models through `tracked_claude_call_async` only.

## Related

- [agent-evaluation.md](agent-evaluation.md) — the same rules applied to agent replies
  (`failure_class`, batch summary, repeats)
- [data-integrity-framework.md](data-integrity-framework.md) — how the probes run
- [pdf-processing-pipeline.md](pdf-processing-pipeline.md) — where stage 5 sits
