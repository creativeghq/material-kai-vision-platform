/**
 * The comment budget: how long a comment may be, in ONE place.
 *
 * Read by the ESLint rule (src/, api/), the guard test (every other runtime) and the
 * `comments:trim` codemod, so the rule that fails a build and the tool that fixes it
 * cannot disagree.
 */

import { createRequire } from 'node:module';

/** Prose lines allowed in one comment. `@tag` lines and their continuations do not count. */
export const MAX_PROSE_LINES = 6;

/** Optional: absent in a bare runtime, and the lexer fallback covers that case. */
const ts = (() => {
  try { return createRequire(import.meta.url)('typescript'); } catch { return null; }
})();

/** Comments carrying one of these are tooling directives, not prose. Never counted, never trimmed. */
const DIRECTIVE =
  /eslint-disable|eslint-enable|@ts-|prettier-ignore|deno-lint-ignore|biome-ignore|@license|@preserve|vitest-environment|jest-environment|<reference\s|@jsx|istanbul ignore|[cv]8 ignore|webpackChunkName|@vite-ignore|@__PURE__|@generated|DO NOT EDIT/i;

const TAG_LINE = /^@[a-zA-Z][\w-]*\b/;

/** A sentence really ending: `.`/`!`/`?` before whitespace. `:` and `;` end a clause, not a thought. */
const SENTENCE_END = /[.!?](?=[\s"'`)\]]|$)/g;

/** A file whose comments a generator owns. Fix the generator, not the output. */
export function isGeneratedFile(relPath, source) {
  if (/\.generated\.[cm]?[jt]sx?$/.test(relPath)) return true;
  if (/(^|[\\/])integrations[\\/]supabase[\\/]types\.ts$/.test(relPath)) return true;
  const head = source.slice(0, 600);
  return /@generated|DO NOT EDIT|auto-?generated/i.test(head);
}

/**
 * Every comment in `text`, as `{ start, end, kind, ownLine }` character ranges.
 *
 * TypeScript's own parser when it is available, because only a real parser knows that `//` in
 * JSX text is not a comment. The lexer below is the fallback and cannot see JSX at all.
 */
export function scanComments(text, fileName = 'file.tsx') {
  // Only a .tsx/.jsx file can hold JSX, and JSX is the one thing the lexer cannot see — so that
  // is the only case worth a parse. Parsing everything cost 50s on the guard test alone.
  if (!ts || !/\.[jt]sx$/.test(fileName)) return scanWithLexer(text);
  let parsed;
  try { parsed = scanWithTypeScript(text, fileName); } catch { return scanWithLexer(text); }

  // The union, because each half misses something the other sees. The parser attaches a comment
  // to a NODE, so `{/* … */}` and a comment alone in an empty block — both attached to a token —
  // are invisible to it; the lexer finds those, and cannot see JSX at all, so a backtick in
  // rendered text desyncs it. `jsxText` is the parser's answer for what is NOT code.
  const merged = new Map();
  for (const c of [...parsed.comments, ...scanWithLexer(text)]) {
    if (parsed.jsxText.some(([from, to]) => c.start >= from && c.start < to)) continue;
    if (!merged.has(c.start)) merged.set(c.start, c);
  }
  return [...merged.values()].sort((a, b) => a.start - b.start);
}

function scriptKindFor(fileName) {
  if (fileName.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (fileName.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (fileName.endsWith('.ts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function scanWithTypeScript(text, fileName) {
  const source = ts.createSourceFile(
    fileName, text, ts.ScriptTarget.Latest, true, scriptKindFor(fileName),
  );
  const found = new Map();
  // `getLeadingCommentRanges` is a LEXICAL scan from an offset, not a contextual one: asked at the
  // start of a JSX child it happily reports rendered text beginning `//` as a comment. Only the
  // parser knows those spans, so collect them and drop anything landing inside one.
  const jsxText = [];
  const add = (ranges) => {
    if (!ranges) return;
    for (const range of ranges) found.set(range.pos, range);
  };
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxText.push([node.getFullStart(), node.getEnd()]);
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    node.forEachChild(visit);
  };
  visit(source);
  if (source.endOfFileToken) add(ts.getLeadingCommentRanges(text, source.endOfFileToken.getFullStart()));

  const comments = [...found.values()]
    .sort((a, b) => a.pos - b.pos)
    .map((range) => ({
      start: range.pos,
      end: range.end,
      kind: range.kind === ts.SyntaxKind.SingleLineCommentTrivia ? 'line' : 'block',
      ownLine: onOwnLine(text, range.pos),
    }));
  return { comments, jsxText };
}

function scanWithLexer(text) {
  const out = [];
  const n = text.length;
  const stack = [{ mode: 'code', brace: 0 }];
  let prevChar = '';
  let prevWord = '';
  let i = 0;

  const top = () => stack[stack.length - 1];
  const regexAllowed = () =>
    prevChar === '' ||
    '([{,;:=!&|?+-*%^~<>'.includes(prevChar) ||
    /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/.test(prevWord);

  while (i < n) {
    const c = text[i];
    const d = i + 1 < n ? text[i + 1] : '';

    if (top().mode === 'template') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; prevChar = '`'; prevWord = ''; continue; }
      if (c === '$' && d === '{') { stack.push({ mode: 'code', brace: 0 }); i += 2; prevChar = '{'; prevWord = ''; continue; }
      i++;
      continue;
    }

    if (c === '/' && d === '/') {
      const start = i;
      while (i < n && text[i] !== '\n') i++;
      out.push({ start, end: i, kind: 'line', ownLine: onOwnLine(text, start) });
      prevChar = ''; prevWord = '';
      continue;
    }
    if (c === '/' && d === '*') {
      const start = i;
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      out.push({ start, end: i, kind: 'block', ownLine: onOwnLine(text, start) });
      prevChar = ''; prevWord = '';
      continue;
    }
    if (c === '"' || c === "'") {
      i++;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === c || text[i] === '\n') { i++; break; }
        i++;
      }
      prevChar = 'x'; prevWord = '';
      continue;
    }
    if (c === '`') { stack.push({ mode: 'template' }); i++; continue; }
    if (c === '/' && regexAllowed()) {
      // A regex literal. Consume it so a `/` inside cannot open a comment.
      let j = i + 1;
      let cls = false;
      let closed = false;
      while (j < n && text[j] !== '\n') {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '[') cls = true;
        else if (text[j] === ']') cls = false;
        else if (text[j] === '/' && !cls) { closed = true; j++; break; }
        j++;
      }
      if (closed) { i = j; prevChar = 'x'; prevWord = ''; continue; }
    }
    if (c === '{') top().brace++;
    else if (c === '}') {
      if (top().brace === 0 && stack.length > 1) { stack.pop(); i++; prevChar = '}'; prevWord = ''; continue; }
      if (top().brace > 0) top().brace--;
    }
    if (!/\s/.test(c)) {
      prevChar = c;
      prevWord = /[\w$]/.test(c) ? prevWord + c : '';
    }
    i++;
  }
  return out;
}

