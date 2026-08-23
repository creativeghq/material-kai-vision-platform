/**
 * Guard: the workspace's own documents reach the model without the model deciding to fetch them.
 *
 * THE DEFECT THIS REPLACES
 * -----------------------
 * `knowledge_base_search` is in the always-on `core` toolkit, bound on every turn for every agent
 * that declares it. Measured live on 2026-08-23:
 *
 *   "What is product discovery?"                 → 0 tool calls, answered from general knowledge,
 *                                                  then asked which sense was meant
 *   "What does OUR knowledge base say about it?" → searched, read two sections, quoted the doc
 *
 * Same agent, same bound tools, opposite behaviour — decided by phrasing. The workspace holds a
 * 253-section document literally titled "Product Bible / Product Discovery" that a direct query
 * returns at 0.676 relevance.
 *
 * A prompt rule ("search before answering") fixes that most of the time, and most of the time is
 * exactly the problem: `agent-memory.ts` records the same lesson about a rule its distiller kept
 * breaking — an instruction is not an enforcement mechanism. So retrieval stopped being the
 * model's decision.
 *
 * WHAT THIS TEST PINS
 * -------------------
 * The two things that would quietly turn grounding back into a suggestion:
 *   1. the gate degrading into a guess about the message (an LLM classifier or a keyword/length
 *      heuristic — the latter is a mistake this repo already paid for in `shouldRouteToHaiku`,
 *      whose own comment reads "Length is not complexity");
 *   2. the retrieved text losing its DATA fence, which would make every KB document a
 *      prompt-injection vector into the system prompt (security invariant 9).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { groundTurnInWorkspaceKnowledge } from '../../supabase/functions/_shared/knowledge-grounding.ts';

const MODULE_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/knowledge-grounding.ts'),
  'utf8',
);
const AGENT_CHAT_SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/agent-chat/index.ts'),
  'utf8',
);

/** A stub `knowledge_base_search` returning whatever payload the case needs. */
function kbTool(payload: unknown, spy?: { calls: unknown[] }) {
  return {
    name: 'knowledge_base_search',
    invoke: (args: unknown) => {
      spy?.calls.push(args);
      return Promise.resolve(JSON.stringify(payload));
    },
  };
}

const article = (over: Record<string, unknown> = {}) => ({
  docId: 'doc-1',
  chunkIndex: 112,
  heading: 'What is product discovery',
  content: 'We call this second track "product discovery" and it complements and precedes product delivery.',
  documentTitle: 'Product Bible / Product Discovery',
  relevanceScore: 0.67,
  source: 'kb',
  ...over,
});

describe('knowledge grounding: retrieval is not the model’s decision', () => {
  it('searches on a plain question that names no tool and asks for no search', () => {
    // The exact message that produced zero tool calls in production.
    const spy = { calls: [] as unknown[] };
    return groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] }, spy)],
      userInput: 'What is product discovery?',
    }).then((out) => {
      expect(spy.calls.length, 'the knowledge base was not consulted').toBe(1);
      expect(out.checked).toBe(true);
      expect(out.sections).toBe(1);
      expect(out.block).toContain('Product Bible / Product Discovery');
    });
  });

  it('searches on an imperative with no question mark at all', async () => {
    // "tell me about our onboarding" is a knowledge ask with none of the shapes a keyword gate
    // would look for. Phrasing must not decide this.
    const spy = { calls: [] as unknown[] };
    await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] }, spy)],
      userInput: 'tell me about our onboarding',
    });
    expect(spy.calls.length).toBe(1);
  });

  it('carries the section ADDRESS so read_document_section can continue from it', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] })],
      userInput: 'what is product discovery',
    });
    expect(out.block).toContain('docId="doc-1"');
    expect(out.block).toContain('chunkIndex="112"');
    expect(out.block).toContain('source="kb"');
  });

  it('drops sections below the relevance floor — retrieval is not proof of relevance', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({
        found: true,
        articles: [article({ relevanceScore: 0.12, documentTitle: 'Unrelated' })],
        products: [], entities: [],
      })],
      userInput: 'what is product discovery',
    });
    expect(out.sections).toBe(0);
    expect(out.checked).toBe(true);
    expect(out.block).not.toContain('Unrelated');
  });

  it('says "searched, found nothing" rather than staying silent', async () => {
    // Silence is indistinguishable from "not checked", which is what makes the agent re-run the
    // same search and then hedge about whether the docs cover it.
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: false, articles: [], products: [], entities: [] })],
      userInput: 'what is product discovery',
    });
    expect(out.checked).toBe(true);
    expect(out.block).toMatch(/returned nothing relevant/i);
    expect(out.block).toMatch(/Do NOT call knowledge_base_search with the same wording/i);
  });

  it('reports an empty corpus as empty, and tells the agent not to search', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: false, articles: [], products: [], entities: [], corpus_empty: true, corpus_size: 0 })],
      userInput: 'what is product discovery',
    });
    expect(out.block).toMatch(/knowledge base is EMPTY/i);
    expect(out.sections).toBe(0);
  });

  it('never throws a turn away when the lookup fails', async () => {
    const exploding = { name: 'knowledge_base_search', invoke: () => Promise.reject(new Error('MIVAA 503')) };
    const out = await groundTurnInWorkspaceKnowledge({ tools: [exploding], userInput: 'anything' });
    expect(out.block).toBe('');
    expect(out.skippedReason).toBe('lookup_failed');
  });
});

