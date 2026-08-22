import type { DbClient } from '../_shared/supabase-client.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductChip, FfeItem, MoodboardRow, SheetRow, ScopePhase, ScopeTask } from './types.ts';

export async function fetchSheet(
  supabase: DbClient,
  sheetId: string,
): Promise<SheetRow> {
  const { data, error } = await supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, project_id, created_by, sheet_type, title, data')
    .eq('id', sheetId)
    .single();
  if (error || !data) throw new Error(`Sheet not found: ${sheetId}`);
  return data as SheetRow;
}

/**
 * The sheet's owning context, from whichever parent it has.
 *
 * A sheet hangs off a moodboard OR a project (technical plans belong to the
 * project — see sheets_has_a_parent). The renderer needs the same three facts
 * either way: a display title for the title block, a description for a deck
 * cover, and the project id that decides which workspace brands the PDF.
 *
 * Resolving this in one place is the point. Calling fetchMoodboard with a null
 * id throws, so a project-owned sheet would fail to render AFTER its status was
 * already flipped to 'generating' — leaving the row stuck there with no PDF and
 * no explanation.
 */
export async function fetchSheetParent(
  supabase: DbClient,
  sheet: Pick<SheetRow, 'moodboard_id' | 'project_id'>,
): Promise<{ title: string; description: string | null; project_id: string | null }> {
  if (sheet.moodboard_id) {
    const mb = await fetchMoodboard(supabase, sheet.moodboard_id);
    return { title: mb.title, description: mb.description ?? null, project_id: mb.project_id ?? null };
  }
  if (sheet.project_id) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, description')
      .eq('id', sheet.project_id)
      .single();
    if (error || !data) throw new Error(`Project not found: ${sheet.project_id}`);
    const p = data as { id: string; name: string | null; description: string | null };
    return { title: p.name ?? 'Project', description: p.description, project_id: p.id };
  }
  // The CHECK constraint makes this unreachable; fail loudly rather than render
  // a sheet with no provenance in its title block.
  throw new Error(`Sheet has neither a moodboard nor a project parent`);
}

export async function fetchMoodboard(
  supabase: DbClient,
  moodboardId: string,
): Promise<MoodboardRow> {
  const { data, error } = await supabase
    .from('moodboards')
    .select('id, user_id, title, description, project_id')
    .eq('id', moodboardId)
    .single();
  if (error || !data) throw new Error(`Moodboard not found: ${moodboardId}`);
  return data as MoodboardRow;
}

/**
 * The workspace's branded PDF cover (Profile → Keys → Document templates), used as the
 * deck cover when a client view has no custom cover image — so a deliverable's front page
 * matches the quotes/catalogs rendered by the shared PDF module. Null when unset.
 */
export async function fetchWorkspaceCoverBytes(
  supabase: DbClient,
  workspaceId: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!workspaceId) return null;
  try {
    const { data: tpl } = await supabase
      .from('workspace_pdf_templates')
      .select('cover_path')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const path = (tpl as { cover_path?: string | null } | null)?.cover_path;
    if (!path) return null;
    const { data } = await supabase.storage.from('quote-templates').download(path);
    return data ? new Uint8Array(await data.arrayBuffer()) : null;
  } catch {
    return null; // template optional — the deck just renders its plain cover
  }
}

/**
 * Resolve WHICH workspace's branding a sheet/client view renders under.
 * Deterministic order:
 *   1. the owning project's workspace (projects.workspace_id) — the real answer;
 *   2. else the creator's OLDEST workspace membership (stable across renders).
 * Never an unordered `limit(1)` — that could flip the logo between regenerations
 * for anyone who belongs to more than one workspace.
 */
