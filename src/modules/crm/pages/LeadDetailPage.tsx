import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRightCircle, FileText, Link2, Loader2, Mail, Pencil, Phone, Trash2, Unlink, UserPlus } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  HubEmptyState, HubPanel, HubPanelAddAction, HubProperty, HubPropertyList, HubRecordIdentity, HubRecordLayout,
} from '@/components/core/hub';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate, fromLocalISODate, todayLocalISO } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL, LEAD_STATUS_VARIANT } from '@/modules/crm/leadVocabulary';
import { CRM_BASE, CRM_TAB, crmTabUrl } from '@/modules/crm/routes';
import { quoteUrl } from '@/modules/quotes/routes';
import { crmLeadsService, type Lead, type LeadQuote } from '@/services/crmLeadsService';
import {
  EDITABLE_LEAD_STATUSES, LeadFormFields, formToLeadInput, leadToForm, type EditableLeadStatus, type LeadFormState,
} from '../components/LeadFormFields';
import { ConvertLeadDialog } from '../components/ConvertLeadDialog';

const quoteLabel = (q: LeadQuote) => [q.quote_number, q.name].filter(Boolean).join(' · ') || 'Quote';

export const LeadDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null | 'missing'>(null);
  const [quotes, setQuotes] = useState<LeadQuote[]>([]);
  const [editForm, setEditForm] = useState<LeadFormState | null>(null);
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
      setQuotes(q);
    } catch {
      setLead('missing');
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const pickable = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return (linkable ?? []).filter((x) => !q || quoteLabel(x).toLowerCase().includes(q));
  }, [linkable, pickSearch]);

  if (lead === null) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  if (lead === 'missing') {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="font-sans text-lg">Lead not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate(crmTabUrl(CRM_TAB.leads))}>Back to leads</Button>
      </div>
    );
  }

  const converted = lead.status === 'converted';
  const overdue = !!lead.follow_up_on && !converted && lead.status !== 'lost' && lead.follow_up_on < todayLocalISO();

  const run = async (fn: () => Promise<unknown>, failTitle: string) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (e) { toast({ title: failTitle, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const saveEdit = async () => {
    if (!editForm || !editForm.name.trim() || saving) return;
    setSaving(true);
    try {
      setLead(await crmLeadsService.update(lead.id, formToLeadInput(editForm)));
      setEditForm(null);
    } catch (e) {
      toast({ title: 'Could not save lead', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const createQuote = async () => {
    setBusy(true);
    try {
      navigate(quoteUrl(await crmLeadsService.createQuote(lead)));
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
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={UserPlus}
        recordTitle
        title={lead.name}
        subtitle={lead.title ?? undefined}
        breadcrumbs={[{ label: 'CRM', to: CRM_BASE }, { label: 'Leads', to: crmTabUrl(CRM_TAB.leads) }, { label: lead.name }]}
        actions={
          <>
            {!converted && (
              <Button variant="outline" size="sm" onClick={() => setEditForm(leadToForm(lead))}><Pencil className="mr-1.5 h-4 w-4" />Edit</Button>
            )}
            {!converted && (
              <Button size="sm" onClick={() => setConverting(lead)}><ArrowRightCircle className="mr-1.5 h-4 w-4" />Convert to contact</Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => void remove()} aria-label="Delete lead"><Trash2 className="h-4 w-4" /></Button>
          </>
        }
      />

      <HubRecordLayout
        className="sm:p-6"
        left={
          <>
            <HubRecordIdentity
              name={lead.name}
              subtitle={lead.company_name ?? undefined}
              meta={
                <>
                  <Badge variant={LEAD_STATUS_VARIANT[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                  <Badge variant="neutral">{LEAD_SOURCE_LABEL[lead.source]}</Badge>
                </>
              }
              actions={
                <>
                  {lead.email && (
                    <Button asChild size="sm" variant="outline"><a href={`mailto:${lead.email}`}><Mail className="mr-1 h-3.5 w-3.5" />Email</a></Button>
                  )}
                  {lead.phone && (
                    <Button asChild size="sm" variant="outline"><a href={`tel:${lead.phone}`}><Phone className="mr-1 h-3.5 w-3.5" />Call</a></Button>
                  )}
                </>
              }
            />
            <HubPanel title="Details">
              <HubPropertyList>
                <HubProperty label="Status">
                  {converted ? LEAD_STATUS_LABEL.converted : (
                    <Select
                      value={lead.status}
                      disabled={busy}
                      onValueChange={(v) => void run(() => crmLeadsService.setStatus(lead.id, v as EditableLeadStatus), 'Could not change status')}
                    >
                      <SelectTrigger className="mt-1 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EDITABLE_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </HubProperty>
                {lead.status === 'lost' && <HubProperty label="Lost reason">{lead.lost_reason}</HubProperty>}
                <HubProperty label="Email">{lead.email}</HubProperty>
                <HubProperty label="Phone">{lead.phone}</HubProperty>
                <HubProperty label="Company">{lead.company_name}</HubProperty>
                <HubProperty label="Estimated value">
                  {lead.estimated_value == null ? null : <span className="tabular-nums">{formatMoney(lead.estimated_value, lead.currency)}</span>}
                </HubProperty>
                <HubProperty label="Follow-up on">
                  {lead.follow_up_on
                    ? <span className={overdue ? 'text-[hsl(var(--error))]' : undefined}>{formatDate(fromLocalISODate(lead.follow_up_on))}{overdue ? ' · overdue' : ''}</span>
                    : null}
                </HubProperty>
                <HubProperty label="Received">{formatDate(lead.created_at)}</HubProperty>
                <HubProperty label="Reference">{lead.source_ref}</HubProperty>
              </HubPropertyList>
            </HubPanel>
          </>
        }
        right={
          <HubPanel title="Quotes" action={!converted ? <HubPanelAddAction label="Create quote" onClick={() => void createQuote()} /> : undefined}>
            {quotes.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">No quote yet. Create one, or link a quote you already made.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {quotes.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 py-2">
                    <Link to={quoteUrl(q.id)} className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium hover:underline">{quoteLabel(q)}</div>
                      <div className="text-[11px] text-muted-foreground">{humanizeLabel(q.status ?? 'draft')} · {formatDate(q.created_at)}</div>
                    </Link>
                    <span className="text-sm tabular-nums">{formatMoney(q.grand_total, q.currency ?? 'EUR')}</span>
                    {!converted && (
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7" aria-label="Unlink quote" disabled={busy}
                        onClick={() => void run(() => crmLeadsService.linkQuote(q.id, null), 'Could not unlink quote')}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!converted && (
              <Button size="sm" variant="ghost" className="mt-2 w-full" onClick={() => void openPicker()} disabled={busy}>
                <Link2 className="mr-1.5 h-4 w-4" />Link existing quote
              </Button>
            )}
          </HubPanel>
        }
      >
        {converted && (
          <div className="rounded-md border border-hairline bg-surface-sunken px-4 py-3 text-sm">
            Converted {formatDate(lead.converted_at)}.{' '}
            {lead.converted_contact_id && <Link className="text-primary hover:underline" to={`/crm/contacts/${lead.converted_contact_id}`}>Open contact</Link>}
            {lead.converted_deal_id && <> · <Link className="text-primary hover:underline" to={`/crm/deals/${lead.converted_deal_id}`}>Open deal</Link></>}
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Request</CardTitle></CardHeader>
          <CardContent>
            {lead.request
              ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{lead.request}</p>
              : <HubEmptyState icon={FileText} title="No request recorded" description="Add what they asked for." action={!converted ? <Button size="sm" variant="outline" onClick={() => setEditForm(leadToForm(lead))}>Edit lead</Button> : undefined} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent>
            {lead.notes
              ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{lead.notes}</p>
              : <HubEmptyState icon={FileText} title="No notes yet" description="Keep the conversation history here." action={!converted ? <Button size="sm" variant="outline" onClick={() => setEditForm(leadToForm(lead))}>Edit lead</Button> : undefined} />}
          </CardContent>
        </Card>
      </HubRecordLayout>

      <Dialog open={editForm !== null} onOpenChange={(o) => { if (!o && !saving) setEditForm(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit lead</DialogTitle>
            <DialogDescription>Changes stay on the lead until you convert it.</DialogDescription>
          </DialogHeader>
          {editForm && <LeadFormFields form={editForm} onChange={setEditForm} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditForm(null)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void saveEdit()} disabled={saving || !editForm?.name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