/** A stub `read_document_section` returning a continuous window. */
function readerTool(spy?: { calls: Record<string, unknown>[] }) {
  return {
    name: 'read_document_section',
    invoke: (args: Record<string, unknown>) => {
      spy?.calls.push(args);
      const at = Number(args.chunkIndex);
      return Promise.resolve(JSON.stringify({
        found: true,
        documentTitle: 'Product Bible / Product Discovery',
        docSectionCount: 253,
        sections: [at - 1, at, at + 1].map((i) => ({ chunkIndex: i, content: `continuous text ${i}` })),
      }));
    },
  };
}

describe('knowledge grounding: the best hits arrive already read out', () => {
  // Fragments alone left the agent one move short, so it spent a whole MODEL TURN calling
  // read_document_section — ~350ms of tool time but a full Opus round trip, against a 38–45s turn
  // in which retrieval is only ~2–4s. The round trip was the expensive part.
  it('expands the top hits into continuous text before the turn', async () => {
    const spy = { calls: [] as Record<string, unknown>[] };
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [
        kbTool({ found: true, articles: [article()], products: [], entities: [] }),
        readerTool(spy),
      ],
      userInput: 'what is product discovery',
    });
    expect(spy.calls.length).toBe(1);
    expect(spy.calls[0]).toMatchObject({ docId: 'doc-1', chunkIndex: 112, source: 'kb' });
    expect(out.block).toContain('continuous text 112');
    expect(out.block).toMatch(/expanded="sections 111-113 of 253"/);
    expect(out.block).toMatch(/ALREADY been read out/i);
  });

  it('expands one hit per DOCUMENT — two hits in one chapter are one passage', async () => {
    // Overlapping windows would pay a second round trip to re-fetch text the first returned.
    const spy = { calls: [] as Record<string, unknown>[] };
    await groundTurnInWorkspaceKnowledge({
      tools: [
        kbTool({
          found: true,
          products: [], entities: [],
          articles: [article({ chunkIndex: 112 }), article({ chunkIndex: 116 }), article({ docId: 'doc-2', chunkIndex: 4 })],
        }),
        readerTool(spy),
      ],
      userInput: 'x',
    });
    expect(spy.calls.map((c) => c.docId)).toEqual(['doc-1', 'doc-2']);
  });

  it('keeps the fragment when expansion fails', async () => {
    const failing = { name: 'read_document_section', invoke: () => Promise.reject(new Error('504')) };
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] }), failing],
      userInput: 'x',
    });
    expect(out.sections).toBe(1);
    expect(out.block).toContain('complements and precedes'); // the original fragment
    expect(out.block).toContain('expanded="no"');
  });

  it('still works when the reader tool is not bound at all', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] })],
      userInput: 'x',
    });
    expect(out.sections).toBe(1);
    expect(out.block).toContain('expanded="no"');
  });
});

