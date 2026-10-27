import { describe, it, expect, beforeAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient } from './_harness';

const suite = hasCreds ? describe : describe.skip;
const OPERATOR_WS = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

interface Resolved {
  item_text: string; price_role: string; printed_net: string; final_net: string | null;
  final_gross: string | null; status: string; supplier: string;
}

suite('resolve_purchase_prices · golden items against the live price store', () => {
  let svc: SupabaseClient;
  beforeAll(() => { svc = serviceClient(); });

  const resolve = async (q: string, n = 6): Promise<Resolved[]> => {
    const { data, error } = await svc.rpc('resolve_purchase_prices', { p_workspace_id: OPERATOR_WS, p_query: q, p_limit: n });
    expect(error).toBeNull();
    return (data ?? []) as Resolved[];
  };

  it('Tagina Onyx Diamond 120x280 is the NET-list price, not the general list', async () => {
    const rows = await resolve('Tagina Onyx Diamond 120x280');
    const net = rows.find((r) => r.status === 'purchase_price' && /Onyx Diamond/.test(r.item_text) && /120x280/.test(r.item_text));
    expect(net, 'net-list row').toBeTruthy();
    expect(Number(net!.final_net)).toBe(49);
    expect(Number(net!.final_gross)).toBe(60.76);
  });

  it('a list price with no unconditional discount rule never carries a final price', async () => {
    for (const q of ['Tagina Onyx Diamond 120x280', 'Daikin EKVDX100A']) {
      for (const r of await resolve(q, 8)) {
        if (r.status.startsWith('list_price')) {
          expect(r.final_net, `${q}: ${r.item_text}`).toBeNull();
          expect(r.final_gross).toBeNull();
        }
      }
    }
  });

  it('Mitsubishi Heavy SRK/SRC-25 ZT-WFB reproduces the ΑΓΗΝΩΡ invoice line (gross 830)', async () => {
    const rows = await resolve('Tournikiotis SRK/SRC-25 ZT-WFB');
    expect(rows.some((r) => /SRK\/SRC-25 ZT-WFB/.test(r.item_text) && Number(r.final_gross) === 830)).toBe(true);
  });

  it('FDU 71 VH / FDC 71 VNP-W reproduces the ΑΓΗΝΩΡ invoice line (gross 1715)', async () => {
    const rows = await resolve('Mitsubishi FDU 71 VH FDC 71 VNP-W');
    expect(rows.some((r) => /FDU 71 VH/.test(r.item_text) && Number(r.final_gross) === 1715)).toBe(true);
  });

  it.each(['FDU71', 'FDU 71', '71FDU', '71 FDU', 'Mitsibushi 71 FDU', 'mitsubishi fdu71'])(
    'the same unit is found however "%s" is spelled',
    async (q) => {
      const rows = await resolve(q, 5);
      expect(rows.some((r) => /FDU 71 VH/.test(r.item_text) && Number(r.final_gross) === 1715)).toBe(true);
    },
  );
});