export async function resolveBrandingWorkspaceId(
  supabase: DbClient,
  projectId: string | null | undefined,
  userId: string | null | undefined,
): Promise<string | undefined> {
  if (projectId) {
    const { data } = await supabase
      .from('projects')
      .select('workspace_id')
      .eq('id', projectId)
      .maybeSingle();
    const wsId = (data as { workspace_id?: string } | null)?.workspace_id;
    if (wsId) return wsId;
  }
  if (userId) {
    const { data } = await supabase
      .from('workspace_members')
      // `joined_at`, not `created_at` — workspace_members has no created_at, so both the
      // projection and the ordering named a column that is not there and the query returned
      // nothing. Membership order is by when they joined, which is what this wanted.
      .select('workspace_id, joined_at')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .limit(1);
    const wsId = (data as Array<{ workspace_id?: string }> | null)?.[0]?.workspace_id;
    if (wsId) return wsId;
  }
  return undefined;
}

export interface OwnerBranding {
  client_fallback_name?: string;
  logo_url?: string;
  company_name?: string;
  contact_line?: string;
}

export async function fetchClientName(
  supabase: DbClient,
  userId: string,
): Promise<string | undefined> {
  const branding = await fetchOwnerBranding(supabase, userId);
  return branding?.client_fallback_name;
}

/**
 * Branding for the sheet title block. Prefers the workspace's finance_settings business
 * identity (business_name + logo + contact) — the SAME source invoices/quotes/catalogs
 * use — so the logo/company match every other document. Falls back to the creator's
 * profile studio branding when finance isn't set up. The client-name fallback always
 * comes from the profile.
 */
export async function fetchOwnerBranding(
  supabase: DbClient,
  userId: string,
  workspaceId?: string,
): Promise<OwnerBranding | undefined> {
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email, branding_logo_url, branding_company_name, branding_contact_line')
    .eq('id', userId)
    .maybeSingle();

  // Unified branding source: the resolved workspace's finance_settings identity.
  let fsLogoUrl: string | undefined;
  let fsCompany: string | undefined;
  let fsContact: string | undefined;
  try {
    const wsId = workspaceId ?? await resolveBrandingWorkspaceId(supabase, null, userId);
    if (wsId) {
      const { data: fs } = await supabase
        .from('finance_settings')
        .select('business_name, business_logo_path, business_phone, business_email, contact_phone, contact_email')
        .eq('workspace_id', wsId)
        .maybeSingle();
      if (fs) {
        const f = fs as Record<string, string | null>;
        fsCompany = f.business_name || undefined;
        if (f.business_logo_path) {
          // business_logo_path lives in the public generation-images bucket.
          const base = Deno.env.get('SUPABASE_URL') || '';
          fsLogoUrl = `${base}/storage/v1/object/public/generation-images/${f.business_logo_path}`;
        }
        const phone = f.business_phone || f.contact_phone;
        const email = f.business_email || f.contact_email;
        fsContact = [phone, email].filter(Boolean).join('  ·  ') || undefined;
      }
    }
  } catch { /* finance branding optional — fall back to profile below */ }

  const p = profile as Record<string, string | null> | null;
  if (!p && !fsCompany && !fsLogoUrl) return undefined;
  return {
    client_fallback_name: p?.full_name || p?.email || undefined,
    logo_url: fsLogoUrl || p?.branding_logo_url || undefined,
    company_name: fsCompany || p?.branding_company_name || undefined,
    contact_line: fsContact || p?.branding_contact_line || undefined,
  };
}

/** Fetch product chips with thumbnails + descriptions. */
export async function fetchProductChips(
  supabase: DbClient,
  productIds: string[],
  scopeWorkspaceIds?: string[] | null,
): Promise<ProductChip[]> {
  if (productIds.length === 0) return [];

  // When a caller scope is supplied (non-service path), only include
  // products in the caller's own workspaces — an embedded foreign product_id can't leak.
  let productQuery = supabase
    .from('products')
    .select('id, name, description, category_id, metadata')
    .in('id', productIds);
  if (scopeWorkspaceIds) {
    productQuery = productQuery.in(
      'workspace_id',
      scopeWorkspaceIds.length ? scopeWorkspaceIds : ['00000000-0000-0000-0000-000000000000'],
    );
  }
  const { data: products } = await productQuery;

  const { data: rels } = await supabase
    .from('image_product_associations')
    .select('product_id, overall_score, image:document_images(image_url)')
    .in('product_id', productIds)
    .order('overall_score', { ascending: false });

  const imageByProduct: Record<string, string> = {};
  for (const rel of rels || []) {
    const imgUrl = (rel as any).image?.image_url;
    if (imgUrl && !imageByProduct[(rel as any).product_id]) {
      imageByProduct[(rel as any).product_id] = imgUrl;
    }
  }

  return (products || []).map((p: any) => ({
    product_id: p.id,
    name: p.name || 'Unnamed',
    description: p.description || null,
    image_url: imageByProduct[p.id] || null,
    hex: p.metadata?.hex_codes?.[0] || p.metadata?.color_hex || null,
    category: p.metadata?.material_type || p.metadata?.category || null,
  }));
}

