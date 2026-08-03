import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

/**
 * Cross-workspace isolation, parametrized (#263 item 1).
 *
 * `tenancy.test.ts` proves the shape on ONE table (`crm_companies`) in depth. This drives the same
 * three probes across a table PER MODULE, because the recurring leak is never "RLS is broken" — it
 * is one new table shipped without the policy its neighbours have. A per-table list is the only
 * thing that catches that, and it is deliberately the source of truth: adding a workspace-scoped
 * table without adding it here is a reviewable omission.
 *
 * The three probes, and why each is separate:
 *   1. B cannot SELECT A's row BY DIRECT ID — the leak signature. Not "B's list is short": B
 *      legitimately sees more than wsA (signup auto-joins a shared workspace), so only
 *      containment of the OTHER tenant's row is meaningful.
 *   2. B cannot UPDATE A's row — a SELECT policy without a matching USING on write is a real and
 *      common half-fix.
 *   3. Service role CAN see it — without this, a table that failed to seed would pass probes 1
 *      and 2 for entirely the wrong reason. Every negative assertion needs its positive control.
 *
 * WHY NOT A STRUCTURAL CHECK OVER ALL 243 workspace_id tables: I tried. 22 have no
 * membership-referencing policy and all 22 are legitimate — user_id-scoped (`projects`,
 * `user_preferences`), service-role-only (`facet_canonical_values`), platform-operator
 * (`data_integrity_findings`), parent-FK-scoped (`project_products`), or deny-all
 * (`kb_doc_chunks`). A check emitting 22 benign rows would bury the one real finding and teach
 * people to ignore `check_security_invariants()`, which returns 0 today. The dangerous shape —
 * an always-true write policy — is already covered there by `4-always-true-policy`.
 */
const suite = hasCreds ? describe : describe.skip;

