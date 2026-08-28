/**
 * A campaign address carries a NAMED lawful basis, or it is not mailed (#357 AE-7 / AE-8).
 *
 * `crm_contacts.marketing_consent` has existed all along: it is a column with a NOT NULL default,
 * a checkbox on the contact page, and the real-estate module gates every buyer digest and instant
 * alert on it. The EMAIL CAMPAIGN resolver never read it. Every contact in the book was mailable
 * whatever the box said, and a pasted address that matched nobody in the workspace was mailed on
 * no basis at all — which is AE-8 as filed.
 *
 * That is AE-5's shape again: a control that is stored, shown, edited, and never consulted. It is
 * invisible to typecheck (the column is selected and assigned), invisible to lint, and invisible to
 * every integrity probe, because the stored data is perfectly correct.
 *
 * The derivation is SQL — `campaign_address_consent_basis` — and no repo-file guard can see
 * pg_proc. What this file pins is the half that lives in the checkout: the vocabulary, the split,
 * and that every surface which shows or approves a recipient count counts the MAILABLE subset. The
 * SQL half is watched by `marketing.campaign_recipient_without_lawful_basis`, which reads the
 * OUTPUT (a pending recipient with no basis) rather than the function body.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  summarizeAudienceConsent,
  CONSENT_BASIS_LABEL,
  CONSENT_BASIS_REMEDY,
  type ConsentRow,
} from '../../src/modules/email-marketing/consentBasis';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const row = (basis: string, mailable: boolean): ConsentRow => ({ consent_basis: basis, mailable });

describe('#357 AE-8 — the summary counts what will send, and says what will not', () => {
  it('counts only mailable rows', () => {
    const s = summarizeAudienceConsent([
      row('workspace_member', true),
      row('contact_opt_in', true),
      row('no_consent', false),
      row('unverified', false),
    ]);
    expect(s.mailable).toBe(2);
  });

  it('groups the withheld by reason, largest first', () => {
    const s = summarizeAudienceConsent([
      row('unverified', false),
      row('no_consent', false),
      row('no_consent', false),
      row('contact_opt_in', true),
    ]);
    expect(s.withheld.map((w) => [w.basis, w.count])).toEqual([['no_consent', 2], ['unverified', 1]]);
  });

  it('says nothing when nothing is held back', () => {
    // The notice must not manufacture a compliance warning for a clean audience.
    const s = summarizeAudienceConsent([row('b2b_company', true), row('workspace_member', true)]);
    expect(s.withheld).toEqual([]);
    expect(s.mailable).toBe(2);
  });

  it('never re-derives mailability from the basis name', () => {
    // SQL owns the verdict (anti-regression rule 1 — one derivation). A second opinion here is
    // how the estimate and the send come to disagree about who gets emailed. If the two ever
    // conflict, this file must follow SQL.
    const s = summarizeAudienceConsent([row('no_consent', true), row('workspace_member', false)]);
    expect(s.mailable).toBe(1);
    expect(s.withheld).toEqual([
      { basis: 'workspace_member', label: CONSENT_BASIS_LABEL.workspace_member, remedy: undefined, count: 1 },
    ]);
  });

  it('every basis has wording, and the two fixable ones say how', () => {
    for (const basis of ['workspace_member', 'contact_opt_in', 'b2b_company', 'no_consent', 'unverified'] as const) {
      expect(CONSENT_BASIS_LABEL[basis], basis).toBeTruthy();
    }
    // A held-back address with no remedy is a dead end: the operator sees a smaller number and no
    // way to act on it, which is how people start pasting lists into a different tool.
    expect(CONSENT_BASIS_REMEDY.no_consent).toBeTruthy();
    expect(CONSENT_BASIS_REMEDY.unverified).toBeTruthy();
  });

  it('an unknown basis from a future migration is held back, not silently mailed', () => {
    const s = summarizeAudienceConsent([row('some_new_basis', false)]);
    expect(s.mailable).toBe(0);
    expect(s.withheld[0].label).toBe('some_new_basis');
  });
});

describe('#357 AE-8 — every surface counts the mailable subset', () => {
  it('the tenant campaign modal validates on mailable, not on resolved rows', () => {
    const src = read('src/modules/email-marketing/components/CreateMarketingCampaignModal.tsx');
    expect(src).toMatch(/summarizeAudienceConsent\(resolved\)\.mailable/);
    expect(src).toContain('<AudienceConsentNotice');
    // The old guard was `resolved.length === 0`, which passes an audience that is entirely
    // withheld — the campaign then sends to nobody and reports success.
    expect(src).toMatch(/if \(mailableCount === 0\)/);
  });

  it('the admin campaign modal derives its estimate from the resolved rows', () => {
    const src = read('src/modules/email/components/CreateCampaignModal.tsx');
    expect(src).toMatch(/summarizeAudienceConsent\(resolvedAudience\)\.mailable/);
    expect(src).toContain('<AudienceConsentNotice');
    // It must hold the ROWS: a bare count cannot say why the number shrank.
    expect(src).toMatch(/setResolvedAudience\(await marketingService\.resolveAudience/);
  });

  it('the agent approval card names the number that will actually be emailed', () => {
    // Approving "247 recipients" and then sending to the 12 with a basis is an approval for a
    // send that never happened — invariant 9's gate is only as good as what it describes.
    const src = read('supabase/functions/_shared/tools/email-marketing-tools.ts');
    expect(src).toMatch(/resolvedRows\.filter\(\(r\) => r\.mailable\)/);
    expect(src).toMatch(/const withheld = resolvedRows\.length - recipients\.length/);
    expect(src).toMatch(/summary: `Send campaign[\s\S]{0,400}\$\{recipients\.length\}/);
  });

  it('the notice is rendered from the shared module, not a second copy of the wording', () => {
    const src = read('src/modules/email-marketing/components/AudienceConsentNotice.tsx');
    expect(src).toMatch(/from '\.\.\/consentBasis'/);
    expect(src, 'the remedy strings were copied back into the component').not.toMatch(/Tick .Marketing consent/);
  });
});

describe('#357 AE-7 — a bulk send is marketing, whatever the caller would like to call it', () => {
  it('campaign-processor declares marketing on every send', () => {
    // Suppression is no longer gated on this (it became the default in #366 BU-2), but the
    // RFC 8058 one-click unsubscribe headers still are. A campaign that declared itself
    // transactional would ship without them, which is a compliance failure for a bulk sender.
    const src = read('supabase/functions/campaign-processor/index.ts');
    expect(src).toMatch(/emailType: 'marketing'/);
    expect(src, 'the campaign row can now choose its own email type').not.toMatch(/emailType: [a-zA-Z]/);
  });

  it('the catalog blast declares marketing too', () => {
    const src = read('supabase/functions/catalog-send-to-customers/index.ts');
    expect(src).toMatch(/emailType: 'marketing'/);
  });

  it('email-api suppresses by default and exempts by allowlist', () => {
    // The exemption must stay two-part: a named transactional feature AND a server-to-server
    // caller. A browser session must not be able to buy its way out by setting a tag.
    const src = read('supabase/functions/email-api/index.ts');
    expect(src).toMatch(/const suppressionExempt = isAdminAccess\(auth\)/);
    expect(src).toMatch(/TRANSACTIONAL_FEATURES\.has\(sendFeature\)/);
  });
});
