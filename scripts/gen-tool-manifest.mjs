/**
 * Tool manifest generator (issue #266, Phase 0).
 *
 * NOTE: deliberately no `#!` shebang — tests/unit/toolkitCoverage.test.ts imports this
 * module through Vite's transform pipeline, which treats a leading `#!` as a syntax
 * error. It is always run as `node scripts/gen-tool-manifest.mjs` anyway.
 *
 * Agent tools are defined ONCE, in the backend:
 *
 *     tool(async (args) => {...}, {
 *       name: 'generate_video',
 *       description: '...',
 *       schema: z.object({ video_type: z.enum([...]).describe('...'), ... }),
 *     })
 *
 * …and every UI surface that exposes them (agentToolsCatalog → ToolkitPickerModal,
 * ToolkitFormModal) was a HAND-MAINTAINED mirror. Nothing kept the two in sync, so
 * tools shipped into no toolkit cluster and `z.enum` options never became form
 * fields. This script emits the machine-readable projection both the guard test and
 * the auto-field builder read:
 *
 *     src/components/features/ai/toolManifest.generated.ts
 *
 * …and, in the other direction, projects the catalog's cluster map down to the edge
 * function so the two are no longer separate hand-written copies:
 *
 *     supabase/functions/_shared/toolkitClusters.generated.ts
 *
 * WHY A STATIC AST PARSE and not runtime introspection: the tool factories build
 * Supabase clients at call time, and the modules are Deno with `npm:` specifiers +
 * top-level await — importing them from Node needs a Deno runtime plus env and has
 * side effects. Parsing is deterministic, env-free, and runs in the existing
 * vitest/node toolchain.
 *
 * TWO TRAPS this deliberately avoids (both hit while building the earlier guards):
 *  1. PHANTOM TOOLS. `tech-radar-tools.ts` holds SUBMIT_FINDINGS_TOOL — an Anthropic
 *     `tool_choice` structured-output schema with a `name:` and an `input_schema:`.
 *     A `name: '...'` regex cannot tell it apart from a real tool. Anchoring on the
 *     `tool(...)` CALL EXPRESSION excludes it structurally.
 *  2. A SILENTLY-SHORT MANIFEST. A parser that quietly skips shapes it does not
 *     understand yields a green build that checks nothing. Every unparsed schema is
 *     collected and the run FAILS LOUDLY, plus floor asserts on the totals.
 *
 * Usage:  node scripts/gen-tool-manifest.mjs [--check]
 *   (no flag) rewrite the generated files
 *   --check   exit 1 if either committed file is stale (used by CI / the guard test)
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_DIR = join(ROOT, 'supabase/functions/_shared/tools');
const OUT_FILE = join(ROOT, 'src/components/features/ai/toolManifest.generated.ts');
const CATALOG_FILE = join(ROOT, 'src/components/features/ai/agentToolsCatalog.ts');
const CLUSTERS_OUT = join(ROOT, 'supabase/functions/_shared/toolkitClusters.generated.ts');

// Sanity floors. The audit in #266 counted 126 implemented tools and 28 with enum
// options; a parse that drops below these is broken, not a shrunken codebase.
const MIN_TOOLS = 100;
const MIN_ENUM_TOOLS = 20;
const MIN_CLUSTERS = 20;

// ── zod → manifest type mapping ──────────────────────────────────────
const BASE_TYPES = {
  string: 'string', number: 'number', boolean: 'boolean', enum: 'enum',
  array: 'array', object: 'object', record: 'object', literal: 'string',
  union: 'union', any: 'unknown', unknown: 'unknown', date: 'string',
  nativeEnum: 'enum', bigint: 'number', null: 'unknown', void: 'unknown',
  tuple: 'array', instanceof: 'unknown', custom: 'unknown', symbol: 'unknown',
};

const lit = (n) =>
  n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : null;

/** Template literals keep their literal spans; `${expr}` collapses to `…`. */
function textOf(n) {
  if (!n) return null;
  const s = lit(n);
  if (s !== null) return s;
  if (ts.isTemplateExpression(n)) {
    return n.head.text + n.templateSpans.map((sp) => `…${sp.literal.text}`).join('');
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = textOf(n.left); const r = textOf(n.right);
    return l !== null && r !== null ? l + r : null;
  }
  // `['line', 'line'].join('\n')` — how the `manage_*` router tools write their
  // multi-paragraph descriptions. Without this they came out blank.
  if (
    ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === 'join' && ts.isArrayLiteralExpression(n.expression.expression)
  ) {
    const sep = lit(n.arguments[0]) ?? ',';
    const parts = n.expression.expression.elements.map(textOf);
    return parts.every((p) => p !== null) ? parts.join(sep) : null;
  }
  return null;
}

