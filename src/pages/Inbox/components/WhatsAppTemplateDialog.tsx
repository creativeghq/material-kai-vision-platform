import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { inboxApi, type InboxWhatsAppTemplate } from '@/services/inboxApi';

function render(content: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((out, [k, v]) => out.split(`{{${k}}}`).join(v || `{{${k}}}`), content || '');
}

export const WhatsAppTemplateDialog: React.FC<{
  threadId: string;
  onClose: () => void;
  onSent: () => void;
}> = ({ threadId, onClose, onSent }) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<InboxWhatsAppTemplate[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inboxApi.listWhatsAppTemplates(threadId)
      .then((r) => { setTemplates(r.templates); if (r.templates.length === 1) setPickedId(r.templates[0].id); })
      .catch((e) => { setTemplates([]); toast({ title: 'Could not load templates', description: (e as Error).message, variant: 'destructive' }); });
  }, [threadId, toast]);

  const picked = templates?.find((t) => t.id === pickedId) ?? null;
  const names = useMemo(() => (Array.isArray(picked?.variables) ? picked.variables : []), [picked]);
  const ready = !!picked && names.every((n) => (values[n] ?? '').trim());

  const send = async () => {
    if (!picked || !ready) return;
    setBusy(true);
    try {
      await inboxApi.sendWhatsAppTemplate({ thread_id: threadId, template_id: picked.id, variables: values });
      toast({ title: 'Template sent' });
      onSent();
    } catch (e) {
      toast({ title: 'Template not sent', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send an Approved Template</DialogTitle>
          <DialogDescription>
            Meta allows only an approved template outside the 24-hour window. When the customer replies, you can write freely again.
          </DialogDescription>
        </DialogHeader>
        {templates === null ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2 py-2">
            <p>This workspace has no Meta-approved WhatsApp templates yet.</p>
            <Button asChild variant="outline" size="sm"><Link to="/profile?tab=social-accounts&section=wa-templates">Create a template</Link></Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {templates.map((t) => (
                <Button key={t.id} size="sm" variant={t.id === pickedId ? 'secondary' : 'outline'} onClick={() => { setPickedId(t.id); setValues({}); }}>
                  {t.name}
                </Button>
              ))}
            </div>
            {picked && (
              <>
                {names.map((n) => (
                  <div key={n} className="space-y-1">
                    <Label htmlFor={`tpl-${n}`} className="text-xs text-muted-foreground">{n}</Label>
                    <Input id={`tpl-${n}`} value={values[n] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} />
                  </div>
                ))}
                <div className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm whitespace-pre-wrap">
                  {render(picked.content, values)}
                </div>
                <p className="text-[11px] text-muted-foreground">A template opens a paid WhatsApp conversation; credits are charged when it is sent.</p>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={send} disabled={busy || !ready}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
