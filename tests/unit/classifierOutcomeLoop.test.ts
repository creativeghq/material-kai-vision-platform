import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import { INBOX_CONVERSATION_INTENTS } from '../../src/modules/messaging/inboxConversationIntents';

const read = (p: string) => blankComments(readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'));
const inboxApi = read('supabase/functions/inbox-api/index.ts');
const between = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

describe('#463 / #506 — a classifier verdict a person judges is recorded with what the model said', () => {
  const action = between(inboxApi, "case 'record_classifier_outcome': {", "case 'get_thread_context': {");

  it('checks membership before anything is written', () => {
    expect(action.indexOf('access.isMember')).toBeGreaterThan(-1);
    expect(action.indexOf('access.isMember')).toBeLessThan(action.indexOf("from('classifier_outcomes')"));
  });

  it('snapshots the verdict and confidence from the stored record, never from the request', () => {
    expect(action).toMatch(/model_confidence: d\.confidence/);
    expect(action).toMatch(/model_confidence: s\.intent_confidence/);
    expect(action, 'the client sends only what the person picked').not.toMatch(/payload\.(model_|confidence|verdict_at|inputs)/);
  });

  it('accepts only values from the mirrored vocabularies', () => {
    expect(action).toMatch(/INBOX_DOCUMENT_KINDS as readonly string\[\]\)\.includes\(human\)/);
    expect(action).toMatch(/INBOX_CONVERSATION_INTENTS as readonly string\[\]\)\.includes\(human\)/);
  });
});

describe('#463 phase 3 — intent rides on the conversation reader, constrained by the server', () => {
  const reader = between(inboxApi, 'async function readConversationSentiment(', '  const sentiment = {');

  it('the forced tool requires intent, its confidence and needs_human', () => {
    expect(reader).toMatch(/required: \[[^\]]*'intent', 'intent_confidence', 'needs_human'\]/);
    expect(reader).toMatch(/enum: \[\.\.\.INBOX_CONVERSATION_INTENTS\]/);
    expect(reader).toMatch(/tool_choice: \{ type: 'tool'/);
  });

  it('an out-of-enum intent is dropped, never rounded to a valid one', () => {
    expect(reader).toMatch(/delete verdict\.intent;/);
    expect(INBOX_CONVERSATION_INTENTS).toContain('other');
  });
});

describe('#506 — an agent run states its model and its cost comes from the usage log', () => {
  it('a run that spent no tokens records no model', () => {
    const runner = read('supabase/functions/background-agent-runner/index.ts');
    expect(runner).toMatch(/model_used:\s+\(result\.inputTokens \?\? 0\) \+ \(result\.outputTokens \?\? 0\) > 0 \? agentConfig\.model : null/);
    expect(runner, 'cost is derived by agent_run_cost_usd(), never stamped').not.toMatch(/total_cost_usd/);
  });

  it('the tracked logger writes the run id, and every model-calling agent passes it', () => {
    const client = read('supabase/functions/_shared/ai-client.ts');
    expect(client).toMatch(/agent_run_id: opts\.agentRunId \?\? null/);
    for (const f of ['lead-conversation-sync-agent', 'material-tagger-agent', 'product-enrichment-agent']) {
      const src = read(`supabase/functions/_shared/agents/${f}.ts`);
      expect(src, `${f} does not attribute its model calls to the run`).toMatch(/agentRunId:\s+ctx\.run\.id/);
    }
  });
});
