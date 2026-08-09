/**
 * Classify every remaining `toLocale*String()` call site BY THE TYPE OF ITS RECEIVER (#329).
 *
 * The date sweep could only safely touch `new Date(x).toLocale…()`, because a regex cannot tell
 * whether `total.toLocaleString()` is a Date or a number — and turning a number into a date
 * formatter would be a real bug. That left 133 sites untouched and unknowable.
 *
 * They are not unknowable to the compiler. This asks the TypeScript type checker what each
 * receiver actually is, so the remaining sites can be fixed on FACT instead of on a guess.
 *
 * REPORT ONLY — this script never edits. Run it, read the classification, then migrate the
 * confident buckets and hand-review the rest:
 *
 *   node scripts/analyze-locale-calls.mjs            # summary + per-bucket counts
 *   node scripts/analyze-locale-calls.mjs --list     # every call site with its resolved type
 *   node scripts/analyze-locale-calls.mjs --json     # machine-readable, for a migration script
 */
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const METHODS = new Set(['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString']);
const ROOT = process.cwd();

function loadProgram() {
  const configPath = ts.findConfigFile(ROOT, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('tsconfig.json not found');
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configPath));
  return ts.createProgram({ options: parsed.options, rootNames: parsed.fileNames });
}

/**
 * What is this receiver, really?
 *
 * Unions are reported as unions rather than collapsed: `Date | null` is safe to migrate,
 * `number | Date` is not, and flattening them would rebuild the exact ambiguity this exists to
 * remove.
 */
function classify(type, checker) {
  const parts = type.isUnion() ? type.types : [type];
  const names = new Set();
  for (const t of parts) {
    const flags = t.getFlags();
    if (flags & ts.TypeFlags.Null) { names.add('null'); continue; }
    if (flags & ts.TypeFlags.Undefined) { names.add('undefined'); continue; }
    if (flags & (ts.TypeFlags.NumberLike)) { names.add('number'); continue; }
    if (flags & (ts.TypeFlags.BigIntLike)) { names.add('bigint'); continue; }
    if (flags & (ts.TypeFlags.StringLike)) { names.add('string'); continue; }
    if (flags & ts.TypeFlags.Any) { names.add('any'); continue; }
    if (flags & ts.TypeFlags.Unknown) { names.add('unknown'); continue; }
    const sym = t.getSymbol();
    names.add(sym ? sym.getName() : checker.typeToString(t));
  }
  return [...names].sort();
}

/** The bucket decides what a migration may do automatically. */
function bucket(names) {
  const meaningful = names.filter((n) => n !== 'null' && n !== 'undefined');
  if (meaningful.length === 0) return 'empty';
  if (meaningful.every((n) => n === 'Date')) return 'date';
  if (meaningful.every((n) => n === 'number' || n === 'bigint')) return 'number';
  if (meaningful.some((n) => n === 'any' || n === 'unknown')) return 'untyped';
  if (meaningful.length > 1) return 'mixed';
  return 'other';
}

const program = loadProgram();
const checker = program.getTypeChecker();
const findings = [];

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const rel = path.relative(ROOT, sf.fileName).split(path.sep).join('/');
  if (!rel.startsWith('src/')) continue;

  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      METHODS.has(node.expression.name.text)
    ) {
      const receiver = node.expression.expression;
      const type = checker.getTypeAtLocation(receiver);
      const names = classify(type, checker);
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
      findings.push({
        file: rel,
        line: line + 1,
        method: node.expression.name.text,
        receiver: receiver.getText().slice(0, 60),
        type: names.join(' | ') || 'never',
        bucket: bucket(names),
        hasArgs: node.arguments.length > 0,
        snippet: sf.text.slice(node.getStart(), node.getEnd()).replace(/\s+/g, ' ').slice(0, 90),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(findings, null, 2));
  process.exit(0);
}

const byBucket = {};
for (const f of findings) {
  const key = `${f.bucket}${f.hasArgs ? ' (has options)' : ''}`;
  (byBucket[key] ??= []).push(f);
}

console.log(`\n${findings.length} toLocale*String call sites under src/\n`);
console.log('bucket                        count   safe to migrate automatically?');
console.log('─'.repeat(78));
const VERDICT = {
  date: 'YES → formatDate()',
  number: 'YES → formatNumber()',
  'date (has options)': 'no — caller wants a specific shape',
  'number (has options)': 'no — caller wants a specific shape',
  untyped: 'NO — any/unknown, read each one',
  mixed: 'NO — union of kinds, read each one',
  other: 'NO — read each one',
  empty: 'NO — resolves to nothing, read each one',
};
for (const [k, v] of Object.entries(byBucket).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${k.padEnd(30)}${String(v.length).padStart(5)}   ${VERDICT[k] ?? 'no — read each one'}`);
}

if (process.argv.includes('--list')) {
  for (const [k, v] of Object.entries(byBucket).sort()) {
    console.log(`\n── ${k} ──`);
    for (const f of v) console.log(`  ${f.file}:${f.line}  [${f.type}]  ${f.snippet}`);
  }
}
console.log('');
