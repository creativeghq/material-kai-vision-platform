import { supabase } from '@/integrations/supabase/client';

// The kind vocabulary + the hand-assignment rule live in a client-free module (see the note
// there); re-exported here so every existing import site keeps working.
export { AUTO_CATEGORY_KINDS, isHandAssignableKind } from './crmCategoryKinds';
// Also imported: a re-export does not bind the name locally, and assertHandAssignable uses it.
import { isHandAssignableKind } from './crmCategoryKinds';
export type { CrmCategoryKind, CrmCategoryMemberKind } from './crmCategoryKinds';

import type { CrmCategoryKind, CrmCategoryMemberKind } from './crmCategoryKinds';

export interface CrmCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: CrmCategoryKind;
  source_value: string | null;
  color_hex: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmCategorySummary extends CrmCategory {
  user_count: number;
  contact_count: number;
  company_count: number;
  total_count: number;
}

export interface CrmCategoryMember {
  id: string;
  category_id: string;
  member_kind: CrmCategoryMemberKind;
  user_id: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  source: 'auto' | 'manual';
  added_at: string;
  // Denormalized display fields filled in by the service
  display_email?: string | null;
  display_name?: string | null;
}

export interface ResolvedRecipient {
  email: string;
  member_kind: CrmCategoryMemberKind | null;
  user_id: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  display_name: string | null;
  category_ids: string[];
  category_slugs: string[];
}

/**
 * Every write here BINDS its error and throws (#389).
 *
 * `supabase-js` RESOLVES on an RLS denial rather than throwing, so an unbound write is
 * completely silent — a surrounding try/catch does not catch it, because nothing threw,
 * and the caller proceeds as though the write landed.
 *
 * It matters more in this file than in a generic one. The `role` and `employment`
 * category lists are DERIVED from `workspace_members.role` and `hr_employees` by
 * `crm_resync_auto_category_members`, so rows here legitimately appear and disappear on
 * their own. A manual assignment that silently failed is invisible against that
 * backdrop: there is no "it should still be there" to notice.
 *
 * Both halves of each reconciliation are checked. A successful add with a failed remove
 * leaves membership wrong in a way that looks deliberate.
 */
