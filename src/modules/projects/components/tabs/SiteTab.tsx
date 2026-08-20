/**
 * Site — snags (punch list) and the dated site visit log (WS4 #285).
 *
 * One tab with two views rather than two triggers: they are the same site-work story and the
 * project tab bar already carries 14. Snags marked `client_visible` are the handover list the
 * client sees; the site log is internal only and has no collaborator read policy at all.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Trash2, ClipboardList, CalendarDays, ImagePlus, Eye, EyeOff,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { projectsService, type ProjectRoom } from '../../services/projectsService';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  siteService, SNAG_STATUSES, SNAG_SEVERITIES, SNAG_CLOSED_STATUSES,
  type ProjectSnag, type ProjectSiteLog, type SnagStatus, type SnagSeverity,
} from '../../services/siteService';
import { HubEmptyState } from '@/components/core/hub';

type View = 'snags' | 'log';

/**
 * Site photos live in a PRIVATE bucket now (#358 PQ-9), so a render needs a signed URL rather
 * than a string built from the path. One batch call per list, re-signed whenever the paths change.
 * A path that could not be signed is absent from the map and shows a placeholder — never a
 * hard-coded public URL, which is what this replaced.
 */
function useSignedPhotos(paths: string[]): Record<string, string> {
  const key = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    if (!key) { setUrls({}); return; }
    siteService.photoUrls(key.split('|')).then((m) => { if (!cancelled) setUrls(m); });
    return () => { cancelled = true; };
  }, [key]);
  return urls;
}

const PhotoStrip: React.FC<{ paths: string[]; urls: Record<string, string>; alt: (i: number) => string }> = ({ paths, urls, alt }) => (
  <div className="mt-2 flex flex-wrap gap-2">
    {paths.map((p, i) => (urls[p] ? (
      <a key={p} href={urls[p]} target="_blank" rel="noreferrer">
        {/* The alt is the LINK's accessible name too — empty made this a nameless link, i.e.
            "link" is all a screen reader could announce. */}
        <img src={urls[p]} alt={alt(i)} loading="lazy"
          className="h-16 w-16 rounded-md object-cover border border-white/10" />
      </a>
    ) : (
      <div key={p} className="h-16 w-16 rounded-md border border-white/10 bg-muted/40" aria-hidden />
    )))}
  </div>
);

const severityTone = (s: SnagSeverity) =>
  s === 'critical' ? 'text-destructive'
    : s === 'high' ? 'text-amber-400'
      : s === 'medium' ? 'text-muted-foreground' : 'text-muted-foreground';

export const SiteTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const [view, setView] = useState<View>('snags');

  const Toggle: React.FC<{ value: View; icon: React.ReactNode; label: string }> = ({ value, icon, label }) => (
    <button
      type="button"
      onClick={() => setView(value)}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
        view === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex rounded-md border border-border/60 p-0.5">
          <Toggle value="snags" icon={<ClipboardList className="h-3.5 w-3.5" />} label="Snags" />
          <Toggle value="log" icon={<CalendarDays className="h-3.5 w-3.5" />} label="Site log" />
        </div>
      </div>
      {view === 'snags'
        ? <SnagsView projectId={projectId} isOwner={isOwner} />
        : <SiteLogView projectId={projectId} isOwner={isOwner} />}
    </div>
  );
};

// ---------------------------------------------------------------------------

