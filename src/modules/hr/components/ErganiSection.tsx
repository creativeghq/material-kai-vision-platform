import { useCallback, useEffect, useState } from 'react';
import { FileText, Loader2, RefreshCw, Download, Plug, Send, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type ErganiCredsStatus, type ErganiSubmission, type ErganiSubmissionType } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate } from '@/utils/datetime';

const statusBadge = (s: string) =>
  s === 'submitted' ? <span className="text-sm text-emerald-600 dark:text-emerald-400">Submitted</span>
  : s === 'failed' ? <span className="text-sm text-red-500 dark:text-red-400">Failed</span>
  : <span className="text-sm text-muted-foreground">Cancelled</span>;

/** Ergani "dd/mm/yyyy hh:mm" (or the row's created_at) → yyyymmdd for the PDF fetch. */
function toYyyymmdd(submitDate: string | null, createdAt: string): string {
  const m = submitDate && /^(\d{2})\/(\d{2})\/(\d{4})/.exec(submitDate);
  if (m) return `${m[3]}${m[2]}${m[1]}`;
  return createdAt.slice(0, 10).replace(/-/g, '');
}

export function ErganiSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ErganiCredsStatus | null>(null);
  const [subs, setSubs] = useState<ErganiSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [st, log] = await Promise.all([
        hrService.getErganiStatus(workspaceId).catch(() => null),
        // 500 is the server-side ceiling — take the whole window so the pager isn't walking a
        // pre-truncated slice.
        hrService.erganiSubmissionsLog(workspaceId, { limit: 500 }).catch(() => ({ submissions: [] as ErganiSubmission[] })),
      ]);
      setStatus(st); setSubs(log.submissions);
      setPage((p) => clampPage(p, log.submissions.length));
    } catch (e) { toast({ title: 'Failed to load Ergani data', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const testConnection = async () => {
    if (!workspaceId) return; setTesting(true);
    try {
      const { info } = await hrService.erganiEmployerInfo(workspaceId);
      const emp = (info as any)?.EX_BASE_01?.Ergodotis;
      toast({ title: 'Ergani connection OK', description: emp ? `${emp.Eponimia ?? ''} · VAT ${emp.Afm ?? ''}` : 'Authenticated successfully.' });
    } catch (e) { toast({ title: 'Ergani connection failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setTesting(false); }
  };

  const retry = async (id: string) => {
    if (!workspaceId) return; setBusyId(id);
    try { const r = await hrService.erganiRetry(workspaceId, id); toast({ title: 'Re-submitted', description: `Protocol ${r.result.protocol}` }); load(); }
    catch (e) { toast({ title: 'Retry failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const downloadPdf = async (s: ErganiSubmission) => {
    if (!workspaceId || !s.protocol) return; setBusyId(s.id);
    try {
      const { pdf_base64 } = await hrService.erganiDownloadPdf(workspaceId, {
        code: s.submission_type, protocol: s.protocol, submitted_date: toYyyymmdd(s.submit_date, s.created_at),
      });
      if (!pdf_base64) throw new Error('Ergani returned no document');
      const bytes = Uint8Array.from(atob(pdf_base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast({ title: 'Could not fetch PDF', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  const configured = !!status?.has_password && !!status?.enabled;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Ergani"
        subtitle="Ministry of Labour filings — work card, leaves, hires, schedules"
        actions={canManage && configured ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={testConnection} disabled={testing}>
              {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}Test connection
            </Button>
            <NewSubmissionDialog workspaceId={workspaceId!} onDone={load} />
          </div>
        ) : undefined}
      />

      {!configured ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Ergani is not configured for this workspace.</p>
              <p className="text-muted-foreground mt-1">
                Add your Ergani Web API credentials in <Link to="/profile?tab=keys" className="text-primary underline">Profile → Keys</Link> to file work-card punches, leaves, hires and schedules.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            <div className="text-sm flex-1">
              Connected · <span className="font-mono">{status?.username}</span> · employer VAT <span className="font-mono">{status?.employer_afm || '—'}</span>
              <Badge variant={status?.environment === 'production' ? 'default' : 'secondary'} className="ml-2">{status?.environment === 'production' ? 'Production' : 'Trial'}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between px-5 py-3 border-b border-border/60">
          <CardTitle>Submission History</CardTitle>
          <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="p-0">
          {subs.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No submissions yet"
              hint="Filings appear here with the protocol number Ergani returns — that number is the proof the filing landed."
              action={canManage && configured && workspaceId
                ? <NewSubmissionDialog workspaceId={workspaceId} onDone={load} />
                : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Entity</TableHead><TableHead>Status</TableHead>
                <TableHead>Protocol</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paginate(subs, page).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.submission_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.entity_type ?? '—'}</TableCell>
                    <TableCell>{statusBadge(s.status)}{s.status === 'failed' && s.error && <span className="block text-xs text-destructive mt-1 max-w-[240px] truncate" title={s.error}>{s.error}</span>}</TableCell>
                    <TableCell className="font-mono text-xs">{s.protocol ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.submit_date ?? formatDate(s.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {s.status === 'submitted' && s.protocol && (
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => downloadPdf(s)} title="Download PDF">
                            {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          </Button>
                        )}
                        {canManage && s.status === 'failed' && (
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => retry(s.id)} title="Retry">
                            {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={subs.length} onPageChange={setPage} label="submissions" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Advanced submission: file any Ergani document type (E3 hire, weekly/daily schedule, etc.) from
 * Ergani's OWN live schema template. We fetch the template, let the operator fill the values, and
 * POST it — no fabricated field names.
 */
function NewSubmissionDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<ErganiSubmissionType[]>([]);
  const [code, setCode] = useState('');
  const [doc, setDoc] = useState('');
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    hrService.erganiSubmissionTypes(workspaceId)
      .then((r) => setTypes(r.submission_types))
      .catch((e) => toast({ title: 'Could not load submission types', description: (e as Error).message, variant: 'destructive' }));
  }, [open, workspaceId, toast]);

  const loadSchema = async () => {
    if (!code) return; setLoadingSchema(true);
    try { const { schema } = await hrService.erganiDocumentSchema(workspaceId, code); setDoc(JSON.stringify(schema, null, 2)); }
    catch (e) { toast({ title: 'Could not load schema', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoadingSchema(false); }
  };

  const submit = async () => {
    let parsed: unknown;
    try { parsed = JSON.parse(doc); } catch { toast({ title: 'Invalid JSON', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const r = await hrService.erganiSubmit(workspaceId, { code, document: parsed });
      toast({ title: 'Submitted to Ergani', description: `Protocol ${r.result.protocol}` });
      setOpen(false); setDoc(''); setCode(''); onDone();
    } catch (e) { toast({ title: 'Submission failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Send className="h-4 w-4 mr-2" />New submission</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Ergani Submission</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Pick a document type, load Ergani's live schema, fill in the values, and submit. Use this for E3 hire
            announcements and work-time schedules (leaves are filed from Time Off; work-card punches from Attendance).
          </p>
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Document type</Label>
              <Select value={code} onValueChange={setCode}>
                <SelectTrigger><SelectValue placeholder="Select an Ergani submission type" /></SelectTrigger>
                <SelectContent>{types.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} · {t.description}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" className="rounded-full" onClick={loadSchema} disabled={!code || loadingSchema}>
              {loadingSchema ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Load schema
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Document (JSON)</Label>
            <Textarea value={doc} onChange={(e) => setDoc(e.target.value)} rows={14} className="font-mono text-xs" placeholder="Load the schema, then fill in the values…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={submitting || !doc.trim() || !code}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
