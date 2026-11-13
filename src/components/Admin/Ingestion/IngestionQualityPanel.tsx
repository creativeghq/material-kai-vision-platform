import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Skeleton } from '@/components/core/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';
import { IngestionAuditList } from './IngestionAuditList';
import { canAcknowledge, needsAttention, type IngestionAuditRow } from './ingestionAudit';

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}
interface Query extends PromiseLike<QueryResult> {
  select: (cols: string) => Query;
  order: (col: string, o: { ascending: boolean }) => Query;
  in: (col: string, ids: string[]) => Query;
  update: (v: Record<string, unknown>) => Query;
  eq: (col: string, v: string) => Query;
}
const db = supabase as unknown as { from: (t: string) => Query };

const POLL_MS = 15_000;
const POLL_FOR_MS = 6 * 60_000;

export const IngestionQualityPanel: React.FC = () => {
  const [rows, setRows] = useState<IngestionAuditRow[]>([]);
  const [filenames, setFilenames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [rechecking, setRechecking] = useState<Map<string, string>>(new Map());
  const [recheckError, setRecheckError] = useState<string | null>(null);
  const pollUntil = useRef(0);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    const res = await db.from('ingestion_audit_latest').select('*').order('created_at', { ascending: false });
    if (res.error) {
      setLoadError(res.error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    const list = (res.data ?? []) as IngestionAuditRow[];
    setRows(list);
    setRechecking((prev) => {
      if (prev.size === 0) return prev;
      const next = new Map(prev);
      for (const r of list) if (next.has(r.document_id) && r.created_at > (next.get(r.document_id) ?? '')) next.delete(r.document_id);
      return next;
    });
    const ids = Array.from(new Set(list.map((r) => r.document_id)));
    if (ids.length > 0) {
      const docs = await db.from('documents').select('id, filename').in('id', ids);
      const map: Record<string, string> = {};
      for (const d of (docs.data ?? []) as Array<{ id: string; filename: string | null }>) {
        if (d.filename) map[d.id] = d.filename;
      }
      setFilenames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (rechecking.size === 0) return;
    const t = setInterval(() => {
      if (Date.now() > pollUntil.current) {
        setRechecking(new Map());
        return;
      }
      void load(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [rechecking.size, load]);

  const markClean = useCallback(async (targets: IngestionAuditRow[]) => {
    if (targets.length === 0) return;
    setAcknowledgingId(targets.length === 1 ? targets[0].id : 'all');
    setAckError(null);
    const { data: auth } = await supabase.auth.getUser();
    const res = await db.from('ingestion_audits')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
      .in('id', targets.map((r) => r.id));
    setAcknowledgingId(null);
    if (res.error) {
      setAckError(res.error.message);
      return;
    }
    await load(true);
  }, [load]);

  const recheck = useCallback(async (targets: IngestionAuditRow[] | null) => {
    setRecheckError(null);
    const subject = targets ?? rows;
    try {
      const res = await mivaaApi.request('/api/admin/ingestion-audits/recheck', {
        method: 'POST',
        body: JSON.stringify({ document_ids: targets ? targets.map((r) => r.document_id) : null }),
      });
      if (!res.success) throw new Error(res.error || 'The re-check could not be started');
    } catch (e) {
      setRecheckError(e instanceof Error ? e.message : String(e));
      return;
    }
    pollUntil.current = Date.now() + POLL_FOR_MS;
    setRechecking((prev) => {
      const next = new Map(prev);
      for (const r of subject) next.set(r.document_id, r.created_at);
      return next;
    });
  }, [rows]);

  const open = useMemo(() => rows.filter(needsAttention), [rows]);
  const visible = showAll ? rows : open;
  const cleanable = useMemo(() => open.filter((r) => canAcknowledge(r.status)), [open]);
  const busy = rechecking.size > 0;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Ingestion Quality</CardTitle>
          <CardDescription>
            Latest audit of every processed document: what the PDF or page says versus what the platform stored.
            {!loading && !loadError && ` ${open.length} need attention, ${rows.length - open.length} passed or marked clean.`}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)} disabled={loading || rows.length === 0}>
            {showAll ? 'Hide passed and clean' : 'Show all documents'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void recheck(null)} disabled={loading || busy || rows.length === 0}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {busy ? `Re-checking ${rechecking.size}…` : 'Re-check all'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setConfirmAll(true)} disabled={loading || cleanable.length === 0 || acknowledgingId !== null}>
            Mark all clean ({cleanable.length})
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {recheckError && <p role="alert" className="px-4 py-2 text-sm text-destructive">Could not start the re-check: {recheckError}</p>}
        {busy && (
          <p className="px-4 pb-2 text-xs text-muted-foreground">
            Re-checking against what is stored now. Each document updates here when its audit finishes (a large catalogue takes a few minutes).
          </p>
        )}
        {loading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : loadError ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not read ingestion audits ({loadError}). This is not a statement that nothing is wrong.
          </p>
        ) : (
          <IngestionAuditList
            rows={visible}
            filenames={filenames}
            acknowledgingId={acknowledgingId}
            ackError={ackError}
            onAcknowledge={(row) => void markClean([row])}
            recheckingIds={new Set(rechecking.keys())}
            onRecheck={(row) => void recheck([row])}
            hiddenClean={showAll ? 0 : rows.length - open.length}
            onShowClean={() => setShowAll(true)}
          />
        )}
      </CardContent>
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {cleanable.length} document(s) clean?</AlertDialogTitle>
            <AlertDialogDescription>
              Their current findings are recorded as reviewed and leave this list. A later re-check brings a document back
              only if it finds something new or more of the same.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void markClean(cleanable)}>Mark clean</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
