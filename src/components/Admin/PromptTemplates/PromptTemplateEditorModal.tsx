import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const API_BASE = 'https://v1api.materialshub.gr/admin/prompt-templates';

const STAGES = [
  { v: 'metadata_extraction', l: 'Metadata Extraction' },
  { v: 'discovery', l: 'Product Discovery' },
  { v: 'classification', l: 'Image Classification' },
  { v: 'chunking', l: 'Text Chunking' },
];
const INDUSTRIES = [
  { v: 'general', l: 'General' },
  { v: 'construction', l: 'Construction' },
  { v: 'interior_design', l: 'Interior Design' },
];
const MODELS = [
  { v: 'auto', l: 'Auto' },
  { v: 'claude', l: 'Claude' },
  { v: 'gpt', l: 'GPT' },
];

export interface EditableTemplate {
  id?: string;
  name: string;
  description: string | null;
  industry: string | null;
  stage: string;
  category: string | null;
  prompt_template: string;
  system_prompt: string | null;
  model_preference: string | null;
  temperature: number;
  max_tokens: number;
  is_active?: boolean;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

export const PromptTemplateEditorModal: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  /** null = create mode; an existing template = edit mode. */
  template: EditableTemplate | null;
  onSaved: () => void;
}> = ({ open, onOpenChange, workspaceId, template, onSaved }) => {
  const { toast } = useToast();
  const isEdit = !!template?.id;
  const [form, setForm] = useState<EditableTemplate>({
    name: '', description: '', industry: 'general', stage: 'discovery', category: '',
    prompt_template: '', system_prompt: '', model_preference: 'auto', temperature: 0.1, max_tokens: 4096, is_active: true,
  });
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setForm({ ...template });
    } else {
      setForm({
        name: '', description: '', industry: 'general', stage: 'discovery', category: '',
        prompt_template: '', system_prompt: '', model_preference: 'auto', temperature: 0.1, max_tokens: 4096, is_active: true,
      });
    }
    setChangeReason('');
  }, [open, template]);

  const set = <K extends keyof EditableTemplate>(k: K, v: EditableTemplate[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    if (!form.prompt_template.trim()) { toast({ title: 'Prompt template is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const headers = await authHeaders();
      let res: Response;
      if (isEdit) {
        res = await fetch(`${API_BASE}/${template!.id}?workspace_id=${encodeURIComponent(workspaceId)}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: form.name,
            description: form.description || null,
            prompt_template: form.prompt_template,
            system_prompt: form.system_prompt || null,
            model_preference: form.model_preference || null,
            temperature: form.temperature,
            max_tokens: form.max_tokens,
            is_active: form.is_active,
            change_reason: changeReason || null,
          }),
        });
      } else {
        res = await fetch(API_BASE, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            workspace_id: workspaceId,
            name: form.name,
            stage: form.stage,
            prompt_template: form.prompt_template,
            description: form.description || null,
            industry: form.industry || null,
            category: form.category || null,
            system_prompt: form.system_prompt || null,
            model_preference: form.model_preference || null,
            temperature: form.temperature,
            max_tokens: form.max_tokens,
          }),
        });
      }
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status} — ${txt}`);
      }
      toast({ title: isEdit ? 'Template updated' : 'Template created' });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit prompt template' : 'New prompt template'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tiles discovery (Greek catalogs)" />
            </div>
            <div className="space-y-1">
              <Label>Model</Label>
              <Select value={form.model_preference ?? 'auto'} onValueChange={(v) => set('model_preference', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODELS.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Stage + industry are immutable after creation (the backend update contract omits them). */}
          {!isEdit && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>Stage</Label>
                <Select value={form.stage} onValueChange={(v) => set('stage', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{STAGES.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Select value={form.industry ?? 'general'} onValueChange={(v) => set('industry', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Category (optional)</Label>
                <Input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} placeholder="products / certificates…" />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Description (optional)</Label>
            <Input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>System prompt (optional)</Label>
            <Textarea rows={3} value={form.system_prompt ?? ''} onChange={(e) => set('system_prompt', e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Prompt template</Label>
            <Textarea rows={8} value={form.prompt_template} onChange={(e) => set('prompt_template', e.target.value)} placeholder="The prompt body. Use {{variables}} where supported." className="font-mono text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Temperature</Label>
              <MoneyInput value={form.temperature} displayDecimals={null}
                onValueChange={(v) => set('temperature', Math.min(2, Math.max(0, v ?? 0)))} />
            </div>
            <div className="space-y-1">
              <Label>Max tokens</Label>
              <Input type="number" step="256" min="256" max="16384" value={form.max_tokens}
                onChange={(e) => set('max_tokens', Math.min(16384, Math.max(256, parseInt(e.target.value, 10) || 4096)))} />
            </div>
            {isEdit && (
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_active ?? true} onCheckedChange={(v) => set('is_active', v)} />
                <span className="text-sm">Active</span>
              </div>
            )}
          </div>

          {isEdit && (
            <div className="space-y-1">
              <Label>Change reason (optional)</Label>
              <Input value={changeReason} onChange={(e) => setChangeReason(e.target.value)} placeholder="Logged in the template's history" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} {isEdit ? 'Save changes' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