/** `z` or `z.coerce` — the root of a zod chain. */
const isZodRoot = (n) =>
  (ts.isIdentifier(n) && n.text === 'z') ||
  (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'z');

/**
 * Module-level `const X = ['a','b'] as const` arrays, so `z.enum(RING_VALUES)`
 * resolves to its values instead of degrading to an option-less enum.
 */
function constArrays(sourceFile) {
  const out = new Map();
  for (const stmt of sourceFile.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      let init = d.initializer;
      // Unwrap `as const` / `satisfies`.
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (!ts.isArrayLiteralExpression(init)) continue;
      const vals = init.elements.map(lit);
      if (vals.length && vals.every((v) => v !== null)) out.set(d.name.text, vals);
    }
  }
  return out;
}

/** Enum members from `z.enum([...])` / `z.enum(CONST)`. Null = unresolvable. */
function enumValues(arg, consts) {
  if (!arg) return null;
  let node = arg;
  while (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  if (ts.isArrayLiteralExpression(node)) {
    const vals = node.elements.map(lit);
    return vals.every((v) => v !== null) ? vals : null;
  }
  if (ts.isIdentifier(node)) return consts.get(node.text) ?? null;
  return null;
}

/**
 * Walk a zod chain outermost-in, e.g.
 *   z.enum([...]).optional().describe('x')
 * → { type: 'enum', enum: [...], optional: true, description: 'x' }
 * Returns null when the chain never reaches a `z.` root (an unknown shape).
 */
function analyzeZod(node, consts) {
  const acc = { type: null, enum: undefined, optional: false, description: undefined, items: undefined };
  let cur = node;
  for (let guard = 0; guard < 40; guard++) {
    while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur) || ts.isSatisfiesExpression(cur)) {
      cur = cur.expression;
    }
    if (!ts.isCallExpression(cur) || !ts.isPropertyAccessExpression(cur.expression)) return null;
    const method = cur.expression.name.text;
    const inner = cur.expression.expression;

    if (isZodRoot(inner)) {
      // Base constructor — the innermost link.
      acc.type = BASE_TYPES[method] ?? 'unknown';
      if (method === 'enum' || method === 'nativeEnum') {
        acc.enum = enumValues(cur.arguments[0], consts) ?? undefined;
        if (!acc.enum) acc.type = 'string'; // an enum whose members we cannot see is a plain string to the UI
      } else if (method === 'array' && cur.arguments[0]) {
        const el = analyzeZod(cur.arguments[0], consts);
        if (el?.enum) acc.enum = el.enum;
        acc.items = el?.type ?? 'unknown';
      } else if (method === 'literal') {
        const v = lit(cur.arguments[0]);
        if (v !== null) acc.enum = [v];
      }
      return acc;
    }

    // Modifier — record and keep descending.
    if (method === 'optional' || method === 'nullish' || method === 'default') acc.optional = true;
    else if (method === 'describe' && acc.description === undefined) {
      acc.description = textOf(cur.arguments[0]) ?? undefined;
    }
    cur = inner;
  }
  return null;
}

/** Unwrap `z.object({...}).strict()` etc. down to the object literal. */
function schemaObjectLiteral(node) {
  let cur = node;
  for (let guard = 0; guard < 20; guard++) {
    while (ts.isAsExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
    if (!ts.isCallExpression(cur) || !ts.isPropertyAccessExpression(cur.expression)) return null;
    const method = cur.expression.name.text;
    const inner = cur.expression.expression;
    if (isZodRoot(inner)) {
      if (method !== 'object') return null;
      const arg = cur.arguments[0];
      return arg && ts.isObjectLiteralExpression(arg) ? arg : null;
    }
    cur = inner;
  }
  return null;
}

const propName = (p) =>
  ts.isIdentifier(p.name) ? p.name.text : ts.isStringLiteral(p.name) ? p.name.text : null;

/**
 * The exported factory that constructs this tool (`export const createXTool = () => tool(...)`).
 *
 * A tool is only REACHABLE if something instantiates its factory. `generate_video`
 * shipped fully defined but never instantiated — bound to no agent, callable by
 * nobody — and no guard could see it, because coverage checks only ever compared
 * NAMES. Recording the factory lets the guard ask the reachability question.
 */
function enclosingFactory(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name && ts.isIdentifier(p.name)) {
      return p.name.text;
    }
  }
  return null;
}

