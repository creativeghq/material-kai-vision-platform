/**
 * Every enum an adapter hardcodes must match the CHECK constraint it is standing in for (#322).
 *
 * This is the bug shape that has now bitten this feature three times, and each time it was a
 * *silent* copy of a database vocabulary drifting from the database:
 *
 *   1. The seeded project starters used `visibility: "client"`. `project_tasks_visibility_check`
 *      accepts only `internal | client_visible`, so applying either starter aborted PARTWAY
 *      through building the task tree and left half a project behind.
 *   2. `contracts_context_check` accepted only `hr | finance | project`, while
 *      `ContractContext`, contracts-api's `CONTEXTS`, `TYPE_OPTIONS`, the context badge and
 *      PropertyWorkbench's Contracts panel all supported `realestate`. Every real-estate contract
 *      creation threw 23514 — a whole feature that looked wired and failed 100% of the time.
 *      (Fixed by widening the constraint, not by narrowing the app.)
 *   3. `properties.furnished` is TEXT ("yes / no / partial"), and the adapter compared it to
 *      `true` — so every template-created listing came out unfurnished.
 *
 * None of these is a type error: every one is a valid string in the wrong vocabulary. The adapters
 * narrow through `oneOf([...])` so a bad payload value cannot reach an insert; this test makes
 * sure the list inside each `oneOf` is the list the database actually accepts.
 *
 * adapters.ts is read as TEXT, not imported — importing it pulls in the Supabase client.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CONTRACT_CONTEXTS } from '@/services/contracts/contractVocabulary';

const ADAPTERS = readFileSync(join(process.cwd(), 'src/services/templates/adapters.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

/**
 * The live CHECK vocabularies, transcribed. Re-verify any of them with:
 *
 *   select conname, pg_get_constraintdef(oid) from pg_constraint
 *    where conrelid = '<table>'::regclass and contype = 'c';
 */
const DB_ENUMS: Record<string, { constraint: string; values: string[] }> = {
  taskVisibility: { constraint: 'project_tasks_visibility_check', values: ['internal', 'client_visible'] },
  roomType: {
    constraint: 'project_rooms_room_type_check',
    values: ['bedroom', 'bathroom', 'kitchen', 'living', 'dining', 'office', 'outdoor', 'hallway', 'other'],
  },
  viewPreference: { constraint: 'moodboards_view_preference_check', values: ['grid', 'list'] },
  mediaType: { constraint: 'moodboard_items_media_type_check', values: ['image', 'video', 'vr_world'] },
  contractContext: { constraint: 'contracts_context_check', values: ['hr', 'finance', 'project', 'realestate'] },
  propertyType: { constraint: 'properties_property_type_check', values: ['residential', 'commercial', 'land', 'other'] },
  transactionType: {
    constraint: 'properties_transaction_type_check',
    values: ['sale', 'rent', 'short_let', 'business_transfer', 'auction'],
  },
  // Not a CHECK — `orders.order_type` is constrained by the app, and these are the only two the
  // order screens and `computeOrderLines` know about.
  orderKind: { constraint: 'orders.order_type (app-level)', values: ['sales', 'purchase'] },
};

/**
 * Vocabularies an adapter now takes from a shared source rather than spelling out (#391).
 *
 * `contractContext` was `oneOf(['hr','finance','project','realestate'] as const)` — one of
 * FIVE copies of that list. It is `oneOf(CONTRACT_CONTEXTS)` now, so there is no literal
 * for the regex below to find, and the values are imported here instead.
 *
 * Importing rather than re-typing them matters for this file in particular: finding 2 in
 * the docstring above is `contracts_context_check` drifting from the app's copy of this
 * very vocabulary, so re-typing it here would put a sixth copy inside the test written to
 * catch the problem.
 */
const IMPORTED_ONE_OFS: Record<string, readonly string[]> = {
  contractContext: CONTRACT_CONTEXTS,
};

/**
 * Every `const <name> = oneOf(...)` in adapters.ts, whether it spells the list out or
 * takes it from a shared source.
 */
function parseOneOfs(src: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const literal = /const\s+(\w+)\s*=\s*oneOf\(\[([^\]]*)\]\s*as const\)/g;
  for (let m = literal.exec(src); m; m = literal.exec(src)) {
    out[m[1]] = [...m[2].matchAll(/'([^']*)'/g)].map((v) => v[1]);
  }
  // `oneOf(SOME_CONSTANT)` — the shared-source form. The name must be one this file
  // knows, so a NEW indirection fails here rather than silently dropping out of the
  // parity check.
  const imported = /const\s+(\w+)\s*=\s*oneOf\(\s*([A-Z][A-Z0-9_]*)\s*\)/g;
  for (let m = imported.exec(src); m; m = imported.exec(src)) {
    const values = IMPORTED_ONE_OFS[m[1]];
    if (!values) {
      throw new Error(
        `adapters.ts declares \`${m[1]} = oneOf(${m[2]})\` but this test does not know ` +
          `where ${m[2]} comes from. Add it to IMPORTED_ONE_OFS — importing the constant, ` +
          'not re-typing its values.',
      );
    }
    out[m[1]] = [...values];
  }
  return out;
}

const declared = parseOneOfs(ADAPTERS);

describe('adapter enum vocabularies ↔ the database', () => {
  it('finds the oneOf declarations at all (the regex is load-bearing)', () => {
    // A silently-empty parse would make every assertion below vacuous.
    expect(Object.keys(declared).length).toBeGreaterThanOrEqual(Object.keys(DB_ENUMS).length);
  });

  for (const [name, { constraint, values }] of Object.entries(DB_ENUMS)) {
    it(`${name} matches ${constraint}`, () => {
      expect(declared[name], `no \`const ${name} = oneOf([...])\` in adapters.ts`).toBeTruthy();
      expect(
        [...declared[name]].sort(),
        `${name} drifted from ${constraint}. Widen the constraint OR the list — but never leave `
        + `them disagreeing: an app value the DB rejects fails partway through a write, and a DB `
        + `value the app omits silently disables a feature (that is how real-estate contracts `
        + `threw on 100% of calls).`,
      ).toEqual([...values].sort());
    });
  }

  it('no oneOf is declared without a database counterpart here', () => {
    const orphans = Object.keys(declared).filter((k) => !DB_ENUMS[k]);
    expect(
      orphans,
      `these narrow a vocabulary nothing pins: ${orphans.join(', ')}. Add the constraint they `
      + `stand for to DB_ENUMS so the next widening cannot pass them by.`,
    ).toEqual([]);
  });
});