/** Pull FF&E items off a quote. */
export async function fetchQuoteFfeItems(
  supabase: DbClient,
  quoteId: string,
  scope?: { userId: string; workspaceIds: string[] } | null,
): Promise<FfeItem[]> {
  // Verify the caller owns the quote before reading its items,
  // else an embedded foreign quote_id would leak that tenant's FF&E pricing.
  const { data: quoteRow } = await supabase
    .from('quotes')
    .select('user_id, workspace_id, currency')
    .eq('id', quoteId)
    .maybeSingle();
  if (scope) {
    const q = quoteRow;
    const ownsQuote = !!q && (
      (q as any).user_id === scope.userId ||
      (scope.workspaceIds.length > 0 && scope.workspaceIds.includes((q as any).workspace_id))
    );
    if (!ownsQuote) return [];
  }
  // quote_items has NO `name`, NO `qty` and NO `position`. The real columns are
  // `custom_product_name` (or the linked product's name), `quantity` and `added_at`.
  // Three unknown columns meant PostgREST rejected the whole statement, so every
  // client-facing sheet printed an EMPTY FF&E schedule — and the designer sent it
  // without knowing, because the error was only console.warn'd.
  const { data, error } = await supabase
    .from('quote_items')
    .select('room, custom_product_name, dimensions, installation_requirements, delivery_date, quantity, unit_price, products(name)')
    .eq('quote_id', quoteId)
    .order('added_at', { ascending: true });

  if (error) {
    // Loud: an empty schedule on a document handed to a client is worse than no document.
    console.error('fetchQuoteFfeItems failed — FF&E schedule will print empty:', error.message);
    return [];
  }
  return (data || []).map((row: any) => ({
    room: row.room ?? null,
    // Prefer the free-text override, fall back to the catalog product's name.
    name: row.custom_product_name || row.products?.name || 'Item',
    dimensions: row.dimensions ?? null,
    install: row.installation_requirements ?? null,
    delivery: row.delivery_date ?? null,
    qty: row.quantity ?? 1,
    price: row.unit_price ?? null,
    currency: (quoteRow as { currency?: string | null } | null)?.currency ?? null,
  }));
}

/**
 * Pull the scope of works off a PROJECT, as phases.
 *
 * Two rules make this safe to hand to a client, and both are load-bearing:
 *
 *   1. **Only `client_visible` tasks.** `project_tasks.visibility` already separates what the team
 *      tracks from what the client is shown, and the tasks tab has the toggle. Without this filter
 *      a proposal would print "chase the supplier" and "check the margin" to the customer. An empty
 *      sheet is the correct outcome when nothing has been marked visible — and the builder says so
 *      in those words rather than printing a blank page.
 *   2. **Ownership is proven before reading.** Same reason `fetchQuoteFfeItems` does it: an
 *      embedded foreign `project_id` would otherwise leak another tenant's programme.
 *
 * A parent task is a phase and its subtasks are the works within it — the structure the project's
 * task list already uses. A parent with no visible children still prints as a one-line phase, so a
 * flat task list is not silently dropped.
 */
