import { supabase } from '@/integrations/supabase/client';

import { requireAdapter } from './templates/registry';
import type { TemplateApplyResult, TemplateEntityType } from './templates/types';

/**
 * Universal entity templates (issue #322) — CRUD + apply.
 *
 * Direct-supabase under RLS, deliberately mirroring `blueprintsService`: this is plain
 * workspace-scoped CRUD with no paid upstream and no cross-tenant compute, so an edge function
 * would buy nothing but a hop. The per-type knowledge lives in the adapter registry, never here.
 *
 * `workspace_id IS NULL` ⇒ a platform starter: readable by every workspace, writable by none
 * (enforced by the RLS policies, not by this file).
 */

export interface EntityTemplate {
  id: string;
  workspace_id: string | null;
  entity_type: TemplateEntityType;
  title: string;
  description: string | null;
  category: string | null;
  payload: Record<string, unknown>;
  is_platform_starter: boolean;
  version: number;
  status: 'active' | 'archived';
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntityTemplateVersion {
  id: string;
  template_id: string;
  version: number;
  payload: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

class EntityTemplatesService {
  /**
   * Templates for ONE workspace: that workspace's own, plus the platform starters.
   *
   * RLS alone would return the templates of every workspace the caller belongs to, which is not a
   * leak (they are a member of all of them) but is wrong on screen: you would see another
   * workspace's invoice shapes in this one's library, and "Use" would materialise them here.
   * The active workspace is the scope the rest of the app works in, so it is the scope here too.
   */
  async list(opts?: { entityType?: TemplateEntityType; includeArchived?: boolean; workspaceId?: string | null }): Promise<EntityTemplate[]> {
    let q = supabase.from('entity_templates').select('*').order('updated_at', { ascending: false });
    if (opts?.entityType) q = q.eq('entity_type', opts.entityType);
    if (!opts?.includeArchived) q = q.eq('status', 'active');
    if (opts?.workspaceId) q = q.or(`is_platform_starter.eq.true,workspace_id.eq.${opts.workspaceId}`);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as EntityTemplate[];
  }

  async get(id: string): Promise<EntityTemplate | null> {
    const { data, error } = await supabase.from('entity_templates').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as unknown as EntityTemplate) ?? null;
  }

  async listVersions(templateId: string): Promise<EntityTemplateVersion[]> {
    const { data, error } = await supabase
      .from('entity_template_versions')
      .select('*')
      .eq('template_id', templateId)
      .order('version', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as EntityTemplateVersion[];
  }

  /**
   * Capture a real record into a new template.
   *
   * The adapter's allowlist decides what is stored; nothing here reads the source record directly,
   * so a field can only enter a payload by being declared (and therefore inspected by
   * tests/unit/templateRegistry.test.ts).
   */
  async saveFrom(input: {
    entityType: TemplateEntityType;
    sourceId: string;
    workspaceId: string;
    title: string;
    description?: string;
    category?: string;
  }): Promise<EntityTemplate> {
    const adapter = requireAdapter(input.entityType);
    const payload = await adapter.capture(input.sourceId);
    return this.create({
      entityType: input.entityType,
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description,
      category: input.category,
      payload: payload as Record<string, unknown>,
    });
  }

  /**
   * Re-capture a record over an EXISTING template.
   *
   * The counterpart to capture-first authoring: you refine the real record, then push the refined
   * shape back over the template rather than accumulating "Bathroom quote v2 (final)" copies.
   * `update()` snapshots the outgoing payload and bumps the version in the same write, so the
   * previous shape is always one Restore away.
   */
  async updateFrom(input: { templateId: string; sourceId: string }): Promise<EntityTemplate> {
    const tpl = await this.get(input.templateId);
    if (!tpl) throw new Error('Template not found');
    if (tpl.is_platform_starter) throw new Error('Starter examples are read-only — copy it first.');
    const adapter = requireAdapter(tpl.entity_type);
    const payload = await adapter.capture(input.sourceId);
    return this.update(input.templateId, { payload: payload as Record<string, unknown> });
  }

  async create(input: {
    entityType: TemplateEntityType;
    workspaceId: string;
    title: string;
    description?: string;
    category?: string;
    payload?: Record<string, unknown>;
  }): Promise<EntityTemplate> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase
      .from('entity_templates')
      .insert({
        workspace_id: input.workspaceId,
        entity_type: input.entityType,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        payload: input.payload ?? {},
        created_by: user.id,
      } as never)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as EntityTemplate;
  }

  /**
   * Metadata + payload edits. A payload edit snapshots the OUTGOING payload and bumps `version`
   * in the same write, so history and the version number can never disagree.
   */
  async update(
    id: string,
    patch: Partial<Pick<EntityTemplate, 'title' | 'description' | 'category' | 'status'>> & { payload?: Record<string, unknown> },
  ): Promise<EntityTemplate> {
    const next: Record<string, unknown> = {};
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.description !== undefined) next.description = patch.description;
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.status !== undefined) next.status = patch.status;

