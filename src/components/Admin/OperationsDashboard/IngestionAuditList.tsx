import React, { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { formatDate } from '@/utils/datetime';
import {
  canAcknowledge, examplesLine, findingsOf, findingsSummary, formatCoverage, pagesNeedingReview,
  statusLabel, statusTone, type AuditFinding, type IngestionAuditRow,
} from './ingestionAudit';

interface Props {
  rows: IngestionAuditRow[];
  filenames: Record<string, string>;
  acknowledgingId?: string | null;
  ackError?: string | null;
  onAcknowledge?: (row: IngestionAuditRow) => void;
  recheckingIds?: ReadonlySet<string>;
  onRecheck?: (row: IngestionAuditRow) => void;
  hiddenClean?: number;
  onShowClean?: () => void;
}

const SEVERITY: Record<AuditFinding['severity'], { label: string; variant: 'error' | 'warning' | 'neutral' }> = {
  fail: { label: 'Fail', variant: 'error' },
  warn: { label: 'Warn', variant: 'warning' },
  info: { label: 'Info', variant: 'neutral' },
};

export const IngestionAuditList: React.FC<Props> = ({
  rows, filenames, acknowledgingId, ackError, onAcknowledge, recheckingIds, onRecheck, hiddenClean = 0, onShowClean,
}) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (rows.length === 0) {
    return hiddenClean > 0 ? (
      <HubEmptyState
        variant="filtered"
        icon={ShieldCheck}
        title="Nothing needs attention"
        description={`All ${hiddenClean} audited document(s) passed or were marked clean.`}
        action={onShowClean ? <Button variant="outline" size="sm" onClick={onShowClean}>Show all documents</Button> : undefined}
      />
    ) : (
      <HubEmptyState
        variant="empty"
        icon={ShieldCheck}
        title="No ingestion audits yet"
        description="An audit appears here after a document has been processed."
      />
    );
  }
  return (
    <div>
      {ackError && <p role="alert" className="px-4 py-2 text-sm text-destructive">Could not mark clean: {ackError}</p>}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"><span className="sr-only">Details</span></TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Numbers</TableHead>
            <TableHead className="text-right">Codes</TableHead>
            <TableHead className="text-right">Pages to Review</TableHead>
            <TableHead className="text-right">Findings</TableHead>
            <TableHead className="hidden md:table-cell">Checked</TableHead>
            <TableHead><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const findings = findingsOf(row);
            const expanded = !!open[row.id];
            const review = pagesNeedingReview(row.metrics);
            const rechecking = recheckingIds?.has(row.document_id) ?? false;
            return (
              <Fragment key={row.id}>
                <TableRow>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      aria-label={expanded ? 'Hide findings' : 'Show findings'}
                      onClick={() => setOpen((o) => ({ ...o, [row.id]: !expanded }))}
                    >
                      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </TableCell>
                  <TableCell className="font-medium break-all">{filenames[row.document_id] ?? row.document_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    {row.acknowledged_at && row.status !== 'passed'
                      ? <Badge variant="success">Clean</Badge>
                      : <Badge variant={statusTone(row.status)}>{statusLabel(row.status)}</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCoverage(row.metrics?.number_coverage)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCoverage(row.metrics?.code_coverage)}</TableCell>
                  <TableCell className="text-right tabular-nums">{review ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{findingsSummary(row)}</TableCell>
                  <TableCell className="hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground">{formatDate(row.created_at, { withTime: true })}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {onRecheck && (
                        <Button variant="ghost" size="sm" disabled={rechecking} onClick={() => onRecheck(row)}>
                          {rechecking ? 'Checking…' : 'Re-check'}
                        </Button>
                      )}
                      {row.acknowledged_at ? (
                        row.status !== 'passed' && <span className="self-center text-xs text-muted-foreground">Marked clean {formatDate(row.acknowledged_at)}</span>
                      ) : canAcknowledge(row.status) && onAcknowledge ? (
                        <Button variant="outline" size="sm" disabled={acknowledgingId === row.id} onClick={() => onAcknowledge(row)}>
                          Mark clean
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                {expanded && (
                  <TableRow>
                    <TableCell />
                    <TableCell colSpan={8}>
                      {findings.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {row.status === 'passed'
                            ? 'No findings.'
                            : `This audit is ${statusLabel(row.status).toLowerCase()} and recorded no findings. That is not a clean result.`}
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {findings.map((f, i) => {
                            const sev = SEVERITY[f.severity] ?? SEVERITY.warn;
                            return (
                              <li key={`${f.code}-${i}`} className="text-sm">
                                <Badge variant={sev.variant}>{sev.label}</Badge>{' '}
                                <span>{f.message}</span>
                                {examplesLine(f) && <p className="mt-1 text-xs text-muted-foreground">e.g. {examplesLine(f)}</p>}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
