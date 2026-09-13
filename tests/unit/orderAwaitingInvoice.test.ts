/**
 * #417 — a sale delivered or confirmed whose invoice was never raised must REACH somebody.
 * `get_order_worklist` derived this correctly all along and nothing read it on a schedule, so
 * €12,074 across three orders (oldest 80 days) sat unseen. These pin the two things that make
 * the fix real: it is the SAME derivation, and an owner cannot silence it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_TRIGGERS } from '@/services/flows/tenantVocabulary';
import { blankComments } from '../helpers/stripComments';

const src = (...p: string[]) => blankComments(readFileSync(join(__dirname, '..', '..', ...p), 'utf8'));

describe('the un-invoiced sale is derived once and told once', () => {
  it('the digest reads the worklist RPC rather than re-deriving it', () => {
    const digest = src('supabase', 'functions', 'finance-digest-aggregate', 'index.ts');
    expect(
      digest.includes('get_order_worklist'),
      'finance-digest-aggregate must read get_order_worklist. A second "which sales are ' +
        'un-invoiced" query here is a second derivation of one fact (anti-regression rule 1), ' +
        'and the digest and the order book would then disagree.',
    ).toBe(true);
    expect(digest).toContain('not_invoiced_block_html');
  });

  it('an owner cannot silence it', () => {
    // CLAUDE.md, Flows: leave tenant_configurable OFF for an alarm about the platform failing a
    // legal obligation. An un-invoiced fulfilled sale is revenue recognised nowhere and VAT
    // undeclared, so silencing it hides breakage rather than noise.
    expect(
      (TENANT_TRIGGERS as readonly string[]).includes('order_awaiting_invoice'),
      'order_awaiting_invoice must NOT be in the tenant vocabulary.',
    ).toBe(false);
  });

  it('the trigger is declared, offered and rendered', () => {
    expect(src('src', 'services', 'flows', 'types.ts')).toContain("'order_awaiting_invoice'");
    expect(src('src', 'components', 'Admin', 'FlowsManagement', 'utils', 'paletteItems.ts'))
      .toContain("subType: 'order_awaiting_invoice'");
    // Both icon maps, or the flow list renders a hole where every other trigger has a glyph.
    for (const f of ['MyFlowsTab.tsx', join('nodes', 'TriggerNode.tsx')]) {
      expect(
        src('src', 'components', 'Admin', 'FlowsManagement', f),
        `${f} has no icon for order_awaiting_invoice.`,
      ).toContain('order_awaiting_invoice:');
    }
  });
});
