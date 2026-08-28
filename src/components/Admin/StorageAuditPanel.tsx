import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Loader2, RefreshCw, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatNumber } from '@/utils/decimal';

type OrphanRow = {
  bucket: string;
  total_objects: number;
  total_bytes: number;
  orphan_objects: number;
  orphan_bytes: number;
  oldest_orphan_at: string | null;
};

type CleanupRunStat = {
  bucket: string;
  scanned: number;
  deleted: number;
  bytes_freed: number;
  error?: string;
};

type CleanupResponse = {
  success: boolean;
  stats?: {
    buckets: CleanupRunStat[];
    total_deleted: number;
    total_bytes_freed: number;
    duration_ms: number;
    dry_run: boolean;
  };
  error?: string;
};

const fmtBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const fmtAge = (iso: string | null): string => {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (isNaN(t)) return '—';
  const days = Math.floor((Date.now() - t) / (24 * 3600 * 1000));
  if (days <= 0) return '<1d';
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
};

export function StorageAuditPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<OrphanRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<CleanupResponse['stats'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('storage_orphan_summary');
      if (error) throw error;
      setRows((data ?? []) as OrphanRow[]);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const invokeCleanup = async (dryRun: boolean) => {
    setRunning(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke(
        'storage-orphan-cleanup-cron',
        {
          body: { dry_run: dryRun, source: 'admin' },
        },
      );
      if (error) throw await edgeError(error);
      const resp = data as CleanupResponse | null;
      if (!resp?.success) throw new Error(resp?.error ?? 'Cleanup failed');
      setLastRun(resp.stats ?? null);
      toast({
        title: dryRun ? 'Dry-run complete' : 'Cleanup complete',
        description: dryRun
          ? `Would delete ${resp.stats?.total_deleted ?? 0} objects, freeing ${fmtBytes(resp.stats?.total_bytes_freed ?? 0)}`
          : `Deleted ${resp.stats?.total_deleted ?? 0} objects, freed ${fmtBytes(resp.stats?.total_bytes_freed ?? 0)}`,
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      toast({
        title: 'Cleanup failed',
        description: e?.message ?? String(e),
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const totalOrphans = rows?.reduce((a, r) => a + Number(r.orphan_objects ?? 0), 0) ?? 0;
  const totalOrphanBytes = rows?.reduce((a, r) => a + Number(r.orphan_bytes ?? 0), 0) ?? 0;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            Storage Audit
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading || running}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => invokeCleanup(true)}
              disabled={loading || running}
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Dry run
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (!window.confirm(`Delete ${totalOrphans} orphan objects (${fmtBytes(totalOrphanBytes)})?`)) return;
                void invokeCleanup(false);
              }}
              disabled={loading || running || totalOrphans === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Run cleanup
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <div className="px-4 py-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}

        {rows && rows.length > 0 ? (
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground border-b">
              <tr>
                <th className="px-4 py-2">Bucket</th>
                <th className="px-4 py-2 text-right">Objects</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Orphans</th>
                <th className="px-4 py-2 text-right">Orphan size</th>
                <th className="px-4 py-2 text-right">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const orphanPct = r.total_objects
                  ? Math.round((Number(r.orphan_objects) / Number(r.total_objects)) * 100)
                  : 0;
                return (
                  <tr key={r.bucket} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-medium">{r.bucket}</td>
                    <td className="px-4 py-2 text-right">{formatNumber(Number(r.total_objects))}</td>
                    <td className="px-4 py-2 text-right">{fmtBytes(Number(r.total_bytes))}</td>
                    <td className="px-4 py-2 text-right">
                      {formatNumber(Number(r.orphan_objects))}
                      {orphanPct > 0 && (
                        <span className={`ml-2 text-xs ${orphanPct > 50 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {orphanPct}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{fmtBytes(Number(r.orphan_bytes))}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmtAge(r.oldest_orphan_at)}</td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">
                  {formatNumber((rows.reduce((a, r) => a + Number(r.total_objects), 0)))}
                </td>
                <td className="px-4 py-3 text-right">
                  {fmtBytes(rows.reduce((a, r) => a + Number(r.total_bytes), 0))}
                </td>
                <td className="px-4 py-3 text-right">{formatNumber(totalOrphans)}</td>
                <td className="px-4 py-3 text-right">{fmtBytes(totalOrphanBytes)}</td>
                <td className="px-4 py-3" />
              </tr>
            </tbody>
          </table>
          </div>
        ) : !loading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> No orphans detected.
          </div>
        ) : null}

        {lastRun && (
          <div className="px-4 py-3 border-t text-xs text-muted-foreground">
            Last run: {lastRun.dry_run ? 'dry-run' : 'cleanup'} —{' '}
            {lastRun.total_deleted} deleted, {fmtBytes(lastRun.total_bytes_freed)} freed in{' '}
            {(lastRun.duration_ms / 1000).toFixed(1)}s.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
