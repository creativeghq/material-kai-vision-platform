# Units of Measure

One canonical unit vocabulary, keyed to the AADE myDATA `measurement_unit` codes, enforced by database triggers.

- TypeScript: [`src/lib/units.ts`](../src/lib/units.ts) — `UNITS`, `normalizeUnit`, `unitFromMydataCode`, `unitLabel`, `unitSuffix`.
- SQL: `normalize_unit(text)` — the twin of `normalizeUnit`, plus `BEFORE INSERT/UPDATE` triggers on the 10 tables that carry a unit.

---

## 1. Why this is enforced in the database

The divergence was live, not theoretical. Measured before any change, **square metres was stored four different ways at once**:

| Column | Value |
|---|---|
| `material_categories.default_unit` (what ingestion stamps) | `sqm` |
| `order_items.measurement_unit_code` | `m2` |
| `quote_items.custom_unit` | `sqm` |
| `blueprint_items.unit` | `m²` |

Pieces existed as `pcs` / `pc` / `item` / `unit`. And this wasn't cosmetic: `marketplace_price_comps` filters comparable listings **by unit string**, so `m²` tiles were silently excluding every `sqm` one from the comparison. A price comparison that quietly drops three quarters of its comparables still returns a number, and the number looks fine.

**A trigger, not a code fix, is the chokepoint.** MIVAA's `_resolve_default_unit` consults a *hardcoded* map (`'porcelain_tile' → 'sqm'`) **before** it reads `material_categories`, so normalizing that table alone would not have stopped ingestion re-minting `sqm` — and MIVAA is a separate repository, so a fix there cannot ship from this repo at all. A `BEFORE INSERT/UPDATE` trigger is the one point every writer must pass through, in any language, from any repo.

---

## 2. The vocabulary

| Key | Label | myDATA code | Notes |
|---|---|---|---|
| `pcs` | pieces | 1 | |
| `kg` | kg | 2 | |
| `lt` | litres | 3 | |
| `m` | metres | 4 | |
| `m2` | m² (square metres) | 5 | `isArea` — drives per-m² cost wording at intake |
| `m3` | m³ (cubic metres) | 6 | |
| `box` | box | — | packaging/commercial |
| `pallet` | pallet | — | packaging/commercial |
| `set` | set | — | packaging/commercial |
| `hour` | hour | — | labour |
| `day` | day | — | labour |
| `job` | job (fixed price) | — | labour |
| `point` | point | — | survey |
| `room` | room | — | survey |
| `bath` | bathroom | — | survey |

`mydataCode: null` is **explicit, not missing**. Those units have no AADE equivalent and must be converted to a coded unit before a line is transmitted. Where myDATA states the unit on an inbound line (`<measurementUnit>5</measurementUnit>`), that code is the authority — `unitFromMydataCode` maps it. Never infer a unit from a product description when a code is present.

---

## 3. Normalization rules

`normalizeUnit` / `normalize_unit` fold aliases into the canonical key: `m²`→`m2`, `sqm`→`m2`, `pc`/`item`/`unit`→`pcs`, plus Greek forms (`τεμ`, `τμ`, `κιλό`, `ώρα`).

**Unknown input passes through unchanged.** It is not guessed at, and it is not rejected. A unit nobody anticipated is more likely to be a real unit than a typo, and silently rewriting it to the nearest known key would be a data-loss bug that looks like a cleanup.

Labour and survey units (`job`, `day`, `point`, `room`, `bath`) are listed precisely so normalization leaves them alone — they are real units with real rows behind them, not misspellings of something else. The backfill confirmed this: of 40 changed rows across 16 tables, every one was an obvious collapse (`m²`→`m2`, `sqm`→`m2`, `pc`/`item`/`unit`→`pcs`), and no labour unit moved.

---

## 4. Using it

- **New surface?** Import from `src/lib/units.ts`. Do not declare a local list. The four that had diverged (orders, quotes, invoice PDF labels, blueprint picker) now all derive from it.
- **New table with a unit column?** Add the `BEFORE INSERT/UPDATE` trigger in the same migration. A table without the trigger is a table that can reintroduce `sqm`.
- **Adding a unit?** Add it to `UNITS` **and** to the SQL function's vocabulary — they are twins and must stay in sync. Set `mydataCode` if AADE has one; leave it `null` and mean it if not.
- **Adding an alias?** Alias table only. Aliases are spellings; units are things.

---

## 5. Known follow-up

In the MIVAA repository (not shippable from here): `_FINE_CATEGORY_DEFAULT_UNITS` and `_CATEGORY_DEFAULT_UNITS` should emit `m2` rather than `sqm`. The trigger makes that a tidiness fix rather than a correctness one — ingestion's `sqm` lands as `m2` either way.

## Related

- [docs/finance-system.md](finance-system.md) — myDATA line transmission
- [docs/warehouse-and-billing.md](warehouse-and-billing.md) — `warehouse_items.unit`
- [docs/blueprint-estimating.md](blueprint-estimating.md) — labour/survey units in blueprints
