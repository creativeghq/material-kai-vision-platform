import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const src = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/gmail-api/index.ts'), 'utf8'));
const cases = src.split(/\n\s+case '/).slice(1);
const action = (name: string) => cases.find((c) => c.startsWith(`${name}'`)) ?? '';

describe('gmail-api — a mailbox is its owner\'s alone', () => {
  it('every action on an account loads it through the ownership check', () => {
    for (const name of ['disconnect', 'labels', 'threads', 'thread', 'attachment', 'modify', 'send']) {
      expect(action(name), name).toContain('await accountFor(db, userId,');
    }
    const owner = src.slice(src.indexOf('async function accountFor'), src.indexOf('async function accessTokenFor'));
    expect(owner).toContain('data.user_id !== userId');
    expect(owner).toContain("throw new HttpError(404, 'Mailbox not found')");
  });

  it('keeps the refresh token in Vault, never in a column', () => {
    expect(src).toContain("rpc('mail_account_store_refresh_token'");
    expect(src).toContain("rpc('mail_account_refresh_token'");
    expect(src).not.toMatch(/refresh_token:\s*tok\.refresh_token/);
  });

  it('trusts the callback only with a signed, fresh state, and needs gmail.modify', () => {
    const cb = src.slice(src.indexOf("req.method === 'GET'"), src.indexOf("req.method !== 'POST'"));
    expect(cb.indexOf('verifyOAuthState(')).toBeLessThan(cb.indexOf('exchangeGoogleCode('));
    expect(cb).toContain("return back('invalid_state')");
    expect(cb).toContain("return back('scope_missing')");
  });

  it('marks a revoked grant for reconnection instead of failing silently', () => {
    expect(src).toContain("status: 'needs_reauth'");
  });

  it('sends through Gmail and never trusts a reply target from another thread', () => {
    const send = action('send');
    expect(send).toContain("'/messages/send'");
    expect(send).toContain("orig.threadId !== threadId");
    expect(send).toContain('renderEmailMarkup(text, escapeHtml)');
  });
});
