/**
 * Opening a conversation must select the agent that OWNS it.
 *
 * A conversation row carries `agent_id`, and every deep link into the Hub
 * (`/agent-hub?conversation=<id>` — the bell notification, the daily job digest,
 * global search, the public KB) passes only that id. Nothing read the row's agent,
 * so the picker kept whatever was last active: the job digest opened its findings
 * under Vision, wearing Vision's avatar and model, and the first follow-up about a
 * job listing was sent to the interior designer.
 *
 * Nothing raises when this breaks — a wrong agent answers perfectly well — so it is
 * checked here at the source, where the three moving parts are visible together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const HUB = readFileSync(join(ROOT, 'src/components/features/ai/AgentHub.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** The body of a `const <name> = useCallback(` / `useEffect(` block, by brace balance. */
const blockAfter = (marker: string): string => {
  const start = HUB.indexOf(marker);
  expect(start, `expected to find ${marker} in AgentHub.tsx`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = start; i < HUB.length; i++) {
    const c = HUB[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return HUB.slice(start, i + 1);
    }
  }
  return HUB.slice(start);
};

describe('opening a conversation selects the agent that owns it', () => {
  const loader = blockAfter('const handleLoadConversation = useCallback(');

  it('reads the conversation ROW, not the in-memory list', () => {
    // `conversations` only ever holds the SELECTED agent's conversations, so the one
    // being opened — which may belong to another agent — is not in it.
    expect(loader).toContain('agentChatHistoryService.getConversation(conversationId)');
    expect(
      loader.includes('conversations.find('),
      'handleLoadConversation must not resolve the conversation from the in-memory list',
    ).toBe(false);
  });

  it('adopts the row\'s agent', () => {
    expect(loader).toContain('setSelectedAgent(');
    // Adopt what the row says, never a hardcoded agent.
    expect(loader).toMatch(/AGENTS\.some\(\s*\(?a\)?\s*=>\s*a\.id === convo\.agentId\s*\)/);
  });

  it('does not clear the thread the agent was adopted for', () => {
    // The conversation-list effect treats an agent change as "the user switched
    // agents" and wipes the thread — which, for an adoption, throws away the very
    // thread the click was for.
    const reset = HUB.slice(HUB.indexOf('const isAgentSwitch ='), HUB.indexOf('const isAgentSwitch =') + 3000);
    expect(reset).toContain('adoptedConversationAgentRef.current === selectedAgent');
    expect(reset).toMatch(/if \(isAgentSwitch && !adoptedForConversation\) \{/);
  });

  it('honours every ?conversation= id, not just the first', () => {
    // A boolean "already loaded" flag went true on the first deep link and stayed
    // true, so a second notification click changed the URL and nothing else.
    const effect = blockAfter('if (!initialConversationId) return;');
    expect(HUB).toContain('loadedConversationParamRef.current === initialConversationId');
    expect(effect).toContain('handleLoadConversation(initialConversationId)');
  });
});
