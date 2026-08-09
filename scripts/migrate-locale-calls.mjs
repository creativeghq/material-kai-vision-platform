/**
 * Migrate the call sites `analyze-locale-calls.mjs` proved safe (#329).
 *
 * Type-driven, not regex-driven. Every edit is made at a node range the TypeScript compiler
 * resolved, and ONLY for receivers it typed unambiguously:
 *
 *   Date   with no arguments → formatDate(x)   /  formatDate(x, { withTime: true })
 *   number with no arguments → formatNumber(x)
 *
 * Anything else — options objects (the caller wanted a specific shape), `any`/`unknown`, or a
 * union of kinds — is skipped and printed, because those need a human.
 *
 * This is what the earlier regex sweep could not do. That pass turned `new Date()` into
 * `formatDate()`, left a trailing comma inside a multi-line call, and rewrote a local wrapper into
 * a call to itself. Editing by resolved node range removes all three failure modes: the range is
 * exactly the call, so there is no paren-matching to get wrong.
 *
 *   node scripts/migrate-locale-calls.mjs --dry     # show what would change
 *   node scripts/migrate-locale-calls.mjs --write   # apply
 */
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const WRITE = process.argv.includes('--write');
const METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const ROOT = process.cwd();

const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
const program = ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
const checker = program.getTypeChecker();

function kindOf(type) {
  const parts = type.isUnion() ? type.types : [type];
  const names = new Set();
  for (const t of parts) {
    const f = t.getFlags();
    if (f & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)) continue;
    if (f & ts.TypeFlags.NumberLike) { names.add('number'); continue; }
    if (f & ts.TypeFlags.BigIntLike) { names.add('number'); continue; }
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) { names.add('untyped'); continue; }
    const s = t.getSymbol();
    names.add(s ? s.getName() : 'other');
  }
  if (names.size !== 1) return null;
  const [only] = names;
  return only === 'Date' || only === 'number' ? only : null;
}

const edits = new Map();   // file -> [{start, end, text}]
const needs = new Map();   // file -> Set('formatDate'|'formatNumber')
const skipped = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = path.relative(ROOT, sf.fileName).split(path.sep).join('/');
  if (!rel.startsWith('src/')) continue;
  if (rel === 'src/utils/decimal.ts' || rel === 'src/utils/datetime.ts') continue;

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      METHODS.has(node.expression.name.text)
    ) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      const kind = kindOf(checker.getTypeAtLocation(receiver));
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      const where = `${rel}:${line + 1}`;

      if (node.expression.questionDotToken || node.questionDotToken) {
        // `x?.toLocaleString()` yields UNDEFINED when x is nullish, and several sites lean on
        // that: `x?.toLocaleString() || 0` renders 0. formatNumber returns '—' instead, which is
        // truthy, so the fallback would stop firing and the screen would show a dash where it
        // shows a zero today. A human decides between `x ?? 0` and keeping the guard.
        skipped.push(`${where}  optional chaining — nullish currently renders as the caller's fallback`);
      } else if (node.arguments.length > 0) {
        skipped.push(`${where}  has options — caller wants a specific shape`);
      } else if (method === 'toLocaleTimeString') {
        skipped.push(`${where}  time-only — formatDate has no time-only mode`);
      } else if (kind === 'Date') {
        const opts = method === 'toLocaleString' ? ', { withTime: true }' : '';
        (edits.get(rel) ?? edits.set(rel, []).get(rel)).push({
          start: node.getStart(), end: node.getEnd(),
          text: `formatDate(${receiver.getText()}${opts})`,
        });
        (needs.get(rel) ?? needs.set(rel, new Set()).get(rel)).add('formatDate');
      } else if (kind === 'number' && method === 'toLocaleString') {
        (edits.get(rel) ?? edits.set(rel, []).get(rel)).push({
          start: node.getStart(), end: node.getEnd(),
          text: `formatNumber(${receiver.getText()})`,
        });
        (needs.get(rel) ?? needs.set(rel, new Set()).get(rel)).add('formatNumber');
      } else {
        skipped.push(`${where}  receiver is ${checker.typeToString(checker.getTypeAtLocation(receiver))} — read it`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** Insert after the last COMPLETE top-level import, never inside a multi-line one. */
function addImport(src, names) {
  let out = src;
  for (const [name, module] of [['formatDate', '@/utils/datetime'], ['formatNumber', '@/utils/decimal']]) {
    if (!names.has(name)) continue;
    const already = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '${module}'`);
    if (already.test(out)) continue;
    const existing = new RegExp(`import \\{([^}]*)\\} from '${module}';`);
    const m = out.match(existing);
    if (m) {
      out = out.replace(existing, `import {${m[1].replace(/\s+$/, '')}, ${name} } from '${module}';`);
      continue;
    }
    const ends = [...out.matchAll(/^import [^\n]*?;[ \t]*$/gm)].map((mm) => mm.index + mm[0].length);
    const at = ends.length ? Math.max(...ends) : 0;
    out = out.slice(0, at) + `\nimport { ${name} } from '${module}';` + out.slice(at);
  }
  return out;
}

let total = 0;
for (const [rel, list] of edits) {
  let src = readFileSync(rel, 'utf8');
  // Descending, so each replacement leaves earlier offsets valid.
  for (const e of list.sort((a, b) => b.start - a.start)) {
    src = src.slice(0, e.start) + e.text + src.slice(e.end);
    total++;
  }
  src = addImport(src, needs.get(rel));
  if (WRITE) writeFileSync(rel, src);
}

console.log(`\n${WRITE ? 'APPLIED' : 'DRY RUN'} — ${total} call sites in ${edits.size} files`);
console.log(`skipped for human review: ${skipped.length}`);
if (!WRITE) for (const s of skipped.slice(0, 50)) console.log('  ' + s);
console.log('');