export async function fetchProjectScopePhases(
  supabase: DbClient,
  projectId: string,
  scope?: { userId: string; workspaceIds: string[] } | null,
  opts?: { showOwners?: boolean },
): Promise<ScopePhase[]> {
  const { data: projectRow } = await supabase
    .from('projects')
    .select('user_id, workspace_id')
    .eq('id', projectId)
    .maybeSingle();
  if (scope) {
    const p = projectRow as { user_id?: string; workspace_id?: string } | null;
    const owns = !!p && (
      p.user_id === scope.userId ||
      (scope.workspaceIds.length > 0 && !!p.workspace_id && scope.workspaceIds.includes(p.workspace_id))
    );
    if (!owns) return [];
  }

  const { data, error } = await supabase
    .from('project_tasks')
    .select('id, parent_task_id, title, start_date, end_date, due_date, is_milestone, sort_order, visibility, assignee_id, assignee_employee_id')
    .eq('project_id', projectId)
    .eq('visibility', 'client_visible')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    // Loud, for the same reason the FF&E fetcher is: an empty scope on a document already sent to
    // a client is worse than no document, and a console.warn is how that ships unnoticed.
    console.error('fetchProjectScopePhases failed — scope sheet will print empty:', error.message);
    return [];
  }

  const rows = (data || []) as Array<Record<string, any>>;
  if (rows.length === 0) return [];

  // Owners are resolved to NAMES and only when asked for. A client document should not disclose
  // which subcontractor is doing what unless the operator decides it should.
  let nameById = new Map<string, string>();
  if (opts?.showOwners) {
    const employeeIds = [...new Set(rows.map((r) => r.assignee_employee_id).filter(Boolean))] as string[];
    if (employeeIds.length) {
      const { data: emps } = await supabase
        .from('hr_employees')
        .select('id, crm_contacts(name)')
        .in('id', employeeIds);
      for (const e of (emps || []) as Array<Record<string, any>>) {
        const n = e.crm_contacts?.name;
        if (n) nameById.set(e.id, n);
      }
    }
  }

  const toTask = (r: Record<string, any>): ScopeTask => ({
    title: r.title || 'Untitled',
    start_date: r.start_date ?? null,
    end_date: r.end_date ?? r.due_date ?? null,
    owner: opts?.showOwners ? (nameById.get(r.assignee_employee_id) ?? null) : null,
    is_milestone: !!r.is_milestone,
  });

  const parents = rows.filter((r) => !r.parent_task_id);
  const childrenOf = (id: string) => rows.filter((r) => r.parent_task_id === id);

  // A visible subtask whose parent is internal would otherwise vanish. It is still work the client
  // was told about, so it is collected under a plain heading rather than dropped.
  const parentIds = new Set(parents.map((p) => p.id));
  const orphans = rows.filter((r) => r.parent_task_id && !parentIds.has(r.parent_task_id));

  const phases: ScopePhase[] = parents.map((p) => {
    const kids = childrenOf(p.id);
    const tasks = kids.length > 0 ? kids.map(toTask) : [toTask(p)];
    const starts = tasks.map((t) => t.start_date).filter(Boolean) as string[];
    const ends = tasks.map((t) => t.end_date).filter(Boolean) as string[];
    return {
      name: p.title || 'Works',
      start_date: p.start_date ?? (starts.length ? starts.sort()[0] : null),
      end_date: p.end_date ?? p.due_date ?? (ends.length ? ends.sort().slice(-1)[0] : null),
      tasks,
    };
  });

  if (orphans.length > 0) {
    phases.push({ name: 'Additional works', start_date: null, end_date: null, tasks: orphans.map(toTask) });
  }
  return phases;
}

/** Fetch sub-sheets to assemble the full deck. */
export async function fetchSheets(
  supabase: DbClient,
  sheetIds: string[],
  scopeUserId?: string | null,
): Promise<SheetRow[]> {
  if (sheetIds.length === 0) return [];
  // Only include sub-sheets owned by the caller — an embedded foreign
  // included_sheet_id can't pull another user's sheet content into the deck.
  let sheetsQuery = supabase
    .from('moodboard_presentation_sheets')
    .select('id, moodboard_id, created_by, sheet_type, title, data')
    .in('id', sheetIds);
  if (scopeUserId) sheetsQuery = sheetsQuery.eq('created_by', scopeUserId);
  const { data, error } = await sheetsQuery;
  if (error) throw error;
  return (data || []) as SheetRow[];
}
