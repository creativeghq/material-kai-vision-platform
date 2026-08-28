/**
 * Emit the SQL twin of `transliterateGreek` from the SAME mapping table the TypeScript uses.
 *
 * WHY GENERATED RATHER THAN HAND-WRITTEN. The transliteration has to exist in both runtimes:
 * the searchable column is GENERATED (so, SQL) and the query pattern is built in the browser
 * (so, TypeScript). That is the split `crm_fold` / `foldForSearch` already live with — and they
 * are hand-kept twins, which is exactly how the three `escapeHtml` copies drifted to three
 * different strengths. A mapping of 41 pairs kept in step by hand would drift on the first
 * addition; a generated one cannot.
 *
 * The output is a committed `.sql` file rather than a direct migration, because the function has
 * to be APPLIED to the database as well as written down. `tests/unit/greekTransliterationParity.test.ts`
 * fails when the committed file no longer matches the source, which is the prompt to regenerate
 * AND re-apply.
 *
 * Regenerate: npm run crm:translit-sql
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'src/services/crm/greekTransliteration.ts';
const TARGET = 'supabase/sql/crm_translit.generated.sql';

/**
 * Read the two mapping tables out of the TypeScript source AS DATA.
 *
 * Parsed rather than imported so this script stays runnable without a TS toolchain, and so the
 * parity test can use the identical parse to compare the two sides.
 */
export function readMappings(sourceText) {
  const grab = (name) => {
    const m = sourceText.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
    if (!m) throw new Error(`${name} not found in ${SOURCE} — did the declaration move?`);
    return [...m[1].matchAll(/\[\s*'([^']+)'\s*,\s*'([^']*)'\s*\]/g)].map((x) => [x[1], x[2]]);
  };
  return { digraphs: grab('GREEK_DIGRAPHS'), letters: grab('GREEK_LETTERS') };
}

/** `replace(replace(... $1 ...))`, innermost first, digraphs before single letters. */
export function buildSql({ digraphs, letters }) {
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  // Applied in source order, so the expression nests with the FIRST pair innermost.
  let expr = '$1';
  for (const [from, to] of [...digraphs, ...letters]) {
    expr = `replace(${expr}, ${q(from)}, ${q(to)})`;
  }
  return `-- GENERATED from ${SOURCE} — do not edit here.
-- Regenerate: npm run crm:translit-sql. Parity is enforced by
-- tests/unit/greekTransliterationParity.test.ts, which compares the mapping in this file
-- against the mapping in the TypeScript source as DATA.
--
-- Greek -> Latin transliteration for SEARCH ONLY. Expects already-folded input (crm_fold):
-- lowercased, accents stripped, final sigma normalised. Lossy on purpose — the Greek
-- homophones eta/iota/upsilon/oi/ei all become 'i', because someone typing by ear must still
-- find the record. Never display this, never store it as a name.
CREATE OR REPLACE FUNCTION public.crm_translit(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  SELECT ${expr}
$function$;
`;
}

const sourceText = readFileSync(join(root, SOURCE), 'utf8');
const sql = buildSql(readMappings(sourceText));

if (process.argv.includes('--check')) {
  const current = readFileSync(join(root, TARGET), 'utf8');
  if (current !== sql) {
    console.error(`${TARGET} is stale. Run: npm run crm:translit-sql`);
    process.exit(1);
  }
  console.log('crm_translit SQL is in sync with the TypeScript source.');
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(join(root, TARGET), sql, 'utf8');
  console.log(`Wrote ${TARGET} from ${SOURCE}.`);
}