/** The list. One representative table per module; `seed` supplies its NOT NULL columns. */
const TENANT_TABLES: { table: string; module: string; seed: (ctx: { ws: string; userId: string; rid: string }) => Record<string, unknown> }[] = [
  { table: 'crm_companies', module: 'CRM', seed: ({ ws, userId, rid }) => ({ workspace_id: ws, name: `mx-${rid}`, created_by: userId }) },
  { table: 'crm_contacts', module: 'CRM (PII)', seed: ({ ws, userId, rid }) => ({ workspace_id: ws, name: `mx-${rid}`, created_by: userId }) },
  { table: 'products', module: 'Catalog', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  { table: 'quotes', module: 'Quotes', seed: ({ ws, userId }) => ({ workspace_id: ws, user_id: userId }) },
  { table: 'flows', module: 'Flows', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  { table: 'finance_bank_accounts', module: 'Finance', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  // HR is the one #272 called out as worst — every hr_* policy was admin-or-operator with no
  // entitlement, and hrService reads these tables direct via PostgREST. Salary-adjacent PII.
  { table: 'hr_candidates', module: 'HR (PII)', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  { table: 'hr_departments', module: 'HR', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  { table: 'blueprints', module: 'Estimating', seed: ({ ws, rid }) => ({ workspace_id: ws, title: `mx-${rid}` }) },
  { table: 'presentation_catalogs', module: 'Catalogs', seed: ({ ws, rid }) => ({ workspace_id: ws, title: `mx-${rid}` }) },
  { table: 'inbox_labels', module: 'Inbox', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  { table: 'campaigns', module: 'Marketing', seed: ({ ws, rid }) => ({ workspace_id: ws, name: `mx-${rid}` }) },
  // NOT kb_categories, deliberately. Its delete guard requires
  // `SET LOCAL app.kb_allow_locked_delete = 'true'`, which PostgREST cannot issue — so the row
  // survives afterAll, the workspace delete then fails on the surviving child, and the suite
  // LEAKS a live workspace on every run. It did exactly that once here before this note existed.
  // A test that cannot clean up after itself against production is worse than one table less of
  // coverage; KB tenancy wants a fixture that respects the guard, not a row we cannot remove.
];

suite('tenancy matrix · one table per module', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser, B: TestUser;
  let wsA = '', wsB = '';
  /** table → id of the row seeded into wsA. Empty string means the seed failed. */
  const seeded: Record<string, string> = {};

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'mxA', rid);
    B = await createUser(svc, 'mxB', rid);
    wsA = await createWorkspace(svc, 'wsMxA', rid, A.id);
    wsB = await createWorkspace(svc, 'wsMxB', rid, B.id);
    await addMember(svc, wsA, A.id, 'owner');
    await addMember(svc, wsB, B.id, 'owner');

    for (const t of TENANT_TABLES) {
      const { data, error } = await svc.from(t.table)
        .insert(t.seed({ ws: wsA, userId: A.id, rid })).select('id').single();
      if (error) {
        // Recorded, not thrown: one table whose columns moved must not blind the other eleven.
        // The per-table "seed landed" assertion below turns it into a visible failure for that
        // table only, naming the constraint.
        console.error(`[tenancy-matrix] seed failed for ${t.table}: ${error.message}`);
        seeded[t.table] = '';
      } else {
        seeded[t.table] = data!.id;
      }
    }
  }, 120_000);

  afterAll(async () => {
    for (const t of TENANT_TABLES) {
      if (seeded[t.table]) await svc.from(t.table).delete().eq('id', seeded[t.table]).then(() => {}, () => {});
    }
    await teardown(svc, { wsIds: [wsA, wsB], userIds: [A?.id, B?.id] });
  }, 120_000);

  for (const t of TENANT_TABLES) {
    describe(`${t.table} (${t.module})`, () => {
      it('seed landed — the positive control for the two negatives below', () => {
        expect(seeded[t.table], `could not seed ${t.table}; see the console error for the failing constraint`).toBeTruthy();
      });

      it("B cannot read A's row by direct id", async () => {
        const id = seeded[t.table];
        if (!id) return; // already failed loudly above
        const { data, error } = await B.client.from(t.table).select('id').eq('id', id);
        // RLS filters rather than rejects: an empty set, not a 403 — which is also what keeps ids
        // un-enumerable, since "exists but forbidden" and "does not exist" look identical.
        expect(error).toBeNull();
        expect(data ?? [], `${t.table}: workspace B can READ workspace A's row — cross-tenant leak`).toEqual([]);
      });

      it("B cannot update A's row", async () => {
        const id = seeded[t.table];
        if (!id) return;
        const { data } = await B.client.from(t.table).update({ workspace_id: wsB }).eq('id', id).select('id');
        expect(data ?? [], `${t.table}: workspace B can WRITE workspace A's row — cross-tenant takeover`).toEqual([]);
        // And confirm from outside RLS that the row really did not move.
        const { data: check } = await svc.from(t.table).select('workspace_id').eq('id', id).single();
        expect(check?.workspace_id).toBe(wsA);
      });
    });
  }

  /**
   * Workspace-scoped RPCs. `SECURITY DEFINER` bypasses RLS by design, so for these the tenancy
   * check is a line of code inside the function rather than a policy — which is exactly why they
   * need their own probes. `issue_invoice_from_quote` had its guard inherited from a callee until
   * today (#263), and a SECURITY DEFINER function that forgets it is a total bypass, not a partial.
   */
  describe('workspace-scoped RPCs reject a foreign workspace', () => {
    it('next_invoice_number', async () => {
      const { error } = await A.client.rpc('next_invoice_number', { p_workspace_id: wsB });
      expect(error, 'A can allocate an invoice number in B’s workspace').not.toBeNull();
    });

    it('next_document_number', async () => {
      const { error } = await A.client.rpc('next_document_number', {
        p_workspace_id: wsB, p_doc_code: '11.1', p_branch_code: 0,
      });
      expect(error, 'A can burn a legal ΑΑΔΕ series number in B’s workspace').not.toBeNull();
    });

    it('pos_issue_receipt', async () => {
      const { error } = await A.client.rpc('pos_issue_receipt', {
        p_workspace_id: wsB, p_session_id: null, p_doc_code: '11.1', p_branch_code: 0,
        p_items: [{ product_id: null, description: 'x', quantity: 1, unit_price: 10, vat_rate: 24 }],
        p_vat_inclusive: true, p_currency: 'EUR', p_payment_method_code: 3,
        p_customer_company_id: null, p_customer_contact_id: null,
        p_has_shipping: false, p_vehicle_number: null, p_ship_to: null, p_move_purpose: null,
      });
      expect(error, 'A can issue a fiscal receipt in B’s workspace').not.toBeNull();
    });

    it('issue_invoice_from_quote', async () => {
      const q = await svc.from('quotes')
        .insert({ workspace_id: wsB, user_id: B.id, status: 'accepted' }).select('id').single();
      expect(q.error).toBeNull();
      const { error } = await A.client.rpc('issue_invoice_from_quote', { p_quote_id: q.data!.id });
      expect(error, 'A can issue an invoice from B’s quote').not.toBeNull();
      await svc.from('quotes').delete().eq('id', q.data!.id).then(() => {}, () => {});
    });
  });
});