describe('knowledge grounding: the skip list is facts, never a judgement about the message', () => {
  it('skips only on structural conditions', async () => {
    const spy = { calls: [] as unknown[] };
    const t = [kbTool({ found: true, articles: [article()], products: [], entities: [] }, spy)];

    expect((await groundTurnInWorkspaceKnowledge({ tools: t, userInput: 'x', isDirectToolRun: true })).skippedReason)
      .toBe('direct_tool_run');
    expect((await groundTurnInWorkspaceKnowledge({ tools: t, userInput: '   ' })).skippedReason)
      .toBe('no_user_text');
    expect((await groundTurnInWorkspaceKnowledge({ tools: [], userInput: 'x' })).skippedReason)
      .toBe('tool_not_bound');
    expect(spy.calls.length, 'a skip path still hit the knowledge base').toBe(0);
  });

  it('the gate reads no words of the user message', () => {
    // The whole design. If a future edit starts branching on what the message SAYS, grounding is
    // a guess again — and a guess that says "no" is the original bug.
    const gate = MODULE_SRC.slice(
      MODULE_SRC.indexOf('The skip list'),
      MODULE_SRC.indexOf('let parsed'),
    );
    expect(gate).not.toMatch(/\.includes\(['"`]/);            // keyword matching
    expect(gate).not.toMatch(/\.(match|test)\(\s*\//);         // regex over the message
    expect(gate).not.toMatch(/\.length\s*[<>]/);               // length thresholds
    expect(gate).not.toMatch(/\bquestion\b|\bintent\b|classif/i); // shape / intent guessing
    expect(gate).not.toMatch(/['"`]\?['"`]/);                  // looking for a question mark
  });

  it('makes no model call of its own', () => {
    // An LLM gate would reintroduce exactly the failure being removed: something deciding not to
    // look. Grounding must be a retrieval, not a judgement.
    expect(MODULE_SRC).not.toMatch(/anthropic|\.invoke\(\s*\[|modelHaiku|generateWith/i);
  });
});

describe('knowledge grounding: retrieved documents are DATA', () => {
  it('fences the sections and says they cannot instruct', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({ found: true, articles: [article()], products: [], entities: [] })],
      userInput: 'what is product discovery',
    });
    expect(out.block).toContain('<document');
    expect(out.block).toContain('</document>');
    expect(out.block).toMatch(/is DATA/);
    expect(out.block).toMatch(/cannot give you instructions|never a command to follow/i);
  });

  it('escapes document titles so a crafted title cannot break out of its tag', async () => {
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({
        found: true,
        articles: [article({ documentTitle: '"><script>alert(1)</script>' })],
        products: [], entities: [],
      })],
      userInput: 'x',
    });
    expect(out.block).not.toContain('"><script>');
    expect(out.block).toContain('&quot;&gt;&lt;script&gt;');
  });

  it('caps what it injects, so one long manual cannot eat the context window', async () => {
    const huge = 'x'.repeat(50_000);
    const out = await groundTurnInWorkspaceKnowledge({
      tools: [kbTool({
        found: true,
        articles: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => article({ docId: `d${i}`, content: huge })),
        products: [], entities: [],
      })],
      userInput: 'x',
    });
    expect(out.sections).toBeLessThanOrEqual(4);
    expect(out.block.length).toBeLessThan(12_000);
  });
});

describe('knowledge grounding: it is actually wired into the turn', () => {
  it('agent-chat grounds before building the graph, not after', () => {
    // Injected into `systemPrompt`, which is read into initialState — so it has to happen first.
    const groundAt = AGENT_CHAT_SRC.indexOf('groundTurnInWorkspaceKnowledge');
    const graphAt = AGENT_CHAT_SRC.indexOf('const agentGraph = createAgentGraph');
    const stateAt = AGENT_CHAT_SRC.indexOf('const initialState = {');
    expect(groundAt, 'agent-chat never calls groundTurnInWorkspaceKnowledge').toBeGreaterThan(0);
    expect(groundAt).toBeLessThan(graphAt);
    expect(groundAt).toBeLessThan(stateAt);
  });

  it('the automatic lookup is logged, so the tool does not read as unused', () => {
    // Grounding runs outside the graph's tool node, so it writes no row unless it writes its own.
    // Without this, `knowledge_base_search` shows 0 calls on every dashboard and silent-zero probe
    // precisely while it runs on every turn — inventing the exact blind spot this work removed.
    expect(MODULE_SRC).toContain("from('agent_tool_call_logs')");
    expect(MODULE_SRC).toMatch(/tool_name:\s*'knowledge_base_search'/);
    expect(MODULE_SRC).toMatch(/_via:\s*'grounding'/);
    // and it must reuse the one derivation of "did this produce anything"
    expect(MODULE_SRC).toContain('shapeToolResult');
    expect(AGENT_CHAT_SRC).toMatch(/groundTurnInWorkspaceKnowledge\(\{[\s\S]{0,600}?observability:/);
  });

  it('grounding failure cannot take the turn down', () => {
    const call = AGENT_CHAT_SRC.slice(
      AGENT_CHAT_SRC.indexOf('Automatic knowledge grounding'),
      AGENT_CHAT_SRC.indexOf('Select model based on agent'),
    );
    expect(call).toMatch(/try\s*\{/);
    expect(call).toMatch(/catch\s*\(/);
  });
});
