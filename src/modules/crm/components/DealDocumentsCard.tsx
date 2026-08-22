/**
 * What a deal actually turned into (#378 C3).
 *
 * `crm_deals` linked to a project and a property; nothing linked a document to a DEAL. So the
 * pipeline's weighted forecast and the invoiced revenue were two unrelated numbers — forecast
 * accuracy could not be measured, "what did this deal become" had no answer, and a won deal had to
 * be re-typed as a quote.
 *
 * The list is DERIVED by `get_deal_documents`; this formats it and does not assemble its own
 * answer from three queries. Attaching is offered for documents that already exist and belong to
 * the same party — this panel deliberately CREATES nothing: raising a quote is a decision with its
 * own form, its own pricing and its own numbering, and a "New quote" button here would be a fourth
 * way to make one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Link2, Link2Off, Package, Receipt, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { dealsService } from '@/services/dealsService';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { statusTone } from '@/utils/statusTone';
import { HubEmptyState } from '@/components/core/hub';

type DocKind = 'quote' | 'order' | 'invoice';

interface DealDoc {
  kind: DocKind;
  id: string;
  number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  occurred_at: string;
}

const KIND_ICON: Record<DocKind, React.ComponentType<{ className?: string }>> = {
  quote: FileText, order: Package, invoice: Receipt,
};
const KIND_LABEL: Record<DocKind, string> = { quote: 'Quote', order: 'Order', invoice: 'Invoice' };

/** Where a document lives. Quotes are a CRM-adjacent surface; the other two are Finance. */
function docHref(d: DealDoc): string {
  if (d.kind === 'quote') return `/quotes/${d.id}`;
  if (d.kind === 'order') return `${FINANCE_BASE}/orders/${d.id}`;
  return `${FINANCE_BASE}/invoices/${d.id}`;
}

