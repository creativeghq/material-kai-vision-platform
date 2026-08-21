/**
 * Company Assets Tools — agent-chat surface for the shared Company Assets register (the same
 * data the Finance + HR "Assets" panels use). One tool, action enum: list / add / assign / return.
 *
 * Tracks owned/leased/financed company property (vehicles, phones, cards, laptops, equipment) and
 * who currently holds each. All reads/writes are scoped to the caller's workspace_id (resolved
 * upstream by agent-chat, NEVER from the LLM args) — this is the tenancy boundary under the
 * service-role client. People/assets referenced by name are resolved within that workspace only,
 * so a cross-workspace id can never be reached.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
function svc() { return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY); }

const CATEGORIES = ['vehicle', 'phone', 'laptop', 'payment_card', 'equipment', 'other'] as const;
const ACQ_TYPES = ['owned', 'leased', 'financed'] as const;

function contactName(c: any): string | null {
  if (!c) return null;
  return c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.billing_name || null;
}

/** Find one company asset in this workspace by (fuzzy) name. */
async function resolveAsset(workspaceId: string, name: string) {
  const sb = svc();
  const { data } = await sb.from('company_assets')
    .select('id, name, category, current:asset_assignments(id, returned_at)')
    .eq('workspace_id', workspaceId).ilike('name', `%${name.trim()}%`).limit(1).maybeSingle();
  return data;
}

/**
 * Resolve a person (by name) to an assignee. If the contact is linked to an hr_employee we assign
 * as employee; otherwise as a plain contact. Workspace-scoped find only — never creates.
 */
async function resolveAssignee(workspaceId: string, name: string): Promise<{ employeeId: string | null; contactId: string | null; displayName: string } | null> {
  const sb = svc();
  const { data: contact } = await sb.from('crm_contacts')
    .select('id, name, first_name, last_name, billing_name')
    .eq('workspace_id', workspaceId).ilike('name', `%${name.trim()}%`).limit(1).maybeSingle();
  if (!contact?.id) return null;
  const { data: emp } = await sb.from('hr_employees')
    .select('id').eq('workspace_id', workspaceId).eq('crm_contact_id', contact.id).limit(1).maybeSingle();
  return {
    employeeId: emp?.id ?? null,
    contactId: emp?.id ? null : contact.id,
    displayName: contactName(contact) || 'the person',
  };
}

/** Find (or create) a supplier/lessor company by name. */
async function resolveSupplier(workspaceId: string, name: string): Promise<{ id: string; name: string }> {
  const sb = svc();
  const found = await sb.from('crm_companies')
    .select('id, name').eq('workspace_id', workspaceId).ilike('name', name.trim()).limit(1).maybeSingle();
  if (found.data?.id) return { id: found.data.id, name: found.data.name };
  const ins = await sb.from('crm_companies')
    // is_customer explicitly false — the column DEFAULTS TO TRUE, so a lessor created here
    // silently landed in the customer lists too.
    .insert({ workspace_id: workspaceId, name: name.trim(), is_supplier: true, is_customer: false }).select('id, name').single();
  if (ins.error) throw ins.error;
  return { id: ins.data.id, name: ins.data.name };
}

