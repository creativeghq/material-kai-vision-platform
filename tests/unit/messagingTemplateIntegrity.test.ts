/**
 * A messaging template belongs to a business, and an approved one is frozen (#359 CM-3 / CM-4).
 *
 * CM-4: `messaging_templates` had NO workspace column at all, and the `templates` action selected
 * every row on the service-role client. A template body IS business copy — prices, offers, the way
 * a company talks to its customers — so every tenant could read every other tenant's.
 *
 * CM-3: the send path resolved a template by id alone, with no workspace, no `is_active` and no
 * approval check. And Meta approves a template by NAME: editing the row after approval keeps the
 * approved name while changing what it says, which is how a business sends marketing copy under a
 * utility approval and has its number rated down for it.
 *
 * The freeze is a SQL trigger, so no writer can go round it. What this file can see is the
 * checkout: that the send path asks the right four questions, that the listing is scoped, and that
 * nothing writes the generated `is_approved` column by hand.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const api = read('supabase/functions/messaging-api/index.ts');
const service = read('src/modules/messaging/services/messagingService.ts');
const tab = read('src/modules/messaging/components/MessagingTemplatesTab.tsx');

describe('#359 CM-3 — a template is resolved for sending, not merely fetched', () => {
  const resolver = api.slice(api.indexOf('async function resolveSendableTemplate'), api.indexOf('function toE164'));

  it('asks all four questions', () => {
    // Each is a different failure: the wrong tenant, a retired template, one Meta never saw, and
    // an "approved" row with no Meta name — which is a freeform send wearing a template.
    expect(resolver).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(resolver).toMatch(/is_active === false/);
    expect(resolver).toMatch(/approval_status !== 'approved'/);
    expect(resolver).toMatch(/!data\.whatsapp_template_name/);
  });

  it('both send paths go through it', () => {
    const lookups = api.match(/resolveSendableTemplate\(supabaseClient, tenantWsId/g) ?? [];
    expect(lookups.length, 'send and send-bulk must both resolve the same way').toBe(2);
    expect(api, 'the unscoped by-id lookup is back')
      .not.toMatch(/from\('messaging_templates'\)\.select\('\*'\)\.eq\('id', body\.templateId\)/);
  });

  it('an unusable id refuses the send rather than falling back to freeform', () => {
    // A missing template degrading to "send the body instead" is how a marketing blast goes out
    // as an unapproved freeform message to people who never opened a conversation.
    expect(api).toMatch(/if \('error' in resolved\) throw new HttpError\(404, resolved\.error\)/);
  });

  it('the resolver hides whether the id exists', () => {
    // 404-shaped for both "no such template" and "not yours" — invariant 1, no id enumeration.
    expect(resolver).toMatch(/if \(!data\) return \{ error: 'Template not found\.' \}/);
  });
});

describe('#359 CM-3 — is_approved is derived, not a second copy', () => {
  it('the client never writes it', () => {
    // Two columns holding one fact are free to disagree, and Postgres refuses a non-DEFAULT write
    // to a generated column — so a caller that still supplies it is a hard runtime error.
    expect(service).toMatch(/'id' \| 'created_at' \| 'updated_at' \| 'is_approved'/);
    expect(service).toMatch(/is_approved: _derived/);
    expect(tab, 'the tab sets is_approved by hand again').not.toMatch(/is_approved: (false|true)/);
  });

  it('a duplicate starts unapproved whatever the original was', () => {
    // Meta approved THAT name, not this one.
    expect(tab).toMatch(/approval_status: 'pending'/);
  });

  it('the update path surfaces the freeze instead of swallowing it', () => {
    // The trigger raises 42501 with the sentence to show the user; a generic "Failed to update"
    // would leave them re-clicking Save on a template that will never take the edit.
    expect(service).toMatch(/if \(error\.code === '42501'\) throw new Error\(error\.message\)/);
  });
});

describe('#359 CM-4 — a template is not readable across tenants', () => {
  it('the edge listing is workspace-scoped', () => {
    const listing = api.slice(api.indexOf("case 'templates':"), api.indexOf("case 'logs':"));
    expect(listing).toMatch(/readScopeWorkspaceIds\(\)/);
    expect(listing).toMatch(/tplQuery\.in\('workspace_id', tplScope\)/);
    // An empty scope is a tenant who belongs nowhere: they see nothing, not everything.
    expect(listing).toMatch(/tplScope && tplScope\.length === 0/);
  });

  it('the client reads and writes are scoped too', () => {
    expect(service).toMatch(/async getTemplates\(workspaceId: string/);
    expect(service).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(service).toMatch(/async getTemplateBySlug\(workspaceId: string, slug: string\)/);
  });

  it('the owner is a parameter, never a field in the payload', () => {
    // Letting the payload name the owner is the mass assignment invariant 8 forbids, and
    // re-homing a template is a transfer of somebody else's business copy.
    expect(service).toMatch(/insert\(\{ \.\.\.template, workspace_id: workspaceId \}\)/);
    expect(service).toMatch(/workspace_id: _ignored/);
  });

  it('the tab reloads when the workspace changes', () => {
    expect(tab).toMatch(/\}, \[activeWorkspaceId\]\);/);
  });
});
