/**
 * Universal entity templates (#322) — registry guard.
 *
 * Two failure shapes this feature is exposed to, neither of which TypeScript can see:
 *
 *  1. **Two-copy drift.** The list of template types lives in `schema.ts` AND in the DB CHECK
 *     `entity_templates_entity_type_check`. Add a type to one only and it fails at the worst
 *     moment: the UI happily offers "Save as template" and the INSERT throws a CHECK violation
 *     when the user presses Save. This is the same shape that made every `sales` /
 *     `realestate_agent` invite fail at redemption (see workspaceRoles.test.ts).
 *
 *  2. **A leaky allowlist.** A payload is a snapshot of a real record. The moment an adapter
 *     captures the wrong column, the template quietly carries something it must not: a myDATA
 *     `fiscal_mark` (cloning a *legal* document), a `public_share_token` (a stranger inherits
 *     access to the new record), or a derived `total` (a second derivation of a money quantity —
 *     the exact bug moneyDerivation.test.ts exists to stop). None of those are type errors; every
 *     one of them is a valid string.
 *
 * The declarative half of the registry (`schema.ts`) imports nothing but types precisely so this
 * test can inspect the allowlists directly instead of regexing source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LIVE_TEMPLATE_TYPES, PLANNED_TEMPLATE_TYPES, SYNTHETIC_PAYLOAD_FIELDS, TEMPLATE_ENTITY_TYPES,
  TEMPLATE_SCHEMAS,
} from '@/services/templates/schema';
import { FORBIDDEN_CAPTURE_FIELDS } from '@/services/templates/types';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/**
 * The live values of `entity_templates_entity_type_check`, transcribed from the applied migration
 * `entity_templates_engine`, then widened by `entity_templates_inspection_type`. Verify with:
 *   select pg_get_constraintdef(oid) from pg_constraint
 *    where conname = 'entity_templates_entity_type_check';
 */
const DB_ALLOWED_ENTITY_TYPES = [
  'invoice', 'quote', 'project', 'moodboard', 'order',
  'contract', 'expense', 'hr_onboarding', 'crm_company', 'property_listing', 'inspection',
];

