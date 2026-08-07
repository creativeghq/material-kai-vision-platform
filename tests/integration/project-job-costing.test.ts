import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

/**
 * Project job costing (#285 WS1/WS2) end to end, against real RLS.
 *
 * Nothing else can cover this. `get_project_pnl` / `get_project_labor` are pure SQL, so the
 * unit tier can only assert that the TypeScript does not re-derive the numbers — it cannot say
 * whether the arithmetic is right, whether the tenancy guards hold, or whether a cost that
 * should count actually counts. Every bug this suite pins was invisible to a green `npm test`:
 *
 *   - an approved expense tagged to a project not reaching actual_cost at all;
 *   - the expense form only saving project_id when `billable` was ticked, so every ABSORBED
 *     cost was silently unattributable to the job that bore it;
 *   - a pending claim moving the margin before anyone reviewed it;
 *   - deleting a project with any task failing outright on a project_events FK.
 *
 * Written against a live workspace with a real signed-in JWT, so the RLS policies and the
 * SECURITY DEFINER guards are the ones actually exercised.
 */
const suite = hasCreds ? describe : describe.skip;

/** jsonb numerics arrive as strings over PostgREST; compare as numbers. */
const n = (v: unknown) => Number(v ?? 0);

suite('project job costing · expenses, labor, tenancy', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser, B: TestUser;
  let wsA = '', wsB = '';
  let projectA = '', reportA = '', reportB = '';

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'jcA', rid);
    B = await createUser(svc, 'jcB', rid);
    wsA = await createWorkspace(svc, 'wsJcA', rid, A.id);
    wsB = await createWorkspace(svc, 'wsJcB', rid, B.id);
    await addMember(svc, wsA, A.id, 'owner');
    await addMember(svc, wsB, B.id, 'owner');

    const p = await svc.from('projects')
      .insert({ user_id: A.id, workspace_id: wsA, name: `E2E JobCost ${rid}`, status: 'planning' })
      .select('id').single();
    if (p.error) throw new Error(`project fixture: ${p.error.message}`);
    projectA = p.data.id;

    const rA = await svc.from('trip_expense_reports')
      .insert({ workspace_id: wsA, user_id: A.id, title: `E2E Claims A ${rid}` })
      .select('id').single();
    if (rA.error) throw new Error(`report A fixture: ${rA.error.message}`);
    reportA = rA.data.id;

    // A report in the OTHER tenant, used to prove a foreign expense cannot enter A's P&L.
    const rB = await svc.from('trip_expense_reports')
      .insert({ workspace_id: wsB, user_id: B.id, title: `E2E Claims B ${rid}` })
      .select('id').single();
    if (rB.error) throw new Error(`report B fixture: ${rB.error.message}`);
    reportB = rB.data.id;
  });

  afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      await svc.from('trip_expense_items').delete().eq('workspace_id', ws).then((r) => r, () => ({}));
      await svc.from('trip_expense_reports').delete().eq('workspace_id', ws).then((r) => r, () => ({}));
      await svc.from('time_entries').delete().eq('workspace_id', ws).then((r) => r, () => ({}));
      await svc.from('projects').delete().eq('workspace_id', ws).then((r) => r, () => ({}));
    }
    await teardown(svc, { wsIds: [wsA, wsB], userIds: [A.id, B.id] });
  });

  /** Add an expense claim straight to the fixture report. */
  const addExpense = async (opts: {
    report: string; workspace: string; amount: number;
    project?: string | null; status?: 'pending' | 'approved' | 'rejected'; billable?: boolean;
  }) => {
    const { data, error } = await svc.from('trip_expense_items').insert({
      report_id: opts.report,
      workspace_id: opts.workspace,
      expense_date: new Date().toISOString().slice(0, 10),
      category: 'transport',
      description: `E2E expense ${rid}`,
      amount: opts.amount,
      currency: 'EUR',
      project_id: opts.project ?? null,
      approval_status: opts.status ?? 'approved',
      billable: opts.billable ?? false,
    }).select('id').single();
    if (error) throw new Error(`addExpense: ${error.message}`);
    return data.id as string;
  };

  const pnl = async () => {
    const { data, error } = await A.client.rpc('get_project_pnl', { p_project_id: projectA });
    if (error) throw new Error(`get_project_pnl: ${error.message}`);
    return data as Record<string, unknown>;
  };

  it('starts from a zeroed P&L', async () => {
    const r = await pnl();
    expect(n(r.actual_cost)).toBe(0);
    expect(n(r.expense_cost)).toBe(0);
    expect(n(r.labor_cost)).toBe(0);
  });

  it('counts an APPROVED project expense towards actual cost', async () => {
    const id = await addExpense({ report: reportA, workspace: wsA, amount: 120, project: projectA, status: 'approved' });
    const r = await pnl();
    expect(n(r.expense_cost)).toBe(120);
    expect(n(r.actual_cost)).toBe(120);
    await svc.from('trip_expense_items').delete().eq('id', id);
  });

  /**
   * The regression that mattered most: `billable` says whether the cost can be ON-CHARGED, not
   * whether it was a cost. An absorbed expense is still money out of this job.
   */
  it('counts a NON-billable expense too — billable is not a cost filter', async () => {
    const id = await addExpense({
      report: reportA, workspace: wsA, amount: 80, project: projectA,
      status: 'approved', billable: false,
    });
    const r = await pnl();
    expect(n(r.expense_cost)).toBe(80);
    await svc.from('trip_expense_items').delete().eq('id', id);
  });

  it('reports a PENDING claim separately and keeps it OUT of actual cost', async () => {
    const id = await addExpense({ report: reportA, workspace: wsA, amount: 55, project: projectA, status: 'pending' });
    const r = await pnl();
    expect(n(r.pending_expense_cost)).toBe(55);
    expect(n(r.expense_cost)).toBe(0);
    expect(n(r.actual_cost)).toBe(0);
    await svc.from('trip_expense_items').delete().eq('id', id);
  });

  it('ignores a REJECTED claim entirely', async () => {
    const id = await addExpense({ report: reportA, workspace: wsA, amount: 999, project: projectA, status: 'rejected' });
    const r = await pnl();
    expect(n(r.expense_cost)).toBe(0);
    expect(n(r.pending_expense_cost)).toBe(0);
    await svc.from('trip_expense_items').delete().eq('id', id);
  });

  /**
   * Nothing constrains an item in workspace B from carrying workspace A's project id, so the RPC
   * filters on workspace as well. Without that, a foreign amount lands in this tenant's margin.
   */
  it('never lets another workspace\'s expense enter this project\'s cost', async () => {
    const id = await addExpense({ report: reportB, workspace: wsB, amount: 5000, project: projectA, status: 'approved' });
    const r = await pnl();
    expect(n(r.expense_cost)).toBe(0);
    expect(n(r.actual_cost)).toBe(0);
    await svc.from('trip_expense_items').delete().eq('id', id);
  });

  it('rolls logged time into labor cost, and labor into actual cost', async () => {
    const { data, error } = await svc.from('time_entries').insert({
      workspace_id: wsA, user_id: A.id, project_id: projectA,
      work_date: new Date().toISOString().slice(0, 10),
      minutes: 90, hourly_rate: 40, description: `E2E labor ${rid}`, is_billable: true,
    }).select('id').single();
    if (error) throw new Error(`time entry: ${error.message}`);

    const r = await pnl();
    expect(n(r.labor_cost)).toBe(60);          // 1.5h @ 40
    expect(n(r.actual_cost)).toBe(60);
    expect(n((r.labor as Record<string, unknown>).total_minutes)).toBe(90);

    await svc.from('time_entries').delete().eq('id', data.id);
  });

  it('refuses a time entry pointing at a project in another workspace', async () => {
    const { error } = await svc.from('time_entries').insert({
      workspace_id: wsB, user_id: B.id, project_id: projectA,   // project belongs to wsA
      work_date: new Date().toISOString().slice(0, 10),
      minutes: 30, hourly_rate: 10, description: `E2E cross-tenant ${rid}`,
    });
    expect(error, 'cross-workspace project_id must be rejected').not.toBeNull();
    expect(error?.message ?? '').toMatch(/does not belong to workspace/i);
  });

  it('refuses get_project_pnl to a non-member', async () => {
    const { error } = await B.client.rpc('get_project_pnl', { p_project_id: projectA });
    expect(error, 'another tenant must not read this P&L').not.toBeNull();
  });

  it('refuses get_project_labor to a non-member', async () => {
    const { error } = await B.client.rpc('get_project_labor', { p_project_id: projectA });
    expect(error, 'another tenant must not read this labor roll-up').not.toBeNull();
  });

  it('rejects a task dependency that would close a cycle', async () => {
    const mk = async (title: string) => {
      const { data, error } = await svc.from('project_tasks')
        .insert({ project_id: projectA, title, status: 'todo' }).select('id').single();
      if (error) throw new Error(`task ${title}: ${error.message}`);
      return data.id as string;
    };
    const t1 = await mk('dep-1');
    const t2 = await mk('dep-2');

    const ok = await svc.from('project_task_dependencies')
      .insert({ project_id: projectA, predecessor_id: t1, successor_id: t2 });
    expect(ok.error, 'an acyclic edge must be accepted').toBeNull();

    const cyc = await svc.from('project_task_dependencies')
      .insert({ project_id: projectA, predecessor_id: t2, successor_id: t1 });
    expect(cyc.error, 'a cycle must be rejected').not.toBeNull();
    expect(cyc.error?.message ?? '').toMatch(/cycle/i);

    await svc.from('project_tasks').delete().in('id', [t1, t2]);
  });

  /**
   * Deleting a project used to fail outright once it had a task: the cascade fired the task
   * DELETE trigger, which appended a project_event referencing the project row that was already
   * gone. The audit event on a LIVE task delete must survive the fix, so both are asserted.
   */
  it('deletes a project that has tasks and rooms', async () => {
    const p = await svc.from('projects')
      .insert({ user_id: A.id, workspace_id: wsA, name: `E2E Delete ${rid}`, status: 'planning' })
      .select('id').single();
    if (p.error) throw new Error(`delete-fixture project: ${p.error.message}`);
    const pid = p.data.id;

    await svc.from('project_tasks').insert({ project_id: pid, title: 'doomed', status: 'todo' });
    await svc.from('project_rooms').insert({ project_id: pid, name: 'doomed room' });

    const { error } = await svc.from('projects').delete().eq('id', pid);
    expect(error, 'deleting a project with children must not violate the events FK').toBeNull();

    const { data: still } = await svc.from('projects').select('id').eq('id', pid);
    expect(still ?? []).toHaveLength(0);
  });

  it('still logs task.deleted when the project itself survives', async () => {
    const t = await svc.from('project_tasks')
      .insert({ project_id: projectA, title: 'logged-delete', status: 'todo' }).select('id').single();
    if (t.error) throw new Error(`task: ${t.error.message}`);

    await svc.from('project_tasks').delete().eq('id', t.data.id);

    const { data } = await svc.from('project_events')
      .select('id').eq('project_id', projectA).eq('event_type', 'task.deleted');
    expect((data ?? []).length, 'the cascade fix must not silence the normal audit event')
      .toBeGreaterThan(0);
  });
});
