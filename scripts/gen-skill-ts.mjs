#!/usr/bin/env node
/**
 * Regenerate every `_shared/skills/<slug>/skill.ts` from its `SKILL.md`.
 *
 * WHY THE TWINS EXIST. The Supabase Edge Runtime's Deno build does not enable
 * `--unstable-raw-imports`, so a skill's markdown cannot be imported as markdown. SKILL.md is the
 * copy humans review; skill.ts is the copy that ships. They were kept in sync by hand, which means
 * the reviewed text and the served text were free to diverge with nothing to notice.
 * `tests/unit/skillsRegistry.test.ts` now fails when they differ — run this, do not hand-edit the .ts.
 *
 * WHY NOT `String.raw`. String.raw preserves the backslash of an escaped backtick, so a skill
 * written that way serves \`material_search\` to the model instead of `material_search`. Three of
 * these skills shipped that way; the same test pins the plain template literal.
 *
 *   node scripts/gen-skill-ts.mjs            # all skills
 *   node scripts/gen-skill-ts.mjs <dir>...   # specific skill directories
 */
import fs from 'node:fs';
import path from 'node:path';

const SKILLS = path.join(process.cwd(), 'supabase/functions/_shared/skills');

const NOTE = [
  '//',
  '// Generated from SKILL.md by scripts/gen-skill-ts.mjs — edit the markdown, not this file.',
  '// A plain template literal, not String.raw: String.raw keeps the backslash of an escaped',
  '// backtick, so the text the model reads comes out as \\`tool_name\\` rather than `tool_name`.',
].join('\n');

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
  // script has no way to know — and only append the provenance note when it is not there yet.
  let header = existing ? existing.slice(0, existing.indexOf('export default')).trimEnd() : '';
  if (!header) header = `// Source of truth for the ${path.basename(dir)} skill.`;
  if (!header.includes('Generated from SKILL.md')) header += `\n${NOTE}`;

  fs.writeFileSync(out, `${header}\n\nexport default \`${escaped}\`;\n`, 'utf8');
  console.log('✎', path.relative(process.cwd(), out).replace(/\\/g, '/'));
}