/** First sentence / line of a tool description, for UI labels. */
function summarize(desc) {
  if (!desc) return '';
  const firstLine = desc.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? '';
  const m = firstLine.match(/^(.{0,180}?[.!?])(\s|$)/);
  const out = (m ? m[1] : firstLine).trim();
  return out.length > 220 ? `${out.slice(0, 217)}…` : out;
}

/**
 * Tool modules that are NOT part of the agent tool surface, and must not enter the manifest.
 *
 * The manifest exists to answer "which tools can an agent be given, and are they all reachable" —
 * `toolkitCoverage.test.ts` reads it and fails the build for any tool that is in no cluster or
 * that no agent lists. That check has no escape hatch by design (`KNOWN_UNCLUSTERED` was deleted,
 * not emptied), and it is right not to.
 *
 * `customer-account-tools.ts` is not in that surface. Its three tools are bound only by
 * agent-chat's customer-audience path, only when an Inbox thread has resolved to a real CRM
 * contact and the workspace allows account answers. Putting them in a cluster would make them
 * selectable in an operator chat, where they are a strictly worse copy of the finance tools — and
 * an entry in the manifest without a cluster is a red build. So the file is excluded HERE, once,
 * with the reason, rather than by weakening the coverage rule for everyone.
 *
 * A new entry needs the same argument: bound outside `registerTools`, and unreachable by
 * selection. If a module does not clear that bar, cluster it instead.
 */
const NON_AGENT_TOOL_MODULES = new Set([
  'customer-account-tools.ts',
]);

