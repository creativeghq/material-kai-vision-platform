/**
 * CrmActivityTimeline — read-only feed of tracked actions against a CRM contact /
 * company / user (quote created, email sent, note added, lead status change,
 * company attach, …). Rows are written via crmActivitiesService.log() at the
 * source of each action; this just renders them newest-first.
 *
 * Exposes a `refreshKey` prop so the parent can force a reload after it logs a
 * new activity (e.g. right after sending an email).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, FileText, Mail, Building2, Tag, ScrollText, Receipt, CreditCard, Loader2, Unlink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { crmActivitiesService, type CrmActivity, type CrmActivityTarget } from '@/services/crmActivitiesService';

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
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.round((now - then) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const CrmActivityTimeline: React.FC<Props> = ({ target, refreshKey = 0 }) => {
  const [items, setItems] = useState<CrmActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!target.id) { setItems([]); setLoading(false); return; }
    try {
      setLoading(true);
      setItems(await crmActivitiesService.listForTarget(target));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [target.kind, target.id]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No activity yet. Actions like sending an email, attaching a company, changing the
            lead status or adding a note will show up here.
          </p>
        ) : (
          <div className="space-y-0">
            {items.map((a, i) => {
              const Icon = ICONS[a.activity_type] ?? Activity;
              return (
                <div key={a.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {i < items.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
                  </div>
                  <div className="pb-4 min-w-0">
                    <div className="text-sm">{a.title}</div>
                    {a.description && <div className="text-xs text-muted-foreground mt-0.5">{a.description}</div>}
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
    </Card>
  );
};

export default CrmActivityTimeline;
