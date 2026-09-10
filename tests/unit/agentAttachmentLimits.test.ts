/**
 * What the composer OFFERS to attach must equal what agent-chat ACCEPTS.
 *
 * The limits were three `const`s inside agent-chat's request handler — `MAX_IMAGES`,
 * `MAX_DOCUMENTS`, `MAX_MULTIMODAL_CHARS` — and the guard they backed was correct: it refuses an
 * oversized turn with 413 before any model call, because attachments become native
 * vision/document blocks with no per-item cap while the turn fee is flat.
 *
 * The composer knew none of that. `attachDocumentFiles` was an unbounded
 * `setAttachedDocuments(prev => [...prev, ...docs])`, so a user attached 19 PDFs, saw 19 chips,
 * pressed send, waited through 19 base64 reads and an upload, and got back:
 *
 *   Agent execution failed: 413 - {"error":"Too many documents attached: 19 (max 6 per turn)."}
 *
 * Two separate defects, both of them silent until a user finds them:
 *
 * 1. An OFFER the enforcer refuses. The catalog-PDF branch eight lines away had always clamped to
 *    one and said so; the read-document branch clamped to nothing. Nothing could have caught it —
 *    the numbers were not reachable from the surface that needed them.
 * 2. A refusal rendered as a STACK TRACE. AgentHub's catch translated exactly one shape (the 402
 *    credits refusal, itself the subject of creditRefusalIsAnOffer.test.ts) and printed the raw
 *    status plus the raw JSON for everything else — while the function had written a perfectly
 *    readable sentence and put it in the body.
 *
 * So: one predicate, mirrored to both runtimes, and a refusal that reads like one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';
import {
  AGENT_MAX_IMAGES,
  AGENT_MAX_DOCUMENTS,
  AGENT_MAX_MULTIMODAL_CHARS,
  checkAgentAttachments,
  attachmentRoom,
  attachmentsWithinBytes,
} from '../../src/config/agentAttachmentLimits';
import { humanEdgeRefusal, looksInsufficientCredits } from '../../src/utils/edgeError';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const AGENT_HUB = 'src/components/features/ai/AgentHub.tsx';
const MIRROR = 'supabase/functions/_shared/agentAttachmentLimits.generated.ts';

/**
 * Every argument passed to `fn(...)` in `src`, matched by paren depth so a nested call or an
 * arrow body does not truncate it the way a `[^)]*` regex would.
 */
function callArguments(src: string, fn: string): string[] {
  const out: string[] = [];
  const needle = `${fn}(`;
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) {
    let depth = 0;
    for (let j = i + needle.length - 1; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')' && --depth === 0) {
        out.push(src.slice(i + needle.length, j));
        break;
      }
    }
  }
  return out;
}

/**
 * Whether this write can leave the composer holding MORE attachments than before — the only
 * shape that needs a cap. A clear (`[]`), a single pick (`[imageUrl]`), a removal
 * (`prev.filter(...)`) and a reorder all shrink or hold, and demanding a slice on those would
 * just teach the next reader to bypass the guard.
 */
function canGrow(arg: string): boolean {
  const a = arg.trim();
  if (a.startsWith('[')) {
    const inner = a.slice(1, a.lastIndexOf(']')).trim();
    if (inner === '') return false; // clear
    if (inner.includes('...')) return true; // spread of unknown length
    let depth = 0;
    for (const ch of inner) {
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) return true; // more than one element
    }
    return false; // exactly one element
  }
  // A functional updater grows only when something is spread in ALONGSIDE the old items. A bare
  // `[...prev]` is a copy the slot UI then reorders in place — same length, and demanding a slice
  // on it would be noise the next reader learns to route around.
  if (/^\(?\s*prev\s*\)?\s*=>/.test(a)) {
    return /\[\s*\.\.\.prev\s*,/.test(a) || /,\s*\.\.\.prev\s*\]/.test(a);
  }
  // Anything else is an array-valued expression of unknown length.
  return true;
}

/** The exact 413 body agent-chat returns for the case that was reported. */
const REAL_413 =
  'Agent execution failed: 413 - {"error":"Too many documents attached: 19 (max 6 per turn).","code":"too_many_documents"}';
/** The exact 402 body, from creditRefusalIsAnOffer.test.ts. It must keep taking the credits path. */
const REAL_402 = 'Agent execution failed: 402 - {"error":"insufficient_credits","current_balance":0.59}';

