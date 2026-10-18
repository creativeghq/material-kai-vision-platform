/** The party ledger (Καρτέλα) is derived once, in `_finance_party_entries`; every surface reads it. */
import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';

const STATEMENT = 'supabase/functions/finance-send-statement/index.ts';
const PARTIES = 'src/modules/finance/tabs/PartiesTab.tsx';
const SERVICE = 'src/modules/finance/services/partyBalancesService.ts';

describe('party ledger has one derivation', () => {
  it('the emailed / shared statement reads the shared derivation, not the document tables', () => {
    const src = strippedSource(STATEMENT);
    const loader = src.match(/async function loadLedger\([\s\S]*?\n\}/);
    expect(loader, 'loadLedger moved — update this guard').not.toBeNull();
    expect(loader![0]).toContain("rpc('_finance_party_ledger_rows'");
    expect(loader![0]).toContain("rpc('_finance_party_carry_forward'");
    expect(loader![0], 'the carry-forward is summed in SQL, never in the edge').not.toMatch(/opening\s*\+=/);
    for (const table of ['invoices', 'credit_notes', 'payments', 'supplier_bills', 'supplier_credit_notes', 'inbound_documents']) {
      expect(loader![0]).not.toContain(`from('${table}')`);
    }
  });

  it('the statement leaves out entries the opening balance already contains', () => {
    const loader = strippedSource(STATEMENT).match(/async function loadLedger\([\s\S]*?\n\}/)![0];
    expect(loader).toMatch(/counted\s*!==\s*false/);
  });

  it('the in-app running balance skips uncounted rows', () => {
    const src = strippedSource(PARTIES);
    const running = src.match(/const ledgerWithBalance = useMemo\([\s\S]*?\}, \[ledger, opening\]\);/);
    expect(running, 'ledgerWithBalance moved — update this guard').not.toBeNull();
    expect(running![0]).toMatch(/r\.counted\s*!==\s*false/);
  });

  it('list balances come from finance_party_balances, never summed in the client', () => {
    const svc = strippedSource(SERVICE);
    expect(svc).toContain("rpc('finance_party_balances'");
    expect(strippedSource(PARTIES)).not.toMatch(/acct_receivable\s*-\s*\w*\.?acct_payable/);
  });
});
