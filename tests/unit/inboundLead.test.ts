/**
 * Portal lead-email parsing guard.
 *
 * Portal notification formats change without notice, and the failure mode is silent: the parser
 * keeps returning a lead, just without the phone number, or with the portal's own no-reply address
 * where the buyer's should be. Nobody notices until an agent tries to call someone back.
 *
 * The case that matters most is the no-reply one. A portal notification almost always contains the
 * portal's own address somewhere in the body — taking the first email match would create a stream of
 * leads that cannot be answered, and it would look like it was working.
 */
import { describe, it, expect } from 'vitest';
import { parsePortalLead, detectPortal } from '../../supabase/functions/_shared/real-estate-inbound';

const spitogatos = {
  from: 'no-reply@spitogatos.gr',
  subject: 'Νέο ενδιαφέρον για το ακίνητο ΚΩΔ: AB-1042',
  text: [
    'Λάβατε νέο μήνυμα από υποψήφιο αγοραστή.',
    '',
    'Όνομα: Γιώργος Παπαδόπουλος',
    'Email: g.papadopoulos@example.com',
    'Τηλέφωνο: +30 694 4123456',
    'Κωδικός: AB-1042',
    'Μήνυμα: Θα ήθελα να δω το διαμέρισμα το Σάββατο.',
    '',
    'Μην απαντάτε σε αυτό το email — no-reply@spitogatos.gr',
  ].join('\n'),
};

const rightmove = {
  from: 'leads@rightmove.co.uk',
  subject: 'New enquiry — Ref 22-CHELSEA',
  html: `<div><p>Name: Sarah Collins</p><p>Email: sarah.collins@example.co.uk</p>
         <p>Phone: 07700 900123</p><p>Reference: 22-CHELSEA</p>
         <p>Message: Is the property still available?</p>
         <p style="color:#999">Do not reply — notifications@rightmove.co.uk</p></div>`,
};

describe('portal lead parsing — the buyer, not the portal', () => {
  it('takes the labelled buyer address, not the portal no-reply in the body', () => {
    expect(parsePortalLead(spitogatos).email).toBe('g.papadopoulos@example.com');
    expect(parsePortalLead(rightmove).email).toBe('sarah.collins@example.co.uk');
  });

  it('falls back past automated addresses when nothing is labelled', () => {
    const parsed = parsePortalLead({
      from: 'noreply@portal.com',
      subject: 'enquiry',
      text: 'Sent via mailer@portal.com on behalf of buyer.person@example.com — please respond.',
    });
    expect(parsed.email).toBe('buyer.person@example.com');
  });
});

describe('portal lead parsing — the fields an agent needs to act', () => {
  it('reads a Greek-labelled message', () => {
    const p = parsePortalLead(spitogatos);
    expect(p.name).toBe('Γιώργος Παπαδόπουλος');
    expect(p.phone).toBe('+30 694 4123456');
    expect(p.reference).toBe('AB-1042');
    expect(p.message).toContain('Σάββατο');
  });

  it('reads an English HTML message, tags stripped', () => {
    const p = parsePortalLead(rightmove);
    expect(p.name).toBe('Sarah Collins');
    expect(p.phone).toBe('07700 900123');
    expect(p.reference).toBe('22-CHELSEA');
    expect(p.message).toBe('Is the property still available?');
    expect(p.message).not.toContain('<');
  });

  it('finds the reference in the subject when the body has no labelled line', () => {
    const p = parsePortalLead({ from: 'x@idealista.com', subject: 'Enquiry ref: ESP-9931', text: 'Email: someone@example.com' });
    expect(p.reference).toBe('ESP-9931');
  });

  it('returns no contact details rather than inventing them', () => {
    // The endpoint uses exactly this to skip delivery receipts and digests instead of creating a
    // lead nobody can answer.
    const p = parsePortalLead({ from: 'digest@portal.com', subject: 'Your weekly summary', text: 'You had 4 views this week.' });
    expect(p.email).toBeNull();
    expect(p.phone).toBeNull();
  });
});

describe('portal detection', () => {
  it('names the known portals', () => {
    expect(detectPortal('no-reply@spitogatos.gr', '', '')).toBe('spitogatos');
    expect(detectPortal('leads@rightmove.co.uk', '', '')).toBe('rightmove');
    expect(detectPortal('', 'Idealista enquiry', '')).toBe('idealista');
  });

  it('falls back to the sender domain rather than guessing', () => {
    expect(detectPortal('alerts@someportal.example', 'enquiry', 'body')).toBe('someportal.example');
    expect(detectPortal('no-reply@someportal.example', '', '')).toBe('someportal.example');
  });
});