describe('the one predicate', () => {
  it('accepts a turn at the limit and refuses the one over it', () => {
    const doc = 'data:application/pdf;base64,AAAA';
    const atLimit = new Array(AGENT_MAX_DOCUMENTS).fill(doc);
    expect(checkAgentAttachments({ documents: atLimit })).toBeNull();

    const over = checkAgentAttachments({ documents: [...atLimit, doc] });
    expect(over?.code).toBe('too_many_documents');
    expect(over?.message).toContain(`max ${AGENT_MAX_DOCUMENTS} per turn`);

    const img = 'https://example.test/i.jpg';
    expect(checkAgentAttachments({ images: new Array(AGENT_MAX_IMAGES).fill(img) })).toBeNull();
    expect(checkAgentAttachments({ images: new Array(AGENT_MAX_IMAGES + 1).fill(img) })?.code)
      .toBe('too_many_images');
  });

  it('refuses on BYTES even when both counts are legal', () => {
    // Six 6MB-of-base64 PDFs: a legal count, ~36MB of payload.
    const fat = 'x'.repeat(6 * 1024 * 1024);
    const refusal = checkAgentAttachments({ documents: new Array(AGENT_MAX_DOCUMENTS).fill(fat) });
    expect(refusal?.code).toBe('attachments_too_large');
    expect(AGENT_MAX_DOCUMENTS * fat.length).toBeGreaterThan(AGENT_MAX_MULTIMODAL_CHARS);
  });

  it('never prints a size that equals the limit it is over', () => {
    // Rounding both operands said `~32MB, max 32MB per turn` — self-contradictory, and nothing the
    // reader can act on. A turn is only ever refused for being OVER.
    // A kilobyte over is the hard case: one decimal alone rounds it back to the limit.
    for (const excess of [1024, 1024 * 1024, 40 * 1024 * 1024]) {
      const message = checkAgentAttachments({
        documents: ['x'.repeat(AGENT_MAX_MULTIMODAL_CHARS + excess)],
      })?.message ?? '';
      const [actual, limit] = [...message.matchAll(/([\d.]+)MB/g)].map((m) => Number(m[1]));
      expect(message).toContain('too large');
      expect(actual, `${message} — a refused turn must not print its own limit as its size`)
        .toBeGreaterThan(limit);
    }
  });

  it('fits attachments under the byte ceiling in order, and refuses one that never could', () => {
    const half = 'x'.repeat(AGENT_MAX_MULTIMODAL_CHARS / 2);
    expect(attachmentsWithinBytes([], [half, half])).toEqual({ accepted: 2, rejected: 0 });
    expect(attachmentsWithinBytes([half], [half, half])).toEqual({ accepted: 1, rejected: 1 });
    // A single item over the whole ceiling takes nothing with it, rather than being accepted here
    // and refused at send.
    const enormous = 'x'.repeat(AGENT_MAX_MULTIMODAL_CHARS + 1);
    expect(attachmentsWithinBytes([], [enormous])).toEqual({ accepted: 0, rejected: 1 });
    expect(attachmentsWithinBytes([], [])).toEqual({ accepted: 0, rejected: 0 });
  });

  it('survives a caller that passes nothing, or garbage', () => {
    expect(checkAgentAttachments({})).toBeNull();
    expect(checkAgentAttachments({ images: undefined, documents: undefined })).toBeNull();
    expect(checkAgentAttachments({ documents: [null as unknown as string] })).toBeNull();
  });

  it('attachmentRoom never returns more than the limit allows', () => {
    expect(attachmentRoom(0, 19, AGENT_MAX_DOCUMENTS)).toEqual({ accepted: 6, rejected: 13 });
    expect(attachmentRoom(6, 1, AGENT_MAX_DOCUMENTS)).toEqual({ accepted: 0, rejected: 1 });
    expect(attachmentRoom(2, 2, AGENT_MAX_DOCUMENTS)).toEqual({ accepted: 2, rejected: 0 });
    // Already over (a stale render, a restored draft) — never negative, never a top-up.
    expect(attachmentRoom(9, 3, AGENT_MAX_DOCUMENTS)).toEqual({ accepted: 0, rejected: 3 });
  });
});

describe('the enforcer reads the shared predicate, not a private copy', () => {
  const src = stripComments(read(AGENT_CHAT));

  it('imports the generated mirror', () => {
    expect(src).toMatch(/import\s*\{[^}]*checkAgentAttachments[^}]*\}\s*from\s*['"]\.\.\/_shared\/agentAttachmentLimits\.generated\.ts['"]/);
    expect(src).toContain('checkAgentAttachments({');
  });

  it('does not re-declare the numbers it used to own', () => {
    // The whole point: a second declaration is a limit the composer cannot see.
    for (const name of ['MAX_IMAGES', 'MAX_DOCUMENTS', 'MAX_MULTIMODAL_CHARS']) {
      expect(src, `${AGENT_CHAT} re-declares ${name} — the composer clamps on the mirrored source, so a local copy is drift by construction`)
        .not.toMatch(new RegExp(`const\\s+${name}\\s*=`));
    }
  });

  it('still answers 413, and still names which limit', () => {
    expect(src).toMatch(/status:\s*413/);
    expect(src).toMatch(/code:\s*attachmentRefusal\.code/);
  });
});

