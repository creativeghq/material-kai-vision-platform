import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Guards one ES-module footgun that typechecks clean and explodes at runtime. */
const ROOTS = ['src', 'supabase/functions'];

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: ReturnType<typeof readdirSync>;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('re-exported symbols are also imported when the module uses them', () => {
  it('no module calls a symbol it only re-exports', () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        const src = readFileSync(file, 'utf8');
        const re = /^export\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"]/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const names = m[1]
            .split(',')
            .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
            .filter((n) => n && n !== 'default' && n !== 'type' && /^[A-Za-z_$][\w$]*$/.test(n));

          // The rest of the file, with this one statement removed.
          const body = src.slice(0, m.index) + src.slice(m.index + m[0].length);

          for (const n of names) {
            // A real local `import { n } from …` elsewhere means the binding exists.
            const imported = new RegExp(
              String.raw`import\s*(?:type\s*)?\{[^}]*\b${n}\b[^}]*\}\s*from`,
            ).test(body);
            // Called as a function — the shape that actually throws.
            const called = new RegExp(String.raw`\b${n}\s*\(`).test(body);
            if (called && !imported) {
              offenders.push(`${file}: re-exports \`${n}\` and calls it without importing it`);
            }
          }
        }
      }
    }

    expect(
      offenders,
      'These modules re-export a symbol with `export … from` and then CALL it. That forwards the '
        + 'binding to consumers but creates none locally, so the call is a runtime ReferenceError '
        + 'that typechecks clean.\nFix: add `import { X } from "…"` and re-export the local '
        + `binding.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
