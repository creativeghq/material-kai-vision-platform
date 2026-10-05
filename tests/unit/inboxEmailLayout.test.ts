import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { emailRecipientsOf } from '@/pages/Inbox/emailRecipients';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

describe('an email conversation reads like mail, a chat like a chat', () => {
  const pane = read('src/pages/Inbox/components/ConversationPane.tsx');
  it('renders email messages as mail cards and keeps bubbles for every other channel', () => {
    expect(pane).toContain("const isEmail = activeThread?.channel === 'email'");
    expect(pane).toMatch(/isEmail && \(m\.message_type === 'text' \|\| m\.message_type === 'agent'\) \? \(\s*<EmailMessageCard/);
    expect(pane).toContain('<MessageBubble');
  });

  it('folds every earlier email to one line and keeps the latest open', () => {
    expect(pane).toContain('collapsed={m.id !== lastMailId && !openMail.has(m.id)}');
  });

  it('shows the recipients the channel recorded: To/Cc for incoming mail, what we sent to for ours', () => {
    expect(emailRecipientsOf({ direction: 'incoming', email_to_all: ['a@x.gr', 'b@x.gr'], email_cc: ['c@x.gr'] }))
      .toEqual({ to: ['a@x.gr', 'b@x.gr'], cc: ['c@x.gr'] });
    expect(emailRecipientsOf({ direction: 'outgoing', email_to: 'maria@keros.com', email_cc: ['n@keros.com'] }))
      .toEqual({ to: ['maria@keros.com'], cc: ['n@keros.com'] });
  });

  it('the list flags a conversation that holds files', () => {
    expect(read('supabase/functions/inbox-api/index.ts')).toContain('has_attachments: withFiles.has(id)');
    expect(read('src/pages/Inbox/components/ThreadListPane.tsx')).toContain('t.has_attachments &&');
  });
});
