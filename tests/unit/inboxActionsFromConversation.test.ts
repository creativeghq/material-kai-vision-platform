import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

describe('a document in a conversation can become an order, a bill, a payment', () => {
  const menu = read('src/pages/Inbox/components/AttachmentActions.tsx');
  it('offers Create order, Book as a bill and Pay through the platform\'s own dialogs', () => {
    expect(menu).toContain('<NewOrderDialog');
    expect(menu).toContain('<NewExpenseDialog');
    expect(menu).toContain('<PayViaRevolutDialog');
    expect(menu).toContain('receiptFile: expenseFile');
  });

  it('shows nothing to a customer: the actions need a member scope', () => {
    expect(menu).toContain('if (!scope) return null;');
    expect(read('src/pages/Inbox/components/ConversationPane.tsx')).toContain('<AttachmentActionsProvider value={isMember ? {');
  });

  it('every attachment shape carries the menu', () => {
    const view = read('src/pages/Inbox/components/AttachmentView.tsx');
    expect((view.match(/<AttachmentActionsMenu /g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(read('src/pages/Inbox/gmail/mailParts.tsx')).toContain('<AttachmentActionsMenu');
  });

  it('the New Order dialog is one component, shared by Sales and the Inbox', () => {
    expect(read('src/pages/Sales/SalesPage.tsx')).toContain("from '@/modules/quotes/components/NewOrderDialog'");
    expect(read('src/pages/Sales/SalesPage.tsx')).not.toContain('const NewOrderDialog');
  });
});

describe('the conversation drawer works the record, not just shows it', () => {
  const api = read('supabase/functions/inbox-api/index.ts');
  it('an email sender can be added to the CRM, reusing a contact with that address', () => {
    const create = api.slice(api.indexOf("case 'create_contact_from_thread'"), api.indexOf("case 'link_company_to_thread'"));
    expect(create).toContain("thread.channel === 'email'");
    expect(create).toContain(".ilike('email', escapeLike(senderEmail))");
    expect(create.indexOf(".ilike('email'")).toBeLessThan(create.indexOf(".from('crm_contacts').insert"));
  });

  it('the context carries deals, meetings, appointments and open tasks', () => {
    expect(api).toContain('deals: dealsRes.data ?? [], meetings: meetingsRes.data ?? [], appointments: apptsRes.data ?? [], tasks: tasksRes.data ?? []');
  });

  it('a meeting from the conversation can email the customer a calendar invite', () => {
    expect(read('src/pages/Inbox/components/DetailsRailExtras.tsx')).toContain('sendInvites: invite');
  });
});
