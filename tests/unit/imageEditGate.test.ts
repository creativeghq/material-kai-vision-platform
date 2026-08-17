/**
 * Guard: what the image tools are allowed to alter, and where that check lives.
 *
 * The trace this came from: a user attached a university graduate certificate to the Vision
 * agent and asked to change the name and the date on it. The agent called
 * `generate_gemini(mode:'image-edit')`, the edit ran in 13.5s for 6 credits, and the result — a
 * clean forged credential, seal and signature intact — was written to a public, unauthenticated
 * storage URL. Every layer behaved correctly by its own lights: the instruction ("change the
 * date, change the name") is an ordinary text edit, and the tool has no opinion about names.
 *
 * So the check is on the ARTEFACT, not the words: `_shared/image-edit-gate.ts` classifies the
 * SOURCE image before the edit runs. This file pins the three properties that make it a gate
 * rather than a suggestion, all of which are easy to undo by accident:
 *
 *   1. It sits in `generate-interior-gemini` — the one function every image edit passes
 *      through (agent tool, AgentHub's edit modal, projectsService, productMaterialMapsService,
 *      generate-vr-world). Putting it in the agent's prompt or in the tool would leave the
 *      other four callers, and `mode:'direct_tool'` fires a tool with no model turn at all.
 *   2. It runs BEFORE the credit debit. A blocked edit must not be charged for.
 *   3. It fails CLOSED. A gate that lets the edit through when the classifier is unreachable
 *      is a delay, not a gate — the same reasoning as invariant 6 on webhook signatures.
 *
 * Static, over source text: the real thing needs an Anthropic key and a vision call, and what
 * regresses here is placement and ordering, which text can see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const FUNCS = join(ROOT, 'supabase', 'functions');
const GATE = join(FUNCS, '_shared', 'image-edit-gate.ts');
const GEMINI = join(FUNCS, 'generate-interior-gemini', 'index.ts');

const read = (p: string) => readFileSync(p, 'utf8');

describe('image-edit source gate', () => {
  it('is wired into generate-interior-gemini, the function every image edit passes through', () => {
    const src = stripComments(read(GEMINI));
    expect(src).toContain('assertEditableSource');
    expect(src).toMatch(/from '\.\.\/_shared\/image-edit-gate\.ts'/);
  });

  it('covers every mode that transforms a SUPPLIED image', () => {
    const src = stripComments(read(GEMINI));
    // The modes that invent an image from words (text-to-image, floor-plan-text) have no
    // source to classify. Every other mode reads `reference_image_url` and must be gated.
    for (const mode of ['image-edit', 'redesign', 'copy-style', 'floor-plan-render']) {
      expect(
        new RegExp(`EDIT_MODES[^;]*'${mode}'`, 's').test(src),
        `mode '${mode}' transforms a supplied image but is not in EDIT_MODES — it would bypass the gate`,
      ).toBe(true);
    }
  });

  it('runs BEFORE credits are debited', () => {
    const src = stripComments(read(GEMINI));
    const gateAt = src.indexOf('assertEditableSource');
    const debitAt = src.indexOf('deductCredits');
    expect(gateAt, 'gate call not found').toBeGreaterThan(-1);
    expect(debitAt, 'deductCredits call not found').toBeGreaterThan(-1);
    expect(
      gateAt < debitAt,
      'the gate must run before deductCredits, or a refused edit still costs the user credits',
    ).toBe(true);
  });

  it('fails closed — every failure path in the gate blocks', () => {
    const src = stripComments(read(GATE));
    // No branch may return an allowing verdict from a catch/error path. `allowed: true` is
    // reachable exactly three times: no source URL, a platform-generated source, and an
    // explicit "allowed" verdict from the classifier.
    const allows = src.match(/allowed:\s*true/g) ?? [];
    expect(
      allows.length,
      'a new `allowed: true` appeared — if it is on an error path the gate now opens when the '
      + 'classifier is unreachable, which is exactly the failure mode this guards',
    ).toBe(3);

    // The classifier's verdict is read as an allow-list, never a deny-list: anything that is
    // not the literal string 'allowed' must block, including a value outside the enum.
    expect(src).toMatch(/verdict === 'allowed'/);
    expect(src).not.toMatch(/verdict === 'restricted'/);
  });

  it('gets its prompt from the database with no code fallback', () => {
    const src = stripComments(read(GATE));
    expect(src).toContain("getToolPrompt(supabase, 'image_edit_source_gate')");
    // A hardcoded classifier prompt is the failure CLAUDE.md documents: an admin edits the
    // prompt, nothing changes, every health signal stays green.
    expect(src).not.toMatch(/const\s+\w*(SYSTEM|PROMPT)\w*\s*=\s*[`'"][^`'"]{200,}/);
  });

  it('uses forced tool_use for the verdict, not a JSON salvage parse (invariant 9)', () => {
    const src = stripComments(read(GATE));
    expect(src).toMatch(/tool_choice:\s*\{\s*type:\s*'tool'/);
    expect(src).not.toContain('JSON.parse');
  });
});

describe('the MIVAA embedding path', () => {
  /**
   * `/api/mivaa/gateway` is the request shape of the SUPABASE EDGE proxy — `{action, payload}`
   * posted at `functions/v1/mivaa-gateway`. It is not a route MIVAA serves. Two callers sent it
   * to the MIVAA HOST directly and 404'd on every call since they were written: agent long-term
   * memory silently degraded to its recency fallback on every turn (100% of `agent_memories`
   * rows had `embedding IS NULL`) and `crawl-user-website` stored every page without a vector.
   * Nothing raised, because every caller treats "no embedding" as a degradation.
   */
  it('no edge function posts the gateway envelope at the MIVAA host', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSyncSafe(dir)) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          const src = stripComments(read(full));
          if (src.includes('/api/mivaa/gateway')) offenders.push(full.slice(FUNCS.length + 1));
        }
      }
    };
    walk(FUNCS);
    expect(
      offenders,
      'these post the edge proxy\'s path at the MIVAA host — it 404s. Call the shared '
      + 'generateStandardEmbedding (which hits /api/embeddings/clip-text, the voyage-4 text '
      + 'endpoint despite the name), or go through the mivaa-gateway function.',
    ).toEqual([]);
  });

  it('there is one embedding implementation, and callers delegate to it', () => {
    const util = stripComments(read(join(FUNCS, '_shared', 'embedding-utils.ts')));
    expect(util).toContain('/api/embeddings/clip-text');
    // MIVAA bills its own call and takes workspace_id to attribute it. A second row written
    // here would double-count every embedding — one derivation per money quantity.
    expect(util).not.toContain("from('ai_usage_logs')");
  });
});

