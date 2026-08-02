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

### Importing — fully automatic

`taric-reference-sync` resolves the CURRENT month from CIRCABC on every run. It does **not** use
a pinned file URL, because the extraction is republished into a NEW folder every month and a pin
would keep serving last month's codes indefinitely — silently, since stale codes still validate
and still classify.

CIRCABC's own Angular client reads `GET /service/circabc/spaces/{id}/children`, and that endpoint
honours `guest=true` on public libraries, so the tree is walked with no credentials. (For the
record, so nobody re-derives this: `/api/-default-/public/alfresco/…` answers 401 and
`/api/nodes/…` 404s. This is the path the product itself uses.)

The walk descends from `TARIC_CIRCABC_LIBRARY_ID`, always taking the **most recently published
subfolder**, until it reaches `Nomenclature <LANG>.xlsx`. Selection is by `modified`/`created`
timestamp, never by name: a name sort breaks at the year rollover, because "01 - January" sorts
below "12 - December" of the year before. The walk works whether the configured node is the year
folder or its parent.

**One language per invocation.** Each edition is ~25,000 rows plus a 1.3 MB workbook unzipped in
memory, and two in one run exceeds the edge runtime's budget — the worker is killed and the
caller sees only "error reading a body from connection". The cron therefore posts twice, EN then
EL; the coalesce-based upsert merges both onto one row.

Uploading a CSV or pasting a link still works (Admin → Data Health → *TARIC nomenclature*) and is
the fallback when CIRCABC reorganises.

### What the file actually looks like

Worth knowing, because every one of these silently corrupts the import if assumed away:

| Reality | Consequence if missed |
|---|---|
| `Goods code` is `"0101210000 10"` — code **and** product line suffix in one cell | defaulting the suffix to 80 publishes ~3,500 intermediate lines as declarable |
| The concatenated digits are 12 long | normalising before splitting rejects **every row in the file** |
| Empty cells are self-closing `<c r="C536" t="inlineStr" />` | a pattern needing `</c>` swallows the NEXT cell, shifting descriptions into the Indent column |
| `Language` is a column, one edition per file | descriptions land in the wrong language field |
| `Indent` is dashes (`- - -`), not a number | — |
| Descriptions use `|` where a non-breaking space belongs (`50|kg`) | the pipe reaches the search vector |
| Dates are `DD-MM-YYYY` | — |

The edge runtime cannot drain CIRCABC's chunked listing through `res.json()` or `res.text()`
(the identical fetch succeeds in stock Deno), so bodies are pulled through `body.getReader()`.

## Choosing a code

Classification follows the **material and the form** of an article. A product NAME carries
neither — "AMALFI GRIS 80X80" is marketing — so the resolution axis is the category, not the
name. `taric-classify` works down four stages, and only the last costs anything.

**A — the supplier already told us.** Supplier XML, price lists and invoices routinely carry an
HS/CN/TARIC field. `attributes_raw` / `attributes` / `metadata` are flattened and scanned for a
customs-code-shaped key; an 8- or 10-digit value that exists in the nomenclature and is
declarable is **applied directly** (`taric_source='supplier'`). A 6-digit value is kept as a hint.

**B — the rules.** `resolve_taric_for_product()`:

    category (+ material) -> heading        one human decision, inherited by every product
    attribute             -> declarable leaf   deterministic, from data already extracted
    name                  -> nothing

`taric_category_rules` maps a category to a heading, optionally qualified by material — because
the same article changes chapter with what it is made of:

| Category | Material | Heading | |
|---|---|---|---|
| tiles | any | **6907** | Ceramic flags and paving, hearth or wall tiles |
| sanitary | ceramic / porcelain / china | **6910** | Ceramic sinks, washbasins, baths… |
| sanitary | plastic / acrylic / pvc | **3922** | Baths, sinks, washbasins… of plastics |
| sanitary | steel / stainless / iron | **7324** | Sanitary ware of iron or steel |
| lighting | any | **9405** | Luminaires and lighting fittings |
| furniture | any | **9403** | Other furniture *(seating is 9401 — the category cannot tell)* |

`taric_leaf_rules` then splits the heading by the attribute the nomenclature actually keys on.
TARIC divides 6907 by **water absorption** — ≤ 0,5 % → 6907 21, > 0,5 % ≤ 10 % → 6907 22,
> 10 % → 6907 23 — and the extractor already stores the ISO 13006 / EN 14411 class
(`metadata.performance.water_absorption_class`: BIa, BIb, BIIa, BIIb, BIII) whose boundaries are
exactly those boundaries. Both the class and a raw percentage are encoded, and the percentage
parser accepts what catalogues actually print (`"12,5 %"`).

So a porcelain tile classifies as **6907 21 00 00** with no model, no credits and no name.

`product_attribute_value()` finds an attribute wherever the pipeline put it — `metadata.performance`,
`metadata`, `attributes`, `properties`, `specifications` — so a rule names the FACT it needs
rather than a storage location that will move.

**C — the model, narrowed.** When the rules reach a heading but no attribute can split it (no
water absorption recorded, say), the shortlist is restricted to that heading's children and
Claude picks among them. Choosing among the children of 6907 is a different problem from choosing
among 22,000 codes, and the rule's reasoning is passed in as context. A resolved heading
supersedes any caller-supplied chapter filter — it is strictly more specific.

**D — name search.** Only when the category is unmapped. This was the whole of stage B before,
and it is now the last resort.

### Confirmation moved from the product to the rule

Seeded rules arrive **unconfirmed**. An unconfirmed rule still resolves — it just produces a
*suggestion*. Confirming "Tiles → 6907" once, in Admin → Data Health → *Customs classification
rules*, means every tile in the catalog is classified from it automatically thereafter.

That is the point of the redesign, and it is not only about cost:

| | per-product guessing | per-category rules |
|---|---|---|
| Human decisions | one per product | one per category |
| Cost | 1 credit per product | none, once confirmed |
| Consistency | two identical tiles can differ | identical by construction |
| Fixing a mistake | hundreds of rows | one rule |
| Auditability | a model's prose | "category tiles → 6907; water_absorption_class = BIa" |

Categories too heterogeneous for one honest heading — `heating`, `kitchen`, `decor`,
`building_materials`, `general_materials` — are deliberately **not** seeded. A wrong rule
inherited by a whole category is worse than no rule. `paint_wall_decor` and `wood` are seeded at
chapter level (32, 44) because the split below that needs a fact we do not extract: the paint
medium (3208 non-aqueous vs 3209 aqueous), and the wood form (4407 sawn / 4411 fibreboard /
4418 joinery).

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