export const createManageCompanyAssetsTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) =>
  tool(async (args: {
    action: 'list' | 'add' | 'assign' | 'return';
    category?: typeof CATEGORIES[number];
    name?: string; identifier?: string; acquisition_type?: typeof ACQ_TYPES[number];
    cost?: number; currency?: string; supplier?: string; notes?: string;
    asset_name?: string; assignee_name?: string;
  }) => {
    try {
      const sb = svc();

      if (args.action === 'list') {
        let q = sb.from('company_assets')
          .select('id, name, category, identifier, status, acquisition_type, acquisition_cost, currency, assignments:asset_assignments(returned_at, employee:hr_employees(contact:crm_contacts!hr_employees_crm_contact_id_fkey(name, first_name, last_name)), contact:crm_contacts(name, first_name, last_name))')
          .eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50);
        if (args.category) q = q.eq('category', args.category);
        const { data, error } = await q;
        if (error) throw error;
        const rows = (data || []).map((a: any) => {
          const active = (a.assignments || []).find((x: any) => !x.returned_at);
          const holder = active ? (contactName(active.employee?.contact) || contactName(active.contact)) : null;
          return { id: a.id, name: a.name, category: a.category, identifier: a.identifier, status: a.status, acquisition_type: a.acquisition_type, cost: a.acquisition_cost, currency: a.currency, held_by: holder };
        });
        onChunk?.({ type: 'company_assets_list', data: { count: rows.length, assets: rows } });
        return JSON.stringify({ success: true, assets: rows });
      }

      if (args.action === 'add') {
        if (!args.name?.trim()) return JSON.stringify({ success: false, error: 'An asset name is required.' });
        const supplier = args.supplier?.trim() ? await resolveSupplier(workspaceId, args.supplier) : null;
        const ins = await sb.from('company_assets').insert({
          workspace_id: workspaceId,
          category: args.category || 'other',
          name: args.name.trim(),
          identifier: args.identifier?.trim() || null,
          acquisition_type: args.acquisition_type || 'owned',
          acquisition_cost: args.cost ?? null,
          currency: args.currency || 'EUR',
          supplier_company_id: supplier?.id ?? null,
          notes: args.notes?.trim() || null,
          created_by: userId,
        }).select('id, name, category').single();
        if (ins.error) throw ins.error;
        onChunk?.({ type: 'company_asset_added', data: { id: ins.data.id, name: ins.data.name, category: ins.data.category, supplier: supplier?.name ?? null } });
        return JSON.stringify({ success: true, id: ins.data.id, message: `Added ${ins.data.name} (${ins.data.category}) to the company assets register.` });
      }

      // assign / return both need the target asset resolved by name
      const targetName = args.asset_name || args.name;
      if (!targetName?.trim()) return JSON.stringify({ success: false, error: 'Which asset? Give its name.' });
      const asset = await resolveAsset(workspaceId, targetName);
      if (!asset?.id) return JSON.stringify({ success: false, error: `No asset matching "${targetName}" in this workspace.` });

      if (args.action === 'return') {
        const { error } = await sb.from('asset_assignments')
          .update({ returned_at: new Date().toISOString() })
          .eq('asset_id', asset.id).is('returned_at', null);
        if (error) throw error;
        onChunk?.({ type: 'company_asset_returned', data: { id: asset.id, name: asset.name } });
        return JSON.stringify({ success: true, message: `Marked "${asset.name}" as returned (released from its current holder).` });
      }

      // action === 'assign'
      if (!args.assignee_name?.trim()) return JSON.stringify({ success: false, error: 'Assign to whom? Give a person name.' });
      const who = await resolveAssignee(workspaceId, args.assignee_name);
      if (!who) return JSON.stringify({ success: false, error: `No employee or contact matching "${args.assignee_name}" in this workspace.` });
      // Release any current holder, then assign (one active holder — DB unique index enforces it too).
      // Checked so the failure is legible. The DB unique index does stop a genuine double-hold,
      // but only by rejecting the INSERT below — which surfaced as a confusing unique-violation
      // instead of "could not release the current holder" (#347 audit).
      const { error: releaseErr } = await sb.from('asset_assignments')
        .update({ returned_at: new Date().toISOString() }).eq('asset_id', asset.id).is('returned_at', null);
      if (releaseErr) {
        return JSON.stringify({ success: false, error: `could not release the current holder: ${releaseErr.message}` });
      }
      const ins = await sb.from('asset_assignments').insert({
        workspace_id: workspaceId, asset_id: asset.id,
        assignee_employee_id: who.employeeId, assignee_contact_id: who.contactId, created_by: userId,
      }).select('id').single();
      if (ins.error) throw ins.error;
      onChunk?.({ type: 'company_asset_assigned', data: { id: asset.id, name: asset.name, assignee: who.displayName, kind: who.employeeId ? 'employee' : 'contact' } });
      return JSON.stringify({ success: true, message: `Assigned "${asset.name}" to ${who.displayName}.` });
    } catch (e: any) {
      return JSON.stringify({ success: false, error: e?.message || 'Company assets action failed' });
    }
  }, {
    name: 'manage_company_assets',
    description: 'Manage the company assets register (vehicles, phones, payment cards, laptops, equipment) shared across Finance and HR. Actions: "list" (optionally filtered by category), "add" a new asset, "assign" an asset to a person by name (employee or contact — releases any current holder), "return" an asset (release its holder). Use for e.g. "add a company phone iPhone 15 for sales", "assign the Ford Transit to Maria", "who holds what / list company vehicles", "mark the laptop returned".',
    schema: z.object({
      action: z.enum(['list', 'add', 'assign', 'return']).describe('What to do'),
      category: z.enum(CATEGORIES).optional().describe('Asset category (filter for list; type for add)'),
      name: z.string().optional().describe('Asset name (for add; also accepted to identify the asset in assign/return)'),
      identifier: z.string().optional().describe('Plate / IMEI / card last-4 / serial (add)'),
      acquisition_type: z.enum(ACQ_TYPES).optional().describe('owned (default), leased, or financed (add)'),
      cost: z.number().optional().describe('Acquisition cost (add)'),
      currency: z.string().optional().describe('ISO currency, default EUR (add)'),
      supplier: z.string().optional().describe('Supplier / lessor company name, created if new (add)'),
      notes: z.string().optional().describe('Free-text notes (add)'),
      asset_name: z.string().optional().describe('Name of the asset to assign/return (fuzzy match within the workspace)'),
      assignee_name: z.string().optional().describe('Person to assign to — an employee or CRM contact name (assign)'),
    }),
  });
