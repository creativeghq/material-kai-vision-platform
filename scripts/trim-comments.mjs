#!/usr/bin/env node
/**
 * Cut every over-budget comment down to its opening paragraph plus its `@tag` lines.
 *
 * Usage: node scripts/trim-comments.mjs [--dry-run] [--list] [path ...]
 *
 * The removed text is not lost — it is in git history. What it is no longer doing is occupying
 * the reader's screen and every context window that ever loads the file.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import {
  MAX_PROSE_LINES, findOverBudget, collapseContent, renderComment,
  isGeneratedFile, scanComments, walkRepo, SCAN_SKIP_DIRS, SCAN_EXT,
} from './lib/commentBudget.mjs';

const ROOT = process.cwd();
const SKIP_DIR = SCAN_SKIP_DIRS;
const EXT = SCAN_EXT;

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry-run');
const LIST = argv.includes('--list');
const roots = argv.filter((a) => !a.startsWith('--'));

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIR.has(e)) continue;
    const p = join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXT.has(extname(e))) out.push(p);
  }
  return out;
}

/** The file with every comment removed. Two versions of this must match, or the splice was wrong. */
function codeOnly(text, fileName) {
  const parts = [];
  let last = 0;
  for (const c of scanComments(text, fileName)) {
    parts.push(text.slice(last, c.start));
    last = c.end;
  }
  parts.push(text.slice(last));
  return parts.join('').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n');
}

function syntaxOk(file, text) {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX
    : file.endsWith('.jsx') ? ts.ScriptKind.JSX
      : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, kind);
  const diags = sf.parseDiagnostics || [];
  return diags.length === 0;
}

const targets = roots.length
  ? roots.flatMap((r) => {
    const abs = resolve(ROOT, r);
    try { return statSync(abs).isDirectory() ? walk(abs) : [abs]; } catch { return []; }
  })
  : await walkRepo(ROOT);

let changedFiles = 0;
let trimmed = 0;
let linesSaved = 0;
let skippedGenerated = 0;
const refused = [];

for (const file of targets) {
  const rel = relative(ROOT, file).split(sep).join('/');
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }
  if (isGeneratedFile(rel, src)) { skippedGenerated++; continue; }

  const offenders = findOverBudget(src, rel);
  if (!offenders.length) continue;

  if (LIST) {
    for (const o of offenders) console.log(`${o.prose}\t${rel}:${o.line}`);
    trimmed += offenders.length;
    continue;
  }

  const eol = src.includes('\r\n') ? '\r\n' : '\n';
  let out = src;
  let fileTrimmed = 0;
  let fileLines = 0;

  for (const o of [...offenders].sort((a, b) => b.start - a.start)) {
    const lineStart = out.lastIndexOf('\n', o.start - 1) + 1;
    // A JSX comment opens after a `{`. Blank it rather than repeating it on every wrapped line,
    // which would emit a second brace and change the code.
    const indent = out.slice(lineStart, o.start).replace(/\S/g, ' ');
    const jsdoc = o.raw.startsWith('/**');
    const marker = o.raw.trimStart().startsWith('//:') ? '//:' : '//';
    const rendered = renderComment(collapseContent(o.content, MAX_PROSE_LINES), {
      kind: o.kind, indent, jsdoc, marker,
    });
    const before = o.raw.split(/\r?\n/).length;
    if (rendered === null) {
      // Nothing survived the cut: drop the comment and the line it sat on.
      const after = out.indexOf('\n', o.end);
      out = out.slice(0, lineStart) + (after === -1 ? '' : out.slice(after + 1));
      fileTrimmed++; fileLines += before;
      continue;
    }
    const body = rendered.split('\n').join(eol).slice(indent.length);
    out = out.slice(0, o.start) + body + out.slice(o.end);
    fileTrimmed++;
    fileLines += before - rendered.split('\n').length;
  }

  if (out === src) continue;
  if (codeOnly(out, rel) !== codeOnly(src, rel)) { refused.push(`${rel} (code changed)`); continue; }
  if (!syntaxOk(file, out)) { refused.push(`${rel} (syntax)`); continue; }

  if (!DRY) writeFileSync(file, out, 'utf8');
  changedFiles++;
  trimmed += fileTrimmed;
  linesSaved += fileLines;
}

if (LIST) {
  console.error(`\n${trimmed} comments over ${MAX_PROSE_LINES} prose lines.`);
} else {
  console.log(`${DRY ? '[dry-run] ' : ''}files ${changedFiles}, comments trimmed ${trimmed}, lines removed ${linesSaved}, generated skipped ${skippedGenerated}`);
  if (refused.length) {
    console.log(`REFUSED ${refused.length} file(s) — left untouched:`);
    for (const r of refused) console.log('  ' + r);
  }
}
