import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { inboxApi, type InboxLabel } from '@/services/inboxApi';

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'social', label: 'Social' },
] as const;

export function labelHasRules(l: InboxLabel): boolean {
  return !!(l.auto_keywords?.length || l.ai_instruction?.trim());
}

/** When a label is applied on its own: keywords (free), and/or an AI description (billed per new conversation). */
export const LabelRulesDialog: React.FC<{ label: InboxLabel; onClose: () => void; onSaved: () => void }> = ({ label, onClose, onSaved }) => {
  const { toast } = useToast();
  const [keywords, setKeywords] = useState((label.auto_keywords ?? []).join(', '));
  const [channels, setChannels] = useState<string[]>(label.auto_channels ?? []);
  const [ai, setAi] = useState(label.ai_instruction ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await inboxApi.updateLabel(label.id, {
        auto_keywords: keywords.split(',').map((k) => k.trim()).filter(Boolean),
        auto_channels: channels,
        ai_instruction: ai.trim() || null,
      });
      toast({ title: 'Auto-apply saved', description: 'It applies to new incoming messages from now on.' });
      onSaved();
      onClose();
    } catch (e) {
      toast({ title: 'Not saved', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Auto-apply “{label.name}”</DialogTitle>
          <DialogDescription>
            Label new incoming conversations without anyone doing it. Only new messages are checked; nothing already in the inbox is relabelled.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="label-keywords" className="text-xs font-semibold">Keywords</Label>
            <Input id="label-keywords" value={keywords} onChange={(e) => setKeywords(e.target.value)}
              placeholder="refund, broken, παράπονο" />
            <p className="text-[11px] text-muted-foreground">Comma-separated. Matches anywhere in the customer’s message, ignoring case and accents. Free.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label-ai" className="text-xs font-semibold inline-flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-primary" /> Describe when it applies (AI)</Label>
            <Textarea id="label-ai" value={ai} maxLength={500} onChange={(e) => setAi(e.target.value)}
              placeholder="The customer is unhappy with a delivered order or asks for money back."
              className="min-h-[72px] text-sm" />
            <p className="text-[11px] text-muted-foreground">
              Optional. The assistant reads each new conversation (and each return after a day) and applies the label when it matches.
              Each check uses a small amount of the workspace owner’s credits. Leave empty to use keywords only.
            </p>
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold">Channels</span>
            <div className="flex flex-wrap gap-4">
              {CHANNELS.map((c) => (
                <label key={c.key} className="inline-flex items-center gap-1.5 text-sm">
                  <Checkbox checked={channels.includes(c.key)}
                    onCheckedChange={(v) => setChannels((cur) => (v === true ? [...cur, c.key] : cur.filter((x) => x !== c.key)))} />
                  {c.label}
                </label>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">None ticked = every channel.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { void save(); }} disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