class CrmCategoriesService {
  async list(): Promise<CrmCategorySummary[]> {
    const { data, error } = await supabase
      .from('crm_categories_summary')
      .select('*')
      .order('kind', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as CrmCategorySummary[];
  }

  async get(categoryId: string): Promise<CrmCategorySummary | null> {
    const { data, error } = await supabase
      .from('crm_categories_summary')
      .select('*')
      .eq('id', categoryId)
      .maybeSingle();
    if (error) throw error;
    return data as CrmCategorySummary | null;
  }

  async create(input: {
    name: string;
    slug?: string;
    description?: string;
    color_hex?: string;
    icon?: string;
    /** Operator-managed kinds only ('manual' default, 'industry', or the
     * pick-one lead vocabularies). The auto kinds (professional_type / role /
     * employment) are owned by the resync RPC. */
    kind?: Extract<CrmCategoryKind, 'manual' | 'industry' | 'lead_status' | 'lead_source'>;
  }): Promise<CrmCategory> {
    const { data: { user } } = await supabase.auth.getUser();
    const slug = (input.slug || input.name).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
    const { data, error } = await supabase
      .from('crm_categories')
      .insert({
        name: input.name,
        slug,
        description: input.description ?? null,
        kind: input.kind ?? 'manual',
        source_value: null,
        color_hex: input.color_hex ?? null,
        icon: input.icon ?? null,
        is_active: true,
        created_by: user?.id ?? null,
      })
      .select('*').single();
    if (error) throw error;
    return data as CrmCategory;
  }

  async update(categoryId: string, patch: Partial<Pick<CrmCategory, 'name' | 'description' | 'color_hex' | 'icon' | 'is_active'>>): Promise<CrmCategory> {
    const { data, error } = await supabase
      .from('crm_categories')
      .update(patch)
      .eq('id', categoryId)
      .select('*').single();
    if (error) throw error;
    return data as CrmCategory;
  }

  async remove(categoryId: string): Promise<void> {
    const { error } = await supabase.from('crm_categories').delete().eq('id', categoryId);
    if (error) throw error;
  }

  async resyncAuto(): Promise<Array<{ out_category_id: string; out_slug: string; out_inserts: number; out_deletes: number }>> {
    const { data, error } = await supabase.rpc('crm_resync_auto_category_members');
    if (error) throw error;
    return (data || []) as any;
  }

  async listMembers(categoryId: string): Promise<CrmCategoryMember[]> {
    // platform_user display fields are fetched separately rather than via a
    // PostgREST embed. crm_category_members.user_id has a FK to auth.users (not
    // user_profiles), so `user_profiles!crm_category_members_user_id_fkey(...)`
    // raises PGRST200 ("no relationship found") and fails the whole query. The
    // crm_contacts / crm_companies embeds are valid and stay inline.
    const { data, error } = await supabase
      .from('crm_category_members')
      .select('id, category_id, member_kind, user_id, crm_contact_id, crm_company_id, source, added_at, crm_contacts!crm_category_members_crm_contact_id_fkey(name, email), crm_companies!crm_category_members_crm_company_id_fkey(name, email)')
      .eq('category_id', categoryId)
      .order('added_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = data || [];

    // Batch-resolve platform_user display info via user_profiles.user_id.
    const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))] as string[];
    const profileById = new Map<string, { full_name: string | null; email: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);
      for (const p of (profiles || []) as any[]) {
        profileById.set(p.user_id, { full_name: p.full_name ?? null, email: p.email ?? null });
      }
    }

    return rows.map((row: any) => {
      const profile = row.user_id ? profileById.get(row.user_id) : undefined;
      return {
        id: row.id,
        category_id: row.category_id,
        member_kind: row.member_kind,
        user_id: row.user_id,
        crm_contact_id: row.crm_contact_id,
        crm_company_id: row.crm_company_id,
        source: row.source,
        added_at: row.added_at,
        display_email: profile?.email ?? row.crm_contacts?.email ?? row.crm_companies?.email ?? null,
        display_name: profile?.full_name ?? row.crm_contacts?.name ?? row.crm_companies?.name ?? null,
      };
    });
  }

  async listMembershipsForUser(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crm_category_members')
      .select('category_id')
      .eq('user_id', userId);
    if (error) throw error;
    return (data || []).map((r: any) => r.category_id);
  }

  async listMembershipsForContact(contactId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crm_category_members')
      .select('category_id')
      .eq('crm_contact_id', contactId);
    if (error) throw error;
    return (data || []).map((r: any) => r.category_id);
  }

  async listMembershipsForCompany(companyId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('crm_category_members')
      .select('category_id')
      .eq('crm_company_id', companyId);
    if (error) throw error;
    return (data || []).map((r: any) => r.category_id);
  }

  /**
   * Refuse a hand-assignment to an AUTO kind, with a message someone can act on (#353 CRM-22).
   *
   * This is the COURTESY, not the guarantee. `trg_crm_category_no_manual_auto_member` is the
   * guarantee — a BEFORE INSERT/UPDATE trigger, so it covers every caller including the edge
   * functions and anything reaching the table directly, and it cannot be outrun. Without this
   * though, the operator sees a raw `check_violation` and has no idea that the answer lives in
   * Profile → Team or the HR roster.
   *
   * The list page already filters its options through `isHandAssignableKind`; the service used
   * to take a raw id and write it. CLAUDE.md's rule for exactly that shape: the offer and the
   * gate must read the same answer.
   */
  async assertHandAssignable(categoryIds: string[]): Promise<void> {
    const ids = categoryIds.filter(Boolean);
    if (ids.length === 0) return;
    const { data, error } = await supabase
      .from('crm_categories').select('id, name, kind').in('id', ids);
    // A failed lookup does NOT fall through to the write — the trigger would reject it anyway,
    // and a clear refusal beats a raw Postgres error surfacing three layers up.
    if (error) throw new Error(`Could not check the category kind: ${error.message}`);
    const auto = (data ?? []).filter((c: any) => !isHandAssignableKind(c.kind));
    if (auto.length > 0) {
      const names = auto.map((c: any) => `"${c.name}" (${c.kind})`).join(', ');
      throw new Error(
        `${names} ${auto.length === 1 ? 'is' : 'are'} derived, not assigned by hand. `
        + 'Membership comes from the workspace role (Profile → Team) or the HR roster, and the '
        + 'nightly resync rewrites it from there.',
      );
    }
  }

  async addMember(categoryId: string, target:
    | { user_id: string }
    | { crm_contact_id: string }
    | { crm_company_id: string },
  ): Promise<CrmCategoryMember> {
    const { data: { user } } = await supabase.auth.getUser();
    const memberKind: CrmCategoryMemberKind =
      'user_id' in target ? 'platform_user' :
      'crm_contact_id' in target ? 'crm_contact' : 'crm_company';
    await this.assertHandAssignable([categoryId]);
    const row: any = {
      category_id: categoryId,
      member_kind: memberKind,
      source: 'manual',
      added_by: user?.id ?? null,
      ...target,
    };
    const { data, error } = await supabase
      .from('crm_category_members')
      .insert(row)
      .select('*').single();
    if (error) throw error;
    return data as CrmCategoryMember;
  }

  async removeMember(memberId: string): Promise<void> {
    const { error } = await supabase.from('crm_category_members').delete().eq('id', memberId);
    if (error) throw error;
  }

  /**
   * Replaces the MANUAL memberships of the target with `categoryIds`. Auto-
   * synced rows (source='auto') are NOT touched — they're managed by the
   * resync RPC. The picker on detail pages should pass only the user's chosen
   * manual category IDs; the auto rows stay attached.
   */
  async setMembershipsForUser(userId: string, manualCategoryIds: string[]): Promise<void> {
    await this.assertHandAssignable(manualCategoryIds);
    const { data: existing } = await supabase
      .from('crm_category_members')
      .select('id, category_id, source')
      .eq('user_id', userId)
      .eq('source', 'manual');
    const existingIds = new Set((existing || []).map((r: any) => r.category_id));
    const wantIds = new Set(manualCategoryIds);
    const toAdd = [...wantIds].filter((id) => !existingIds.has(id));
    const toRemove = (existing || []).filter((r: any) => !wantIds.has(r.category_id));
    if (toAdd.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: addError } = await supabase.from('crm_category_members').insert(toAdd.map((cid) => ({
        category_id: cid,
        member_kind: 'platform_user' as CrmCategoryMemberKind,
        user_id: userId,
        source: 'manual',
        added_by: user?.id ?? null,
      })));
      if (addError) throw addError;
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('crm_category_members').delete().in('id', toRemove.map((r: any) => r.id));
      if (removeError) throw removeError;
    }
  }

  async setMembershipsForContact(contactId: string, manualCategoryIds: string[]): Promise<void> {
    await this.assertHandAssignable(manualCategoryIds);
    const { data: existing } = await supabase
      .from('crm_category_members')
      .select('id, category_id, source')
      .eq('crm_contact_id', contactId)
      .eq('source', 'manual');
    const existingIds = new Set((existing || []).map((r: any) => r.category_id));
    const wantIds = new Set(manualCategoryIds);
    const toAdd = [...wantIds].filter((id) => !existingIds.has(id));
    const toRemove = (existing || []).filter((r: any) => !wantIds.has(r.category_id));
    if (toAdd.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: addError } = await supabase.from('crm_category_members').insert(toAdd.map((cid) => ({
        category_id: cid,
        member_kind: 'crm_contact' as CrmCategoryMemberKind,
        crm_contact_id: contactId,
        source: 'manual',
        added_by: user?.id ?? null,
      })));
      if (addError) throw addError;
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('crm_category_members').delete().in('id', toRemove.map((r: any) => r.id));
      if (removeError) throw removeError;
    }
  }

  async setMembershipsForCompany(companyId: string, manualCategoryIds: string[]): Promise<void> {
    await this.assertHandAssignable(manualCategoryIds);
    const { data: existing } = await supabase
      .from('crm_category_members')
      .select('id, category_id, source')
      .eq('crm_company_id', companyId)
      .eq('source', 'manual');
    const existingIds = new Set((existing || []).map((r: any) => r.category_id));
    const wantIds = new Set(manualCategoryIds);
    const toAdd = [...wantIds].filter((id) => !existingIds.has(id));
    const toRemove = (existing || []).filter((r: any) => !wantIds.has(r.category_id));
    if (toAdd.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: addError } = await supabase.from('crm_category_members').insert(toAdd.map((cid) => ({
        category_id: cid,
        member_kind: 'crm_company' as CrmCategoryMemberKind,
        crm_company_id: companyId,
        source: 'manual',
        added_by: user?.id ?? null,
      })));
      if (addError) throw addError;
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('crm_category_members').delete().in('id', toRemove.map((r: any) => r.id));
      if (removeError) throw removeError;
    }
  }

  /** List categories of a given kind (e.g. 'industry') for a scoped picker. */
  async listByKind(kind: CrmCategoryKind): Promise<CrmCategory[]> {
    const { data, error } = await supabase
      .from('crm_categories')
      .select('id, slug, name, description, kind, source_value, color_hex, icon, is_active, created_at, updated_at')
      .eq('kind', kind)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data || []) as CrmCategory[];
  }

  /**
   * Reconcile a company's manual memberships **within a bounded set of categories**
   * (`scopeIds`) to exactly `selectedIds`. Memberships outside the scope (e.g. other
   * manual lists) are left untouched — unlike `setMembershipsForCompany`, which
   * replaces ALL manual memberships. Used by the per-kind pickers (industry) so they
   * don't clobber unrelated category assignments.
   */
  async setCompanyMembershipsWithinScope(companyId: string, scopeIds: string[], selectedIds: string[]): Promise<void> {
    const scope = new Set(scopeIds);
    const want = new Set(selectedIds.filter((id) => scope.has(id)));
    const { data: existing } = await supabase
      .from('crm_category_members')
      .select('id, category_id, source')
      .eq('crm_company_id', companyId)
      .eq('source', 'manual')
      .in('category_id', scopeIds.length ? scopeIds : ['00000000-0000-0000-0000-000000000000']);
    const existingIds = new Set((existing || []).map((r: any) => r.category_id));
    const toAdd = [...want].filter((id) => !existingIds.has(id));
    const toRemove = (existing || []).filter((r: any) => !want.has(r.category_id));
    if (toAdd.length > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: addError } = await supabase.from('crm_category_members').insert(toAdd.map((cid) => ({
        category_id: cid,
        member_kind: 'crm_company' as CrmCategoryMemberKind,
        crm_company_id: companyId,
        source: 'manual',
        added_by: user?.id ?? null,
      })));
      if (addError) throw addError;
    }
    if (toRemove.length > 0) {
      const { error: removeError } = await supabase.from('crm_category_members').delete().in('id', toRemove.map((r: any) => r.id));
      if (removeError) throw removeError;
    }
  }

  /** Resolve category members to email recipients, scoped to the caller's workspace (membership-guarded
   *  RPC — the previous unscoped variant leaked emails across all tenants). */
  async resolveRecipients(workspaceId: string, categoryIds: string[]): Promise<ResolvedRecipient[]> {
    if (categoryIds.length === 0) return [];
    const { data, error } = await supabase.rpc('crm_categories_resolve_recipients_ws', {
      p_workspace_id: workspaceId,
      p_category_ids: categoryIds,
    });
    if (error) throw error;
    return (data || []) as ResolvedRecipient[];
  }
}

export const crmCategoriesService = new CrmCategoriesService();
