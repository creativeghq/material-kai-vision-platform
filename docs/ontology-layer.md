# The ontology layer

> **Status:** Phase 1 shipped 2026-08-26 — typed concepts, governed term bindings, resolution,
> the review lifecycle and two integrity probes. Phases 2–4 (relationships, knowledge statements,
> neutral rules) are not built yet and are sketched at the bottom.

## Why this exists, and what it deliberately is not

The platform already resolved source terminology to enterprise concepts in **four** places, none
of which knew about the others:

| Where | What it holds | Rows (2026-08-26) |
|---|---|---|
| `material_categories.vocab_aliases` | alias array on the category row | 15 |
| `material_categories.controlled_vocab` | allowed values per category | ~91 |
| `material_category_aliases` | alias → category, with an operator CRUD screen | 6 |
| `facet_canonical_values` | canonical facet values + aliases + embeddings | 21 (2 facets) |

and tracked unresolved **search** terms in a fifth, `unmatched_term_frequency` (MIVAA-written,
0 rows).

What none of them carry is the thing that makes a binding governable: **an epistemic status, a
confidence, the evidence behind it, who confirmed it, and how often the term was actually seen.**
`material_category_aliases` is `(alias, category_key, created_at)` — a fact with no provenance,
which cannot be reviewed, explained or audited.

So this layer stores the **observation** and the **proposal** — the part nobody owned. It does
**not** store confirmed aliases where a home already owns them. `ontology_concept_types.alias_home`
records which existing table receives a binding once a human confirms it.

> **One home for confirmed truth, one home for everything still in question.**
> `ontology.duplicate_alias_home` fires the moment that stops being true.

`facet_value` is deliberately **not** a concept type: `facet_canonical_values` owns it, with
embeddings and a pipeline behind it. Adding it would create the fifth copy this layer exists to
prevent.

## The two tables

### `ontology_concept_types` — the semantic-role vocabulary (global, operator-owned)

| Column | Meaning |
|---|---|
| `key` | `material_category`, `manufacturer`, `supplier` |
| `semantic_role` | what a concept of this type *does* in a statement — `classification`, `party`, `measure`, `condition`, `evidence`, `conclusion`… |
| `target_table` / `target_id_column` / `target_key_column` | the domain a binding may resolve to, **enforced by trigger** |
| `alias_home` | where confirmed vocabulary lives when an existing table owns it; `NULL` = this layer owns it |

`semantic_role` is not the same as the table. `manufacturer` and `supplier` are both parties on
`crm_companies` but play different roles, and a rule that wants one must not silently accept the
other.

### `ontology_bindings` — term → concept (workspace-scoped)

`raw_term` is kept **verbatim** — "ΕΓΓΕΡ", "EGGER" and "Egger GmbH" are three observations, and
collapsing them at write time destroys the evidence a reviewer needs. `term_norm` is generated.

| Status | Meaning |
|---|---|
| `unresolved` | nothing knows this term. It is a **gap**, never a guess. |
| `candidate` | a model proposed a target. **Not** a binding. |
| `confirmed` | a human agreed. `reviewed_by` + `reviewed_at` are required by CHECK. |
| `rejected` | a human said no. Kept, so the next run does not re-propose the same wrong answer. |

`occurrences` is what ranks the work list: clearing the top of it unblocks the most source rows.

## Resolution order

`ontology_resolve(workspace, concept_type, raw_term)` consults the homes that already own
confirmed vocabulary **first**, and only then this layer's own bindings. A term an existing home
can answer never gets a row here.

**material_category** → `material_category_aliases` → category key/name/display_name →
`vocab_aliases` → confirmed binding → candidate binding → **unresolved**

**manufacturer / supplier** → `_brand_company_match` (name + `factory_names`) → folded
`crm_companies` match → confirmed binding → candidate binding → **unresolved**

It returns a **status**, not just an id. A caller that treats `candidate` as `confirmed` has
thrown away the distinction this layer exists to preserve.

### One normaliser

`ontology_term_norm()` = `crm_fold` (lowercase, strip diacritics, fold final sigma) **plus
internal-whitespace collapse**. Both sides of every comparison go through it, and the generated
column uses the same expression. Folding the query differently from the stored value is how a
lookup misses a row that is right there — it happened during development: `'πλακακια  μπανιου'`
with two spaces became a second gap row instead of a re-sighting, which would have split one
supplier's vocabulary across several low-count rows and buried the term blocking the most lines.

Whitespace only. Punctuation stays: "EGGER" and "EGGER-Werk" are plausibly different makers, and
merging them silently is the kind of guess this layer refuses to make.

## The review lifecycle

```
ontology_note_term()      a term was seen. Answered by a home → returns the answer, writes nothing.
                          Unanswerable → records a GAP and counts the sighting.
ontology_propose_binding()  machine. Can only ever reach `candidate`.
ontology_confirm_binding()  human, workspace ADMIN. The only path to `confirmed`.
ontology_reject_binding()   human. Keeps the term and the evidence.
ontology_gaps()             the work list, ranked by occurrences.
```

There is **no path from a model's output to a confirmed binding that does not pass through a
person.** That is enforced in the functions, not merely intended.

**Confirming does not promote to global vocabulary.** `material_category_aliases` has no
workspace column, so writing to it makes one tenant's observation platform-wide — that is the
platform operator's call. A workspace admin confirms for their own workspace and no further; the
return value says so and names what a promotion would do.

## Probes

| Check | Severity | Fires when |
|---|---|---|
| `ontology.duplicate_alias_home` | critical | a term is confirmed in `ontology_bindings` **and** in the concept type's `alias_home` — two tables now answer one question |
| `ontology.candidates_unreviewed` | warning | an AI proposal has waited >14 days for a decision |

Both were watched firing on constructed state and going silent again.

`candidates_unreviewed` measures staleness with `proposed_at`, **not** `updated_at`. The
validation trigger sets `updated_at := now()` on every update and `ontology_note_term` updates the
row on every re-sighting — so with `updated_at` a candidate for a term that keeps appearing (the
only kind that matters) would have had its clock reset forever and the probe could never have
fired at all. Found by watching the probe fail to fire on a deliberately backdated row.

## What this is for

Measured 2026-08-26, before any of this ran:

```
intake lines waiting        1,720      approved ever        0
material_category set           0      products             0
manufacturer set              191      CRM manufacturers    0
pricing_rules                   0      default markup      0%
```

Rung 2 of the markup ladder matches `products.brand_company_id`, rung 3
`products.supplier_company_id`, rung 4 `metadata.material_category`. All three are **ontology
bindings**, and all three are unresolvable today — so every rung above the workspace default is
unreachable and the default is zero. The ladder is complete, explained and probe-guarded, and
structurally guaranteed to return cost.

Clearing the top of `ontology_gaps()` is what makes those rungs reachable.

## Not built yet

- **Phase 2 — relationships** (§4.2): `subject_type predicate object_type` with domain/range, so a rule can state `Observation measures Property` and have it validated.
- **Phase 3 — knowledge statements** (§3.1) and the **neutral intermediate rule** (§6): conditions, thresholds, evidence, epistemic status, attached tests, and a draft → review → approved lifecycle. Must extend the existing `propose_or_apply_customer_pricing` / `decide_customer_pricing_request` flow rather than duplicate it.
- **Phase 4 — extraction** into statements from supplier documents and regulations.

Deliberately skipped: OWL/SHACL/RDF tooling. This platform is Postgres and pgvector, its
validation layer is a SQL function registry (`data_integrity_checks`), and a second validation
system beside it would be the same two-sources-of-truth failure this layer was built to stop.