describe('the composer clamps before the read, not after the send', () => {
  const src = stripComments(read(AGENT_HUB));

  it('imports the limits rather than restating them', () => {
    expect(src).toMatch(/from\s*['"]@\/config\/agentAttachmentLimits['"]/);
    expect(src).toContain('AGENT_MAX_DOCUMENTS');
    expect(src).toContain('AGENT_MAX_IMAGES');
  });

  it('fills neither attachment array without a ceiling', () => {
    // Not just the append that shipped the bug — EVERY write that can leave the composer holding
    // more than it held before. A deep link and a toolkit form both seed these arrays wholesale,
    // and a seed of 19 is refused exactly like a paperclip of 19.
    for (const [setter, limit] of [
      ['setAttachedDocuments', 'AGENT_MAX_DOCUMENTS'],
      ['setAttachedImages', 'AGENT_MAX_IMAGES'],
    ] as const) {
      const calls = callArguments(src, setter);
      expect(calls.length, `${setter} is gone — re-point this guard at whatever replaced it`)
        .toBeGreaterThan(0);
      for (const arg of calls) {
        if (!canGrow(arg)) continue;
        expect(arg.replace(/\s+/g, ' '), `an uncapped ${setter}: agent-chat refuses the turn with 413 above ${limit}`)
          .toContain(`slice(0, ${limit})`);
      }
    }
  });

  it('tells the user at attach time', () => {
    expect(src).toMatch(/\$\{AGENT_MAX_DOCUMENTS\} documents is the limit/);
    expect(src).toMatch(/\$\{AGENT_MAX_IMAGES\} images is the limit/);
  });

  it('checks BYTES at attach time too, not only counts', () => {
    // The count clamp alone leaves the byte ceiling discoverable only after the upload — the exact
    // shape the counts were clamped to close.
    expect(src).toContain('attachmentsWithinBytes(');
  });

  it('sends what is attached: the send handler sees the documents array', () => {
    // `attachedDocuments` was missing from handleSendMessage's dependency list while
    // `attachedCatalogPdfs` was present, so the closure held a stale array. Attaching a PDF and
    // pressing send WITHOUT typing hit the empty-composer guard and did nothing at all, with the
    // button enabled and no error — typing first hid it, because `input` is in that list.
    const deps = src.match(/\}, \[input, selectedAgent, selectedModel,[^\]]*\]\);/);
    expect(deps, 'handleSendMessage dependency list not found — re-point this guard').toBeTruthy();
    for (const state of ['attachedImages', 'attachedCatalogPdfs', 'attachedDocuments']) {
      expect(deps![0], `handleSendMessage closes over ${state} but does not depend on it`)
        .toContain(state);
    }
  });
});

describe('a refusal reads like a sentence', () => {
  it('humanises the real 413 instead of printing its JSON', () => {
    expect(humanEdgeRefusal(REAL_413)).toBe('Too many documents attached: 19 (max 6 per turn).');
  });

  it('leaves the credits refusal to the credits path, untouched', () => {
    // Slug-shaped body: humanising it would print `insufficient_credits` at the user AND strip the
    // `current_balance` the top-up card reads out of the raw string.
    expect(humanEdgeRefusal(REAL_402)).toBeNull();
    expect(looksInsufficientCredits(REAL_402)).toBe(true);
  });

  it('returns null rather than guessing when there is no body', () => {
    expect(humanEdgeRefusal('Failed to fetch')).toBeNull();
    expect(humanEdgeRefusal('Agent execution failed: 500 - ')).toBeNull();
    expect(humanEdgeRefusal(undefined)).toBeNull();
    expect(humanEdgeRefusal('Agent execution failed: 502 - <html>bad gateway</html>')).toBeNull();
  });

  it('leaves a CRASH looking like a crash', () => {
    // A 5xx body carries whatever the exception said. Rendering that as clean prose strips the
    // status and puts an internal error on screen as an ordinary assistant reply — a failure the
    // reader cannot tell from an answer. Only a 4xx is a decision someone wrote a sentence for.
    expect(humanEdgeRefusal(
      'Agent execution failed: 500 - {"error":"Cannot read properties of undefined (reading \'id\')"}',
    )).toBeNull();
    expect(humanEdgeRefusal('Agent execution failed: 503 - {"error":"Model provider unavailable"}')).toBeNull();
    // …and every 4xx our own functions answer with still comes through.
    expect(humanEdgeRefusal('Agent execution failed: 400 - {"error":"Attach a PDF, not a folder."}'))
      .toBe('Attach a PDF, not a folder.');
  });

  it('is what AgentHub actually renders on a non-credit failure', () => {
    const src = stripComments(read(AGENT_HUB));
    expect(src).toContain('humanEdgeRefusal(errText)');
    expect(src).toMatch(/humanRefusal\s*\?\?\s*`Error: \$\{errText\}`/);
  });
});

describe('the mirror is a byte copy of the source', () => {
  it('carries the generated banner and the same body', () => {
    // Freshness is enforced globally by vocabularyMirrors.test.ts; this asserts the pair is
    // REGISTERED there at all, which is the step that is easy to forget.
    const script = read('scripts/gen-vocabularies.mjs');
    expect(script).toContain('src/config/agentAttachmentLimits.ts');
    expect(script).toContain(MIRROR);
    expect(read(MIRROR)).toContain('GENERATED MIRROR of src/config/agentAttachmentLimits.ts');
  });

  it('the source stays import-free, or the mirror cannot build under Deno', () => {
    const src = read('src/config/agentAttachmentLimits.ts');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
