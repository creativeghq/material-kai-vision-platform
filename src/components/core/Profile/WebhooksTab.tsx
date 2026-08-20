/**
 * Profile → Webhooks (#330). A workspace points its own systems at platform events.
 *
 * Two things drive the whole design:
 *   1. **The signing secret is shown exactly once.** It cannot be read back — the column is
 *      revoked from `authenticated` — so the reveal has to be unmissable and copyable, and
 *      "lost it" has to have an obvious answer (rotate).
 *   2. **Event types are an explicit opt-in list, never "all".** An endpoint that silently
 *      starts receiving newly-added event types leaks data by default, so there is no
 *      select-all shortcut here on purpose.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Webhook, Loader2, Plus, Trash2, RefreshCw, Copy, Check, AlertTriangle, ScrollText,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { formatDate } from '@/utils/datetime';
import {
  workspaceWebhooksService,
  type WorkspaceWebhook,
  type WebhookDelivery,
} from '@/services/workspaceWebhooksService';
import { HubEmptyState } from '@/components/core/hub';

const relative = (iso: string | null) => (iso ? formatDate(iso, { withTime: true }) : '—');

/** Turn `purchase_order.sent` into `Purchase order sent` for the checkbox list. */
const humanize = (t: string) =>
  t.replace(/[._]/g, ' ').replace(/^./, (c) => c.toUpperCase());

const statusTone: Record<WebhookDelivery['status'], string> = {
  delivered: 'text-emerald-500',
  pending: 'text-muted-foreground',
  delivering: 'text-muted-foreground',
  failed: 'text-destructive',
  dropped: 'text-amber-500',
};

