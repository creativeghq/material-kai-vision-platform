#!/usr/bin/env node
/**
 * Prove a working-tree change touched COMMENTS ONLY, by comparing each modified file's
 * comment-stripped source against the same file at HEAD.
 *
 * Usage: node scripts/verify-comment-only.mjs [--normalize-eol] [--print-comment-only]
 *
 * A shared checkout means someone else's real edit can land in the same sweep; this is what
 * separates the two so their work is not committed under a comment-cleanup message.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { scanComments } from './lib/commentBudget.mjs';

const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const NORMALIZE = process.argv.includes('--normalize-eol');

function codeOnly(text) {
  const parts = [];
  let last = 0;
  for (const c of scanComments(text)) {
    parts.push(text.slice(last, c.start));
    last = c.end;
  }
  return parts.concat(text.slice(last)).join('')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * The line ending a file is STORED with. Worktree CRLF against an LF blob stages as a
 * whole-file rewrite, which would bury a comment diff completely.
 */
function dominantEol(text) {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/\n/g) || []).length - crlf;
  return crlf > lf ? '\r\n' : '\n';
}

const changed = execSync('git diff --name-only --diff-filter=M', { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter(Boolean);

const commentOnly = [];
const hasCode = [];
const skipped = [];
let renormalized = 0;

for (const file of changed) {
  if (!EXT.has(extname(file))) { skipped.push(file); continue; }
  let head;
  try {
    head = execSync(`git show HEAD:${JSON.stringify(file)}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch { skipped.push(file); continue; }
  const now = readFileSync(file, 'utf8');
  const same = codeOnly(head) === codeOnly(now);
  (same ? commentOnly : hasCode).push(file);

  if (NORMALIZE && same) {
    const want = dominantEol(head);
    const fixed = now.replace(/\r\n/g, '\n').replace(/\n/g, want);
    if (fixed !== now) { writeFileSync(file, fixed, 'utf8'); renormalized++; }
  }
}

console.log(`comment-only: ${commentOnly.length}`);
console.log(`CODE CHANGED: ${hasCode.length}`);
for (const f of hasCode) console.log('  ' + f);
if (skipped.length) {
  console.log(`not scannable: ${skipped.length}`);
  for (const f of skipped) console.log('  ' + f);
}
if (NORMALIZE) console.log(`line endings realigned to the index: ${renormalized}`);

if (process.argv.includes('--print-comment-only')) {
  for (const f of commentOnly) console.log('OK\t' + f);
}
