import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { formatDate } from '@/utils/datetime';
import { financeService, type FinanceFinding } from '@/modules/finance/services/financeService';

/** The operator's /admin view is cross-workspace; this is one workspace's own finance findings. */
export const FinanceHealthStrip: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const [rows, setRows] = React.useState<FinanceFinding[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!workspaceId) return;
    let live = true;
    financeService.integrityFindings(workspaceId)
      .then((r) => { if (live) { setRows(r); setFailed(false); } })
      .catch(() => { if (live) { setRows(null); setFailed(true); } });
    return () => { live = false; };
  }, [workspaceId]);

  if (failed) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          The nightly finance checks could not be read. That is not a statement that they passed.
        </CardContent>
      </Card>
    );
  }

  // Nothing to say is said once, quietly — a clean night is worth seeing, an empty card is not.
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-success" />
        The nightly finance checks found nothing to look at.
      </p>
    );
  }

  return (
    <Card className="border-amber-500/40">
      <CardContent className="space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {rows.length === 1 ? 'One thing needs a look' : `${rows.length} things need a look`}
        </p>
        <ul className="space-y-2">
          {rows.map((f) => (
            <li key={`${f.check_key}-${f.entity_id}`} className="text-xs">
              <span className="font-medium">{f.title}</span>
              {f.severity === 'critical' && (
                <span className="ml-2 rounded-sm bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                  critical
                </span>
              )}
              <span className="ml-2 text-muted-foreground">
                since {formatDate(f.first_seen_at)}
              </span>
              {typeof f.detail?.hint === 'string' && (
                <p className="mt-0.5 text-muted-foreground">{f.detail.hint}</p>
              )}
              {typeof f.detail?.why === 'string' && (
                <p className="mt-0.5 text-muted-foreground">{f.detail.why}</p>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
