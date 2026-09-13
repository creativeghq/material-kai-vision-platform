/** Receiving a supplier document is PARTIAL, netted and replayable (#415). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { INBOUND_OUTCOME, inboundOutcomes } from '@/modules/finance/components/inboundStatus';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const dialog = read('src/modules/finance/components/ReceiveToWarehouseDialog.tsx');
const service = read('src/modules/finance/services/inboundService.ts');

describe('an inbound document can be received in parts', () => {
  it('"part stocked" is a word the operator sees, not an implied state', () => {
    // 60 of 100 boards arrived. Until this existed the whole document read "Stocked" and the
    // outstanding 40 were tracked nowhere.
    expect(INBOUND_OUTCOME.partially_received).toBeTruthy();
    expect(inboundOutcomes({ status: 'partially_received' }).map((o) => o.label))
      .toContain(INBOUND_OUTCOME.partially_received.label);
    expect(inboundOutcomes({ status: 'received' }).map((o) => o.label))
      .not.toContain(INBOUND_OUTCOME.partially_received.label);
  });

  it('the outstanding quantity is read, never recomputed in the client', () => {
    expect(service).toContain('inbound_doc_outstanding');
    // A client-side `ordered - received` would be a second derivation of the quantity the
    // over-receipt refusal and the document status both key off (anti-regression rule 1).
    expect(service).not.toMatch(/ordered\s*-\s*received/);
    expect(dialog).not.toMatch(/ordered\s*-\s*received/);
  });
});

describe('a retry does not receive the goods twice', () => {
  it('the dialog mints one token per click and sends it', () => {
    expect(dialog).toContain('clickTokenRef');
    expect(dialog).toMatch(/receiveToWarehouse\(doc\.id, mappings, clickTokenRef\.current\)/);
  });

  it('the token is minted BEFORE the write and cleared only after it succeeds', () => {
    const mint = dialog.indexOf('clickTokenRef.current = crypto.randomUUID()');
    const call = dialog.indexOf('receiveToWarehouse(doc.id, mappings');
    const clear = dialog.indexOf('clickTokenRef.current = null');
    expect(mint, 'no token is minted').toBeGreaterThan(-1);
    expect(mint, 'a token minted after the call cannot replay it').toBeLessThan(call);
    expect(clear, 'the token is never cleared, so a genuine second delivery would replay')
      .toBeGreaterThan(call);
  });

  it('the service passes the token through to the RPC', () => {
    expect(service).toMatch(/p_client_token/);
  });
});

describe('the receipt nets against the DOCUMENT line, not the array index', () => {
  it('every mapping carries the document line number', () => {
    // A supplier's line ids are 209851, 209852 ... An array index here would net one line
    // against another line's receipts and produce a plausible, wrong "still to come".
    expect(dialog).toContain('lineNumberAt');
    const pushes = dialog.match(/mappings\.push\(\{[^}]*\}\)/g) ?? [];
    expect(pushes.length, 'no mapping pushes found — has the dialog been restructured?')
      .toBeGreaterThan(0);
    for (const p of pushes) {
      expect(p, `a mapping with no line_number cannot be netted: ${p}`).toContain('line_number');
    }
  });
});
