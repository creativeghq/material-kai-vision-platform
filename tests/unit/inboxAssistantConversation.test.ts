/** How the Inbox assistant reads a conversation, hands it to a person, and never sends a failure. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  formatThreadFacts,
  handoffSince,
  stripQuotedEmail,
} from '../../supabase/functions/_shared/inbox-conversation.ts';
import { readFinalResult } from '../../supabase/functions/_shared/agent-chat-once.ts';

const code = (p: string) => stripComments(readFileSync(resolve(process.cwd(), p), 'utf8'));
const INBOX = 'supabase/functions/inbox-api/index.ts';
const AGENT_CHAT = 'supabase/functions/agent-chat/index.ts';
const EMAIL_WEBHOOKS = 'supabase/functions/email-webhooks/index.ts';

describe('an inbound email is read without the history it quotes', () => {
  it('cuts a Gmail reply header, including one wrapped over two lines', () => {
    const body = 'Hello,\n\nWhen will the worktop arrive?\n\nMaria\n\nOn Mon, Sep 29, 2026 at 10:12 AM Materials Bank <\norders@materialshub.gr> wrote:\n> Dear Maria, thank you.';
    expect(stripQuotedEmail(body)).toEqual({ text: 'Hello,\n\nWhen will the worktop arrive?\n\nMaria', quoted: true });
  });

  it('cuts a Greek client header and an Outlook block', () => {
    expect(stripQuotedEmail('Ευχαριστώ!\n\nΣτις Δευ 29 Σεπ 2026 στις 10:12, Materials Bank έγραψε:\n> παλιό').text).toBe('Ευχαριστώ!');
    const outlook = 'Thanks, confirmed.\n\nFrom: Materials Bank <orders@materialshub.gr>\nSent: Monday, September 29, 2026 10:12\nTo: Maria\nSubject: Order';
    expect(stripQuotedEmail(outlook).text).toBe('Thanks, confirmed.');
  });

  it('keeps the customer line above a header that starts with the same word', () => {
    const it_ = 'Ciao,\nIl prezzo va bene, procediamo.\nIl giorno lun 29 set 2026 Materials Bank ha scritto:\n> vecchio';
    expect(stripQuotedEmail(it_).text).toBe('Ciao,\nIl prezzo va bene, procediamo.');
  });

  it('keeps an inline reply whole rather than dropping the answers', () => {
    const inline = 'Hi,\nOn Mon, Sep 29, 2026 Materials Bank wrote:\n> Which colour?\nGrey please\n> How many?\n20 boxes';
    expect(stripQuotedEmail(inline)).toEqual({ text: inline, quoted: false });
  });

  it('cuts an unprefixed Original Message block', () => {
    expect(stripQuotedEmail('Agreed.\n-----Original Message-----\nold text here').text).toBe('Agreed.');
  });

  it('cuts a trailing run of > lines only when nothing follows it', () => {
    expect(stripQuotedEmail('See below\n> old line\n> older').text).toBe('See below');
    expect(stripQuotedEmail('> they said X\nI disagree with that').quoted).toBe(false);
  });

  it('leaves a forward whole, because the forwarded part is the content', () => {
    const fwd = 'Supplier invoice\n---------- Forwarded message ---------\nFrom: X <x@y.gr>\nDate: Wed\nSubject: Invoice\n\nOn Tue someone wrote:\n> earlier';
    expect(stripQuotedEmail(fwd)).toEqual({ text: fwd, quoted: false });
  });

  it('never returns nothing: an all-quote message is kept as sent', () => {
    expect(stripQuotedEmail('On Mon, Sep 29 X wrote:\n> only quote')).toEqual({ text: 'On Mon, Sep 29 X wrote:\n> only quote', quoted: false });
  });
});

describe('a handoff is read off the thread, by the turn that made it', () => {
  const since = '2026-10-06T10:00:00.000Z';
  const sys = (at: string, h: unknown) => ({ message_type: 'system', created_at: at, metadata: { agent_handoff: h } });

  it('finds a handoff written during the turn, and only then', () => {
    expect(handoffSince([sys('2026-10-06T10:00:05+00:00', { reason: 'supplier', send_reply: false })], since))
      .toEqual({ reason: 'supplier', send_reply: false });
    expect(handoffSince([sys('2026-10-06T09:59:00+00:00', { reason: 'old', send_reply: false })], since)).toBeNull();
    expect(handoffSince([{ message_type: 'text', created_at: '2026-10-06T10:00:05Z', metadata: { agent_handoff: { reason: 'x' } } }], since)).toBeNull();
  });

  it('defaults to sending the reply unless send_reply is explicitly false', () => {
    expect(handoffSince([sys('2026-10-06T10:00:05Z', { reason: 'refund' })], since)?.send_reply).toBe(true);
  });
});

describe('a failed agent turn is never a reply', () => {
  const stream = (chunk: object) => `{"type":"heartbeat"}\n${JSON.stringify({ type: 'final_result', ...chunk })}\n`;

  it('flags the provider-failure answer agent-chat streams with HTTP 200', () => {
    const r = readFinalResult(stream({ text: 'The AI service is unavailable — the platform\'s provider account is out of credit.', failed: true }));
    expect(r.failed).toBe(true);
  });

  it('flags the stream-level error chunk', () => {
    expect(readFinalResult(stream({ text: 'Error: boom', error: true })).failed).toBe(true);
  });

  it('treats a stream with no final answer as failed, not as a considered silence', () => {
    expect(readFinalResult('{"type":"heartbeat"}\n').failed).toBe(true);
  });

  it('passes a real answer through, and an empty one (a silent handoff) as success', () => {
    expect(readFinalResult(stream({ text: '', failed: false }))).toEqual({ text: '', failed: false });
  });

  it('passes a real answer through', () => {
    expect(readFinalResult(stream({ text: '  Yes, we stock it.  ', failed: false }))).toEqual({ text: 'Yes, we stock it.', failed: false });
  });
});

describe('the assistant is told who it is talking to', () => {
  it('names our own outreach and a supplier as what they are', () => {
    const block = formatThreadFacts({ channel: 'whatsapp', openedBy: 'us', counterparty: 'supplier' });
    expect(block).toContain('WhatsApp');
    expect(block).toContain('our own outreach');
    expect(block).toContain('SUPPLIERS');
  });

  it('agent-chat puts the facts in the system prompt, not inside the DATA fence', () => {
    const src = code(AGENT_CHAT);
    expect(src).toContain('systemPrompt += customerThreadFactsBlock');
  });
});

describe('the handoff is real, and only on an unattended reply', () => {
  it('binds the handoff tool only for an auto-reply turn from the service-role customer path', () => {
    const src = code(AGENT_CHAT);
    expect(src).toMatch(/forCustomer && customerThreadId && customerThreadWorkspace && inboxAutoReply/);
    expect(src).toContain("audience === 'customer' && bodyInboxAutoReply === true");
  });

  it('inbox-api asks for it only on the auto-reply, never on a member draft', () => {
    expect(code(INBOX)).toContain("autoReply: billedTo.task === 'inbox_agent_reply'");
  });

  it('re-reads the thread after the turn and sends from a non-active thread only on a send_reply handoff', () => {
    const src = code(INBOX);
    const fn = src.slice(src.indexOf('async function maybeRunAgentReply'), src.indexOf('interface TranscriptAttachment'));
    const turn = fn.indexOf("task: 'inbox_agent_reply'");
    const recheck = fn.indexOf("if (fresh.agent_state !== 'active')");
    const gate = fn.indexOf('if (!handoff?.send_reply) return;');
    expect(turn).toBeGreaterThan(-1);
    expect(recheck).toBeGreaterThan(turn);
    expect(gate).toBeGreaterThan(recheck);
    expect(gate).toBeLessThan(fn.indexOf('insertMessageAndNotify('));
  });

  it('leaves a team-visible note when the turn fails, including on exhausted credits', () => {
    const src = code(INBOX);
    expect(src).toContain('The assistant could not answer this message');
    expect(src).toMatch(/billedTo\.task === 'inbox_agent_reply'\) throw new Error\(`\$\{AGENT_NO_CREDITS\}/);
  });
});

describe('email gets the same assistant as WhatsApp', () => {
  it('calls the reply chokepoint for any human mail, letting the thread state decide', () => {
    const src = code(EMAIL_WEBHOOKS);
    const call = src.indexOf("action: 'internal_agent_reply'");
    const gate = src.lastIndexOf('if (!automated && !platformSender)', call);
    expect(gate, 'the agent call lost its automated/loop gate').toBeGreaterThan(-1);
  });

  it('still lets only the address switch start a NEW email thread with the assistant on', () => {
    const shared = code('supabase/functions/_shared/inbound-email.ts');
    expect(shared).toContain('const autoRespond = workspaceWantsAutopilot && args.autoReplyAllowed;');
  });
});
