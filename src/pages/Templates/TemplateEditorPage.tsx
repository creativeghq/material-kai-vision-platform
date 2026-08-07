import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, History, Loader2, Play, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import {
  entityTemplatesService, type EntityTemplate, type EntityTemplateVersion,
} from '@/services/entityTemplatesService';
import { getAdapter } from '@/services/templates/registry';
import type { TemplateChildSpec } from '@/services/templates/types';

/**
 * Template editor (issue #322).
 *
 * Deliberately NOT ten bespoke forms. Authoring is capture-first — you build a template by saving
 * a real record — so this screen edits the parts that genuinely need tuning afterwards: the
 * metadata, the adapter-declared scalar defaults, and the child rows. Anything richer belongs in
 * the module's own editor, where it already exists.
 *
 * Platform starters are read-only here; "Copy to edit" in the library makes an editable copy.
 */

/** Child columns that are numbers rather than free text. */
const NUMERIC_FIELD = /(quantity|price|amount|_pct|position|sort_order|code|version|rate)$/;

export const TemplateEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tpl, setTpl] = useState<EntityTemplate | null>(null);
  const [versions, setVersions] = useState<EntityTemplateVersion[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [payload, setPayload] = useState<Record<string, unknown>>({});

  const adapter = tpl ? getAdapter(tpl.entity_type) : null;
  const readOnly = !!tpl?.is_platform_starter;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const t = await entityTemplatesService.get(id);
      if (!t) { toast({ title: 'Template not found', variant: 'destructive' }); navigate('/templates'); return; }
      setTpl(t);
      setTitle(t.title);
      setDescription(t.description ?? '');
      setCategory(t.category ?? '');
      setPayload({ ...(t.payload ?? {}) });
      if (!t.is_platform_starter) setVersions(await entityTemplatesService.listVersions(t.id));
    } catch (e) {
      toast({ title: 'Failed to load template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const childSpecs = useMemo<readonly TemplateChildSpec[]>(() => adapter?.captureChildren ?? [], [adapter]);

  const setPayloadKey = (key: string, value: unknown) => setPayload((p) => ({ ...p, [key]: value }));

  const rowsOf = (table: string): Record<string, unknown>[] => {
    const v = payload[table];
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
  };

  const setRows = (table: string, rows: Record<string, unknown>[]) => setPayloadKey(table, rows);

  const save = async () => {
    if (!tpl) return;
    setSaving(true);
    try {
      const updated = await entityTemplatesService.update(tpl.id, {
        title: title.trim() || tpl.title,
        description: description.trim() || null,
        category: category.trim() || null,
        payload,
      });
      setTpl(updated);
      setVersions(await entityTemplatesService.listVersions(updated.id));
      toast({ title: 'Template saved' });
    } catch (e) {
      toast({ title: 'Save failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const restore = async (version: number) => {
    if (!tpl) return;
    if (!confirm(`Restore version ${version}? The current content is snapshotted first.`)) return;
    try {
      await entityTemplatesService.restoreVersion(tpl.id, version);
      await load();
      toast({ title: `Restored version ${version}` });
    } catch (e) {
      toast({ title: 'Restore failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  const use = async () => {
    if (!tpl || !workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    try {
      const result = await entityTemplatesService.apply(tpl.id, { workspaceId });
      if (result.message) toast({ title: result.message });
      navigate(result.route);
    } catch (e) {
      toast({ title: 'Could not use this template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!tpl || !adapter) return null;

  const Icon = adapter.icon;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={Icon}
        title={tpl.title}
        subtitle={`${adapter.label} template${readOnly ? ' — starter example, read-only' : ''}`}
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/templates')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Templates
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={use}>
              <Play className="h-4 w-4 mr-1" /> Use
            </Button>
            {!readOnly && (
              <Button size="sm" className="rounded-full" disabled={saving} onClick={save}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save
              </Button>
            )}
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6 space-y-4 max-w-4xl">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
            <CardDescription>How this template shows up in the library.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={title} disabled={readOnly} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea rows={2} value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Input value={category} disabled={readOnly} placeholder="Optional grouping label" onChange={(e) => setCategory(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {(adapter.editableFields?.length ?? 0) > 0 && (
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="text-base">Defaults</CardTitle>
              <CardDescription>Applied every time this template is used.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(adapter.editableFields ?? []).map((f) => {
                const value = payload[f.key];
                if (f.kind === 'boolean') {
                  return (
                    <div key={f.key} className="flex items-center justify-between gap-2 sm:col-span-2">
                      <div>
                        <Label className="text-sm">{f.label}</Label>
                        {f.hint && <div className="text-xs text-muted-foreground">{f.hint}</div>}
                      </div>
                      <Switch checked={value === true} disabled={readOnly} onCheckedChange={(v) => setPayloadKey(f.key, v)} />
                    </div>
                  );
                }
                if (f.kind === 'textarea') {
                  return (
                    <div key={f.key} className="space-y-1 sm:col-span-2">
                      <Label className="text-xs text-muted-foreground">{f.label}</Label>
                      <Textarea rows={2} value={value == null ? '' : String(value)} disabled={readOnly}
                        onChange={(e) => setPayloadKey(f.key, e.target.value || null)} />
                      {f.hint && <div className="text-xs text-muted-foreground">{f.hint}</div>}
                    </div>
                  );
                }
                return (
                  <div key={f.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{f.label}</Label>
                    <Input
                      type={f.kind === 'number' ? 'number' : 'text'}
                      value={value == null ? '' : String(value)}
                      disabled={readOnly}
                      onChange={(e) => setPayloadKey(
                        f.key,
                        f.kind === 'number'
                          ? (e.target.value === '' ? null : Number(e.target.value))
                          : (e.target.value || null),
                      )}
                    />
                    {f.hint && <div className="text-xs text-muted-foreground">{f.hint}</div>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {childSpecs.map((spec) => {
          const rows = rowsOf(spec.table);
          return (
            <Card key={spec.table} className="dashboard-card">
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{spec.label}</CardTitle>
                  <CardDescription>{rows.length} row{rows.length === 1 ? '' : 's'}</CardDescription>
                </div>
                {!readOnly && (
                  <Button variant="outline" size="sm" className="rounded-full"
                    onClick={() => setRows(spec.table, [...rows, {}])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {rows.length === 0 ? (
                  <div className="px-6 pb-6 text-sm text-muted-foreground">Nothing here yet.</div>
                ) : (
                  <div className="divide-y">
                    {rows.map((row, idx) => (
                      <div key={idx} className="px-6 py-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {spec.fields.map((f) => (
                          <div key={f} className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">{f.replace(/_/g, ' ')}</Label>
                            <Input
                              className="h-8 text-sm"
                              type={NUMERIC_FIELD.test(f) ? 'number' : 'text'}
                              value={row[f] == null ? '' : String(row[f])}
                              disabled={readOnly}
                              onChange={(e) => {
                                const next = [...rows];
                                const raw = e.target.value;
                                next[idx] = {
                                  ...row,
                                  [f]: raw === '' ? null : (NUMERIC_FIELD.test(f) ? Number(raw) : raw),
                                };
                                setRows(spec.table, next);
                              }}
                            />
                          </div>
                        ))}
                        {!readOnly && (
                          <div className="flex items-end">
                            <Button variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => setRows(spec.table, rows.filter((_, i) => i !== idx))}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {!readOnly && (
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Version history
                <Badge variant="outline" className="text-[10px] h-4">v{tpl.version}</Badge>
              </CardTitle>
              <CardDescription>Every payload edit snapshots the previous content first.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {versions.length === 0 ? (
                <div className="px-6 pb-6 text-sm text-muted-foreground">No earlier versions yet.</div>
              ) : (
                <div className="divide-y">
                  {versions.map((v) => (
                    <div key={v.id} className="px-6 py-2 flex items-center justify-between gap-2">
                      <div className="text-sm">
                        Version {v.version}
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => restore(v.version)}>
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TemplateEditorPage;
