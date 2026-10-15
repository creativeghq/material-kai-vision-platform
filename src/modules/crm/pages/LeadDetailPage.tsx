import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRightCircle, FileText, Link2, Loader2, Plus, Trash2, Unlink } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { LEAD_STATUS_LABEL, LEAD_STATUS_VARIANT } from '@/modules/crm/leadVocabulary';
import { crmTabUrl, CRM_TAB } from '@/modules/crm/routes';
import { quoteUrl } from '@/modules/quotes/routes';
import { crmLeadsService, type Lead, type LeadQuote } from '@/services/crmLeadsService';
import { LeadFormFields, formToLeadInput, leadToForm, type LeadFormState } from '../components/LeadFormFields';
import { ConvertLeadDialog } from '../components/ConvertLeadDialog';

const quoteLabel = (q: LeadQuote) => [q.quote_number, q.name].filter(Boolean).join(' · ') || 'Quote';

export const LeadDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null | 'missing'>(null);
  const [form, setForm] = useState<LeadFormState | null>(null);
  const [quotes, setQuotes] = useState<LeadQuote[]>([]);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [picking, setPicking] = useState(false);
  const [linkable, setLinkable] = useState<LeadQuote[] | null>(null);
  const [pickSearch, setPickSearch] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [l, q] = await Promise.all([crmLeadsService.get(id), crmLeadsService.quotes(id)]);
      if (!l) { setLead('missing'); return; }
      setLead(l);
      setForm(leadToForm(l));
      setQuotes(q);
    } catch {
      setLead('missing');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(
    () => !!form && lead !== null && lead !== 'missing' && JSON.stringify(form) !== JSON.stringify(leadToForm(lead)),
    [form, lead],
  );

  const pickable = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return (linkable ?? []).filter((x) => !q || quoteLabel(x).toLowerCase().includes(q));
  }, [linkable, pickSearch]);

  if (lead === null) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (lead === 'missing' || !form) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-sans text-lg">Lead not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(crmTabUrl(CRM_TAB.leads))}>Back to leads</Button>
      </div>
    );
  }

  const converted = lead.status === 'converted';

  const run = async (fn: () => Promise<unknown>, failTitle: string) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { toast({ title: failTitle, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await crmLeadsService.update(lead.id, formToLeadInput(form));
      setLead(updated);
      setForm(leadToForm(updated));
      toast({ title: 'Lead saved' });
    } catch (e) {
      toast({ title: 'Could not save lead', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createQuote = async () => {
    setBusy(true);
    try {
      const quoteId = await crmLeadsService.createQuote(lead);
      navigate(quoteUrl(quoteId));
    } catch (e) {
      toast({ title: 'Could not create quote', description: (e as Error).message, variant: 'destructive' });
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setPickSearch('');
    setLinkable(null);
    setPicking(true);
    try {
      setLinkable(await crmLeadsService.linkableQuotes(lead.workspace_id));
    } catch (e) {
      setPicking(false);
      toast({ title: 'Could not load quotes', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the lead "${lead.name}"? Linked quotes are kept.`)) return;
    try {
      await crmLeadsService.remove(lead.id);
      navigate(crmTabUrl(CRM_TAB.leads));
    } catch (e) {
      toast({ title: 'Could not delete lead', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(crmTabUrl(CRM_TAB.leads))}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Leads
        </Button>
        <h1 className="font-sans text-xl">{lead.name}</h1>
        <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
        <span className="text-xs text-muted-foreground">Received {formatDate(lead.created_at)}</span>
        <div className="ml-auto flex gap-2">
          {!converted && (
            <Button size="sm" onClick={() => setConverting(lead)}><ArrowRightCircle className="mr-1 h-4 w-4" />Convert to contact</Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void remove()} aria-label="Delete lead"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {converted && (
        <div className="rounded-sm border border-hairline bg-surface-sunken px-4 py-3 text-sm">
          Converted {formatDate(lead.converted_at)}.{' '}
          {lead.converted_contact_id && <Link className="text-primary hover:underline" to={`/crm/contacts/${lead.converted_contact_id}`}>Open contact</Link>}
          {lead.converted_deal_id && <> · <Link className="text-primary hover:underline" to={`/crm/deals/${lead.converted_deal_id}`}>Open deal</Link></>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-hairline px-5 py-3">
            <CardTitle className="text-base">Details</CardTitle>
            {!converted && (
              <Button size="sm" variant={dirty ? 'default' : 'outline'} disabled={!dirty || saving || !form.name.trim()} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="p-5">
            <LeadFormFields form={form} onChange={setForm} disabled={converted} />
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader className="border-b border-hairline px-5 py-3">
            <CardTitle className="text-base">Quotes</CardTitle>
            <CardDescription>What this lead has been offered.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            {quotes.length === 0 ? (
              <HubEmptyState
                icon={FileText}
                title="No quote yet"
                description="Create one for this lead, or link a quote you already made."
                action={<Button size="sm" onClick={() => void createQuote()} disabled={busy}><Plus className="mr-1 h-4 w-4" />Create quote</Button>}
              />
            ) : (
              <ul className="divide-y divide-hairline">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 py-2">
                    <Link to={quoteUrl(q.id)} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium hover:underline">{quoteLabel(q)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {humanizeLabel(q.status ?? 'draft')} · {formatDate(q.created_at)}
                      </div>
                    </Link>
                    <span className="text-sm tabular-nums">{formatMoney(q.grand_total, q.currency ?? 'EUR')}</span>
                    <Button
                      size="icon" variant="ghost" aria-label="Unlink quote" disabled={busy}
                      onClick={() => void run(() => crmLeadsService.linkQuote(q.id, null), 'Could not unlink quote')}
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {quotes.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => void createQuote()} disabled={busy}><Plus className="mr-1 h-4 w-4" />Create quote</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => void openPicker()} disabled={busy}><Link2 className="mr-1 h-4 w-4" />Link existing quote</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={picking} onOpenChange={(o) => { if (!o) setPicking(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link an existing quote</DialogTitle>
            <DialogDescription>Quotes not linked to any lead yet.</DialogDescription>
          </DialogHeader>
          <Input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="Search by number or name…" />
          <div className="max-h-[50vh] overflow-y-auto">
            {linkable === null ? (
              <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : pickable.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No quotes to link.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {pickable.map((q) => (
                  <li key={q.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-1 py-2 text-left hover:bg-surface-sunken"
                      onClick={() => { setPicking(false); void run(() => crmLeadsService.linkQuote(q.id, lead), 'Could not link quote'); }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{quoteLabel(q)}</div>
                        <div className="text-[11px] text-muted-foreground">{humanizeLabel(q.status ?? 'draft')} · {formatDate(q.created_at)}</div>
                      </div>
                      <span className="text-sm tabular-nums">{formatMoney(q.grand_total, q.currency ?? 'EUR')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConvertLeadDialog lead={converting} onClose={() => { setConverting(null); void load(); }} />
    </div>
  );
};
