/**
 * Inventory every prompt the edge functions send to a model (#347 phase 3P).
 *
 * DRIVEN BY THE CALL SITES, not by what the text looks like. Two earlier attempts got the count
 * badly wrong in opposite directions and both are worth remembering:
 *
 *   * A regex for `` `...{250,}` `` reported 82. The `[^`]` class stops at backticks, but a file
 *     with 52 template literals has long backtick-free runs of ORDINARY CODE between distant
 *     literals, and those matched. b2b-tools.ts "had" 17 prompts; it has one.
 *   * An AST sweep filtered template literals on instruction-shaped keywords ("you are",
 *     "classify", ...) and reported 11 — dropping that same b2b prompt, which opens
 *     "Find B2B manufacturers of ${category}".
 *
 * Prompts do not reliably look like anything. What is reliable is where they GO: the `system`,
 * `prompt`, `messages[].content` and `contents` arguments of a model call. So this finds the
 * calls, then walks back to whatever expression supplies those arguments, resolving
 * single-assignment identifiers within the file.
 */
import ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['supabase/functions', 'api', 'src/services'];

/** A call whose arguments carry a prompt. */
const LLM_CALLEES = /^(generateWithClaude|generateWithGemini|generateText|callClaude|callAnthropic|callAI|generateObject|complete|chat)$/;
const ANTHROPIC_URL = /api\.anthropic\.com|generativelanguage\.googleapis|api\.openai\.com/;

/** Object properties that hold prompt text. */
const PROMPT_PROPS = new Set(['system', 'systemPrompt', 'prompt', 'content', 'text', 'instruction', 'instructions']);

const MIN_CHARS = 120;

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const p = join(dir, name);
    if (p.includes('node_modules')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js)$/.test(name)) out.push(p);
  }
  return out;
}

/** Static text + interpolations of a string/template node, or null. */
function literalOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { text: node.text, exprs: [] };
  }
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    const exprs = [];
    for (const span of node.templateSpans) {
      exprs.push(span.expression.getText().replace(/\s+/g, ' '));
      text += '\u0000' + span.literal.text;
    }
    return { text, exprs };
  }
  return null;
}

function enclosingFn(node) {
  let cur = node.parent, fn = null;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) || ts.isArrowFunction(cur) ||
        ts.isMethodDeclaration(cur) || ts.isFunctionExpression(cur)) { fn = cur; break; }
    cur = cur.parent;
  }
  if (!fn) return { name: '<module>', isAsync: false };
  const isAsync = !!fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
  let name = fn.name?.getText?.() || '';
  if (!name && ts.isVariableDeclaration(fn.parent)) name = fn.parent.name.getText();
  return { name: name || '<anonymous>', isAsync };
}

const rows = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    if (!ANTHROPIC_URL.test(src) && !LLM_CALLEES.test('') &&
        !/generateWithClaude|generateWithGemini|messages\.create|generateText\(/.test(src)) continue;

    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);

    // Single-assignment identifiers in this file -> their initializer.
    const decls = new Map();
    const seenTwice = new Set();
    const collect = (n) => {
      if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name) && n.initializer) {
        const k = n.name.text;
        if (decls.has(k)) seenTwice.add(k); else decls.set(k, n.initializer);
      }
      ts.forEachChild(n, collect);
    };
    ts.forEachChild(sf, collect);
    for (const k of seenTwice) decls.delete(k);

    const found = new Map();

    const record = (node, why) => {
      let target = node;
      if (ts.isIdentifier(node) && decls.has(node.text)) target = decls.get(node.text);
      const lit = literalOf(target);
      if (!lit) return;
      const plain = lit.text.split('\u0000').join('');
      if (plain.length < MIN_CHARS) return;
      const { line } = sf.getLineAndCharacterOfPosition(target.getStart());
      const key = `${file}:${line}`;
      if (found.has(key)) return;
      const ctx = enclosingFn(target);
      found.set(key, {
        file: file.split('\\').join('/'), line: line + 1, chars: plain.length,
        fn: ctx.name, isAsync: ctx.isAsync, via: why,
        exprs: lit.exprs, preview: plain.replace(/\s+/g, ' ').slice(0, 72),
      });
    };

    const fromObject = (obj) => {
      if (!ts.isObjectLiteralExpression(obj)) return;
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop) || !prop.name) continue;
        const name = prop.name.getText().replace(/['"]/g, '');
        if (PROMPT_PROPS.has(name)) record(prop.initializer, name);
        else if (name === 'messages' || name === 'contents' || name === 'parts') {
          const arr = prop.initializer;
          if (ts.isArrayLiteralExpression(arr)) arr.elements.forEach(fromObject);
        }
      }
    };

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression.getText().split('.').pop() || '';
        const isLlmCall = LLM_CALLEES.test(callee);
        const isFetch = callee === 'fetch' && node.arguments[0] &&
          ANTHROPIC_URL.test(node.arguments[0].getText());
        if (isLlmCall || isFetch) {
          for (const arg of node.arguments) {
            if (ts.isObjectLiteralExpression(arg)) fromObject(arg);
            else record(arg, 'positional');
            // fetch(url, {body: JSON.stringify({...})})
            if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (ts.isPropertyAssignment(prop) && prop.name?.getText() === 'body') {
                  const b = prop.initializer;
                  if (ts.isCallExpression(b) && b.arguments[0]) fromObject(b.arguments[0]);
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    rows.push(...found.values());
  }
}

rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
writeFileSync('edge-prompt-inventory.json', JSON.stringify(rows, null, 2));

const total = rows.reduce((a, r) => a + r.chars, 0);
const sync = rows.filter((r) => !r.isAsync);
console.log(`${rows.length} prompts, ${total.toLocaleString()} chars, ${new Set(rows.map((r) => r.file)).size} files`);
console.log(`with interpolations: ${rows.filter((r) => r.exprs.length).length}`);
console.log(`in a NON-async function: ${sync.length}`);
for (const r of sync) console.log(`   ${r.file}:${r.line} in ${r.fn}()`);
console.log('\nper file:');
const byFile = {};
for (const r of rows) (byFile[r.file] ??= []).push(r);
for (const [f, rs] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(rs.length).padStart(2)}  ${f}`);
  for (const r of rs) console.log(`        :${String(r.line).padEnd(5)} ${String(r.chars).padStart(5)}ch via ${r.via.padEnd(8)} ${r.preview.slice(0, 54)}`);
}
