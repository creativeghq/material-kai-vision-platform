/**
 * Map every prompt row to the files that actually READ it (#347 phase 3P).
 *
 * This is what makes `ops.prompt_never_read` trustworthy. An earlier attempt grepped for the
 * category STRING and was rejected: matching 'interior-designer' finds every UI file that names
 * the agent, not the files that load its prompt — it would have fabricated the very claim the
 * probe verifies.
 *
 * That attempt failed because most prompts were not loaded by an explicit call at all; they were
 * hardcoded. Now that every prompt comes through a loader with LITERAL (type, category)
 * arguments, the call sites are the evidence, and this reads them out of the AST.
 *
 * Emits SQL to stdout. A row with no reader after this is genuinely unread.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deno loaders: fn name -> how to read (promptType, category) from the arg list.
 *
 * `Object.create(null)`, not `{}`, and the lookup below uses `Object.hasOwn`. With a plain object
 * literal, `TS_LOADERS[fn]` inherits from `Object.prototype` — so a call ending in `.toString`
 * (`validateUrl.toString()`, `searchUrl.toString()`) resolves to a real function, gets invoked as
 * `Object.prototype.toString.call(args)`, returns the string `"[object Array]"`, and destructuring
 * a STRING yields its characters: prompt_type `"["`, category `"o"`.
 *
 * That is the exact symptom the `add()` guard below was written against — its comment says "one
 * run produced prompt_type='['" — and this is the cause. The guard caught it, so nothing was ever
 * mis-attributed; what it cost was two lines of stderr on every run, and a guard that looks like
 * it is defending against something mysterious rather than something understood.
 */
const TS_LOADERS = Object.assign(Object.create(null), {
  loadPrompt: (a) => [lit(a[1]), lit(a[2])],
  getToolPrompt: (a) => ['tool', lit(a[1])],
  getAgentSystemPrompt: (a) => ['agent', lit(a[1])],
  getGenerationPrompt: (a) => ['generation', lit(a[1])],
});
/** Python loader: load_prompt(prompt_type, category, stage=...) */
const PY_LOADER = /load_prompt\(\s*["']([\w-]+)["']\s*,\s*["']([\w-]+)["']/g;
/** Python sync cache read: get_cached(prompt_type, category, ...) */
const PY_CACHED = /get_cached\(\s*["']([\w-]+)["']\s*,\s*["']([\w-]+)["']/g;

function lit(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  // `materials_board_${boardMode}` — a computed family. Record the prefix so the family is
  // attributed rather than reported unread.
  if (ts.isTemplateExpression(node)) return node.head.text + '*';
  return null;
}

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (p.includes('node_modules') || p.includes('.git')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js|py)$/.test(name)) out.push(p);
  }
  return out;
}

/** category -> Set(file) */
const readers = new Map();
/**
 * Plausible `prompt_type` values. Anything else means the extractor mis-read a call, and a bogus
 * key would write `used_in` onto nothing while looking like coverage.
 *
 * MIRRORS `select distinct prompt_type from public.prompts` — there is no CHECK constraint, so
 * that column IS the vocabulary and this is a hand-kept copy of it. It had drifted: `embed` and
 * `system` are both in use and were both missing here, so every loader call for them was silently
 * dropped and their prompts would have read as never-read forever.
 *
 * The drift is self-reporting, which is why it was findable: a type missing from this list gives
 * its prompts no reader, and `ops.prompt_never_read` fires on exactly that. Re-derive the list
 * with the query above when adding a type.
 */
const PROMPT_TYPES = new Set(['agent', 'tool', 'generation', 'extraction', 'classification',
  'search', 'template', 'chat_starter', 'embed', 'system']);

const add = (type, category, file) => {
  if (!type || !category) return;
  if (!PROMPT_TYPES.has(type)) {
    console.error(`-- ignored: implausible prompt_type ${JSON.stringify(type)} from ${file}`);
    return;
  }
  if (!/^[\w-]+\*?$/.test(category)) {
    console.error(`-- ignored: implausible category ${JSON.stringify(category)} from ${file}`);
    return;
  }
  const key = type + String.fromCharCode(0) + category;
  if (!readers.has(key)) readers.set(key, new Set());
  readers.get(key).add(file.split('\\').join('/'));
};

for (const root of ['supabase/functions', 'api', 'src', 'mivaa-pdf-extractor/app']) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    if (file.endsWith('.py')) {
      for (const re of [PY_LOADER, PY_CACHED]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src))) add(m[1], m[2], file);
      }
      continue;
    }
    if (!/loadPrompt|getToolPrompt|getAgentSystemPrompt|getGenerationPrompt/.test(src)) continue;
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const visit = (n) => {
      if (ts.isCallExpression(n)) {
        const fn = n.expression.getText().split('.').pop();
        // `hasOwn` as well as the null prototype: belt and braces, because the failure mode is a
        // silent mis-read rather than an error.
        const reader = Object.hasOwn(TS_LOADERS, fn) ? TS_LOADERS[fn] : null;
        if (reader) {
          const [type, category] = reader(n.arguments);
          add(type, category, file);
        }
      }
      ts.forEachChild(n, visit);
    };
    ts.forEachChild(sf, visit);
  }
}

const q = (s) => `'${String(s).split("'").join("''")}'`;
const rows = [];
let exact = 0, families = 0;
for (const [key, files] of [...readers.entries()].sort()) {
  const [type, category] = key.split(String.fromCharCode(0));
  const arr = `array[${[...files].sort().map(q).join(', ')}]`;
  if (category.endsWith('*')) { families++; rows.push(`(${q(type)}, ${q(category.slice(0, -1) + '%')}, true, ${arr})`); }
  else { exact++; rows.push(`(${q(type)}, ${q(category)}, false, ${arr})`); }
}
console.error(`${exact} exact keys, ${families} computed families, ${readers.size} total`);
console.log(`update public.prompts p set used_in = r.files
from (values
  ${rows.join(',' + String.fromCharCode(10) + '  ')}
) as r(ptype, cat, is_family, files)
where p.prompt_type = r.ptype
  and (case when r.is_family then p.category like r.cat else p.category = r.cat end)
  and coalesce(array_length(p.used_in, 1), 0) = 0;`);
