import { readFileSync } from 'node:fs';
import { globSync } from 'glob';

const SERVICE_GLOBS = ['src/services/**/*.ts', 'src/modules/**/services/**/*.ts'];
const CONSUMER_GLOBS = ['src/**/*.{ts,tsx}', 'supabase/functions/**/*.ts', 'tests/**/*.ts', 'api/**/*.js'];
const norm = (p) => p.split(String.fromCharCode(92)).join('/');

const serviceFiles = [...new Set(SERVICE_GLOBS.flatMap((g) => globSync(g, { nodir: true })))]
  .map(norm).filter((p) => !p.endsWith('.d.ts'));

const DEF = /^  (?:(?:public|private|protected)\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*(?:\(|:\s*(?:async\s*)?\()/;
const SKIP = new Set(['if','for','while','switch','catch','return','constructor','function']);
const defs = [];
for (const f of serviceFiles) {
  const lines = readFileSync(f, 'utf8').split('\n');
  lines.forEach((l, i) => {
    const m = DEF.exec(l);
    if (!m || SKIP.has(m[1])) return;
    defs.push({ file: f, name: m[1], line: i + 1 });
  });
}

const consumers = [...new Set(CONSUMER_GLOBS.flatMap((g) => globSync(g, { nodir: true })))].map(norm);
const blob = new Map();
for (const f of consumers) blob.set(f, readFileSync(f, 'utf8'));

export function findUnreachableServiceMethods() {
  const dead = [];
  for (const d of defs) {
    // A method is reached if its name is CALLED (`.name(`), passed as a value, or named as a
    // string key -- an agent tool or a dispatch table addresses it that way.
    const q = String.fromCharCode(39, 34, 96);
    const needle = new RegExp(
      '[.]' + d.name + '\\s*[(]'
      + '|\\b' + d.name + '\\s*[,}\\]]'
      + '|[' + q + ']' + d.name + '[' + q + ']');
    let hit = false;
    for (const [f, txt] of blob) {
      if (!txt.includes(d.name)) continue;
      if (f === d.file) {
        const others = txt.split('\n').filter((l, i) => i + 1 !== d.line && needle.test(l));
        if (others.length) { hit = true; break; }
        continue;
      }
      if (needle.test(txt)) { hit = true; break; }
    }
    if (!hit) dead.push(d.file + ':' + d.name);
  }
  return dead.sort();
}