const SnagsView: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const { toast } = useToast();
  const [snags, setSnags] = useState<ProjectSnag[]>([]);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [roomFilter, setRoomFilter] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [s, r] = await Promise.all([
        siteService.listSnags(projectId),
        projectsService.listRooms(projectId),
      ]);
      setSnags(s);
      setRooms(r);
    } catch (err: any) {
      toast({ title: 'Failed to load snags', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const roomName = useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  const visible = useMemo(() => snags.filter((s) => {
    if (roomFilter && s.room_id !== roomFilter) return false;
    if (!showClosed && SNAG_CLOSED_STATUSES.includes(s.status)) return false;
    return true;
  }), [snags, roomFilter, showClosed]);

  const openCount = snags.filter((s) => !SNAG_CLOSED_STATUSES.includes(s.status)).length;
  const photoUrls = useSignedPhotos(useMemo(() => visible.flatMap((s) => s.photo_paths ?? []), [visible]));

  const setStatus = async (snag: ProjectSnag, status: SnagStatus) => {
    setSnags((list) => list.map((s) => (s.id === snag.id ? { ...s, status } : s)));
    try { await siteService.updateSnag(snag.id, { status }); }
    catch (err: any) {
      toast({ title: 'Failed to update', description: err?.message, variant: 'destructive' });
      void load();
    }
  };

  const toggleVisible = async (snag: ProjectSnag) => {
    const next = !snag.client_visible;
    setSnags((list) => list.map((s) => (s.id === snag.id ? { ...s, client_visible: next } : s)));
    try { await siteService.updateSnag(snag.id, { client_visible: next }); }
    catch (err: any) {
      toast({ title: 'Failed to update', description: err?.message, variant: 'destructive' });
      void load();
    }
  };

  const remove = async (snag: ProjectSnag) => {
    if (!confirm('Delete this snag? Its photos are reclaimed by the nightly cleanup.')) return;
    try { await siteService.deleteSnag(snag.id); await load(); }
    catch (err: any) { toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' }); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ClipboardList className="h-4 w-4 text-primary" /> Snags
          </CardTitle>
          <p className="text-xs text-muted-foreground">{openCount} open of {snags.length}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rooms.length > 0 && (
            <select
              className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
              value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}
            >
              <option value="">All rooms</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(!!v)} /> Show closed
          </label>
          {isOwner && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Raise snag
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {snags.length === 0 ? 'No snags raised.' : 'Nothing matches the filter.'}
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {visible.map((s) => (
              <div key={s.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{s.title}</p>
                      <span className={`text-[11px] capitalize ${severityTone(s.severity)}`}>{s.severity}</span>
                      {s.room_id && <span className="text-[11px] text-muted-foreground">· {roomName.get(s.room_id) ?? 'Room'}</span>}
                      {s.due_date && <span className="text-[11px] text-muted-foreground">· due {s.due_date}</span>}
                    </div>
                    {s.description && <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>}
                    {s.photo_paths.length > 0 && (
                      <PhotoStrip paths={s.photo_paths} urls={photoUrls} alt={(i) => `Snag photo ${i + 1}: ${s.title}`} />
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner ? (
                      <select
                        className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                        value={s.status} onChange={(e) => setStatus(s, e.target.value as SnagStatus)}
                      >
                        {SNAG_STATUSES.map((st) => <option key={st} value={st}>{humanizeLabel(st)}</option>)}
                      </select>
                    ) : (
                      <span className={`text-xs capitalize ${statusTone(s.status)}`}>{humanizeLabel(s.status)}</span>
                    )}
                    {isOwner && (
                      <>
                        <button
                          type="button"
                          title={s.client_visible ? 'Visible to the client' : 'Internal only'}
                          className={s.client_visible ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
                          onClick={() => toggleVisible(s)}
                        >
                          {s.client_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </button>
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(s)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {adding && (
        <AddSnagDialog
          projectId={projectId} rooms={rooms}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void load(); }}
        />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const AddSnagDialog: React.FC<{
  projectId: string; rooms: ProjectRoom[]; onClose: () => void; onSaved: () => void;
}> = ({ projectId, rooms, onClose, onSaved }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<SnagSeverity>('medium');
  const [roomId, setRoomId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [clientVisible, setClientVisible] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await siteService.createSnag({
        project_id: projectId,
        title: title.trim(),
        description: description.trim() || null,
        severity,
        room_id: roomId || null,
        due_date: dueDate || null,
        client_visible: clientVisible,
      }, photos);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to raise snag', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Raise a snag</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Scratch on the worktop" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Where exactly, and what needs doing" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Severity</Label>
              <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={severity} onChange={(e) => setSeverity(e.target.value as SnagSeverity)}>
                {SNAG_SEVERITIES.map((s) => <option key={s} value={s}>{humanizeLabel(s)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Room</Label>
              <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                <option value="">No room</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Due date</Label>
            <Input type="date" className="h-9" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><ImagePlus className="h-3 w-3" /> Photos</Label>
            <input type="file" accept="image/*" multiple
              className="text-xs"
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
            {photos.length > 0 && <p className="text-[11px] text-muted-foreground">{photos.length} selected</p>}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} />
            Show this to the client
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Raise snag'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

const SiteLogView: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const { toast } = useToast();
  const [logs, setLogs] = useState<ProjectSiteLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const photoUrls = useSignedPhotos(useMemo(() => logs.flatMap((l) => l.photo_paths ?? []), [logs]));

  const load = useCallback(async () => {
    try { setLoading(true); setLogs(await siteService.listSiteLogs(projectId)); }
    catch (err: any) { toast({ title: 'Failed to load site log', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (log: ProjectSiteLog) => {
    if (!confirm('Delete this site log entry?')) return;
    try { await siteService.deleteSiteLog(log.id); await load(); }
    catch (err: any) { toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' }); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CalendarDays className="h-4 w-4 text-primary" /> Site log
          </CardTitle>
          <p className="text-xs text-muted-foreground">Dated visit notes. Internal — never shown to the client.</p>
        </div>
        {isOwner && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus /> Add entry
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {logs.length === 0 ? (
          <HubEmptyState
            icon={CalendarDays}
            title="No site visits logged yet"
            description="A dated note per visit — what you found, what you agreed, what is blocking. Internal only; the client never sees this."
            action={isOwner ? <Button size="sm" onClick={() => setAdding(true)}><Plus /> Add entry</Button> : undefined}
          />
        ) : (
          <div className="divide-y divide-hairline">
            {logs.map((l) => (
              <div key={l.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{formatDate(`${l.log_date}T00:00:00Z`)}</p>
                      {l.weather && <span className="text-[11px] text-muted-foreground">· {l.weather}</span>}
                      {l.attendance && <span className="text-[11px] text-muted-foreground">· {l.attendance}</span>}
                    </div>
                    {l.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{l.notes}</p>}
                    {l.photo_paths.length > 0 && (
                      <PhotoStrip paths={l.photo_paths} urls={photoUrls} alt={(i) => `Site visit photo ${i + 1} — ${l.log_date}`} />
                    )}
                  </div>
                  {isOwner && (
                    <button type="button" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => remove(l)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {adding && (
        <AddSiteLogDialog
          projectId={projectId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); void load(); }}
        />
      )}
    </Card>
  );
};

const AddSiteLogDialog: React.FC<{ projectId: string; onClose: () => void; onSaved: () => void }> = ({
  projectId, onClose, onSaved,
}) => {
  const { toast } = useToast();
  const [logDate, setLogDate] = useState(() => todayLocalISO());
  const [notes, setNotes] = useState('');
  const [attendance, setAttendance] = useState('');
  const [weather, setWeather] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!notes.trim() && photos.length === 0) {
      toast({ title: 'Add a note or a photo', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await siteService.createSiteLog({
        project_id: projectId,
        log_date: logDate,
        notes: notes.trim() || null,
        attendance: attendance.trim() || null,
        weather: weather.trim() || null,
      }, photos);
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log a site visit</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" className="h-9" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <textarea
              className="min-h-24 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What was done, what was found, what was agreed"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Who attended</Label>
              <Input className="h-9" value={attendance} onChange={(e) => setAttendance(e.target.value)} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Weather</Label>
              <Input className="h-9" value={weather} onChange={(e) => setWeather(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1"><ImagePlus className="h-3 w-3" /> Photos</Label>
            <input type="file" accept="image/*" multiple className="text-xs"
              onChange={(e) => setPhotos(Array.from(e.target.files ?? []))} />
            {photos.length > 0 && <p className="text-[11px] text-muted-foreground">{photos.length} selected</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save entry'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SiteTab;
