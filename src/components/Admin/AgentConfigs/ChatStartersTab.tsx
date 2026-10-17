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
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { HubEmptyState } from '@/components/core/hub';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';

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

function emptyStarter(agentId: string): Omit<ChatStarterRow, 'id' | 'updated_at'> {
  return {
    category:      AGENT_OPTIONS.some(a => a.value === agentId) ? agentId : 'kai',
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
      <SectionHeader
        icon={ListChecks}
        title="Chat Starters"
        subtitle="Curated prompt templates that appear in the chat composer picker."
        actions={
          <>
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
            <Button onClick={() => setCreating(emptyStarter(filterAgent))}>
              <Plus className="h-4 w-4 mr-2" />New starter
            </Button>
          </>
        }
      />

      {/* List */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="border rounded-lg">
          <HubEmptyState
            icon={ListChecks}
            title="No starters yet"
            description="The suggested prompts an agent offers before anyone has typed anything — grouped per agent, so each one opens with its own."
            action={<Button size="sm" onClick={() => setCreating(emptyStarter(filterAgent))}><Plus className="h-4 w-4 mr-2" />New starter</Button>}
          />
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        // The agent filter excluded every starter. Without this branch the list renders as a
        // blank area — no rows, no message — which reads as "the tab is broken", not "your
        // filter is narrow". Offering "New starter" here would be wrong: starters exist.
        <div className="border rounded-lg">
          <HubEmptyState
            icon={ListChecks}
            variant="filtered"
            title="No starters for this agent"
            description={`${rows.length} ${rows.length === 1 ? 'starter exists' : 'starters exist'}, but none are assigned to the agent you picked.`}
            action={<Button size="sm" variant="outline" onClick={() => setFilterAgent('all')}>Show all agents</Button>}
          />
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
                                {r.is_default && <span className="text-[10px] text-muted-foreground capitalize">Default</span>}
                                {!r.is_active && <span className={`text-[10px] inline-flex items-center capitalize ${statusTone('inactive')}`}><EyeOff className="h-2.5 w-2.5 mr-0.5" />Inactive</span>}
                                {r.configuration?.visibility === 'admin' && <span className="text-[10px] text-muted-foreground capitalize">Admin</span>}
                                {r.configuration?.requires_image && <span className="text-[10px] inline-flex items-center text-muted-foreground capitalize"><ImageIcon className="h-2.5 w-2.5 mr-0.5" />Image</span>}
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
                <DialogTitle>Delete Starter</DialogTitle>
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

        <div className="space-y-5 py-4">
          <FormSection title="Starter">
            <FormGrid>
              <FormField label="Name">
                <Input value={form.name} onChange={(e) => patch({ name: e.target.value })} />
              </FormField>
              <FormField label="Agent">
                <Select value={form.category} onValueChange={(v) => patch({ category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AGENT_OPTIONS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Group" hint="The UI label the starter is grouped under.">
                <Input
                  value={config.group ?? ''}
                  onChange={(e) => patchConfig({ group: e.target.value })}
                  placeholder="B2B Research / Material Specs / Staging / SEO"
                />
              </FormField>
              <FormField label="Slug" hint={!isNew ? 'Slug is immutable after creation.' : undefined}>
                <Input
                  value={form.subcategory ?? ''}
                  onChange={(e) => patch({ subcategory: e.target.value })}
                  placeholder="auto-derived from name if empty"
                  disabled={!isNew}
                />
              </FormField>
              <FormField label="Description" className="sm:col-span-2">
                <Input
                  value={form.description ?? ''}
                  onChange={(e) => patch({ description: e.target.value })}
                  placeholder="One-line summary shown under the name in the picker."
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Prompt">
            <FormGrid>
              <FormField
                label="Prompt text"
                hint="Phrase this to reliably trigger the intended skill — include the skill's trigger verbs (research, verify, identify, stage, extract) + the inputs it expects."
                className="sm:col-span-2"
              >
                <Textarea
                  value={form.prompt_text}
                  onChange={(e) => patch({ prompt_text: e.target.value })}
                  className="font-mono text-sm min-h-[200px]"
                  placeholder="What the agent receives when this starter is inserted. Use {variable} placeholders."
                />
              </FormField>
              <FormField label="Skill hint" optional>
                <Input
                  value={config.skill_hint ?? ''}
                  onChange={(e) => patchConfig({ skill_hint: e.target.value || null })}
                  placeholder="e.g. b2b-manufacturer-research"
                />
              </FormField>
              <FormField label="Credit estimate" optional>
                <Input
                  value={config.credit_estimate ?? ''}
                  onChange={(e) => patchConfig({ credit_estimate: e.target.value || null })}
                  placeholder="1-2 / 15-20 / etc"
                />
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Availability">
            <FormGrid>
              <FormField label="Visibility">
                <Select value={config.visibility ?? 'all'} onValueChange={(v) => patchConfig({ visibility: v as 'all' | 'admin' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All users</SelectItem>
                    <SelectItem value="admin">Admin / Owner only</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:col-span-2">
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
            </FormGrid>
          </FormSection>

          <FormSection
            title="Variables"
            description={<>Use the <code>key</code> in the prompt text as <code>{'{key}'}</code>. Defaults pre-fill the picker form.</>}
          >
            {vars.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No variables. The prompt is inserted as-is when picked.
              </p>
            ) : (
              <div className="space-y-2">
                {vars.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2 items-end">
                    <FormField label="key">
                      <Input value={v.key} onChange={(e) => setVar(i, { key: e.target.value })} placeholder="N / region / company" />
                    </FormField>
                    <FormField label="default">
                      <Input value={v.default} onChange={(e) => setVar(i, { default: e.target.value })} placeholder="10" />
                    </FormField>
                    <FormField label="description">
                      <Input value={v.description ?? ''} onChange={(e) => setVar(i, { description: e.target.value })} placeholder="Helper text shown in the form" />
                    </FormField>
                    <Button size="icon" variant="ghost" onClick={() => removeVar(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={addVar}>
              <Plus className="h-3 w-3 mr-1" />Add variable
            </Button>
          </FormSection>
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
