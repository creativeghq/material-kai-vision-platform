/**
 * Chat Starters Admin Tab
 *
 * CRUD for the chat composer's starter prompts (prompt_type='chat_starter' in
 * the shared `prompts` table). Handles the structured `configuration` fields
 * that the vanilla AI Prompts tab can't edit: variables, group, visibility,
 * skill hint, credit estimate, image requirement.
 */

import React, { useEffect, useState, useMemo } from 'react';
import {
  Sparkles, Plus, Edit, Trash2, Save, X, ListChecks, ImageIcon,
  AlertTriangle, EyeOff, ChevronDown, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const GLOBAL_WORKSPACE = '00000000-0000-0000-0000-000000000000';

interface StarterVariable {
  key:          string;
  default:      string;
  description?: string;
}

interface StarterConfig {
  variables?:        StarterVariable[];
  group?:            string;
  visibility?:       'all' | 'admin';
  skill_hint?:       string | null;
  credit_estimate?:  string | null;
  requires_image?:   boolean;
}

interface ChatStarterRow {
  id:            string;
  category:      string; // agent id
  subcategory:   string;
  name:          string;
  description:   string | null;
  prompt_text:   string;
  configuration: StarterConfig;
  is_default:    boolean;
  is_active:     boolean;
  version:       number;
  updated_at:    string;
}

const AGENT_OPTIONS = [
  { value: 'kai',               label: 'KAI' },
  { value: 'interior-designer', label: 'Interior Designer' },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function emptyStarter(): Omit<ChatStarterRow, 'id' | 'updated_at'> {
  return {
    category:      'kai',
    subcategory:   '',
    name:          '',
    description:   '',
    prompt_text:   '',
    configuration: {
      variables:       [],
      group:           'General',
      visibility:      'all',
      skill_hint:      null,
      credit_estimate: null,
      requires_image:  false,
    },
    is_default:    false,
    is_active:     true,
    version:       1,
  };
}

export const ChatStartersTab: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ChatStarterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChatStarterRow | null>(null);
  const [creating, setCreating] = useState<Omit<ChatStarterRow, 'id' | 'updated_at'> | null>(null);
  const [deleting, setDeleting] = useState<ChatStarterRow | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>('all');

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('prompts')
        .select('id, category, subcategory, name, description, prompt_text, configuration, is_default, is_active, version, updated_at')
        .eq('prompt_type', 'chat_starter')
        .order('category')
        .order('name');
      if (error) throw error;
      setRows((data ?? []) as ChatStarterRow[]);
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Save (insert or update) ───────────────────────────────────────────────
  const handleSave = async () => {
    const source = creating ?? editing;
    if (!source) return;

    // Minimum validation — skip noisy boundary validation, trust the admin
    if (!source.name.trim() || !source.prompt_text.trim()) {
      toast({ title: 'Name and prompt text are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (creating) {
        const subcategory = source.subcategory.trim() || slugify(source.name);
        const { error } = await supabase.from('prompts').insert({
          prompt_type:   'chat_starter',
          category:      source.category,
          subcategory,
          name:          source.name,
          description:   source.description || null,
          prompt_text:   source.prompt_text,
          configuration: source.configuration,
          workspace_id:  GLOBAL_WORKSPACE,
          is_active:     source.is_active,
          is_default:    source.is_default,
          version:       1,
          status:        'published',
          used_in:       ['chat-composer'],
        });
        if (error) throw error;
        toast({ title: 'Starter created' });
        setCreating(null);
      } else if (editing) {
        const { error } = await supabase
          .from('prompts')
          .update({
            name:          editing.name,
            description:   editing.description,
            prompt_text:   editing.prompt_text,
            configuration: editing.configuration,
            is_active:     editing.is_active,
            is_default:    editing.is_default,
            category:      editing.category,
          })
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Starter updated' });
        setEditing(null);
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const { error } = await supabase.from('prompts').delete().eq('id', deleting.id);
      if (error) throw error;
      toast({ title: 'Starter deleted' });
      setDeleting(null);
      load();
    } catch (err: any) {
      toast({ title: 'Delete failed', description: err.message, variant: 'destructive' });
    }
  };

  // Group by agent → group
  const grouped = useMemo(() => {
    const byAgent: Record<string, Record<string, ChatStarterRow[]>> = {};
    for (const r of rows) {
      if (filterAgent !== 'all' && r.category !== filterAgent) continue;
      const agent = r.category;
      const group = r.configuration?.group ?? 'Other';
      (byAgent[agent] ??= {});
      (byAgent[agent][group] ??= []).push(r);
    }
    return byAgent;
  }, [rows, filterAgent]);

  const form = creating ?? editing;

  return (
    <div className="space-y-4">
      {/* Header + actions */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Chat Starters
          </h2>
          <p className="text-sm text-muted-foreground">
            Curated prompt templates that appear in the chat composer picker.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterAgent} onValueChange={setFilterAgent}>
            <SelectTrigger className="w-[200px] rounded-full">
              <SelectValue placeholder="All agents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All agents</SelectItem>
              {AGENT_OPTIONS.map(a => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setCreating(emptyStarter())} className="rounded-full">
            <Plus className="h-4 w-4 mr-2" />New starter
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 border rounded-lg">
          <ListChecks className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No starters yet</p>
          <p className="text-sm text-muted-foreground">Click "New starter" to add one.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([agent, groups]) => (
            <div key={agent} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                {AGENT_OPTIONS.find(a => a.value === agent)?.label ?? agent}
              </h3>
              {Object.entries(groups).map(([group, items]) => {
                const key = `${agent}-${group}`;
                const open = expandedGroup === key;
                return (
                  <div key={key} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-muted/40 text-left"
                      onClick={() => setExpandedGroup(open ? null : key)}
                    >
                      {open
                        ? <ChevronDown  className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      <span className="text-sm font-medium">{group}</span>
                      <Badge variant="outline" className="text-xs">{items.length}</Badge>
                    </button>
                    {open && (
                      <div className="divide-y">
                        {items.map(r => (
                          <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                            <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-medium">{r.name}</span>
                                {r.is_default && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                                {!r.is_active && <Badge variant="outline" className="text-[10px]"><EyeOff className="h-2.5 w-2.5 mr-0.5" />Inactive</Badge>}
                                {r.configuration?.visibility === 'admin' && <Badge variant="outline" className="text-[10px]">Admin</Badge>}
                                {r.configuration?.requires_image && <Badge variant="outline" className="text-[10px]"><ImageIcon className="h-2.5 w-2.5 mr-0.5" />Image</Badge>}
                                {r.configuration?.skill_hint && <Badge variant="outline" className="text-[10px]">skill: {r.configuration.skill_hint}</Badge>}
                                {r.configuration?.credit_estimate && (
                                  <span className="text-[10px] text-muted-foreground">~{r.configuration.credit_estimate} cr</span>
                                )}
                              </div>
                              {r.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                              )}
                              <p className="text-[10px] text-muted-foreground mt-1">
                                slug: <code>{r.subcategory}</code>
                                {(r.configuration?.variables?.length ?? 0) > 0 && (
                                  <> • vars: {r.configuration.variables!.map(v => `{${v.key}}`).join(', ')}</>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(r)}>
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleting(r)}>
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      {form && (
        <StarterFormDialog
          form={form}
          setForm={(next) => creating ? setCreating(next) : setEditing(next as ChatStarterRow)}
          isNew={!!creating}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setCreating(null); setEditing(null); }}
        />
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <DialogTitle>Delete starter</DialogTitle>
                <DialogDescription>
                  Permanently remove "{deleting?.name}"? This cannot be undone.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Form dialog ───────────────────────────────────────────────────────────────

interface StarterFormDialogProps {
  form:    Omit<ChatStarterRow, 'id' | 'updated_at'> | ChatStarterRow;
  setForm: (next: any) => void;
  isNew:   boolean;
  saving:  boolean;
  onSave:  () => void;
  onClose: () => void;
}

function StarterFormDialog({ form, setForm, isNew, saving, onSave, onClose }: StarterFormDialogProps) {
  const config = form.configuration ?? {};
  const vars   = config.variables ?? [];

  const patch = (updates: Partial<typeof form>) => setForm({ ...form, ...updates });
  const patchConfig = (updates: Partial<StarterConfig>) =>
    setForm({ ...form, configuration: { ...config, ...updates } });

  const setVar = (i: number, updates: Partial<StarterVariable>) => {
    const next = [...vars];
    next[i] = { ...next[i], ...updates };
    patchConfig({ variables: next });
  };
  const addVar = () => patchConfig({ variables: [...vars, { key: '', default: '', description: '' }] });
  const removeVar = (i: number) => patchConfig({ variables: vars.filter((_, j) => j !== i) });

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New starter' : `Edit — ${form.name}`}</DialogTitle>
          <DialogDescription>
            Prompt templates inserted into the chat composer. Use <code>{'{variable}'}</code> placeholders.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} className="mt-1" />
          </div>
          <div>
            <Label>Agent</Label>
            <Select value={form.category} onValueChange={(v) => patch({ category: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AGENT_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Group (UI label)</Label>
            <Input
              value={config.group ?? ''}
              onChange={(e) => patchConfig({ group: e.target.value })}
              placeholder="B2B Research / Material Specs / Staging / SEO"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Slug</Label>
            <Input
              value={form.subcategory ?? ''}
              onChange={(e) => patch({ subcategory: e.target.value })}
              placeholder="auto-derived from name if empty"
              disabled={!isNew}
              className="mt-1"
            />
            {!isNew && (
              <p className="text-[10px] text-muted-foreground mt-1">Slug is immutable after creation.</p>
            )}
          </div>

          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Input
              value={form.description ?? ''}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="One-line summary shown under the name in the picker."
              className="mt-1"
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Prompt text</Label>
            <Textarea
              value={form.prompt_text}
              onChange={(e) => patch({ prompt_text: e.target.value })}
              className="font-mono text-sm min-h-[200px] mt-1"
              placeholder="What the agent receives when this starter is inserted. Use {variable} placeholders."
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Phrase this to reliably trigger the intended skill — include the skill's trigger verbs (research, verify, identify, stage, extract) + the inputs it expects.
            </p>
          </div>

          <div>
            <Label>Visibility</Label>
            <Select value={config.visibility ?? 'all'} onValueChange={(v) => patchConfig({ visibility: v as 'all' | 'admin' })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="admin">Admin / owner only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Skill hint (optional)</Label>
            <Input
              value={config.skill_hint ?? ''}
              onChange={(e) => patchConfig({ skill_hint: e.target.value || null })}
              placeholder="e.g. b2b-manufacturer-research"
              className="mt-1"
            />
          </div>
          <div>
            <Label>Credit estimate (optional)</Label>
            <Input
              value={config.credit_estimate ?? ''}
              onChange={(e) => patchConfig({ credit_estimate: e.target.value || null })}
              placeholder="1-2 / 15-20 / etc"
              className="mt-1"
            />
          </div>

          <div className="flex items-center gap-6 pt-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={config.requires_image ?? false}
                onCheckedChange={(c) => patchConfig({ requires_image: c })}
                id="requires_image"
              />
              <Label htmlFor="requires_image" className="text-sm">Requires image</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_default}
                onCheckedChange={(c) => patch({ is_default: c })}
                id="is_default"
              />
              <Label htmlFor="is_default" className="text-sm">Default (pinned in picker)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(c) => patch({ is_active: c })}
                id="is_active"
              />
              <Label htmlFor="is_active" className="text-sm">Active</Label>
            </div>
          </div>

          <div className="sm:col-span-2 pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Variables</Label>
              <Button size="sm" variant="outline" onClick={addVar} className="rounded-full">
                <Plus className="h-3 w-3 mr-1" />Add variable
              </Button>
            </div>
            {vars.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variables. The prompt is inserted as-is when picked.
              </p>
            ) : (
              <div className="space-y-2">
                {vars.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-[10px]">key</Label>
                      <Input value={v.key} onChange={(e) => setVar(i, { key: e.target.value })} placeholder="N / region / company" />
                    </div>
                    <div>
                      <Label className="text-[10px]">default</Label>
                      <Input value={v.default} onChange={(e) => setVar(i, { default: e.target.value })} placeholder="10" />
                    </div>
                    <div>
                      <Label className="text-[10px]">description</Label>
                      <Input value={v.description ?? ''} onChange={(e) => setVar(i, { description: e.target.value })} placeholder="Helper text shown in the form" />
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => removeVar(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground mt-2">
              Use the <code>key</code> in the prompt text as <code>{'{key}'}</code>. Defaults pre-fill the picker form.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}><X className="h-4 w-4 mr-2" />Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