/**
 * Nothing but whitespace before the comment on its line — or a lone `{`, because in JSX an
 * own-line comment is written `{/* … *\/}` and treating that as trailing let essays through.
 */
function onOwnLine(text, start) {
  let k = start - 1;
  let brace = false;
  while (k >= 0 && text[k] !== '\n') {
    const char = text[k];
    if (!/\s/.test(char)) {
      if (char === '{' && !brace) { brace = true; k--; continue; }
      return false;
    }
    k--;
  }
  return true;
}

/**
 * Consecutive own-line `//` comments are ONE comment. Counting them singly is how an
 * eight-line essay written with `//` slips a rule that only looks at block comments.
 */
export function groupComments(text, comments) {
  const groups = [];
  let cur = null;
  const lineOf = buildLineIndex(text);
  for (const c of comments) {
    if (!c.ownLine) continue;
    if (c.kind === 'block') { groups.push({ ...c, parts: [c] }); cur = null; continue; }
    if (cur && lineOf(c.start) === lineOf(cur.end) + 1) {
      cur.end = c.end;
      cur.parts.push(c);
      continue;
    }
    cur = { start: c.start, end: c.end, kind: 'line', ownLine: true, parts: [c] };
    groups.push(cur);
  }
  return groups;
}

function buildLineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo;
  };
}

/** The comment's text with its comment syntax stripped. */
export function contentOf(raw, kind) {
  if (kind === 'line') {
    // `//:` is this codebase's "documents the next declaration" marker (the `#:` of the Python
    // side). Leaving the colon in makes a separator line read as prose and ends up printed.
    return raw.split(/\r?\n/).map((l) => l.trim().replace(/^\/\/+:? ?/, ''));
  }
  const lines = raw.split(/\r?\n/);
  return lines.map((l, k) => {
    let s = l;
    if (k === 0) s = s.replace(/^\s*\/\*+ ?/, '');
    if (k === lines.length - 1) s = s.replace(/\*\/\s*$/, '');
    return s.trim().replace(/^\*+:? ?/, '').trimEnd();
  });
}

