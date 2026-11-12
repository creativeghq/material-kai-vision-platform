import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, Workflow, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal } from '@/utils/decimal';
import { dealsService, type DealStage, type DealType } from '@/services/dealsService';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

export interface PipelineQuote {
  id: string;
  name?: string | null;
  workspace_id?: string | null;
  deal_id?: string | null;
  customer_company_id?: string | null;
  customer_contact_id?: string | null;
  project_id?: string | null;
  grand_total?: number | null;
  currency?: string | null;
}

/** Put a quote on the deal pipeline: open a new deal for it, or attach it to an existing one. */
export const QuotePipelineDialog: React.FC<{
  quote: PipelineQuote | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: (dealId: string) => void;
}> = ({ quote, open, onOpenChange, onLinked }) => {
  const { toast } = useToast();
  const ws = quote?.workspace_id ?? null;
  const [tab, setTab] = useState<'new' | 'existing'>('new');
  const [types, setTypes] = useState<DealType[]>([]);
  const [typeId, setTypeId] = useState('');
  const [stages, setStages] = useState<DealStage[]>([]);
  const [stageKey, setStageKey] = useState('');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; title: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !quote) return;
    setTab('new');
    setTitle(quote.name || 'Quote');
    setValue(quote.grand_total != null && quote.grand_total > 0 ? String(quote.grand_total) : '');
    setQuery('');
    if (!ws) return;
    void dealsService.listTypes(ws).then((t) => {
      setTypes(t);
      const preferred = t.find((x) => x.subject_kind === 'project') ?? t.find((x) => x.subject_kind === 'none') ?? t[0];
      setTypeId(preferred?.id ?? '');
    }).catch(() => setTypes([]));
  }, [open, quote?.id, ws]);

  useEffect(() => {
    if (!typeId) { setStages([]); setStageKey(''); return; }
    void dealsService.listStages(typeId).then((s) => {
      setStages(s);
      setStageKey((s.find((x) => !x.is_won && !x.is_lost) ?? s[0])?.key ?? '');
    }).catch(() => setStages([]));
  }, [typeId]);

  useEffect(() => {
    if (!open || tab !== 'existing' || !ws) return;
    const t = setTimeout(() => {
      void dealsService.searchDeals(ws, query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [open, tab, query, ws]);

  const attach = async (dealId: string) => {
    if (!quote) return;
    await dealsService.setDocumentDeal('quote', quote.id, dealId);
    onLinked(dealId);
    onOpenChange(false);
  };

  const createDeal = async () => {
    if (!quote || !ws || !typeId || !stageKey) return;
    try {
      setBusy(true);
      const deal = await dealsService.createDeal(ws, {
        deal_type_id: typeId,
        stage: stageKey,
        title: title.trim() || quote.name || 'Quote',
        company_id: quote.customer_company_id ?? null,
        contact_id: quote.customer_contact_id ?? null,
        project_id: quote.project_id ?? null,
        value: parseDecimal(value),
        currency: quote.currency || 'EUR',
      });
      await attach(deal.id);
      toast({ title: 'Added to the pipeline', description: deal.title ?? undefined });
    } catch (err) {
      toast({ title: 'Could not create the deal', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const linkExisting = async (dealId: string, dealTitle: string) => {
    try {
      setBusy(true);
      await attach(dealId);
      toast({ title: 'Quote linked to deal', description: dealTitle });
    } catch (err) {
      toast({ title: 'Could not link the deal', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Add to pipeline</DialogTitle>
          <DialogDescription>
            Track this quote as a deal: open a new one or attach it to a deal you already have.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'new' | 'existing')}>
          <TabsList>
            <TabsTrigger value="new">New Deal</TabsTrigger>
            <TabsTrigger value="existing">Existing Deal</TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="mt-4 space-y-4">
            <FormField label="Deal Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </FormField>
            <FormGrid>
              <FormField label="Pipeline">
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger><SelectValue placeholder="Choose a pipeline" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Stage">
                <Select value={stageKey} onValueChange={setStageKey} disabled={stages.length === 0}>
                  <SelectTrigger><SelectValue placeholder="Choose a stage" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </FormGrid>
            <FormField label={`Deal Value (${quote?.currency || 'EUR'}, optional)`} hint="Prefilled from the quote's total.">
              <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </FormField>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={() => void createDeal()} disabled={busy || !typeId || !stageKey}>
                {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Create deal
              </Button>
            </DialogFooter>
          </TabsContent>
          <TabsContent value="existing" className="mt-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search deals by title" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-hairline border border-hairline rounded-sm">
              {results.length === 0 ? (
                query.trim() ? (
                  <HubEmptyState
                    variant="filtered"
                    title="No deal matches that title"
                    action={<Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button>}
                  />
                ) : (
                  <HubEmptyState
                    icon={Workflow}
                    title="No deals yet"
                    action={<Button size="sm" onClick={() => setTab('new')}>Create a deal</Button>}
                  />
                )
              ) : results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy || r.id === quote?.deal_id}
                  onClick={() => void linkExisting(r.id, r.title)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 disabled:opacity-50"
                >
                  <span className="truncate">{r.title}</span>
                  {r.id === quote?.deal_id && <span className="text-xs text-muted-foreground">Linked</span>}
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export const QuoteDealLink: React.FC<{ quote: PipelineQuote; editable: boolean; onChanged: () => void }> = ({ quote, editable, onChanged }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [deal, setDeal] = useState<{ id: string; title: string; status: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!quote.deal_id) { setDeal(null); return; }
    void dealsService.getDealSummary(quote.deal_id)
      .then((d) => { if (!cancelled) setDeal(d); })
      .catch(() => { if (!cancelled) setDeal(null); });
    return () => { cancelled = true; };
  }, [quote.deal_id]);

  const detach = async () => {
    try {
      await dealsService.setDocumentDeal('quote', quote.id, null);
      onChanged();
    } catch (err) {
      toast({ title: 'Could not detach the deal', description: (err as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Workflow className="h-4 w-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">Pipeline</span>
      {quote.deal_id ? (
        <>
          <Link to={`/crm/deals/${quote.deal_id}`} className="text-primary hover:underline">
            {deal?.title ?? 'Open deal'}
          </Link>
          {deal && <span className="text-xs capitalize text-muted-foreground">· {deal.status}</span>}
          {editable && (
            <>
              <Button variant="ghost" size="sm" className="h-7" onClick={() => setOpen(true)}>Change</Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Detach from deal" onClick={() => void detach()}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </>
      ) : editable ? (
        <Button variant="outline" size="sm" className="h-7" onClick={() => setOpen(true)}>Add to pipeline</Button>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
      <QuotePipelineDialog quote={quote} open={open} onOpenChange={setOpen} onLinked={() => onChanged()} />
    </div>
  );
};
