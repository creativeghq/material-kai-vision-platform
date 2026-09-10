#!/usr/bin/env node
/** Safe wrapper around `supabase gen types typescript`. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TARGET = 'src/integrations/supabase/types.ts';
const PROJECT_REF = 'bgbavxtjlbvgplozizxu';

/** Pick the auth path when the caller gave none. */
function defaultArgs() {
  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (dbUrl) return ['--db-url', dbUrl];
  if (process.env.SUPABASE_ACCESS_TOKEN) return ['--project-id', PROJECT_REF];
  console.error('✖ No way to reach the database.');
  console.error('  Set ONE of these and re-run:');
  console.error('    SUPABASE_DB_URL   a Postgres connection string (Dashboard → Connect → ORMs).');
  console.error('                      Preferred: no personal token involved.');
  console.error('    SUPABASE_ACCESS_TOKEN  a personal access token, for the Management API.');
  console.error('  Or pass the path explicitly:');
  console.error('    node scripts/gen-types.mjs --db-url "postgresql://…"');
  console.error('    node scripts/gen-types.mjs --local');
  process.exit(2);
}

const passed = process.argv.slice(2);

if (passed.includes('--help')) {
  console.error('usage: node scripts/gen-types.mjs [--db-url <url> | --project-id <ref> | --local]');
  console.error('  With no arguments: uses SUPABASE_DB_URL if set, else SUPABASE_ACCESS_TOKEN.');
  process.exit(2);
}

const args = passed.length > 0 ? passed : defaultArgs();

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
