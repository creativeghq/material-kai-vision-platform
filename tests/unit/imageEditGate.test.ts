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
 * Measured against the pinned package on 2026-08-17:
 *
 *   [text, image(url), document]  ->  [text]
 *   [text, image(base64)]         ->  [text]
 *   [text, image_url, document]   ->  [text, image, document]
 *
 * Consequences, none of which raised anything: agent vision never worked for anyone; attaching an
 * image and a PDF in the same turn silently lost the PDF (documents are pushed after images); and
 * the model answered from the text alone, which is why "update the date and the name" on an
 * attached certificate came back as a question about which quote or CRM record was meant.
 *
 * Upstream fixed it in 1.5.2 (`yield`). We do not depend on that: `image_url` is handled by the
 * branch above, which yields, and `_formatImage` turns a data: URL into a base64 block and an
 * http(s) URL into a url block — the same two blocks we were hand-building. Identical in both.
 *
 * WHY THIS IS A SOURCE CHECK AND NOT THE RUNTIME ONE IT STARTED AS
 * ---------------------------------------------------------------
 * The first version of this guard imported the pinned package and ran the conversion, which is
 * strictly better evidence — and it failed the whole suite in CI, because
 * `supabase/functions/**\/node_modules/.deno` is Deno's local cache and is gitignored. The
 * library simply is not there on a runner. A skipIf would have "fixed" it by turning the guard
 * into a no-op in the only environment that gates the deploy, which is the silent-zero shape
 * this repo keeps finding.
 *
 * So the runtime numbers above are recorded rather than re-derived, and what CI enforces is the
 * property that actually regresses: that we emit `image_url` and never hand-build the native
 * block again. To re-derive them, from a machine that has run the edge functions once:
 *
 *   const m = await import('<repo>/supabase/functions/agent-chat/node_modules/.deno/'
 *     + '@langchain+anthropic@1.3.10/node_modules/@langchain/anthropic/dist/utils/message_inputs.js');
 *   m._convertMessagesToAnthropicPayload([new HumanMessage({ content: BLOCKS })]).messages[0].content
 */
describe('multimodal blocks the agent sends', () => {
  const AGENT_CHAT = join(FUNCS, 'agent-chat', 'index.ts');

  it('attaches images as `image_url`, the shape LangChain actually yields', () => {
    const src = stripComments(read(AGENT_CHAT));
    expect(
      /content\.push\(\{\s*type:\s*'image_url'/.test(src),
      "the last user message must carry images as {type:'image_url', image_url:{url}}",
    ).toBe(true);
  });

  it('never hand-builds the native image block again', () => {
    const src = stripComments(read(AGENT_CHAT));
    // `{type:'image', source:{...}}` is dropped whole by the pinned library, silently, along
    // with every content block after it. It looks more "native" and more correct, which is
    // exactly why it needs pinning down.
    const native = src.match(/type:\s*'image'\s*,\s*source:/g) ?? [];
    expect(
      native.length,
      'a native Anthropic image block is being constructed — the pinned @langchain/anthropic '
      + 'returns instead of yielding it, so the image (and everything after it) never reaches '
      + "the API. Use {type:'image_url', image_url:{url}}.",
    ).toBe(0);
  });

  it('still sends documents as document blocks — those are yielded correctly', () => {
    const src = stripComments(read(AGENT_CHAT));
    expect(src).toMatch(/type:\s*'document'/);
  });
});
