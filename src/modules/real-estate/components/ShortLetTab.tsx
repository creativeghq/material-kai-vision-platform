import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { CalendarDays, Plus, Trash2, Loader2, RefreshCw, Copy, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { statusTone } from '@/utils/statusTone';
import {
  realEstateService, icalFeedUrl, CHANNEL_LABELS,
  type Booking, type BookingTask, type ChannelLink,
} from '../services/realEstateService';

const money = (n: number | null | undefined, ccy: string) => formatMoney(n ?? 0, ccy || 'EUR', { decimals: 0 });
const nights = (b: Booking) => Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 864e5);

/**
 * Short-let operations: the booking calendar, the changeover work, and the channel links.
 *
 * A short-let property is not a tenancy — it is a stream of stays, each with a guest and a cleaning
 * turnaround — so it gets its own surface rather than being forced through the Lettings tab.
 *
 * Dates are half-open. `check_out` is the morning of departure, so a back-to-back changeover is two
 * touching bookings and not a clash; the database enforces that with a GiST exclusion constraint
 * rather than a check here, because two channel syncs land concurrently and a read-then-write would
 * accept both.
 */
export const ShortLetTab: React.FC<{ ws: string | null; propertyId: string; icalToken: string | null; canManage: boolean; onChanged: () => void }> = ({ ws, propertyId, icalToken, canManage, onChanged }) => {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [tasks, setTasks] = useState<BookingTask[]>([]);
  const [channels, setChannels] = useState<ChannelLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<{ check_in: string; check_out: string; guest_name: string; nightly_rate: string; channel: string } | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    try { const r = await realEstateService.listBookings(ws, propertyId); setBookings(r.bookings); setTasks(r.tasks); setChannels(r.channels); }
    catch { setBookings([]); }
  }, [ws, propertyId]);
  useEffect(() => { void load(); }, [load]);

  const addBooking = async () => {
    if (!ws || !draft?.check_in || !draft.check_out) return;
    setBusy(true);
    try {
      await realEstateService.upsertBooking(ws, {
        property_id: propertyId, channel: draft.channel, check_in: draft.check_in, check_out: draft.check_out,
        guest_name: draft.guest_name || null, nightly_rate: draft.nightly_rate || null,
      });
      setDraft(null); await load(); toast({ title: 'Booking added' });
    } catch (e) {
      // The 409 here is the exclusion constraint refusing a double booking — say so plainly.
      toast({ title: 'Could not book', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const setTaskStatus = async (t: BookingTask, status: string) => {
    if (!ws) return;
    try { await realEstateService.upsertBookingTask(ws, { task_id: t.id, status }); await load(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  const saveChannel = async (channel: string, url: string) => {
    if (!ws) return;
    try { await realEstateService.upsertChannelLink(ws, { property_id: propertyId, channel, ical_import_url: url || null, is_active: !!url }); await load(); toast({ title: 'Channel saved' }); }
    catch (e) { toast({ title: 'Rejected', description: (e as Error).message, variant: 'destructive' }); }
  };

  const rotateToken = async (revoke: boolean) => {
    if (!ws) return;
    try { await realEstateService.rotateIcalToken(ws, propertyId, revoke); onChanged(); toast({ title: revoke ? 'Calendar link revoked' : 'Calendar link ready' }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (bookings === null) return <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">Loading…</div>;
  const openTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'skipped');

  return (
    <div className="space-y-4">
      {/* Bookings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" /> Bookings</CardTitle>
          {canManage && !draft && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDraft({ check_in: '', check_out: '', guest_name: '', nightly_rate: '', channel: 'direct' })}>
              <Plus className="mr-1 h-4 w-4" /> Add booking
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {bookings.length === 0 && !draft && <p className="py-2 text-sm text-muted-foreground">No bookings yet. Link a channel below, or add one directly.</p>}
          {bookings.map((b) => (
            <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{new Date(b.check_in).toLocaleDateString()} → {new Date(b.check_out).toLocaleDateString()}</span>
              <span className="text-xs text-muted-foreground">{nights(b)} night{nights(b) === 1 ? '' : 's'}</span>
              <span className="text-xs text-muted-foreground">{CHANNEL_LABELS[b.channel] ?? b.channel}</span>
              {b.guest_name && <span className="text-xs">{b.guest_name}</span>}
              {b.total_amount != null && <span className="text-xs tabular-nums">{money(b.total_amount, b.currency)}</span>}
              <span className={`ml-auto text-xs capitalize ${statusTone(b.status)}`}>{b.status}</span>
              {canManage && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-destructive"
                  onClick={async () => { if (!ws) return; try { await realEstateService.deleteBooking(ws, b.id); await load(); } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); } }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          {draft && (
            <div className="space-y-3 rounded-lg border p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                <div><Label className="text-xs">Check-in</Label><Input className="h-9" type="date" value={draft.check_in} onChange={(e) => setDraft({ ...draft, check_in: e.target.value })} /></div>
                <div><Label className="text-xs">Check-out</Label><Input className="h-9" type="date" value={draft.check_out} onChange={(e) => setDraft({ ...draft, check_out: e.target.value })} /></div>
                <div><Label className="text-xs">Guest</Label><Input className="h-9" value={draft.guest_name} onChange={(e) => setDraft({ ...draft, guest_name: e.target.value })} /></div>
                <div><Label className="text-xs">Nightly rate</Label><Input className="h-9" type="number" value={draft.nightly_rate} onChange={(e) => setDraft({ ...draft, nightly_rate: e.target.value })} /></div>
                <div>
                  <Label className="text-xs">Channel</Label>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
                    {Object.entries(CHANNEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Check-out is the morning of departure — the same day can be another guest’s check-in.</p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setDraft(null)}>Cancel</Button>
                <Button size="sm" className="rounded-full" disabled={busy || !draft.check_in || !draft.check_out} onClick={addBooking}>
                  {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Add
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Changeover work */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Changeover</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {openTasks.length === 0 && <p className="py-2 text-sm text-muted-foreground">Nothing outstanding.</p>}
          {openTasks.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium capitalize">{t.task_type.replace('_', ' ')}</span>
              <span className="text-xs text-muted-foreground">due {new Date(t.due_at).toLocaleDateString()}</span>
              {t.assignee_name && <span className="text-xs">{t.assignee_name}</span>}
              <span className={`ml-auto text-xs capitalize ${statusTone(t.status)}`}>{t.status.replace('_', ' ')}</span>
              {canManage && (
                <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs" onClick={() => setTaskStatus(t, 'done')}><Check className="mr-1 h-3 w-3" /> Done</Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Channels */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><RefreshCw className="h-4 w-4" /> Channel sync</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Paste each channel’s calendar URL to import their bookings hourly, and give them the link below so they stop selling nights you have taken.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(['airbnb', 'booking_com', 'vrbo'] as const).map((ch) => {
              const link = channels.find((c) => c.channel === ch);
              return (
                <div key={ch} className="flex flex-wrap items-center gap-2">
                  <span className="w-28 shrink-0 text-sm">{CHANNEL_LABELS[ch]}</span>
                  <Input className="h-9 min-w-0 flex-1" defaultValue={link?.ical_import_url ?? ''} placeholder="https://…/calendar.ics"
                    onBlur={(e) => { if (e.target.value !== (link?.ical_import_url ?? '')) void saveChannel(ch, e.target.value.trim()); }} />
                  {link?.last_sync_status && (
                    <span className={`text-[11px] ${statusTone(link.last_sync_status === 'ok' ? 'success' : link.last_sync_status)}`}>
                      {link.last_sync_status}{link.last_sync_message ? ` — ${link.last_sync_message}` : ''}
                    </span>
                  )}
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-muted-foreground">Our availability feed</span>
              <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">
                {icalToken ? icalFeedUrl(icalToken) : 'Not shared yet'}
              </code>
              {icalToken && <Button size="sm" variant="ghost" className="rounded-full" onClick={() => { void navigator.clipboard.writeText(icalFeedUrl(icalToken)); toast({ title: 'Calendar URL copied' }); }}><Copy className="h-3.5 w-3.5" /></Button>}
              <Button size="sm" variant="outline" className="rounded-full" onClick={() => rotateToken(false)}>{icalToken ? 'Rotate' : 'Create link'}</Button>
              {icalToken && <Button size="sm" variant="ghost" className="rounded-full text-destructive" onClick={() => rotateToken(true)}>Revoke</Button>}
            </div>
            <p className="text-[11px] text-muted-foreground">The feed publishes blocked nights only — never a guest name, contact detail or price.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
