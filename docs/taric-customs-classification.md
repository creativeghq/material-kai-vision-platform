# TARIC customs classification

EU commodity codes on catalog products: where the nomenclature comes from, how a code gets
picked, and what is deliberately not automated.

## Why this exists

`products.taric_code` was a free-text box with no reference data behind it and no way to see the
value again once it had been typed. That was survivable while a commodity code was paperwork
somebody else filled in. It stopped being survivable on **1 July 2026**, when EU low-value
imports under €150 — **including consignments declared under IOSS** — became chargeable at **€3
of customs duty per tariff sub-heading**. The charge is per *heading*, not per parcel: a shipment
spanning three CN headings costs €9. Only a **declarable** line may appear on the declaration —
the 10-digit TARIC code whose product line suffix is `80`. A 6-digit HS code, or an intermediate
line with suffix `10`, is rejected.

IOSS covers VAT collection only. It has never determined customs duty, and it does not now.

## The data

`public.taric_codes` — global reference data, not tenant data. Readable by any authenticated
user; writes are service-role only (there are no INSERT/UPDATE/DELETE policies, so RLS denies
everything else).

Every level of the nomenclature is stored **zero-padded to 10 digits**, exactly as the TARIC
extractions publish it: heading `6907` is the row `6907000000`. That is what makes the hierarchy
a prefix walk — the breadcrumb in `search_taric_codes` reads the chapter/heading/subheading/CN
ancestors by slicing the code — and it means there is one code format to validate instead of
four. `normalizeTaricInput` in [src/lib/taric.ts](../src/lib/taric.ts) is the single place that
rule is written down on the client; the `taric_codes_code_digits` CHECK is the same rule in SQL.

| Column | Meaning |
|---|---|
| `code` | 10-digit padded code (PK) |
| `cn_code` / `hs_code` / `chapter` | stored slices, so the common lookups are btree hits |
| `product_line_suffix`, `declarable` | `80` = declarable; `10` = hierarchy only, never on a declaration |
| `description_en` / `description_el` | EL comes from the Greek national extract |
| `search_vector` | generated `to_tsvector('english', en) || to_tsvector('greek', el)` |
| `valid_from` / `valid_to` | the nomenclature changes monthly |

### Importing

`taric-reference-sync` takes **CSV/TSV text**, not xlsx. The nomenclature is published as
spreadsheets on the CIRCABC "TARIC & Quota Data and Information" library; one "Save as CSV" is a
better trade than shipping a spreadsheet parser into an edge function.

Column names differ between the EU export, the Greek national export and whatever an admin
re-exports, so headers are matched against an **alias table** (`HEADER_ALIASES`) rather than
hardcoded to one layout. A file whose code column cannot be found fails with the headers it
actually saw — importing zero rows silently is the exact failure `taric_reference_stale` exists
to catch, and it should never get the chance to fire for a fixable reason. The import result
reports which header mapped to which field, and the admin panel shows it.

Merging is `coalesce`-based (`taric_upsert_batch`), so importing the Greek extract does not blank
the English descriptions loaded from the EU one.

**Where:** Admin → Data Health → *TARIC nomenclature*. The import control sits next to the check
that reports the problem.

**Automatic refresh:** set `TARIC_REFERENCE_URL` in platform secrets and the
`taric-reference-refresh-monthly` cron (02:20 on the 2nd) fetches it through the SSRF guard.
Unset, the cron returns a 200 skip rather than failing monthly — the outcome it exists to produce
is already probed by `taric_reference_stale`, so an error would be noise on a covered signal.

## Choosing a code

`taric-classify`, three stages, cheapest first.

**A — the supplier already told us.** Supplier XML, price lists and invoices routinely carry an
HS/CN/TARIC field. The product's `attributes_raw` / `attributes` / `metadata` are flattened and
scanned for a customs-code-shaped key; an 8- or 10-digit value that exists in the nomenclature
and is declarable is **applied directly** with `taric_source='supplier'`. A code the supplier
declared is the normal basis for a declaration — it is not a guess. A 6-digit value is kept as a
hint for stage B instead.

**B — shortlist.** `search_taric_codes` ranks the nomenclature by full-text (EN + EL) and trigram
match on the product's own words. This is what makes stage C affordable: the model picks among
~30 real codes instead of recalling 20,000 from memory.

**C — Claude picks one.** A forced tool call returns `{code, confidence, reasoning}`. A code that
was not in the candidate list is discarded rather than written.

### What is never automated

Stage C **never writes `products.taric_code`.** It writes `taric_code_suggested` plus a
confidence and leaves `taric_status='suggested'` for a person to confirm. A tariff
misclassification is a customs liability that surfaces months later at a border, not a bad label
in a UI — this is the one place where an autonomous write is not worth the convenience. The
guard is pinned by [tests/unit/productFiscalCoverage.test.ts](../tests/unit/productFiscalCoverage.test.ts).

`taric_status` follows the platform's explicit-marker convention:

| Status | Meaning |
|---|---|
| `pending` | never attempted, or attempted and only free stages ran |
| `suggested` | the classifier has a proposal awaiting confirmation |
| `confirmed` | a human (or a valid supplier declaration) settled it |
| `failed` | attempted and could not produce a usable answer |

### Cost

Stage C debits **1 credit per product before** the upstream call. The hourly
`taric-supplier-code-backfill-hourly` cron runs with `llm: false`, so an unattended sweep only
applies the free stage A — a 5,000-line supplier import does not silently generate a 5,000-credit
bill. The paid stage is operator-initiated (*Suggest a code*).

## Origin

`products.country_of_origin`, ISO 3166-1 alpha-2. **Not** `VAT_COUNTRY_OPTIONS`: that list is
keyed on the VAT prefix, where Greece is `EL`, and `EL` as an origin on a declaration is wrong.
`ORIGIN_COUNTRY_OPTIONS` ([src/lib/originCountries.ts](../src/lib/originCountries.ts)) is the ISO
list, with names resolved at runtime through `Intl.DisplayNames` so there is no country-name
table to maintain.

A code alone does not determine duty — code **plus** origin does, since origin drives preferential
rates and trade-defence measures. Per-batch origin on `warehouse_items` is the right long-term
model (same SKU, different factory) and is deliberately **not** added yet: nothing consumes it,
and an always-null column reads as "we don't know" rather than "nobody asked". Add it with the
Intrastat consumer that needs it.

## Integrity checks

| Check | Fires when |
|---|---|
| `taric_reference_stale` | the table is empty, or the last import is over 60 days old |
| `taric_code_invalid` | a product carries a code that is unknown, expired, or an intermediate (suffix 10) line |

Neither auto-heals. Guessing a replacement tariff code is the thing this system refuses to do.

## Not built

- **Duty rates, quotas, suspensions and anti-dumping measures.** `taric_codes` holds nomenclature
  only. The measures payload is large and churns monthly; codes + descriptions + validity is all
  that validation and matching need. Fetch rates live from the EU TARIC API when a consumer wants
  them.
- **Intrastat export.** The inputs now exist (CN-8 from the code, net mass from
  `warehouse_items.weight_kg`, origin from the product) but nothing assembles a declaration.
- **Landed-cost preview.** Grouping an order's lines by CN sub-heading and showing
  `€3 × distinct sub-headings` is the commercial payoff of the July 2026 rule — it makes
  "consolidate into fewer headings" visible before shipping.

## Related

- [docs/warehouse-and-billing.md](warehouse-and-billing.md) — where the fiscal columns are read
- [docs/finance-system.md](finance-system.md) — invoice building and myDATA
