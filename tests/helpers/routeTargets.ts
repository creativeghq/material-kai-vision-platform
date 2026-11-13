import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { readSource, blankedSource } from './sourceIndex';

const ROOT = process.cwd();

export function resolveSpec(spec: string, fromFile: string, name?: string): string | null {
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null;
  const base = spec.startsWith('@/') ? join(ROOT, 'src', spec.slice(2)) : resolve(dirname(fromFile), spec);
  for (const c of [base + '.tsx', base + '.ts', join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(c)) return followBarrel(c, name);
  }
  return null;
}

function followBarrel(file: string, name?: string, hops = 0): string {
  if (hops > 3) return file;
  const src = readSource(file);
  if (src.split('\n').filter((l) => l.trim()).length > 6) return file;
  for (const m of src.matchAll(/export\s+\{([^}]+)\}\s+from\s+'([^']+)'/g)) {
    const names = m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()!.trim());
    if (name && !names.includes(name)) continue;
    const base = m[2].startsWith('@/') ? join(ROOT, 'src', m[2].slice(2)) : resolve(dirname(file), m[2]);
    for (const c of [base + '.tsx', base + '.ts', join(base, 'index.tsx')]) {
      if (existsSync(c)) return followBarrel(c, name, hops + 1);
    }
  }
  return file;
}

export function importMap(file: string): Map<string, string> {
  const src = readSource(file);
  const map = new Map<string, string>();
  for (const m of src.matchAll(/import\s+(?:\{([^}]+)\}|([A-Za-z0-9_]+))\s+from\s+'([^']+)'/g)) {
    if (m[2]) map.set(m[2], m[3]);
    if (m[1]) for (const raw of m[1].split(',')) {
      const n = raw.trim().split(/\s+as\s+/).pop()!.trim();
      if (n) map.set(n, m[3]);
    }
  }
  for (const m of src.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function routeTable(): { patterns: Set<string>; pageFor: Map<string, string> } {
  const patterns = new Set<string>();
  const pageFor = new Map<string, string>();

  const appFile = join(ROOT, 'src/App.tsx');
  const app = readSource(appFile);
  const appImports = importMap(appFile);
  for (const m of app.matchAll(/path="([^"]+)"/g)) patterns.add(m[1]);
  for (const m of app.matchAll(/path="([^"]+)"([\s\S]{0,900}?)(?=\n\s*(?:<Route|path="))/g)) {
    if (pageFor.has(m[1])) continue;
    const leaves = (m[2].match(/<([A-Z][A-Za-z0-9_]*)\s*\/>/g) ?? [])
      .map((s) => s.replace(/[<>/\s]/g, '')).reverse();
    for (const c of leaves) {
      const spec = appImports.get(c);
      const f = spec && resolveSpec(spec, appFile, c);
      if (f) { pageFor.set(m[1], f); break; }
    }
  }

  for (const dir of readdirSync(join(ROOT, 'src/modules'))) {
    const file = join(ROOT, 'src/modules', dir, 'index.ts');
    if (!existsSync(file)) continue;
    const src = readSource(file);
    const imports = importMap(file);
    for (const m of src.matchAll(/path:\s*'([^']+)'/g)) patterns.add(m[1]);
    for (const m of src.matchAll(/path:\s*'([^']+)'[\s\S]{0,200}?component:\s*([A-Za-z0-9_]+)/g)) {
      if (pageFor.has(m[1])) continue;
      const spec = imports.get(m[2]);
      const f = spec && resolveSpec(spec, file, m[2]);
      if (f) pageFor.set(m[1], f);
    }
  }
  return { patterns, pageFor };
}

const table = routeTable();
export const ROUTES = table.patterns;
export const PAGE_FOR = table.pageFor;