    if (patch.payload !== undefined) {
      const current = await this.get(id);
      if (!current) throw new Error('Template not found');
      await this.snapshot(current);
      next.payload = patch.payload;
      next.version = current.version + 1;
    }

    const { data, error } = await supabase
      .from('entity_templates')
      .update(next as never)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as EntityTemplate;
  }

  /** Freeze a template's current payload as a version row so an edit is always undoable. */
  async snapshot(template: EntityTemplate): Promise<void> {
    if (template.is_platform_starter) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('entity_template_versions').insert({
      template_id: template.id,
      version: template.version,
      payload: template.payload,
      created_by: user?.id ?? null,
    } as never);
    // A duplicate (template_id, version) means this exact version is already snapshotted — the
    // history is intact, so there is nothing to report.
    if (error && !String(error.message).includes('duplicate key')) throw error;
  }

  async restoreVersion(templateId: string, version: number): Promise<EntityTemplate> {
    const { data, error } = await supabase
      .from('entity_template_versions')
      .select('payload')
      .eq('template_id', templateId)
      .eq('version', version)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Version not found');
    return this.update(templateId, { payload: (data as unknown as { payload: Record<string, unknown> }).payload });
  }

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('entity_templates').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Copy any template — a platform starter or one of your own — into the active workspace so it
   * becomes editable. Same affordance as `blueprintsService.duplicate`.
   */
  async duplicate(sourceId: string, workspaceId: string, title?: string): Promise<EntityTemplate> {
    const src = await this.get(sourceId);
    if (!src) throw new Error('Template not found');
    return this.create({
      entityType: src.entity_type,
      workspaceId,
      title: title ?? `${src.title} (copy)`,
      description: src.description ?? undefined,
      category: src.category ?? undefined,
      payload: src.payload,
    });
  }

  /**
   * Use a template: either the record is created, or the module's own create form is opened
   * pre-filled (money documents — see the adapter contract).
   *
   * The usage counter is bumped through `bump_template_usage`, the one SECURITY DEFINER in this
   * feature: a member legitimately cannot UPDATE a platform-starter row through RLS.
   */
  async apply(
    templateId: string,
    ctx: {
      workspaceId: string;
      title?: string;
      projectId?: string | null;
      customer?: { companyId?: string | null; contactId?: string | null };
      hrEmployeeId?: string | null;
    },
  ): Promise<TemplateApplyResult> {
    const tpl = await this.get(templateId);
    if (!tpl) throw new Error('Template not found');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const adapter = requireAdapter(tpl.entity_type);
    const result = await adapter.apply(tpl.payload as never, {
      templateId,
      workspaceId: ctx.workspaceId,
      userId: user.id,
      title: ctx.title,
      projectId: ctx.projectId ?? null,
      customer: ctx.customer,
      hrEmployeeId: ctx.hrEmployeeId ?? null,
    });

    // Best-effort: a counter must never sink a successful create.
    try { await supabase.rpc('bump_template_usage', { p_template_id: templateId } as never); } catch { /* ignore */ }
    return result;
  }
}

export const entityTemplatesService = new EntityTemplatesService();
