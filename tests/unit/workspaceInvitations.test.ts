/**
 * An invitation is how a person becomes a user here, and there is ONE of it.
 *
 * The two failures this pins are both silent. A minted invite that is never sent is a row in
 * `workspace_invites` and a code nobody will ever type. And an invite raised from a CRM record
 * that forgets to carry the record's id redeems perfectly — it just leaves the contact and the
 * login as two unrelated rows, which is the state the CRM was in before this existed.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';
import { WORKSPACE_INVITE_ROLES, WORKSPACE_ROLE_META } from '../../src/auth/workspaceRoles';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const SERVICE = 'src/services/workspaceManagementService.ts';
const CONTACT_PAGE = 'src/modules/crm/pages/ContactDetailPage.tsx';
const COMPANY_PAGE = 'src/modules/crm/pages/CompanyDetailPage.tsx';
const COMPANY_CARD = 'src/modules/crm/components/CompanyWorkspaceCard.tsx';
const TEAM_PANEL = 'src/components/core/Team/TeamPanel.tsx';
const CRM_SERVICE = 'src/services/crm.service.ts';

/** The body of `name(` … matching close paren, by paren depth. */
function bodyOf(src: string, name: string): string {
  const i = src.indexOf(`${name}(`);
  if (i < 0) return '';
  let depth = 0;
  for (let j = i + name.length; j < src.length; j++) {
    if (src[j] === '(') depth++;
    else if (src[j] === ')' && --depth === 0) return src.slice(i, j + 1);
  }
  return src.slice(i);
}

describe('an invitation is minted and sent in one place', () => {
  it('builds the sign-up URL exactly once', () => {
    const src = read(SERVICE);
    const built = src.split('mode=signup&invite=').length - 1;
    expect(built).toBe(1);
    const at = src.indexOf('export function inviteUrlFor');
    expect(at).toBeGreaterThan(-1);
    const helper = src.slice(at, src.indexOf('\n}', at));
    expect(helper).toContain('mode=signup&invite=');
  });

  it('emits the delivery event exactly once, from emitInvitation', () => {
    const src = read(SERVICE);
    expect(src.split("'workspace_invitation_sent'").length - 1).toBe(1);
    const emit = src.indexOf('async function emitInvitation');
    const event = src.indexOf("'workspace_invitation_sent'");
    expect(emit).toBeGreaterThan(-1);
    expect(event).toBeGreaterThan(emit);
  });

  it.each([
    ['inviteByEmail', 'create_workspace_invite'],
    ['inviteCompanyAsWorkspace', 'invite_crm_company_as_workspace'],
  ])('%s mints then sends — never one without the other', (method, rpc) => {
    const src = read(SERVICE);
    const start = src.indexOf(`async ${method}(`);
    expect(start).toBeGreaterThan(-1);
    const next = src.indexOf('\n  async ', start + 1);
    const body = src.slice(start, next === -1 ? src.length : next);
    const minted = body.indexOf(rpc) >= 0 || body.indexOf('this.createInvite') >= 0;
    expect(minted).toBe(true);
    // Order, not just presence: a send before the mint has no code to send.
    expect(body).toContain('emitInvitation');
    const mintAt = Math.max(body.indexOf(rpc), body.indexOf('this.createInvite'));
    expect(body.indexOf('emitInvitation')).toBeGreaterThan(mintAt);
  });
});

describe('an invite raised from a CRM record carries that record', () => {
  it('the contact page passes crmContactId', () => {
    const body = bodyOf(read(CONTACT_PAGE), 'workspaceManagementService.inviteByEmail');
    expect(body).toContain('crmContactId');
  });

  it('the company card passes crmContactId', () => {
    const body = bodyOf(read(COMPANY_CARD), 'workspaceManagementService.inviteCompanyAsWorkspace');
    expect(body).toContain('crmContactId');
  });

  it('the team panel, which has no CRM record, does not invent one', () => {
    expect(read(TEAM_PANEL)).not.toContain('crmContactId');
  });
});

describe('the CRM never mints an account for somebody', () => {
  it('no frontend surface calls the platform-operator user-creation endpoint', () => {
    expect(read(CRM_SERVICE)).not.toContain('inviteUser');
    for (const f of [CONTACT_PAGE, COMPANY_PAGE, COMPANY_CARD]) {
      expect(read(f)).not.toContain('usersAPI.inviteUser');
      expect(read(f)).not.toContain('inviteUserByEmail');
    }
  });
});

describe('the role a form offers is a role the RPC accepts', () => {
  it('owner is not in the invitable set — create_workspace_invite refuses it', () => {
    expect(WORKSPACE_INVITE_ROLES as readonly string[]).not.toContain('owner');
  });

  it('owner still has role meta, because the handover email names it', () => {
    expect(WORKSPACE_ROLE_META.owner.label).toBeTruthy();
    expect(WORKSPACE_ROLE_META.owner.portal).toBeTruthy();
  });

  it('the contact dialog reads the catalog rather than listing roles by hand', () => {
    const src = read(CONTACT_PAGE);
    expect(src).toContain('WORKSPACE_INVITE_ROLES.map');
    for (const r of WORKSPACE_INVITE_ROLES) {
      expect(src).not.toContain(`value="${r}"`);
    }
  });
});

describe('the company surface is mounted', () => {
  it('CompanyDetailPage renders the platform-access card', () => {
    const src = read(COMPANY_PAGE);
    expect(src).toContain('CompanyWorkspaceCard');
    expect(src).toContain("id: 'workspace'");
  });

  it('the card asks the server for the verdict rather than deriving one', () => {
    const src = read(COMPANY_CARD);
    expect(src).toContain('companyWorkspaceStatus');
    // A refusal is a permission answer; rendering the invite form over it would offer an
    // action the RPC will reject.
    expect(src).toContain('42501');
  });
});