export function routeExists(urlPath: string): boolean {
  const segs = urlPath.split('/').filter(Boolean);
  for (const r of ROUTES) {
    if (!r.startsWith('/')) continue;
    const rs = r.split('/').filter(Boolean);
    if (rs[rs.length - 1] === '*') {
      if (segs.length >= rs.length - 1 && rs.slice(0, -1).every((s, i) => s.startsWith(':') || s === segs[i])) return true;
      continue;
    }
    if (rs.length !== segs.length) continue;
    if (rs.every((s, i) => s.startsWith(':') || s === segs[i])) return true;
  }
  return false;
}

const tabCache = new Map<string, Set<string>>();

const constCache = new Map<string, Map<string, Map<string, string>>>();
function constMembers(file: string): Map<string, Map<string, string>> {
  if (constCache.has(file)) return constCache.get(file)!;
  const out = new Map<string, Map<string, string>>();
  const src = blankedSource(file);
  for (const m of src.matchAll(/export\s+const\s+([A-Z][A-Z0-9_]*)\s*=\s*\{([\s\S]*?)\}\s*as\s+const/g)) {
    const members = new Map<string, string>();
    for (const f of m[2].matchAll(/([A-Za-z0-9_]+)\s*:\s*'([^']*)'/g)) members.set(f[1], f[2]);
    out.set(m[1], members);
  }
  constCache.set(file, out);
  return out;
}

function resolveConstRef(file: string, name: string, member: string): string | undefined {
  const own = constMembers(file).get(name)?.get(member);
  if (own !== undefined) return own;
  const spec = importMap(file).get(name);
  const target = spec && resolveSpec(spec, file, name);
  return target ? constMembers(target).get(name)?.get(member) : undefined;
}

function catalogValues(file: string): Set<string> {
  const src = readSource(file);
  const keys = new Set<string>();
  for (const m of src.matchAll(/value:\s*'([A-Za-z0-9_-]+)'/g)) keys.add(m[1]);
  for (const m of src.matchAll(/value:\s*([A-Z][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)/g)) {
    const v = resolveConstRef(file, m[1], m[2]);
    if (v) keys.add(v);
  }
  return keys;
}

function tabKeys(file: string, depth = 0, seen = new Set<string>(), followDelegation = true): Set<string> {
  if (seen.has(file) || depth > 2) return new Set();
  seen.add(file);
  const src = readSource(file);
  const keys = new Set<string>();
  for (const m of src.matchAll(/<TabsContent\s+[^>]*value="([^"]+)"/g)) keys.add(m[1]);
  if (src.includes('<HqTabbedPage')) {
    for (const m of src.matchAll(/\{\s*id:\s*'([A-Za-z0-9_-]+)',\s*label:/g)) keys.add(m[1]);
  }
  for (const m of src.matchAll(/<TabsContent\s+[^>]*value=\{([A-Z][A-Za-z0-9_]*)\.([A-Za-z0-9_]+)\}/g)) {
    const v = resolveConstRef(file, m[1], m[2]);
    if (v) keys.add(v);
  }
  if (/<TabsContent\s+[^>]*value=\{/.test(src)) {
    for (const k of catalogValues(file)) keys.add(k);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveSpec(m[1], file);
      if (!r) continue;
      for (const k of tabKeys(r, depth + 1, seen)) keys.add(k);
      for (const k of catalogValues(r)) keys.add(k);
    }
  }
  if (keys.size === 0 && followDelegation) {
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const r = resolveSpec(m[1], file);
      if (r) for (const k of tabKeys(r, depth + 1, seen)) keys.add(k);
    }
  }
  return keys;
}

const ownTabCache = new Map<string, Set<string>>();
export function ownTabsFor(file: string): Set<string> {
  if (!ownTabCache.has(file)) ownTabCache.set(file, tabKeys(file, 0, new Set(), false));
  return ownTabCache.get(file)!;
}

export function tabsFor(file: string): Set<string> {
  if (!tabCache.has(file)) tabCache.set(file, tabKeys(file));
  return tabCache.get(file)!;
}
