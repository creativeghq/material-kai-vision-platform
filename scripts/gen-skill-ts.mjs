#!/usr/bin/env node
/** Regenerate every `_shared/skills/<slug>/skill.ts` from its `SKILL.md`. */
import fs from 'node:fs';
import path from 'node:path';

const SKILLS = path.join(process.cwd(), 'supabase/functions/_shared/skills');

/**
 * The body is emitted as a plain template literal, never `String.raw` — `String.raw` keeps the
 * backslash of an escaped backtick, so the model would read the tool name with backslashes on it.
 */
const MARKER = 'DO NOT EDIT';
const NOTE = `// ${MARKER} — generated from SKILL.md by scripts/gen-skill-ts.mjs. Edit the markdown.`;

/**
 * Provenance lines this script owns, rewritten every run so they cannot accumulate.
 *
 * Matching is per line and the old note wrapped over three of them, so every phrase it could
 * have wrapped onto is listed — a marker that catches only the first line leaves the rest as a
 * dangling fragment, which is exactly what `design-to-quote` ended up carrying.
 */
const OWNED = [
  MARKER, 'Generated from SKILL.md', 'String.raw', 'the model reads', 'template literal',
  'backtick, so', 'keeps the backslash',
];

const targets = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(SKILLS)
    .map((d) => path.join(SKILLS, d))
    .filter((p) => fs.statSync(p).isDirectory());

for (const dir of targets) {
  const md = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  const escaped = md.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

  const out = path.join(dir, 'skill.ts');
  const existing = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
  // Keep whatever explanatory header the file already carries — some of them say things this
  // script has no way to know — but re-own the provenance line rather than appending a second one.
  let header = existing ? existing.slice(0, existing.indexOf('export default')).trimEnd() : '';
  if (!header) header = `// Source of truth for the ${path.basename(dir)} skill.`;
  const kept = header.split('\n').filter((l) => !OWNED.some((m) => l.includes(m)));
  while (kept.length && kept[kept.length - 1].trim().replace(/^\/\/+/, '').trim() === '') kept.pop();
  header = `${kept.join('\n').trimEnd()}\n${NOTE}`;

  fs.writeFileSync(out, `${header}\n\nexport default \`${escaped}\`;\n`, 'utf8');
  console.log('✎', path.relative(process.cwd(), out).replace(/\\/g, '/'));
}
