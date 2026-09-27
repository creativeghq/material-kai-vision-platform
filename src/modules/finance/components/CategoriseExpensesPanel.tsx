/**
 * Review surface for the categoriser: every row editable, nothing written until Apply, and an
 * unread supplier left undecided. A panel, because 246 rows is a table you read across.
 */
import React from 'react';
import { AlertTriangle, Check, Sparkles, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { financeService, type ExpenseCategorySuggestions } from '@/modules/finance/services/financeService';
import { EXPENSE_CATEGORY_CHART, expenseCategoryByName } from '@/modules/finance/expenseCategoryVocabulary';

interface Row {
  key: string;
  issuerKey: string;
  scopeDocType: string | null;
  issuerName: string | null;
  docs: number;
  net: number;
  /** Chart key, or null for a rule pointing at a category the chart does not contain. */
  categoryKey: string | null;
  categoryLabel: string;
  note: string;
  decidedBy: 'ai' | 'manual' | 'fiscal_code' | 'kad';
  confidence: number | null;
  rationale: string | null;
  lowConfidence: boolean;
  inForce: boolean;
}

interface RowState {
  /** Included in the Apply. Low-confidence proposals start off. */
  on: boolean;
  categoryKey: string | null;
  /** Set once the reviewer changes the category: the decision is then theirs, not the model's. */
  edited: boolean;
}

export const CategoriseExpensesPanel: React.FC<{
  workspaceId: string;
  onApplied?: () => void;
}> = ({ workspaceId, onApplied }) => {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [data, setData] = React.useState<ExpenseCategorySuggestions | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [state, setState] = React.useState<Record<string, RowState>>({});

  const rows: Row[] = React.useMemo(() => {
    if (!data) return [];
    const proposals = (data.proposals ?? []).map<Row>((p) => ({
      key: `${p.issuer_key}::${p.scope_doc_type ?? '*'}`,
      issuerKey: p.issuer_key,
      scopeDocType: p.scope_doc_type,
      issuerName: p.issuer_name,
      docs: p.docs,
      net: p.net,
      categoryKey: p.category_key,
      categoryLabel: p.category_name,
      note: p.decided_by === 'fiscal_code'
        ? 'the document type decides this'
        : p.decided_by === 'kad'
          ? 'their registered activity decides this'
          : p.low_confidence
            ? `low confidence (${Math.round(p.confidence * 100)}%) — check this one`
            : `${Math.round(p.confidence * 100)}% confident`,
      decidedBy: p.decided_by,
      confidence: p.confidence,
      rationale: p.rationale,
      lowConfidence: p.low_confidence,
      inForce: false,
    }));
    const decided = (data.decided ?? []).map<Row>((d) => ({
      key: `${d.issuer_key}::${d.scope_doc_type ?? '*'}`,
      issuerKey: d.issuer_key,
      scopeDocType: d.scope_doc_type,
      issuerName: d.issuer_name,
      docs: d.docs,
      net: d.net,
      categoryKey: expenseCategoryByName(d.category_name)?.key ?? null,
      categoryLabel: d.category_name,
      note: d.decided_by === 'fiscal_code' ? 'filed by document type'
        : d.decided_by === 'kad' ? 'filed by registered activity'
          : d.decided_by === 'manual' ? 'your decision' : 'filed by the classifier',
      decidedBy: d.decided_by,
      confidence: d.confidence,
      rationale: d.rationale,
      lowConfidence: false,
      inForce: true,
    }));
    return [...proposals, ...decided];
  }, [data]);

  // Never on mount: a visit to this tab must not fire a paid classification nobody asked for.
  const suggest = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeService.suggestExpenseCategories(workspaceId, 60);
      setData(res);
      const next: Record<string, RowState> = {};
      for (const p of res.proposals ?? []) {
        next[`${p.issuer_key}::${p.scope_doc_type ?? '*'}`] =
          { on: !p.low_confidence, categoryKey: p.category_key, edited: false };
      }
      for (const d of res.decided ?? []) {
        next[`${d.issuer_key}::${d.scope_doc_type ?? '*'}`] =
          { on: false, categoryKey: expenseCategoryByName(d.category_name)?.key ?? null, edited: false };
      }
      setState(next);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const selected = rows.filter((r) => state[r.key]?.on && state[r.key]?.categoryKey);

  const apply = async () => {
    if (selected.length === 0) return;
    setApplying(true);
    try {
      const res = await financeService.applyExpenseCategoryRules(
        workspaceId,
        selected.map((r) => {
          const st = state[r.key];
          return {
            issuer_key: r.issuerKey,
            scope_doc_type: r.scopeDocType,
            issuer_name: r.issuerName,
            category_key: st.categoryKey!,
            // Recording a hand correction as the model's verdict would misreport who decided.
            decided_by: st.edited ? 'manual' as const : r.decidedBy,
            confidence: st.edited ? null : r.confidence,
            rationale: st.edited ? null : r.rationale,
          };
        }),
      );
      toast({
        title: 'Categories applied',
        description: `${res.docs_recategorised.toLocaleString()} documents re-filed under `
          + `${res.rules_written} supplier rule${res.rules_written === 1 ? '' : 's'}`
          + `${res.categories_created > 0 ? `, ${res.categories_created} new` : ''}.`,
      });
      onApplied?.();
      await suggest();
    } catch (e) {
      toast({
        title: 'Could not apply the categories',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setApplying(false);
    }
  };

  const setRow = (key: string, patch: Partial<RowState>) =>
    setState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const selectedNet = selected.reduce((s, r) => s + r.net, 0);
  const selectedDocs = selected.reduce((s, r) => s + r.docs, 0);

  const renderRows = (list: Row[]) => list.map((r) => {
    const st = state[r.key];
    if (!st) return null;
    return (
      <tr key={r.key} className={st.on ? '' : 'opacity-60'}>
        <td className="px-3 py-2 align-top">
          <Checkbox
            checked={st.on}
            onCheckedChange={(v) => setRow(r.key, { on: v === true })}
            aria-label={`Include ${r.issuerName ?? r.issuerKey}`}
          />
        </td>
        <td className="max-w-[22rem] px-3 py-2 align-top">
          <p className="truncate font-medium" title={r.issuerName ?? undefined}>
            {r.issuerName ?? 'Unnamed supplier'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {r.scopeDocType && <Badge variant="neutral">{r.scopeDocType}</Badge>}
            <span className={r.lowConfidence ? 'text-amber-800 dark:text-amber-300' : undefined}>
              {r.note}
            </span>
          </p>
        </td>
        <td className="px-3 py-2 align-top">
          <Select
            value={st.categoryKey ?? ''}
            onValueChange={(v) => setRow(r.key, { categoryKey: v, edited: v !== r.categoryKey, on: true })}
          >
            <SelectTrigger className="h-8 w-[14rem]">
              <SelectValue placeholder={r.categoryLabel} />
            </SelectTrigger>
            <SelectContent>
              {EXPENSE_CATEGORY_CHART.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!st.categoryKey && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Filed under “{r.categoryLabel}”, which is not on the chart.
            </p>
          )}
        </td>
        <td className="px-3 py-2 align-top text-[11px] text-muted-foreground">
          {st.edited ? 'Your choice.' : r.rationale ?? '—'}
        </td>
        <td className="px-3 py-2 text-right align-top tabular-nums">{r.docs}</td>
        <td className="px-3 py-2 text-right align-top tabular-nums">{formatMoney(r.net, 'EUR')}</td>
      </tr>
    );
  });

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Categorise the inlet</CardTitle>
            <p className="pt-1 text-[11px] text-muted-foreground">
              One decision per supplier, not per document — and it sticks, so everything that
              arrives from them later is filed the same way without being asked again. Their
              registered ΚΑΔ decides it where we hold one; the trade name is read only where we
              do not.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {data && (
              <Button onClick={() => void apply()} disabled={applying || selected.length === 0}>
                <Check className="mr-2 h-3.5 w-3.5" />
                {applying ? 'Applying…' : `Apply ${selected.length || ''}`.trim()}
              </Button>
            )}
            <Button variant={data ? 'outline' : 'secondary'} size="sm" onClick={() => void suggest()} disabled={loading}>
              {data
                ? <><RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Re-run</>
                : <><Sparkles className="mr-2 h-3.5 w-3.5" /> Suggest categories</>}
            </Button>
          </div>
        </div>
      </CardHeader>

      {error && (
        <CardContent className="pt-4">
          <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        </CardContent>
      )}

      {loading && !data && (
        <CardContent className="pt-4">
          <p className="py-6 text-center text-sm text-muted-foreground">
            Reading the suppliers and proposing a category for each…
          </p>
        </CardContent>
      )}

      {!data && !loading && !error && (
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Received documents arrive under the inlet they came through, which says nothing about
            what the money bought. This proposes a category per supplier and shows you each one
            with its reason before anything is written.
          </p>
        </CardContent>
      )}

      {data && (
        <CardContent className="space-y-4 pt-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-b border-hairline pb-3">
            <div>
              <p className="text-[11px] text-muted-foreground">Waiting on a category</p>
              <p className="text-sm font-semibold tabular-nums">
                {data.pending_issuers.toLocaleString()} suppliers ·{' '}
                {data.pending_docs.toLocaleString()} documents
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Value in the inlet</p>
              <p className="text-sm font-semibold tabular-nums">{formatMoney(data.pending_net, 'EUR')}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">With a registered ΚΑΔ</p>
              <p className="text-sm font-semibold tabular-nums">
                {data.pending_with_kad.toLocaleString()} of {data.pending_issuers.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Already decided</p>
              <p className="text-sm font-semibold tabular-nums">
                {data.decided_issuers.toLocaleString()} suppliers
              </p>
            </div>
            {selected.length > 0 && (
              <div className="border-l border-hairline pl-8">
                <p className="text-[11px] text-muted-foreground">Selected</p>
                <p className="text-sm font-semibold tabular-nums">
                  {selectedDocs.toLocaleString()} documents · {formatMoney(selectedNet, 'EUR')}
                </p>
              </div>
            )}
          </div>

          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                  <th className="w-8 px-3 py-2"><span className="sr-only">Include</span></th>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Why</th>
                  <th className="px-3 py-2 text-right">Docs</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {renderRows(rows.filter((r) => !r.inForce))}
                {(data.decided ?? []).length > 0 && (
                  <tr className="bg-surface-sunken">
                    <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                      Already in force — change one to correct it, including the documents it filed
                    </td>
                  </tr>
                )}
                {renderRows(rows.filter((r) => r.inForce))}
              </tbody>
            </table>
          </div>

          {data.unresolved.length > 0 && (
            <p className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {data.unresolved.length} supplier{data.unresolved.length === 1 ? '' : 's'} came back
              with no verdict and {data.unresolved.length === 1 ? 'is' : 'are'} left undecided
              rather than filed somewhere plausible:{' '}
              {data.unresolved.slice(0, 5).map((u) => u.issuer_name ?? u.issuer_key).join(', ')}
              {data.unresolved.length > 5 ? ' …' : ''}
            </p>
          )}

          {rows.length === 0 && !loading && (
            <p className="py-4 text-sm text-muted-foreground">
              Nothing is waiting on a category.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
};
