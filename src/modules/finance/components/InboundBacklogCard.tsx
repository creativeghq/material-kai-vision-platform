/**
 * File the myDATA inbox by SUPPLIER, because that is the unit of the decision.
 *
 * 1,866 documents arrived from myDATA and every one sits in the generic myAADE bucket that
 * `finance-inbound-sync` stamps on arrival. Nothing is broken — retrieval works, the documents
 * are all there — but filing them one at a time is 1,866 decisions and so none were made.
 *
 * Grouped by issuer it is 241 decisions, and the 45 largest suppliers carry 1,324 of the
 * documents: 71% of the pile. A supplier's invoices almost always belong in one category, so
 * this is the queue that actually clears, ordered by how much of the backlog each row removes.
 *
 * Filing a supplier once is permanent. `remember_inbound_issuer_category` records the choice and
 * `finance-inbound-sync` applies it to everything that arrives afterwards — so a row that shows
 * a learned category will never come back. That loop was built long ago and had never been given
 * a first example to learn from, which is why it had no rows.
 *
 * Renders nothing when the backlog is empty: an operator with a clear inbox should not be shown
 * a panel about clearing it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Inbox, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { inboundService, type IssuerBacklogRow } from '@/modules/finance/services/inboundService';

interface CategoryOption { id: string; name: string; kind?: string | null; is_system?: boolean | null }

export const InboundBacklogCard: React.FC<{
  workspaceId: string;
  categories: CategoryOption[];
  /** Called after a successful file so the host can refresh its own document list. */
  onFiled?: () => void;
}> = ({ workspaceId, categories, onFiled }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<IssuerBacklogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // A system category is not a filing destination — the RPC refuses it, because filing into the
  // bucket the documents are already in would move them and teach nothing.
  const fileable = categories.filter((c) => !c.is_system && (c.kind ?? 'expense') === 'expense');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRows(await inboundService.backlogByIssuer(workspaceId));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const file = async (row: IssuerBacklogRow) => {
    const categoryId = choice[row.issuer_vat] ?? row.learned_category_id ?? '';
    if (!categoryId) return;
    setBusy(row.issuer_vat);
    try {
      const moved = await inboundService.fileIssuer(workspaceId, row.issuer_vat, categoryId);
      toast({
        title: `Filed ${moved} document${moved === 1 ? '' : 's'}`,
        description: `Future invoices from ${row.issuer_name || row.issuer_vat} will file here automatically.`,
      });
      await load();
      onFiled?.();
    } catch (e) {
      toast({
        title: 'Could not file these documents',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading the inbox…
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) return null;

  const totalDocs = rows.reduce((n, r) => n + r.docs, 0);

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          {totalDocs} document{totalDocs === 1 ? '' : 's'} to file, from {rows.length} supplier{rows.length === 1 ? '' : 's'}
        </CardTitle>
        <p className="pt-1 text-[11px] text-muted-foreground">
          Ordered by how much of the pile each supplier clears. Filing one is permanent — the next
          invoice from that supplier files itself.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-sunken">
                <th className="px-5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Supplier</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Docs</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Net</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Span</th>
                <th className="px-5 py-2 text-left text-[11px] font-semibold text-muted-foreground">File as</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const selected = choice[r.issuer_vat] ?? r.learned_category_id ?? '';
                return (
                  <tr key={r.issuer_vat} className="border-b border-hairline last:border-b-0">
                    <td className="max-w-[22rem] px-5 py-2 text-sm">
                      <span className="block truncate font-medium">{r.issuer_name || '—'}</span>
                      <span className="text-xs text-muted-foreground">{r.issuer_vat}</span>
                      {r.learned_category_name && (
                        <Badge variant="success" className="ml-0 mt-1">
                          <Check className="mr-1 h-3 w-3" />
                          {r.learned_category_name}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">{r.docs}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">
                      {r.total_net === null ? '—' : formatMoney(Number(r.total_net), r.currency || 'EUR')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {r.first_issue_date ? formatDate(r.first_issue_date) : '—'}
                      {r.last_issue_date && r.last_issue_date !== r.first_issue_date
                        ? ` → ${formatDate(r.last_issue_date)}` : ''}
                    </td>
                    <td className="px-5 py-2">
                      <div className="flex items-center gap-2">
                        <Select
                          value={selected}
                          onValueChange={(v) => setChoice((c) => ({ ...c, [r.issuer_vat]: v }))}
                        >
                          <SelectTrigger className="h-8 w-44 text-xs">
                            <SelectValue placeholder="Choose a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {fileable.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!selected || busy === r.issuer_vat}
                          onClick={() => void file(r)}
                        >
                          {busy === r.issuer_vat
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : `File ${r.docs}`}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};