export function isDirective(raw) {
  return DIRECTIVE.test(raw);
}

/** Prose lines only: blanks, `@tag` lines and lines continuing a `@tag` are not prose. */
export function proseLineCount(content) {
  let n = 0;
  let inTag = false;
  for (const line of content) {
    const l = line.trim();
    if (!l) { inTag = false; continue; }
    if (TAG_LINE.test(l)) { inTag = true; continue; }
    if (inTag) continue;
    n++;
  }
  return n;
}

/**
 * The comment, cut to budget: its opening paragraph plus every `@tag`.
 *
 * The lead sentence is kept because that is where this codebase states what a thing IS; the
 * supporting essay below it is what git history is for.
 */
export function collapseContent(content, max = MAX_PROSE_LINES) {
  const prose = [];
  const tags = [];
  let inTag = false;
  for (const line of content) {
    const l = line.trim();
    if (!l) { inTag = false; if (!tags.length) prose.push(''); continue; }
    if (TAG_LINE.test(l)) { inTag = true; tags.push(line.trimEnd()); continue; }
    if (inTag) { tags.push(line.trimEnd()); continue; }
    prose.push(line.trimEnd());
  }

  // The opening paragraph, up to the first blank line.
  let head = [];
  for (const l of prose) {
    if (!l.trim()) { if (head.length) break; continue; }
    head.push(l);
  }
  if (head.length > max) {
    // Cut at the last sentence that ENDS inside the budget, mid-line if need be. Cutting only at
    // line ends leaves the reader hanging on "…and called `generate_gemini`".
    const text = head.slice(0, max).join('\n');
    const ends = [...text.matchAll(SENTENCE_END)];
    const last = ends.length ? ends[ends.length - 1].index + 1 : -1;
    const kept = last > 0 ? text.slice(0, last).trimEnd() : '';
    head = kept ? kept.split('\n') : head.slice(0, max);
  }
  head = head.filter((l) => /[A-Za-z0-9Ͱ-Ͽ]/.test(l));
  return { head, tags };
}

/** Re-emit a collapsed comment in its original style and indentation. */
export function renderComment({ head, tags }, { kind, indent, jsdoc, marker = '//', width = 108 }) {
  const body = [...head, ...tags];
  if (!body.length) return null;
  if (kind === 'line') return body.map((l) => (l ? `${indent}${marker} ${l}` : `${indent}${marker}`)).join('\n');
  const open = jsdoc ? '/**' : '/*';
  if (body.length === 1 && !tags.length && `${indent}${open} ${body[0]} */`.length <= width) {
    return `${indent}${open} ${body[0]} */`;
  }
  return [`${indent}${open}`, ...body.map((l) => (l ? `${indent} * ${l}` : `${indent} *`)), `${indent} */`].join('\n');
}

/** Every comment in `source` that is over budget. The one definition of a violation. */
export function findOverBudget(source, fileName = 'file.tsx') {
  const groups = groupComments(source, scanComments(source, fileName));
  const lineOf = buildLineIndex(source);
  const out = [];
  for (const g of groups) {
    const raw = source.slice(g.start, g.end);
    if (isDirective(raw)) continue;
    const content = contentOf(raw, g.kind);
    const prose = proseLineCount(content);
    if (prose <= MAX_PROSE_LINES) continue;
    out.push({ ...g, raw, content, prose, line: lineOf(g.start) + 1 });
  }
  return out;
}

/** Directories no rule should ever read: vendored, generated, or another repo. */
export const SCAN_SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.nyc_output',
  '.venv', 'venv', '__pycache__', '.turbo', '.vercel', 'deployed', 'mivaa-pdf-extractor',
  '.ruru', 'public', 'storybook-static', '.cache', '.idea', '.vscode', 'docs',
]);

export const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/**
 * Every hand-written TS/JS file in the repo. One walker for the codemod and the guard test, so
 * "which files does the budget apply to" has a single answer.
 */
export async function walkRepo(root) {
  const { readdir, stat } = await import('node:fs/promises');
  const { join, extname } = await import('node:path');
  const out = [];
  const visit = async (dir) => {
    let entries;
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      if (SCAN_SKIP_DIRS.has(e)) continue;
      const p = join(dir, e);
      let st;
      try { st = await stat(p); } catch { continue; }
      if (st.isDirectory()) await visit(p);
      else if (SCAN_EXT.has(extname(e))) out.push(p);
    }
  };
  await visit(root);
  return out;
}
