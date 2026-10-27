import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  ATTEMPT_LABEL, RUN_BATCH, describeReport, fetchEnrichmentReport, runEnrichment,
  type EnrichmentReport, type EnrichmentRunResult,
} from '@/services/productEnrichmentService';

interface Props {
  workspaceId: string;
  documentId: string | null;
  onClose: () => void;
  onFinished: () => void;
}

const nameOf = (report: EnrichmentReport, id: string) =>
  report.products.find((p) => p.product_id === id)?.name ?? id;

export const EnrichCatalogueDialog: React.FC<Props> = ({ workspaceId, documentId, onClose, onFinished }) => {
  const [report, setReport] = useState<EnrichmentReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<EnrichmentRunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const stop = useRef(false);

  const targets = (report?.products ?? [])
    .filter((p) => p.verdict === 'gaps_with_source' || p.open_attempt !== null)
    .map((p) => p.product_id);
  const handled = new Set(results.filter((r) => r.status !== 'failed' && r.status !== 'in_progress').map((r) => r.product_id));
  const pending = targets.filter((id) => !handled.has(id));

  useEffect(() => {
    setReport(null);
    setError(null);
    setResults([]);
    setDone(0);
    if (!documentId) return;
    let cancelled = false;
    fetchEnrichmentReport(workspaceId, documentId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'The gap report failed'); });
    return () => { cancelled = true; };
  }, [workspaceId, documentId]);

  const run = useCallback(async () => {
    stop.current = false;
    setRunning(true);
    setError(null);
    try {
      for (let i = 0; i < pending.length && !stop.current; i += RUN_BATCH) {
        const batch = pending.slice(i, i + RUN_BATCH);
        const out = await runEnrichment(workspaceId, batch);
        setResults((prev) => [...prev.filter((r) => !batch.includes(r.product_id)), ...out]);
        setDone((n) => n + out.filter((r) => r.status !== 'failed' && r.status !== 'in_progress').length);
        if (out.some((r) => r.status === 'failed' && /credit/i.test(r.reason ?? ''))) break;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment stopped');
    } finally {
      setRunning(false);
      onFinished();
    }
  }, [pending, workspaceId, onFinished]);

  const close = () => { stop.current = true; onClose(); };

  return (
    <Dialog open={documentId !== null} onOpenChange={(open) => { if (!open && !running) close(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Fill empty fields from the web</DialogTitle>
          <DialogDescription>
            Reads only a page we already hold for each product (its own link, else its brand's site) and writes
            only fields that are still empty. Nothing is published.
          </DialogDescription>
        </DialogHeader>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!report && !error && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the catalogue…
          </div>
        )}
        {report && (
          <div className="space-y-3 text-sm">
            <p>{describeReport(report)}</p>
            {targets.length > 0 && results.length === 0 && (
              <p className="text-muted-foreground">
                {report.estimate.products_to_read} product(s) will be read. Estimated cost: up to {report.estimate.credits_ceiling} credits
                (a page read and one extraction each; unused credits are refunded).
                {targets.length - report.estimate.products_to_read > 0
                  ? ` ${targets.length - report.estimate.products_to_read} unfinished product(s) are completed at no charge.`
                  : ''}
              </p>
            )}
            {targets.length === 0 && results.length === 0 && (
              <p className="text-muted-foreground">Nothing here can be filled from a page we hold.</p>
            )}
            {running && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {done} of {targets.length} read…
              </p>
            )}
            {results.length > 0 && (
              <ul className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-sm border border-hairline">
                {results.map((r) => {
                  const tone = ATTEMPT_LABEL[r.status] ?? { label: r.status, tone: 'neutral' as const };
                  return (
                    <li key={r.product_id} className="flex items-start justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{nameOf(report, r.product_id)}</div>
                        {r.reason && <div className="text-xs text-muted-foreground">{r.reason}</div>}
                      </div>
                      <Badge variant={tone.tone}>
                        {tone.label}{r.status === 'done' && r.fields ? ` · ${r.fields}` : ''}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={running}>Close</Button>
          {report && pending.length > 0 && (
            <Button onClick={() => { void run(); }} disabled={running}>
              {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {results.length > 0 ? `Continue (${pending.length} left)` : `Enrich ${targets.length} product(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
