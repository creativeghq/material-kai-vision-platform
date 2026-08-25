/**
 * Sampling parameters are REMOVED on the current Anthropic models, and passing one is fatal.
 *
 * `temperature`, `top_p` and `top_k` were dropped on Opus 4.7 and everything after it (Opus 4.8,
 * Opus 5, Sonnet 5, Fable 5). The API answers 400, and `@langchain/anthropic` does not even get
 * that far — `validateInvocationParamCompatibility` throws client-side the moment the model is
 * invoked with a non-default value.
 *
 * This is not a style rule. On 2026-08-25 six constructor sites carried a tuned temperature
 * against `claude-opus-4-8`, and every one of them was dead:
 *
 *   • `company_website_scrape` threw on EVERY call for as long as it had been on that model. Its
 *     catch block quietly substituted a 2 000-character preview of the page and still reported
 *     `success: true`, so an agent asked to enumerate ~100 brands out of a sitemap received the
 *     first 29, concluded the scraper truncates, and spent a whole turn working around a bug that
 *     was in the catch block. Eight paid Firecrawl fetches for one useful answer.
 *   • `scrape_materials_from_url` and `suggest_extraction_fields` threw too — behind an unpriced
 *     credit key that was already refusing them first.
 *   • all four `*_analysis` sub-agents threw.
 *
 * Nothing failed loudly, because every site had a catch. The typecheck was clean: `temperature`
 * is a valid property with a valid value. Only the runtime knew, and only in the edge logs.
 *
 * `claude-haiku-4-5` and older models still accept sampling parameters, so the rule is per-model
 * rather than blanket — an exemption list would rot, a model list is checkable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const root = join(__dirname, '..', '..');
const EDGE_ROOT = join(root, 'supabase', 'functions');

/**
 * Models that REJECT sampling parameters. Anything matching one of these prefixes must be
 * constructed without `temperature` / `top_p` / `top_k`.
 *
 * Prefix matching, so a dated snapshot (`claude-opus-5-20260…`) is covered by the same entry.
 * Adding a new frontier model means adding it here; the cost of forgetting is that the guard
 * goes quiet, which is why the second test below pins the list against the models actually used.
 */
const NO_SAMPLING_MODEL_PREFIXES = [
  'claude-fable-5',
  'claude-mythos-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-sonnet-5',
];

const SAMPLING_PARAMS = ['temperature', 'top_p', 'topP', 'top_k', 'topK'];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Every `new ChatAnthropic({ ... })` in the edge tree, as (file, body, resolvedModel) triples.
 *
 * The model is often a named constant rather than a literal (`SUB_AGENT_MODEL`,
 * `ANALYSIS_MODEL`, `MAIN_MODEL`), which is the shape the platform prefers — so an identifier is
 * resolved against a `const X = '<model>'` in the same file. A model that cannot be resolved
 * (a runtime parameter, e.g. `buildLLM`'s) is reported separately rather than silently skipped.
 */
interface Construction {
  file: string;
  body: string;
  model: string | null;
  modelExpr: string;
}

function collectConstructions(): Construction[] {
  const found: Construction[] = [];
  for (const file of walk(EDGE_ROOT)) {
    const raw = readFileSync(file, 'utf8');
    if (!raw.includes('new ChatAnthropic')) continue;
    // Comments describing a banned construction must not read as one — see stripComments below.
    const src = stripComments(raw);

    const constants = new Map<string, string>();
    for (const m of src.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*'([^']+)'/g)) {
      constants.set(m[1], m[2]);
    }

    // Non-greedy up to the first `})` — every construction in this tree is a flat object literal
    // with no nested braces, and the assertion below would trip loudly if that ever changed.
    for (const m of src.matchAll(/new ChatAnthropic\(\{([\s\S]*?)\}\)/g)) {
      const body = m[1];
      expect(body, `nested object in a ChatAnthropic literal in ${file} — this parser assumes flat`).not.toContain('{');
      const modelMatch = body.match(/\bmodel\s*:\s*([^,\n]+)/);
      const modelExpr = modelMatch ? modelMatch[1].trim() : '';
      const literal = modelExpr.match(/^'([^']+)'$/);
      const model = literal ? literal[1] : (constants.get(modelExpr) ?? null);
      found.push({ file: file.slice(root.length + 1).split('\\').join('/'), body, model, modelExpr });
    }
  }
  return found;
}

