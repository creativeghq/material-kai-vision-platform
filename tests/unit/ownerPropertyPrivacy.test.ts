import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const OWNER_FN = 'supabase/functions/real-estate-owner/index.ts';
const SHARED = 'supabase/functions/_shared/real-estate.ts';

function selects(src: string): string[] {
  return [...src.matchAll(/\.select\(\s*'([^']*)'/g)].map((m) => m[1]);
}

describe('the owner surface never returns what is ours', () => {
  const src = read(OWNER_FN);

  it.each([
    'cost_basis', 'min_offer', 'commission_pct', 'estimated_value', 'avm_source',
  ])('does not name %s', (col) => {
    expect(src).not.toContain(col);
  });

  it('selects maintenance without its cost or its contractor', () => {
    const maintenance = selects(src).find((s) => s.includes('reported_at') && s.includes('resolved_at'));
    expect(maintenance, 'the maintenance select changed shape').toBeTruthy();
    expect(maintenance).not.toContain('cost');
    expect(maintenance).not.toContain('contractor_name');
  });

  it('selects offers without the buyer, the terms or the agent note', () => {
    const offers = selects(src).find((s) => s.includes('amount') && s.includes('status') && s.includes('created_at'));
    expect(offers, 'the offers select changed shape').toBeTruthy();
    for (const col of ['buyer_contact_id', 'buyer_name', 'buyer_company_id', 'terms', 'note', 'proof_of_funds']) {
      expect(offers).not.toContain(col);
    }
  });

  it('selects viewings without the private note, and only ones not hidden', () => {
    const viewings = selects(src).find((s) => s.includes('scheduled_at') && s.includes('feedback'));
    expect(viewings).toBeTruthy();
    expect(viewings).not.toContain('internal_note');
    expect(src).toContain("hidden_from_vendor', false");
  });

  it('never spreads a property row', () => {
    expect(src).toContain('toOwner(');
    expect(src).not.toMatch(/\.\.\.property[,\s}]/);
  });
});

describe('access comes from the grant, never from the request', () => {
  const src = read(OWNER_FN);

  it('reads the workspace off the grant rather than the body', () => {
    expect(src).toContain('grant.workspace_id');
    expect(src).not.toContain("body?.workspace_id");
  });

  it('only live owner grants count', () => {
    expect(src).toContain("eq('role', 'owner')");
    expect(src).toContain("is('revoked_at', null)");
    expect(src).toContain('expires_at');
  });

  it('an unknown property is 404, not 403 — no id enumeration', () => {
    expect(src).toMatch(/if \(!grant\) throw new HttpError\(404/);
  });
});

describe('the owner projection', () => {
  const shared = read(SHARED);

  it('is its own function, not the public one reused', () => {
    expect(shared).toContain('export function toOwner');
  });

  it.each(['cost_basis', 'min_offer', 'commission_pct'])('never emits %s', (col) => {
    const start = shared.indexOf('export function toOwner');
    const body = shared.slice(start);
    expect(body.slice(0, body.indexOf('\n}'))).not.toContain(col);
  });

  it('unmasks the address and the price, which are the owner\'s own facts', () => {
    const start = shared.indexOf('export function toOwner');
    const body = shared.slice(start, shared.indexOf('\n}', start));
    expect(body).toContain('hide_exact_address: false');
    expect(body).toContain('price: p.price');
  });
});