export const DealDocumentsCard: React.FC<{
  dealId: string;
  workspaceId: string | null;
  companyId: string | null;
  contactId: string | null;
  canEdit?: boolean;
}> = ({ dealId, workspaceId, companyId, contactId, canEdit = true }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<DealDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<DealDoc[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setRows(await dealsService.documents(dealId) as DealDoc[]); }
    catch (err: any) { toast({ title: 'Failed to load the deal documents', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [dealId, toast]);
  useEffect(() => { void load(); }, [load]);

  /** Money the deal has actually produced, by stage of the chain. Formatted, never re-derived. */
  const totals = useMemo(() => {
    const sum = (k: DocKind) => rows.filter((r) => r.kind === k)
      .reduce((n, r) => n + (Number(r.total) || 0), 0);
    return { quoted: sum('quote'), ordered: sum('order'), invoiced: sum('invoice') };
  }, [rows]);
  const currency = rows[0]?.currency ?? 'EUR';

  /**
   * Candidates: this party's documents that belong to NO deal yet. Restricted to the party on
   * purpose — attaching a stranger's invoice to a deal would put someone else's money in this
   * pipeline. Already-attached documents are excluded so one cannot be silently stolen from
   * another deal; detach it there first.
   */
  const openPicker = async () => {
    if (!workspaceId) return;
    setPicking(true);
    setBusy(true);
    try {
      const partyFilter = (q: any) => (companyId
        ? q.eq('customer_company_id', companyId)
        : q.eq('customer_contact_id', contactId));
      const [q, o, i] = await Promise.all([
        partyFilter(supabase.from('quotes').select('id, quote_number, status, grand_total, currency, created_at')
          .eq('workspace_id', workspaceId).is('deal_id', null)).order('created_at', { ascending: false }).limit(10),
        partyFilter(supabase.from('orders').select('id, order_number, status, total, currency, created_at')
          .eq('workspace_id', workspaceId).is('deal_id', null)).order('created_at', { ascending: false }).limit(10),
        partyFilter(supabase.from('invoices').select('id, internal_number, status, total, currency, created_at')
          .eq('workspace_id', workspaceId).is('deal_id', null)).order('created_at', { ascending: false }).limit(10),
      ]);
      const map = (kind: DocKind, data: any[], numberKey: string, totalKey: string): DealDoc[] =>
        (data ?? []).map((r) => ({
          kind, id: r.id, number: r[numberKey] ?? null, status: r.status ?? null,
          total: r[totalKey] ?? null, currency: r.currency ?? 'EUR', occurred_at: r.created_at,
        }));
      setCandidates([
        ...map('quote', q.data ?? [], 'quote_number', 'grand_total'),
        ...map('order', o.data ?? [], 'order_number', 'total'),
        ...map('invoice', i.data ?? [], 'internal_number', 'total'),
      ]);
    } catch (err: any) {
      toast({ title: 'Failed to search documents', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const attach = async (d: DealDoc) => {
    setBusy(true);
    try {
      await dealsService.setDocumentDeal(d.kind, d.id, dealId);
      setPicking(false);
      await load();
      toast({ title: `${KIND_LABEL[d.kind]} attached to this deal` });
    } catch (err: any) {
      toast({ title: 'Failed to attach', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const detach = async (d: DealDoc) => {
    if (!confirm(`Detach ${KIND_LABEL[d.kind].toLowerCase()} ${d.number ?? ''} from this deal? The document itself is kept.`)) return;
    setBusy(true);
    try {
      await dealsService.setDocumentDeal(d.kind, d.id, null);
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to detach', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0 gap-3">
        <div>
          <CardTitle className="text-base">Documents</CardTitle>
          {rows.length > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {formatMoney(totals.quoted, currency)} quoted · {formatMoney(totals.ordered, currency)} ordered
              {' · '}{formatMoney(totals.invoiced, currency)} invoiced
            </p>
          )}
        </div>
        {canEdit && (companyId || contactId) && (
          <Button size="sm" variant="outline" onClick={openPicker} disabled={busy}>
            <Link2 className="h-3.5 w-3.5 mr-1" /> Attach
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={FileText}
            title="Nothing raised for this deal yet"
            description="Attach the quote, order or invoice this deal produced, so its forecast can be compared with what was actually billed."
            action={canEdit && (companyId || contactId)
              ? <Button size="sm" onClick={openPicker}><Plus className="h-3.5 w-3.5 mr-1" /> Attach a document</Button>
              : undefined}
          />
        ) : (
          <div className="divide-y divide-border/40">
            {rows.map((d) => {
              const Icon = KIND_ICON[d.kind];
              return (
                <div key={`${d.kind}:${d.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <Link to={docHref(d)} className="min-w-0 flex-1 truncate text-primary hover:underline">
                    {KIND_LABEL[d.kind]} {d.number}
                  </Link>
                  <span className={`shrink-0 text-[11px] capitalize ${statusTone(d.status ?? '')}`}>{d.status}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums">{formatMoney(d.total, d.currency ?? 'EUR')}</span>
                  <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">{formatDate(d.occurred_at)}</span>
                  {canEdit && (
                    <button type="button" title="Detach from this deal" className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => detach(d)} disabled={busy}>
                      <Link2Off className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={picking} onOpenChange={(v) => { if (!busy) setPicking(v); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Attach a document</DialogTitle>
            <DialogDescription>
              This party&apos;s quotes, orders and invoices that are not on a deal yet. To move one
              from another deal, detach it there first.
            </DialogDescription>
          </DialogHeader>
          {busy ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : candidates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing unattached for this party.
            </p>
          ) : (
            <div className="max-h-80 overflow-auto divide-y divide-border/40">
              {candidates.map((d) => {
                const Icon = KIND_ICON[d.kind];
                return (
                  <button key={`${d.kind}:${d.id}`} type="button" onClick={() => attach(d)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted">
                    <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{KIND_LABEL[d.kind]} {d.number}</span>
                    <span className="shrink-0 text-[11px] capitalize text-muted-foreground">{d.status}</span>
                    <span className="w-24 shrink-0 text-right tabular-nums">{formatMoney(d.total, d.currency ?? 'EUR')}</span>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