export const WebhooksTab: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hooks, setHooks] = useState<WorkspaceWebhook[]>([]);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [logFor, setLogFor] = useState<WorkspaceWebhook | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [logLoading, setLogLoading] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const res = await workspaceWebhooksService.list(activeWorkspaceId);
      setHooks(res.webhooks);
      setAvailableEvents(res.available_events);
    } catch (err) {
      toast({ title: 'Could not load webhooks', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!activeWorkspaceId) return;
    setSaving(true);
    try {
      const res = await workspaceWebhooksService.create({
        workspaceId: activeWorkspaceId, url, eventTypes: selected, description: description || undefined,
      });
      setRevealedSecret(res.secret);
      setAddOpen(false);
      setUrl(''); setDescription(''); setSelected([]);
      await load();
    } catch (err) {
      toast({ title: 'Could not create the endpoint', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (h: WorkspaceWebhook, next: boolean) => {
    try {
      await workspaceWebhooksService.update(h.id, { isActive: next });
      await load();
    } catch (err) {
      toast({ title: 'Update failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const rotate = async (h: WorkspaceWebhook) => {
    try {
      const res = await workspaceWebhooksService.rotateSecret(h.id);
      setRevealedSecret(res.secret);
      toast({ title: 'Secret rotated', description: 'Deliveries signed with the old secret will now fail verification.' });
    } catch (err) {
      toast({ title: 'Rotation failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const remove = async (h: WorkspaceWebhook) => {
    try {
      await workspaceWebhooksService.remove(h.id);
      await load();
    } catch (err) {
      toast({ title: 'Delete failed', description: (err as Error).message, variant: 'destructive' });
    }
  };

  const openLog = async (h: WorkspaceWebhook) => {
    setLogFor(h); setLogLoading(true); setDeliveries([]);
    try {
      const res = await workspaceWebhooksService.deliveries(h.id, 50);
      setDeliveries(res.deliveries);
    } catch (err) {
      toast({ title: 'Could not load deliveries', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLogLoading(false);
    }
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    await navigator.clipboard.writeText(revealedSecret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!activeWorkspaceId) {
    return <Card><CardContent className="p-6 text-sm text-muted-foreground">Pick a workspace first.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Webhook className="h-4 w-4" /> Outbound webhooks</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Get your own systems notified when something happens here. Every request is signed, so you can
                verify it really came from us.
              </p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => setAddOpen(true)}>
              <Plus /> Add endpoint
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : hooks.length === 0 ? (
            <HubEmptyState
              icon={Webhook}
              title="No endpoints yet"
              description="A webhook endpoint receives a signed POST whenever something happens in this workspace — an order is placed, a quote is signed, a lead arrives."
              action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus /> Add endpoint</Button>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Endpoint</th>
                  <th className="px-4 py-2 font-medium">Events</th>
                  <th className="px-4 py-2 font-medium">Last delivery</th>
                  <th className="px-4 py-2 font-medium">Active</th>
                  <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {hooks.map((h) => (
                  <tr key={h.id} className="border-b border-border/40 last:border-0 align-top">
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs break-all">{h.url}</div>
                      {h.description && <div className="mt-0.5 text-xs text-muted-foreground">{h.description}</div>}
                      {h.disabled_reason && (
                        <div className="mt-1 flex items-start gap-1.5 text-xs text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {h.disabled_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{h.event_types.length}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{relative(h.last_delivery_at)}</td>
                    <td className="px-4 py-3">
                      <Switch checked={h.is_active} onCheckedChange={(v) => toggleActive(h, v)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => openLog(h)} title="Delivery log">
                          <ScrollText className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => rotate(h)} title="Rotate signing secret">
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => remove(h)} title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Verification instructions live next to the thing they explain, not in a doc nobody
          opens — a receiver that skips the check is the whole point of signing undone. */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm">Verifying a delivery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-5 text-xs text-muted-foreground">
          <p>Each POST carries these headers:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li><code>X-MaterialKai-Event</code> — the event type</li>
            <li><code>X-MaterialKai-Timestamp</code> — unix seconds</li>
            <li><code>X-MaterialKai-Signature</code> — <code>sha256=&lt;hex&gt;</code></li>
          </ul>
          <p>
            Compute <code>HMAC-SHA256(secret, "&lt;timestamp&gt;.&lt;raw body&gt;")</code> and compare it to the
            signature. Reject anything whose timestamp is more than a few minutes old — the timestamp is
            inside the signed string precisely so a captured delivery cannot be replayed at you later.
          </p>
          <p>
            Answer <strong>2xx</strong> quickly. Anything else is retried with backoff, and an endpoint that keeps
            failing is disabled automatically so it stops piling up retries.
          </p>
        </CardContent>
      </Card>

      {/* Add endpoint */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add an endpoint</DialogTitle>
            <DialogDescription>We will POST signed JSON here when the events you pick happen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/materialkai" />
              <p className="text-[11px] text-muted-foreground">Must be https, and must be reachable from the public internet.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. our ERP" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Events ({selected.length} selected)</Label>
              <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 p-2">
                {availableEvents.map((e) => (
                  <label key={e} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
                    <input
                      type="checkbox"
                      checked={selected.includes(e)}
                      onChange={(ev) => setSelected((prev) => ev.target.checked ? [...prev, e] : prev.filter((x) => x !== e))}
                    />
                    <span>{humanize(e)}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{e}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={create} disabled={saving || !url || selected.length === 0}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Secret reveal — the only time it is ever available */}
      <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Copy your signing secret now</DialogTitle>
            <DialogDescription>
              This is the only time it is shown. We cannot show it again — if you lose it, rotate the secret
              and update your receiver.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 p-3">
            <code className="flex-1 break-all font-mono text-xs">{revealedSecret}</code>
            <Button size="sm" variant="outline" className="shrink-0" onClick={copySecret}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delivery log */}
      <Dialog open={!!logFor} onOpenChange={(o) => !o && setLogFor(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Delivery log</DialogTitle>
            <DialogDescription className="font-mono text-xs break-all">{logFor?.url}</DialogDescription>
          </DialogHeader>
          {logLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : deliveries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nothing delivered yet.</p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Event</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">HTTP</th>
                    <th className="py-2 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-border/40 last:border-0 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{relative(d.created_at)}</td>
                      <td className="py-2 pr-3 font-mono">{d.event_type}</td>
                      <td className={`py-2 pr-3 ${statusTone[d.status]}`}>
                        {d.status}{d.attempt > 1 ? ` (try ${d.attempt})` : ''}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">{d.http_status ?? '—'}</td>
                      <td className="py-2 text-muted-foreground break-all">{d.error ?? d.response_snippet ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