function readdirSyncSafe(dir: string) {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/**
 * The reason the agent could not see the image at all.
 *
 * agent-chat built Anthropic's NATIVE image block — `{type:'image', source:{...}}` — for the last
 * user message. @langchain/anthropic 1.3.10, the version agent-chat pins, drops it:
 * `_formatContentBlocks` is a GENERATOR and its branch for a native image block says
 * `return contentPart` instead of `yield contentPart`. A `return` in a generator emits nothing
 * (every `for...of`/spread discards the return value) and TERMINATES the generator, so the image
 * never reached the API and every block after it was thrown away too.
 *
 * Consequences, none of which raised anything: agent vision never worked for anyone; attaching an
 * image and a PDF in the same turn silently lost the PDF (documents are pushed after images); and
 * the model answered from the text alone, which is why "update the date and the name" on an
 * attached certificate came back as a question about which quote or CRM record was meant.
 *
 * Upstream fixed it in 1.5.2 (`yield`). We do not depend on that: `image_url` is handled by the
 * branch above, which yields, and `_formatImage` turns a data: URL into a base64 block and an
 * http(s) URL into a url block — the same two blocks we were hand-building. Identical in both
 * versions.
 *
 * RUNTIME, against the pinned package. A static "does the source say image_url" check would pass
 * just as happily against a library that had changed underneath it — and the whole failure here
 * was a silent library behaviour, not a visible mistake in our source.
 */
describe('multimodal blocks actually survive the LangChain conversion', () => {
  const DENO = join(FUNCS, 'agent-chat', 'node_modules', '.deno');
  const load = async () => {
    const inputs: any = await import(
      /* @vite-ignore */ pathToFileURL(join(DENO, '@langchain+anthropic@1.3.10', 'node_modules', '@langchain', 'anthropic', 'dist', 'utils', 'message_inputs.js')).href
    );
    const core: any = await import(
      /* @vite-ignore */ pathToFileURL(join(DENO, '@langchain+core@1.1.15', 'node_modules', '@langchain', 'core', 'dist', 'messages', 'index.js')).href
    );
    return { convert: inputs._convertMessagesToAnthropicPayload, HumanMessage: core.HumanMessage };
  };

  const BLOCKS = [
    { type: 'text', text: 'update the date and the name' },
    { type: 'image_url', image_url: { url: 'https://example.com/source.png' } },
    { type: 'document', source: { type: 'url', url: 'https://example.com/spec.pdf' } },
  ];

  it('an attached image reaches the payload as an image block', async () => {
    const { convert, HumanMessage } = await load();
    const out = convert([new HumanMessage({ content: BLOCKS })]).messages[0].content;
    const kinds = out.map((b: any) => b.type);
    expect(
      kinds,
      'the image did not survive — the model would answer from the text alone and sound confused '
      + 'about a request whose whole subject is the picture',
    ).toContain('image');
  });

  it('a document attached ALONGSIDE an image is not swallowed with it', async () => {
    const { convert, HumanMessage } = await load();
    const out = convert([new HumanMessage({ content: BLOCKS })]).messages[0].content;
    // This is the part a "does the image work" check misses: the old bug terminated the
    // generator, so the block ORDER decided what else got lost.
    expect(out.map((b: any) => b.type)).toEqual(['text', 'image', 'document']);
  });

  it('the native block shape is still the trap it was — do not go back to it', async () => {
    const { convert, HumanMessage } = await load();
    for (const source of [
      { type: 'url', url: 'https://example.com/source.png' },
      { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    ]) {
      const out = convert([new HumanMessage({ content: [
        { type: 'text', text: 't' },
        { type: 'image', source },
      ] })]).messages[0].content;
      // If this ever starts returning the image, the pinned library has been upgraded past the
      // `return`/`yield` bug — at which point delete this case, not the two above it.
      expect(
        out.map((b: any) => b.type),
        `the pinned @langchain/anthropic now passes a native ${source.type} image block through. `
        + 'That is good news; this case has outlived its purpose and should be removed.',
      ).toEqual(['text']);
    }
  });
});
