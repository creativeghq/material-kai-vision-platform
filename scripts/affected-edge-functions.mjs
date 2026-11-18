#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(process.argv[2] ?? '.');
const FN_DIR = join(ROOT, 'supabase', 'functions');
const SPEC = /(['"`])(\.{1,2}\/[^'"`\n$]+?)\1/g;
const toRepo = (abs) => relative(ROOT, abs).split(sep).join('/');

export function listFunctions() {
  return readdirSync(FN_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '_shared' && d.name !== 'node_modules')
    .map((d) => d.name)
    .filter((n) => existsSync(join(FN_DIR, n, 'index.ts')))
    .sort();
}

function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec.split('?')[0]);
  for (const cand of [base, `${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

const importCache = new Map();
function importsOf(file) {
  if (importCache.has(file)) return importCache.get(file);
  const out = [];
  if (/\.(m?[jt]sx?|json)$/.test(file)) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(SPEC)) {
      const hit = resolveSpec(file, m[2]);
      if (hit && !hit.includes(`${sep}node_modules${sep}`)) out.push(hit);
    }
  }
  importCache.set(file, out);
  return out;
}

export function bundleOf(fn) {
  const seen = new Set();
  const queue = [join(FN_DIR, fn, 'index.ts')];
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    queue.push(...importsOf(f));
  }
  return new Set([...seen].map(toRepo));
}

export function affectedFunctions(changed) {
  const all = listFunctions();
  const paths = changed.map((p) => p.trim()).filter(Boolean);
  const global = paths.find((p) => /^supabase\/functions\/(deno\.jsonc?|import_map\.json)$/.test(p));
  if (global) return { functions: all, reasons: { '*': `${global} changed` } };

  const reasons = {};
  const own = new Set(paths.map((p) => /^supabase\/functions\/([^/]+)\//.exec(p)?.[1]).filter(Boolean));
  const fnPaths = paths.filter((p) => p.startsWith('supabase/functions/'));
  for (const fn of all) {
    if (!fnPaths.length) break;
    if (own.has(fn)) { reasons[fn] = 'own files changed'; continue; }
    const bundle = bundleOf(fn);
    const hit = fnPaths.find((p) => bundle.has(p));
    if (hit) reasons[fn] = `imports ${hit}`;
  }
  return { functions: Object.keys(reasons).sort(), reasons };
}

if (process.argv[1]?.endsWith('affected-edge-functions.mjs')) {
  const input = readFileSync(0, 'utf8').split('\n');
  const { functions, reasons } = affectedFunctions(input);
  for (const [fn, why] of Object.entries(reasons)) process.stderr.write(`  ${fn}: ${why}\n`);
  process.stdout.write(functions.join(' '));
}
