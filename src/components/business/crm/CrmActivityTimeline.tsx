/**
 * CrmActivityTimeline — unified feed for a CRM contact / company: tracked actions
 * (quote/invoice created, email sent, company attach, lead status change) merged
 * with the party's internal notes, newest-first. Notes are added via the inline
 * "Add note" modal here — there is no separate Notes tab any more.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, FileText, Mail, Building2, Tag, ScrollText, Receipt, CreditCard, Loader2, Unlink, Plus,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { crmActivitiesService, type TimelineItem, type CrmActivityTarget } from '@/services/crmActivitiesService';
import { getErrorMessage } from '@/core/errors/utils';

interface Props {
  target: CrmActivityTarget;
  /** Bump to force a reload (parent logged a new activity). */
  refreshKey?: number;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note_added: FileText,
  email_sent: Mail,
  company_attached: Building2,
  company_detached: Unlink,
  lead_status_changed: Tag,
  quote_created: ScrollText,
  invoice_created: Receipt,
  payment_received: CreditCard,
};

const relativeTime = (iso: string): string => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const CrmActivityTimeline: React.FC<Props> = ({ target, refreshKey = 0 }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!target.id) { setItems([]); setLoading(false); return; }
    try {
      setLoading(true);
      setItems(await crmActivitiesService.listTimeline(target));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleAddNote = async () => {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      await crmActivitiesService.addNote(target, body);
      setDraft('');
      setAddOpen(false);
      await load(); // instant refresh
    } catch (err) {
      toast({ title: 'Failed to add note', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Activity
        </CardTitle>
        {target.id && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add note
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No activity yet. Notes you add and actions (emails, quotes, invoices, company
            changes, lead status) will show up here.
          </p>
        ) : (
          <div className="space-y-0">
            {items.map((a, i) => {
              const Icon = ICONS[a.activity_type] ?? Activity;
              const isNote = a.source === 'note';
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isNote ? 'bg-amber-500/15 text-amber-500' : 'bg-muted text-muted-foreground'}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {i < items.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-4 min-w-0 flex-1">
                    <div className="text-sm">
                      {isNote ? <span className="font-medium">Note</span> : a.title}
                    </div>
                    {a.description && (
                      <div className={`text-xs mt-0.5 ${isNote ? 'text-foreground whitespace-pre-wrap' : 'text-muted-foreground'}`}>{a.description}</div>
                    )}
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {relativeTime(a.created_at)}{a.actor_name ? ` · ${a.actor_name}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={(o) => !saving && setAddOpen(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add note</DialogTitle></DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            placeholder="Internal note — visible to your team in the activity feed."
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAddNote} disabled={saving || !draft.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Add note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CrmActivityTimeline;