export function buildManifest() {
  const files = readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts') && !NON_AGENT_TOOL_MODULES.has(f))
    .sort()
    .map((f) => join(TOOLS_DIR, f));

  const tools = [];
  const problems = [];

  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
    const consts = constArrays(sf);
    const rel = relative(ROOT, file).replace(/\\/g, '/');

    const visit = (node) => {
      // ONLY `tool(fn, { ... })` calls. This is what excludes the Anthropic
      // `input_schema` structured-output blocks (submit_findings) structurally.
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'tool' &&
        node.arguments.length >= 2 &&
        ts.isObjectLiteralExpression(node.arguments[1])
      ) {
        const meta = node.arguments[1];
        let name = null; let description = ''; let schemaNode = null;
        for (const p of meta.properties) {
          if (!ts.isPropertyAssignment(p)) continue;
          const key = propName(p);
          if (key === 'name') name = lit(p.initializer);
          else if (key === 'description') description = textOf(p.initializer) ?? '';
          else if (key === 'schema') schemaNode = p.initializer;
        }
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (!name) {
          problems.push(`${rel}:${line} — tool() with no literal \`name\``);
        } else {
          const obj = schemaNode ? schemaObjectLiteral(schemaNode) : null;
          if (schemaNode && !obj) {
            problems.push(`${rel}:${line} — ${name}: schema is not a readable z.object({...})`);
          }
          const params = [];
          for (const p of obj?.properties ?? []) {
            if (!ts.isPropertyAssignment(p)) {
              problems.push(`${rel}:${line} — ${name}: non-literal schema property (spread/shorthand)`);
              continue;
            }
            const key = propName(p);
            const info = analyzeZod(p.initializer, consts);
            if (!key || !info) {
              problems.push(`${rel}:${line} — ${name}.${key ?? '?'}: unreadable zod chain`);
              continue;
            }
            params.push({
              name: key,
              type: info.type ?? 'unknown',
              ...(info.enum ? { enum: info.enum } : {}),
              optional: info.optional,
              ...(info.description ? { description: info.description } : {}),
            });
          }
          const factory = enclosingFactory(node);
          if (!factory) problems.push(`${rel}:${line} — ${name}: tool() not inside a named factory`);
          tools.push({ name, file: rel, factory: factory ?? '', description: summarize(description), params });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));

  const dupes = tools.map((t) => t.name).filter((n, i, a) => a.indexOf(n) !== i);
  if (dupes.length) problems.push(`duplicate tool name(s): ${[...new Set(dupes)].join(', ')}`);

  return { tools, problems };
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

export function renderManifest(tools) {
  const body = tools.map((t) => {
    const params = t.params.map((p) => {
      const bits = [`name: ${q(p.name)}`, `type: ${q(p.type)}`];
      if (p.enum) bits.push(`enum: [${p.enum.map(q).join(', ')}]`);
      bits.push(`optional: ${p.optional}`);
      if (p.description) bits.push(`description: ${q(p.description)}`);
      return `      { ${bits.join(', ')} },`;
    });
    return [
      '  {',
      `    name: ${q(t.name)},`,
      `    file: ${q(t.file)},`,
      `    factory: ${q(t.factory)},`,
      `    description: ${q(t.description)},`,
      params.length ? `    params: [\n${params.join('\n')}\n    ],` : '    params: [],',
      '  },',
    ].join('\n');
  }).join('\n');

  return `/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source of truth: the \`tool(fn, { name, description, schema })\` definitions in
 * supabase/functions/_shared/tools/*.ts.
 * Regenerate with:  npm run tools:manifest
 *
 * Staleness is a red build — tests/unit/toolkitCoverage.test.ts re-runs the
 * generator and diffs it against this file, so a tool added in the backend without
 * regenerating here fails CI.
 *
 * \`description\` is the tool description's first sentence only (the UI never shows
 * the full agent-facing prose); \`params\` is complete.
 */

export type ToolParamType =
  | 'string' | 'number' | 'boolean' | 'enum' | 'array' | 'object' | 'union' | 'unknown';

export interface ToolManifestParam {
  name: string;
  type: ToolParamType;
  /** Present for z.enum(...) params (and arrays of enums) — the selectable options. */
  enum?: string[];
  optional: boolean;
  /** The zod \`.describe()\` text, used as the form-field help. */
  description?: string;
}

export interface ToolManifestEntry {
  name: string;
  /** Repo-relative file the tool is defined in. */
  file: string;
  /**
   * The factory that constructs it (\`export const createXTool = () => tool(...)\`).
   * A tool whose factory nothing calls is defined but UNREACHABLE — the guard
   * checks this, because a name-only check cannot see that failure.
   */
  factory: string;
  description: string;
  params: ToolManifestParam[];
}

export const TOOL_MANIFEST: ToolManifestEntry[] = [
${body}
];

export const TOOL_MANIFEST_BY_NAME: Record<string, ToolManifestEntry> =
  Object.fromEntries(TOOL_MANIFEST.map((t) => [t.name, t]));
`;
}

export function generate() {
  const { tools, problems } = buildManifest();
  const enumTools = tools.filter((t) => t.params.some((p) => p.enum)).length;

  // Fail loudly rather than silently emitting a short manifest.
  const fatal = [...problems];
  if (tools.length < MIN_TOOLS) fatal.push(`only ${tools.length} tools parsed (floor ${MIN_TOOLS}) — the parser is broken`);
  if (enumTools < MIN_ENUM_TOOLS) fatal.push(`only ${enumTools} tools with enum params (floor ${MIN_ENUM_TOOLS}) — enum extraction is broken`);

  return { tools, source: renderManifest(tools), problems: fatal, enumTools };
}

// ─────────────────────────────────────────────────────────────────────
// Toolkit clusters — agentToolsCatalog.TOOLKITS → the edge function's map
//
// agent-chat used to hold its OWN copy of cluster → tool_ids, commented "mirrored
// from agentToolsCatalog.ts". Only the frontend copy drove the picker; only the
// server copy drove what `load_toolkit` could bind. They drifted by four whole
// clusters (flows / knowledge-graph / social / tech-radar were bindable mid-chat and
// impossible to enable from the picker) and by two tools inside `projects`.
//
// A test could only ever report that drift after the fact. Projecting the map out of
// the catalog removes the second copy, so there is nothing left to disagree.
// ─────────────────────────────────────────────────────────────────────

/** The `[...]` initializer of `export const TOOLKITS ... = [...]`. */
function toolkitsArray(sf) {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const d of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || d.name.text !== 'TOOLKITS' || !d.initializer) continue;
      let init = d.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      // NOTE: anchor on the DECLARATION, never on the first `[` in the source text.
      // The type annotation (`: ToolkitDefinition[]`) carries brackets of its own, and
      // a text-anchored parser grabs those and silently yields zero clusters.
      if (ts.isArrayLiteralExpression(init)) return init;
    }
  }
  return null;
}