describe('template entity types ↔ DB CHECK constraint', () => {
  it('the TS union and the DB CHECK list are the same set', () => {
    expect([...TEMPLATE_ENTITY_TYPES].sort()).toEqual([...DB_ALLOWED_ENTITY_TYPES].sort());
  });

  it('every type is either live (has an adapter) or explicitly planned — none is simply missing', () => {
    const accounted = new Set<string>([...LIVE_TEMPLATE_TYPES, ...PLANNED_TEMPLATE_TYPES]);
    const unaccounted = TEMPLATE_ENTITY_TYPES.filter((t) => !accounted.has(t));
    expect(unaccounted, `types with neither an adapter nor a PLANNED_TEMPLATE_TYPES entry: ${unaccounted.join(', ')}`).toEqual([]);
  });

  it('live and planned do not overlap', () => {
    const overlap = LIVE_TEMPLATE_TYPES.filter((t) => (PLANNED_TEMPLATE_TYPES as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });

  it('every live type has a schema entry that captures SOMETHING', () => {
    for (const t of LIVE_TEMPLATE_TYPES) {
      const schema = TEMPLATE_SCHEMAS[t];
      expect(schema, `no schema for live type "${t}"`).toBeTruthy();
      expect(schema.sourceTable.length).toBeGreaterThan(0);
      expect(schema.label.length).toBeGreaterThan(0);
      // An EMPTY parent allowlist is legal — `hr_onboarding` has one deliberately, because its
      // parent is an employee record (salary, AMKA, PIN hash) and none of that belongs in a
      // reusable checklist. What is never legal is a type that captures nothing at all, which
      // would be a template that silently produces an empty record.
      const captures =
        schema.captureFields.length +
        (schema.captureChildren ?? []).length +
        (SYNTHETIC_PAYLOAD_FIELDS[t] ?? []).length;
      expect(captures, `"${t}" captures no parent fields, no children and no synthetic keys`).toBeGreaterThan(0);
    }
  });
});

describe('capture allowlists carry no identity, fiscal or derived-money field', () => {
  const forbidden = new Set<string>(FORBIDDEN_CAPTURE_FIELDS);

  for (const type of LIVE_TEMPLATE_TYPES) {
    const schema = TEMPLATE_SCHEMAS[type];

    it(`${type}: parent fields are clean`, () => {
      const bad = schema.captureFields.filter((f) => forbidden.has(f));
      expect(bad, `${type}.captureFields must not include ${bad.join(', ')}`).toEqual([]);
    });

    it(`${type}: child fields are clean`, () => {
      for (const child of schema.captureChildren ?? []) {
        const bad = child.fields.filter((f) => forbidden.has(f));
        expect(bad, `${type} → ${child.table}.fields must not include ${bad.join(', ')}`).toEqual([]);
        // The FK back to the parent is supplied by the writer, never captured.
        expect(child.fields).not.toContain(child.fk);
      }
    });

    it(`${type}: a nested child stores parent_index, never the parent's id`, () => {
      for (const child of schema.captureChildren ?? []) {
        if (!child.hierarchy) continue;
        expect(child.fields).not.toContain(child.hierarchy.idField);
        expect(child.fields).not.toContain(child.hierarchy.parentField);
      }
    });

    it(`${type}: editable fields all exist in the capture allowlist`, () => {
      for (const f of schema.editableFields ?? []) {
        expect(
          schema.captureFields.includes(f.key),
          `${type}: editable field "${f.key}" is not captured, so editing it would write a key the adapter never reads`,
        ).toBe(true);
      }
    });

    it(`${type}: synthetic payload keys are distinct from captured columns and are not forbidden`, () => {
      // A synthetic key is how an adapter stores a value under a name that is NOT a column — the
      // expense adapter keeps a bill's amount as `default_amount` precisely so no payload key is
      // ever called `subtotal_net`. That only works while the two namespaces stay disjoint.
      //
      // The key is also checked with its prefix STRIPPED (#385 FN-4). `default_vat_amount`
      // passed this test for months: the forbidden list holds `vat_amount`, the key was
      // spelled `default_vat_amount`, and the adapter selected the real column and
      // prefilled it into the expense form. The rename hid it from the check rather than
      // from a reader — the file's own comment said as much — so the check has to see
      // through the rename.
      const SYNTHETIC_PREFIXES = ['default_', 'initial_', 'suggested_'];
      for (const f of SYNTHETIC_PAYLOAD_FIELDS[type] ?? []) {
        expect(schema.captureFields, `${type}: "${f.key}" is both synthetic and captured`).not.toContain(f.key);
        expect(forbidden.has(f.key), `${type}: synthetic key "${f.key}" is on the forbidden list`).toBe(false);
        for (const prefix of SYNTHETIC_PREFIXES) {
          if (!f.key.startsWith(prefix)) continue;
          const bare = f.key.slice(prefix.length);
          expect(
            forbidden.has(bare),
            `${type}: synthetic key "${f.key}" is "${bare}" with a prefix, and "${bare}" is ` +
              'forbidden. Renaming a derived total does not make it capturable.',
          ).toBe(false);
        }
      }
    });
  }
});

describe('adapters never mass-assign a stored payload', () => {
  const ADAPTERS = read('src/services/templates/adapters.ts');

  it('no payload spread reaches an insert', () => {
    // Security invariant 8. The payload is jsonb read back out of the DB — untrusted input — so
    // `.insert({ ...payload })` would let anything that ever landed in the column become a column
    // value, including workspace_id or a price.
    const spreads = ADAPTERS.match(/\.insert\(\s*\{[^}]*\.\.\.\s*(payload|p)\b/g) ?? [];
    expect(spreads, `mass assignment of a template payload: ${spreads.join(' | ')}`).toEqual([]);
  });

  it('no adapter selects a forbidden column directly', () => {
    // The declarative allowlist is not the only way a value reaches a payload (#385 FN-4).
    // The expense adapter ran its own `.select('subtotal_net, vat_amount')` inside
    // `capture()` and stored the result under synthetic names, so both the allowlist and
    // any name-based check were bypassed — the guard was well-built for the path it
    // inspected, and the code took a different one.
    //
    // This reads what the adapters actually ASK the database for.
    // Scoped to `capture()` bodies. Selecting `id` elsewhere is ordinary — `filterVisibleIds`
    // does it to check what the caller may see — and flagging that would make this a
    // checker people mute rather than one they act on.
    const offenders: string[] = [];
    for (const m of ADAPTERS.matchAll(/async capture\s*\([\s\S]*?\n {2}\},/g)) {
      for (const sel of [...m[0].matchAll(/\.select\(\s*'([^']+)'/g)].map((x) => x[1])) {
        for (const col of sel.split(',').map((c) => c.trim())) {
          if (FORBIDDEN_CAPTURE_FIELDS.includes(col as never)) offenders.push(col);
        }
      }
    }
    expect(
      offenders,
      'an adapter selects a forbidden column directly, routing around captureFields: ' +
        offenders.join(', '),
    ).toEqual([]);
  });

  it('every live adapter is exported from adapters.ts', () => {
    // Types are snake_case (they are DB values); the exports are camelCase TS identifiers.
    const camel = (t: string) => t.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    for (const t of LIVE_TEMPLATE_TYPES) {
      expect(ADAPTERS, `no \`export const ${camel(t)}Adapter\` in adapters.ts`)
        .toContain(`export const ${camel(t)}Adapter`);
    }
  });
});
