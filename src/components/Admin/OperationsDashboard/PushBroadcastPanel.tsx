import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Loader2, Send } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/core/ui/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { edgeError } from '@/utils/edgeError';
import { formatDate } from '@/utils/datetime';

interface AudienceUser { user_id: string; name: string | null; email: string | null; devices: number }
interface Broadcast {
  id: string; title: string; audience: string;
  recipient_users: number; delivered: number; failed: number; created_at: string;
}

export const PushBroadcastPanel: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<AudienceUser[] | null>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [audience, setAudience] = useState<'all' | 'selected'>('all');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const [aud, hist] = await Promise.all([
      supabase.functions.invoke('notification-dispatcher', { body: { action: 'list-push-audience' } }),
      supabase.from('push_broadcasts')
        .select('id, title, audience, recipient_users, delivered, failed, created_at')
        .order('created_at', { ascending: false }).limit(20),
    ]);
    setUsers(aud.error ? [] : ((aud.data?.users ?? []) as AudienceUser[]));
    setHistory((hist.data ?? []) as Broadcast[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (users ?? []).filter((u) => !f || `${u.name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(f));
  }, [users, filter]);

  const recipients = audience === 'all' ? (users?.length ?? 0) : picked.size;
  const valid = title.trim() && message.trim() && recipients > 0;

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('notification-dispatcher', {
        body: {
          action: 'broadcast-push', title, body: message, url: link.trim() || undefined,
          audience, user_ids: audience === 'selected' ? [...picked] : undefined,
        },
      });
      if (error) throw await edgeError(error);
      toast({
        title: 'Notification Sent',
        description: `Delivered to ${data?.delivered ?? 0} device(s) of ${data?.recipients ?? 0} user(s)${data?.failed ? `, ${data.failed} failed` : ''}.`,
      });
      setTitle(''); setMessage(''); setLink(''); setPicked(new Set());
      void load();
    } catch (e) {
      toast({ title: 'Failed to Send', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 space-y-0">
          <CardTitle className="flex items-center gap-2"><Bell className="h-4 w-4" /> Send a Phone Notification</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reaches users who turned notifications on in their profile, even when the app is closed. Only platform operators can send.
          </p>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <Label htmlFor="push-title">Title</Label>
            <Input id="push-title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="push-body">Message</Label>
            <Textarea id="push-body" maxLength={240} rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="push-link">Opens (optional)</Label>
            <Input id="push-link" placeholder="/finance" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Send to</p>
            <RadioGroup value={audience} onValueChange={(v) => setAudience(v as 'all' | 'selected')} className="flex gap-6">
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem id="aud-all" value="all" />
                <Label htmlFor="aud-all">Everyone subscribed {users ? `(${users.length})` : ''}</Label>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <RadioGroupItem id="aud-selected" value="selected" />
                <Label htmlFor="aud-selected">Selected users</Label>
              </div>
            </RadioGroup>
          </div>

          {audience === 'selected' && (
            <div className="space-y-2">
              <Input placeholder="Search by name or email…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              {users === null ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
              ) : shown.length === 0 ? (
                <HubEmptyState icon={Bell} title="No subscribed users match" variant="filtered" />
              ) : (
                <div className="max-h-64 overflow-y-auto rounded-md border border-border/60">
                  {shown.map((u) => (
                    <label key={u.user_id} className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0">
                      <Checkbox checked={picked.has(u.user_id)} onCheckedChange={() => toggle(u.user_id)} />
                      <span className="min-w-0 flex-1 truncate">{u.name ?? u.email ?? u.user_id.slice(0, 8)}</span>
                      <span className="text-xs text-muted-foreground">{u.devices} device{u.devices === 1 ? '' : 's'}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button disabled={!valid || sending} onClick={() => setConfirmOpen(true)}>
              <Send className="mr-2 h-4 w-4" /> Send to {recipients} User{recipients === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 space-y-0">
          <CardTitle>Recent Notifications</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <HubEmptyState icon={Bell} title="Nothing sent yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sent</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{formatDate(h.created_at)}</TableCell>
                    <TableCell className="font-medium">{h.title}</TableCell>
                    <TableCell>{h.audience === 'all' ? 'Everyone' : 'Selected'}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.recipient_users}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.delivered}</TableCell>
                    <TableCell className="text-right tabular-nums">{h.failed}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this notification?</AlertDialogTitle>
            <AlertDialogDescription>
              “{title}” will appear on the screens of {recipients} user{recipients === 1 ? '' : 's'}. It cannot be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={sending} onClick={(e) => { e.preventDefault(); void send(); }}>
              {sending ? 'Sending…' : 'Send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