export function buildToolkitClusters() {
  const src = readFileSync(CATALOG_FILE, 'utf8');
  const sf = ts.createSourceFile(CATALOG_FILE, src, ts.ScriptTarget.Latest, true);
  const problems = [];
  const clusters = [];

  const arr = toolkitsArray(sf);
  if (!arr) return { clusters, problems: ['agentToolsCatalog.ts: no readable `export const TOOLKITS = [...]`'] };

  for (const el of arr.elements) {
    if (!ts.isObjectLiteralExpression(el)) {
      problems.push('TOOLKITS entry is not an object literal (spread?)');
      continue;
    }
    let id = null; let alwaysOn = false; let toolIds = null;
    for (const p of el.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = propName(p);
      if (key === 'id') id = lit(p.initializer);
      else if (key === 'alwaysOn') alwaysOn = p.initializer.kind === ts.SyntaxKind.TrueKeyword;
      else if (key === 'tool_ids') {
        if (!ts.isArrayLiteralExpression(p.initializer)) { problems.push(`${id ?? '?'}: tool_ids is not an array literal`); continue; }
        const vals = p.initializer.elements.map(lit);
        if (vals.some((v) => v === null)) problems.push(`${id ?? '?'}: non-literal entry in tool_ids`);
        else toolIds = vals;
      }
    }
    if (!id) { problems.push('TOOLKITS entry with no literal `id`'); continue; }
    if (!toolIds) { problems.push(`${id}: unreadable tool_ids`); continue; }
    clusters.push({ id, alwaysOn, tool_ids: toolIds });
  }

  const dupes = clusters.map((c) => c.id).filter((v, i, a) => a.indexOf(v) !== i);
  if (dupes.length) problems.push(`duplicate toolkit id(s): ${[...new Set(dupes)].join(', ')}`);

  return { clusters, problems };
}

export function renderToolkitClusters(clusters) {
  const body = clusters.map((c) => {
    const ids = c.tool_ids.map(q).join(', ');
    return [
      `  ${q(c.id)}: {`,
      ...(c.alwaysOn ? ['    alwaysOn: true,'] : []),
      c.tool_ids.length ? `    tool_ids: [${ids}],` : '    tool_ids: [],',
      '  },',
    ].join('\n');
  }).join('\n');

  return `/* eslint-disable */
/**
 * AUTO-GENERATED — DO NOT EDIT BY HAND.
 *
 * Source of truth: \`TOOLKITS\` in src/components/features/ai/agentToolsCatalog.ts.
 * Regenerate with:  npm run tools:manifest
 *
 * agent-chat used to keep a hand-written copy of this map. Only the catalog copy drove
 * the ToolkitPickerModal and only the agent-chat copy drove \`load_toolkit\`, so four
 * clusters were bindable by the agent and impossible for a user to enable. This file is
 * a projection of the catalog, not a mirror of it — staleness is a red build
 * (tests/unit/toolkitCoverage.test.ts re-runs the generator and diffs).
 */

export interface ToolkitCluster {
  /** Bound for every agent that declares the tool, with no user opt-in. */
  alwaysOn?: boolean;
  tool_ids: string[];
}

export const TOOLKIT_CLUSTERS: Record<string, ToolkitCluster> = {
${body}
};
`;
}

export function generateToolkitClusters() {
  const { clusters, problems } = buildToolkitClusters();
  const fatal = [...problems];
  if (clusters.length < MIN_CLUSTERS) {
    fatal.push(`only ${clusters.length} toolkit clusters parsed (floor ${MIN_CLUSTERS}) — the parser is broken`);
  }
  return { clusters, source: renderToolkitClusters(clusters), problems: fatal };
}

const normalized = (s) => s.replace(/\r\n/g, '\n');
const readOrNull = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');

function main() {
  const check = process.argv.includes('--check');
  const { tools, source, problems, enumTools } = generate();
  const { clusters, source: clusterSource, problems: clusterProblems } = generateToolkitClusters();

  const fatal = [...problems, ...clusterProblems];
  if (fatal.length) {
    console.error('✗ tool manifest generation failed:');
    for (const p of fatal) console.error(`   • ${p}`);
    process.exit(1);
  }

  const outputs = [
    { file: OUT_FILE, source, current: readOrNull(OUT_FILE) },
    { file: CLUSTERS_OUT, source: clusterSource, current: readOrNull(CLUSTERS_OUT) },
  ];

  if (check) {
    const stale = outputs.filter((o) => normalized(o.current ?? '') !== normalized(o.source));
    if (stale.length) {
      for (const o of stale) console.error(`✗ ${rel(o.file)} is STALE.`);
      console.error('Run: npm run tools:manifest');
      process.exit(1);
    }
    console.log(
      `✓ generated files up to date (${tools.length} tools, ${enumTools} with options, ` +
      `${clusters.length} toolkit clusters)`,
    );
    return;
  }

  for (const o of outputs) writeFileSync(o.file, o.source, 'utf8');
  const changed = outputs.filter((o) => normalized(o.current ?? '') !== normalized(o.source));
  console.log(
    `${changed.length ? `✎ wrote ${changed.map((o) => rel(o.file)).join(', ')}` : '= unchanged'} ` +
    `— ${tools.length} tools, ${enumTools} with enum options, ` +
    `${tools.reduce((n, t) => n + t.params.length, 0)} params, ${clusters.length} toolkit clusters`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