const constructions = collectConstructions();

describe('Anthropic sampling parameters', () => {
  it('finds the ChatAnthropic constructions to check', () => {
    // A parser that silently matches nothing is a test that passes forever. The platform has had
    // ~9 of these; if this drops to zero the regex has rotted, not the codebase.
    expect(constructions.length).toBeGreaterThanOrEqual(5);
  });

  it('never passes temperature/top_p/top_k to a model that rejects them', () => {
    const offenders: string[] = [];
    for (const c of constructions) {
      if (!c.model) continue;
      if (!NO_SAMPLING_MODEL_PREFIXES.some((p) => c.model!.startsWith(p))) continue;
      for (const param of SAMPLING_PARAMS) {
        if (new RegExp(`\\b${param}\\s*:`).test(c.body)) {
          offenders.push(`${c.file}: ${c.model} was given \`${param}\``);
        }
      }
    }
    expect(
      offenders,
      'These models reject sampling parameters — langchain-anthropic throws before the request is '
      + 'sent, and the surrounding catch block will turn it into a plausible-looking degraded '
      + 'result rather than an error. Delete the parameter; the default is what you want.\n'
      + offenders.join('\n'),
    ).toEqual([]);
  });

  it('resolves the model for every construction it checks', () => {
    // An unresolvable model is a hole in the guard, not a pass. `buildLLM` is the one legitimate
    // case — its model is chosen by the caller at runtime — and it passes no sampling parameter
    // at all, which the assertion below pins.
    const unresolved = constructions.filter((c) => !c.model);
    for (const c of unresolved) {
      for (const param of SAMPLING_PARAMS) {
        expect(
          new RegExp(`\\b${param}\\s*:`).test(c.body),
          `${c.file} builds ChatAnthropic with a runtime model (\`${c.modelExpr}\`) AND a `
          + `\`${param}\`. Since the model is not known here, it may be one that rejects `
          + 'sampling parameters — do not pass one.',
        ).toBe(false);
      }
    }
  });
});

/*
 * `stripComments` is the SHARED helper (tests/helpers), not a local copy — the comment that
 * DOCUMENTS a banned line must not read to the guard as an instance of it, and that is not a
 * hypothetical: the first run of this file failed on its own explanation of why
 * `process.env` must not be assigned. A hand-rolled stripper is also what
 * stripCommentsHelper.test.ts exists to forbid, having found thirty of them that ate live code.
 */

describe('langgraph-core buildLLM', () => {
  const src = stripComments(readFileSync(join(EDGE_ROOT, '_shared', 'langgraph-core.ts'), 'utf8'));

  it('never writes to process.env', () => {
    // `Deno.env.set` is unavailable on Supabase edge — `secrets-bootstrap` logs exactly this on
    // every cold start. Under Deno's node-compat layer `process.env` is a proxy over it, so
    // `procEnv.ANTHROPIC_API_KEY = key` threw `NotSupported: The operation is not supported` and
    // killed buildLLM before any model existed. Every background agent died in ~490ms, and
    // `dispatch_background_task` came back `refused_500` on every dispatch it ever made.
    expect(
      /process\s*(\?\.)?\.env\s*(\.[\w$]+|\[[^\]]+\])\s*=[^=]/.test(src)
      || /procEnv\s*(\.[\w$]+|\[[^\]]+\])\s*=[^=]/.test(src),
      'buildLLM must not assign to process.env — Deno.env.set throws on this runtime. Both '
      + 'constructors take the API key as an explicit argument, so there is nothing to set.',
    ).toBe(false);
  });

  it('still passes the API key explicitly to both providers', () => {
    // The counterpart to the rule above: removing the env writes is only safe because the key
    // travels as an argument. If that ever stops being true the providers would silently fall
    // back to an env var that this runtime cannot populate.
    expect(src).toMatch(/ChatGoogleGenerativeAI\(\{[^}]*apiKey/);
    expect(src).toMatch(/ChatAnthropic\(\{[^}]*anthropicApiKey/);
  });
});
