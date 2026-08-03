#!/usr/bin/env node
/**
 * Safe wrapper around `supabase gen types typescript`.
 *
 * THE BUG THIS EXISTS FOR: the npm script was
 *
 *     supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
 *
 * The shell truncates the target the moment it opens the redirect — before the CLI has done
 * anything. When the CLI then fails, it prints its error as JSON on stdout, so the redirect
 * happily captures that instead:
 *
 *     {"_tag":"Error","error":{"code":"LegacyPlatformAuthRequiredError","message":"Access token…"}}
 *
 * 217 bytes replacing a 34,000-line file, exit code 1, and `git checkout --` the only way back.
 * That happened on 2026-08-02. A non-zero exit does not undo a redirect.
 *
 * So: generate to a temp file, PROVE the output is a types module, and only then move it into
 * place. A failure now leaves the existing file untouched, which is the whole point.
 *
 * AUTH — you do NOT need a personal access token:
 *   --db-url     reads the database directly (a Postgres connection string). No Management API,
 *                no SUPABASE_ACCESS_TOKEN. This is the path to prefer.
 *   --project-id goes through the Management API, which DOES require SUPABASE_ACCESS_TOKEN (or
 *                `supabase login`). That token is a personal credential — unrelated to the
 *                service-role key and unrelated to whatever deploys the app.
 *   --local      reads a local `supabase start` stack.
 *
 * Nothing in CI regenerates types: `types.ts` is committed source, so pushing or deploying never
 * updates it. It changes only when a human runs this.
 *
 * Usage:
 *   node scripts/gen-types.mjs --db-url "postgresql://…"
 *   node scripts/gen-types.mjs --project-id bgbavxtjlbvgplozizxu   # needs SUPABASE_ACCESS_TOKEN
 *   node scripts/gen-types.mjs --local
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TARGET = 'src/integrations/supabase/types.ts';
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.error('usage: node scripts/gen-types.mjs (--db-url <url> | --project-id <ref> | --local)');
  process.exit(2);
}

const tmp = join(tmpdir(), `supabase-types-${process.pid}.ts`);
let out;
try {
  // Captured, never redirected. The CLI's failure output cannot reach the target this way.
  out = execFileSync('npx', ['supabase', 'gen', 'types', 'typescript', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,   // the real file is ~1.5 MB; leave room to grow
    shell: process.platform === 'win32',
  });
} catch (e) {
  const stdout = (e.stdout || '').toString().trim();
  console.error('✖ supabase gen types failed — the existing file was NOT touched.');
  if (stdout) console.error(stdout.slice(0, 500));
  if (stdout.includes('LegacyPlatformAuthRequiredError')) {
    console.error('\n  --project-id needs a personal access token. Either set SUPABASE_ACCESS_TOKEN,');
    console.error('  run `supabase login`, or avoid it entirely with:');
    console.error('    node scripts/gen-types.mjs --db-url "postgresql://…"');
  }
  process.exit(1);
}

// Prove it is a types module before letting it near the repo. Each check is a way the old script
// could silently write garbage: an error blob, a truncated stream, or a valid-but-empty schema.
const problems = [];
if (out.length < 10_000) problems.push(`output is only ${out.length} bytes`);
if (!out.includes('export type Database')) problems.push('no `export type Database` declaration');
if (!out.includes('invoices:')) problems.push('no `invoices` table — schema looks empty or partial');
if (out.trimStart().startsWith('{')) problems.push('output is JSON, not TypeScript (an error payload)');

if (problems.length) {
  console.error('✖ generated output does not look like a types module — refusing to write it:');
  for (const p of problems) console.error(`    · ${p}`);
  console.error(`\n  first 300 chars:\n${out.slice(0, 300)}`);
  process.exit(1);
}

writeFileSync(tmp, out, 'utf8');
const before = existsSync(TARGET) ? statSync(TARGET).size : 0;
writeFileSync(TARGET, readFileSync(tmp, 'utf8'), 'utf8');
unlinkSync(tmp);

const after = statSync(TARGET).size;
console.log(`✔ ${TARGET}: ${before} → ${after} bytes`);
// A large shrink is legal (someone dropped tables) but is worth a human looking, because the
// failure mode this script exists to prevent looked exactly like a very large shrink.
if (before > 0 && after < before * 0.75) {
  console.warn(`⚠ file shrank by ${Math.round((1 - after / before) * 100)}% — check `
    + '`git diff` before committing.');
}
