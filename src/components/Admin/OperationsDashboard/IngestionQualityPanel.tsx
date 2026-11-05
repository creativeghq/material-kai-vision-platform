import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { IngestionAuditList } from './IngestionAuditList';
import type { IngestionAuditRow } from './ingestionAudit';

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

export const IngestionQualityPanel: React.FC = () => {
  const [rows, setRows] = useState<IngestionAuditRow[]>([]);
  const [filenames, setFilenames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ackError, setAckError] = useState<string | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await db.from('ingestion_audit_latest').select('*').order('created_at', { ascending: false });
    if (res.error) {
      setLoadError(res.error.message);
      setLoading(false);
      return;
    }
    setLoadError(null);
    const list = (res.data ?? []) as IngestionAuditRow[];
    setRows(list);
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

  const acknowledge = useCallback(async (row: IngestionAuditRow) => {
    setAcknowledgingId(row.id);
    setAckError(null);
    const { data: auth } = await supabase.auth.getUser();
    const res = await db.from('ingestion_audits')
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: auth.user?.id ?? null })
      .eq('id', row.id);
    setAcknowledgingId(null);
    if (res.error) {
      setAckError(res.error.message);
      return;
    }
    await load();
  }, [load]);

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle>Ingestion Quality</CardTitle>
        <CardDescription>Latest audit of every processed document: what the PDF or page says versus what the platform stored</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : loadError ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not read ingestion audits ({loadError}). This is not a statement that nothing is wrong.
          </p>
        ) : (
          <IngestionAuditList rows={rows} filenames={filenames} acknowledgingId={acknowledgingId} ackError={ackError} onAcknowledge={acknowledge} />
        )}
      </CardContent>
    </Card>
  );
};
