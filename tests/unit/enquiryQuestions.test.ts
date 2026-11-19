import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import { containsPersonalData } from '../../supabase/functions/_shared/agents/enquiry-personal-data';

const read = (p: string) => blankComments(readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'));
const lead = { name: 'Μαρία Παπαδοπούλου', email: 'maria.p@example.com', phone: '6912345678', company_name: 'Papadopoulos Build' };

describe('#592 — a question written from an enquiry carries nothing personal', () => {
  it.each([
    'Ποια πλακάκια 60x120 ανθρακί είναι κατάλληλα για εξωτερική βεράντα;',
    'Which 60x120 anthracite tiles suit an outdoor terrace in Greece?',
    'Πόσο κοστίζει η θερμοπρόσοψη για 120 m² σε μονοκατοικία;',
  ])('lets a generic question through: %s', (q) => {
    expect(containsPersonalData(q, lead)).toBe(false);
  });

  it.each([
    ['an email', 'Can maria.p@example.com get anthracite tiles?'],
    ['a phone number', 'Tiles for terrace, call 691 234 5678'],
    ['the sender name', 'Τι πλακάκια ταιριάζουν στη βεράντα της Μαρία;'],
    ['the company name', 'Which tiles does Papadopoulos use outdoors?'],
  ])('refuses %s', (_label, q) => {
    expect(containsPersonalData(q, lead)).toBe(true);
  });
});

describe('#592 — the pass reads only new website enquiries and keeps no link to the person', () => {
  const pass = read('supabase/functions/_shared/agents/enquiry-questions.ts');

  it('reads only flow-captured leads from the agreed date, never older Inbox history', () => {
    expect(pass).toMatch(/\.not\('capture_flow_id', 'is', null\)/);
    expect(pass).toMatch(/\.gte\('created_at', ENQUIRY_QUESTIONS_FROM\)/);
    expect(pass).toMatch(/ENQUIRY_QUESTIONS_FROM = '2026-11-19T00:00:00Z'/);
  });

  it('fences the enquiry as data and checks the answer before it is stored', () => {
    expect(pass).toMatch(/wrapUntrusted\('enquiry'/);
    expect(pass.indexOf('containsPersonalData(question, lead)')).toBeLessThan(pass.indexOf('await record(question'));
  });

  it('the lead sync agent runs the pass', () => {
    expect(read('supabase/functions/_shared/agents/lead-conversation-sync-agent.ts')).toMatch(/await deriveEnquiryQuestions\(ctx, model\)/);
  });
});
