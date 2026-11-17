import { describe, expect, it } from 'vitest';

import {
  firstMatchingRule, leadFromEmail, leadFromWhatsApp, normalizePhone, ruleMatches, type LeadCaptureRule,
} from '../../supabase/functions/_shared/crm/leadCapture';
import { LEAD_SOURCES } from '../../src/modules/crm/leadVocabulary';

const rule = (over: Partial<LeadCaptureRule>): LeadCaptureRule => ({
  id: 'r', workspace_id: 'w', label: 'L', channel: 'email', match_field: 'subject',
  match_mode: 'starts_with', pattern: 'MaterialsHub inquiry', mail_account_id: 'a', ...over,
});

const FORM_HTML = `
      <div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a">
        <h2 style="margin:0 0 16px">New contact inquiry</h2>
        <p><strong>Name:</strong> ΤΣΙΟΤΡΑΣ ΧΡΗΣΤΟΣ</p>
        <p><strong>Email:</strong> Someone@Example.gr</p>
        <p><strong>Phone:</strong> 6945301929</p>
        <p><strong>Subject:</strong> Κατάλογος: Ανοίγματα &amp; Εξαρτήματα</p>
        <p><strong>Message:</strong></p>
        <p style="white-space:pre-wrap">Καλημέρα θα μπορούσα να έχω πληροφορίες
για ένα διαχωριστικό 250x240</p>
      </div>`;

describe('lead capture matching', () => {
  it('matches the website form subject regardless of case and spacing', () => {
    expect(ruleMatches(rule({}), { subject: 'MaterialsHub  INQUIRY — Τιμή: Ecoceramic KRAKEN' })).toBe(true);
    expect(ruleMatches(rule({}), { subject: 'Re: MaterialsHub inquiry — Τιμή: X' })).toBe(false);
  });

  it('matches the WhatsApp page card when it is not the first words', () => {
    const wa = rule({ channel: 'whatsapp', match_field: 'body', match_mode: 'contains', pattern: 'Σας γράφω για τη σελίδα', mail_account_id: null });
    const text = 'Γεια σας! Σας γράφω για τη σελίδα «Yurtbay Quasar Πλακάκια 60×120 — Τιμή από €20/τ.μ.»:\nhttps://materialshub.gr/el/proionta/plakakia/yurtbay-quasar';
    expect(firstMatchingRule([wa], { body: text })?.id).toBe('r');
    expect(firstMatchingRule([wa], { body: 'Καλησπέρα' })).toBeNull();
  });
});

describe('lead capture parsing', () => {
  it('reads every field of the website contact form', () => {
    const lead = leadFromEmail({
      subject: 'MaterialsHub inquiry — Κατάλογος: Ανοίγματα & Εξαρτήματα', html: FORM_HTML, text: null,
      fromName: 'MaterialsHub', fromAddress: 'find@materialshub.gr', rulePattern: 'MaterialsHub inquiry',
    });
    expect(lead).toEqual({
      name: 'ΤΣΙΟΤΡΑΣ ΧΡΗΣΤΟΣ',
      email: 'someone@example.gr',
      phone: '+306945301929',
      title: 'Κατάλογος: Ανοίγματα & Εξαρτήματα',
      request: 'Καλημέρα θα μπορούσα να έχω πληροφορίες\nγια ένα διαχωριστικό 250x240',
    });
  });

  it('falls back to the sender, never the form relay, when the mail is not the form', () => {
    const lead = leadFromEmail({
      subject: 'MaterialsHub inquiry — tiles', html: null, text: 'Hello, I need tiles.',
      fromName: 'Ann', fromAddress: 'ann@x.com', rulePattern: 'MaterialsHub inquiry',
    });
    expect(lead).toMatchObject({ name: 'Ann', email: 'ann@x.com', title: 'tiles', request: 'Hello, I need tiles.' });
  });

  it('takes the page title off the WhatsApp card', () => {
    const lead = leadFromWhatsApp({
      text: 'Γεια σας! Σας γράφω για τη σελίδα «Peronda FS Artisan Πλακάκια 33×33 — Τιμή από €30,40/τ.μ.»:\nhttps://materialshub.gr/el/proionta/plakakia/peronda-fs-artisan',
      profileName: 'Dimitris', phone: '+306932659420',
    });
    expect(lead.title).toBe('Peronda FS Artisan Πλακάκια 33×33 — Τιμή από €30,40/τ.μ.');
    expect(lead).toMatchObject({ name: 'Dimitris', phone: '+306932659420', email: null });
  });

  it('normalises phones without guessing a country for foreign numbers', () => {
    expect(normalizePhone('6948043192')).toBe('+306948043192');
    expect(normalizePhone('+44 7825 409251')).toBe('+447825409251');
    expect(normalizePhone('17188358109')).toBe('+17188358109');
    expect(normalizePhone('0030 210 1234567')).toBe('+302101234567');
    expect(normalizePhone('')).toBeNull();
  });

  it('can store the source a WhatsApp capture writes', () => {
    expect(LEAD_SOURCES).toContain('whatsapp');
  });
});
