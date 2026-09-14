/**
 * What we hold by way of a declaration of performance, and what is missing (#430).
 *
 * The Greek translation of an Italian or Spanish manufacturer's declaration is OUR obligation once
 * we make the product available here, and we have to hold the original beside it (art. 16(4)).
 * Superseded versions are kept: a past sale was made against the version in force then.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, FileText, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  dopcService, dopcNeedsAttention, formatDeclaredValue, NO_PERFORMANCE_DECLARED,
  type DopcVerdict, type DopcDocument, type DeclaredPerformance,
} from '@/modules/finance/services/dopcService';

export const DopcPanel: React.FC<{
  productId: string;
  workspaceId: string | null | undefined;
  productTypeCode: string;
  /** Bumped by the parent after a save, so the status reflects what was stored. */
  refreshKey?: number;
}> = ({ productId, workspaceId, productTypeCode, refreshKey = 0 }) => {
  const [verdict, setVerdict] = useState<DopcVerdict | null>(null);
  const [docs, setDocs] = useState<DopcDocument[]>([]);
  const [perf, setPerf] = useState<DeclaredPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const v = await dopcService.statusFor(productId);
        if (cancelled) return;
        setVerdict(v); setFailed(false);
        if (workspaceId && productTypeCode) {
          const rows = await dopcService.listForType(workspaceId, productTypeCode);
          if (cancelled) return;
          setDocs(rows);
          const current = rows.find((d) => d.superseded_at == null) ?? rows[0];
          setPerf(current ? await dopcService.performances(current.id) : []);
        } else {
          setDocs([]); setPerf([]);
        }
      } catch {
        if (!cancelled) { setVerdict(null); setDocs([]); setPerf([]); setFailed(true); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId, workspaceId, productTypeCode, refreshKey]);

  if (loading) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking the declaration of performance…
      </p>
    );
  }

  if (failed) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] text-destructive">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        The declaration could not be checked just now. That is not a statement that one is held.
      </p>
    );
  }

  if (!verdict) return null;

  return (
    <div className="space-y-2">
      <div
        className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] ${
          dopcNeedsAttention(verdict)
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-hairline bg-surface-sunken'
        }`}
      >
        {dopcNeedsAttention(verdict)
          ? <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
          : <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" />}
        <span>{verdict.reason}</span>
      </div>

      {docs.length > 0 && (
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Language</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="tabular-nums">{d.version}</TableCell>
                  <TableCell>
                    {d.language_code.toUpperCase()}
                    {d.is_original && (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">original</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{d.issued_on ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={d.superseded_at ? 'neutral' : 'success'}>
                      {d.superseded_at ? 'Superseded' : 'In force'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {d.source_url
                      ? (
                        <a
                          href={d.source_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary underline"
                        >
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      )
                      : d.storage_object_path
                        ? <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> Stored</span>
                        : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {perf.length > 0 && (
        <div className="space-y-1">
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Essential characteristic</TableHead>
                  <TableHead>Declared performance</TableHead>
                  <TableHead>Harmonised specification</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.essential_characteristic}</TableCell>
                    <TableCell
                      className={
                        formatDeclaredValue(r.declared_value) === NO_PERFORMANCE_DECLARED
                          ? 'font-mono text-muted-foreground'
                          : 'tabular-nums'
                      }
                    >
                      {formatDeclaredValue(r.declared_value)}
                    </TableCell>
                    <TableCell>{r.harmonised_specification ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Annex V §9(b) requires the literal word {NO_PERFORMANCE_DECLARED} where no performance
            is declared. A blank, a dash or a zero is wrong on the face of the document.
          </p>
        </div>
      )}
    </div>
  );
};
