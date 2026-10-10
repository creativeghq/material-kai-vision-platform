import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Loader2, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { formatDate } from '@/utils/datetime';

interface FollowUpRow {
  kind: 'outreach' | 'boomerang'; source: 'inbox' | 'gmail'; inbox_thread_id: string | null; gmail_thread_id: string | null;
  account_id: string | null; subject: string | null; step: number | null; due_at: string | null; status: string;
  replied_at: string | null; cancel_reason: string | null; preview: string | null;
}

function verdict(r: FollowUpRow): { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' } {
  if (r.kind === 'boomerang') return { label: 'Comes back', variant: 'info' };
  if (r.status === 'pending' || r.status === 'sending') return { label: 'Waiting', variant: 'info' };
  if (r.status === 'sent') return r.replied_at ? { label: 'Got a reply', variant: 'success' } : { label: 'Sent, no reply yet', variant: 'neutral' };
  if (r.status === 'failed') return { label: 'Not sent', variant: 'error' };
  if (r.cancel_reason === 'replied') return { label: 'Answered before it was needed', variant: 'success' };
  if (r.cancel_reason === 'deleted') return { label: 'Conversation deleted', variant: 'neutral' };
  return { label: 'Cancelled', variant: 'neutral' };
}

/** Follow-ups on this contact's or deal's conversations: what is waiting, and how each one ended. */
export const FollowUpsCard: React.FC<{ contactId?: string | null; dealId?: string | null }> = ({ contactId, dealId }) => {
  const [rows, setRows] = useState<FollowUpRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contactId && !dealId) { setRows([]); return; }
    let live = true;
    supabase.rpc('crm_follow_ups' as never, { p_contact_id: contactId ?? null, p_deal_id: dealId ?? null } as never)
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) { setError(e.message); setRows([]); } else setRows((data as unknown as FollowUpRow[] | null) ?? []);
      });
    return () => { live = false; };
  }, [contactId, dealId]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-base">Follow-ups</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows === null ? (
          <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="p-4 text-sm text-destructive">Follow-ups could not be loaded: {error}</div>
        ) : rows.length === 0 ? (
          <HubEmptyState icon={AlarmClock} title="No follow-ups" description="Set a Boomerang or Automatic outreach on any of their conversations and it shows here."
            action={<Button asChild size="sm" variant="outline"><Link to="/inbox">Open the Inbox</Link></Button>} />
        ) : (
          <ul className="divide-y divide-hairline">
            {rows.map((r, i) => {
              const v = verdict(r);
              const href = r.source === 'inbox' && r.inbox_thread_id ? `/inbox?thread=${r.inbox_thread_id}` : '/inbox?src=gmail';
              return (
                <li key={`${r.source}-${r.inbox_thread_id ?? r.gmail_thread_id}-${r.step ?? 0}-${i}`} className="px-4 py-2.5 flex items-start gap-3 text-sm">
                  {r.kind === 'outreach' ? <Send className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" /> : <AlarmClock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <Link to={href} className="block truncate hover:underline">{r.subject || '(no subject)'}</Link>
                    <div className="text-xs text-muted-foreground truncate">
                      {r.kind === 'outreach' ? `Follow-up${r.step ? ` ${r.step}` : ''}` : 'Boomerang'}
                      {r.due_at ? ` · ${r.status === 'sent' ? 'sent' : 'due'} ${formatDate(r.due_at)}` : ''}
                      {r.source === 'gmail' ? ' · Gmail' : ''}
                    </div>
                  </div>
                  <Badge variant={v.variant}>{v.label}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
