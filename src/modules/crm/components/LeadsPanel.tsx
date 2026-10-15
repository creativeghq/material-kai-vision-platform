import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightCircle, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubCellEmpty, HubCellLink, HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate, fromLocalISODate, todayLocalISO } from '@/utils/datetime';
import {
  crmLeadsService, LEAD_SOURCES, LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL,
  type Lead, type LeadInput, type LeadSource, type LeadStatus,
} from '@/services/crmLeadsService';

type EditableStatus = Exclude<LeadStatus, 'converted'>;
type StatusFilter = 'open' | 'all' | LeadStatus;

const OPEN: ReadonlySet<LeadStatus> = new Set(['new', 'contacted', 'quoted']);
const EDITABLE_STATUSES = LEAD_STATUSES.filter((s): s is EditableStatus => s !== 'converted');

const STATUS_VARIANT: Record<LeadStatus, 'info' | 'warning' | 'success' | 'neutral' | 'error'> = {
  new: 'info', contacted: 'warning', quoted: 'warning', converted: 'success', lost: 'neutral',
};

interface FormState {
  name: string; email: string; phone: string; company_name: string; source: LeadSource;
  title: string; request: string; notes: string; estimated_value: string; status: EditableStatus;
  lost_reason: string; follow_up_on: string; source_ref: string;
}

const EMPTY_FORM: FormState = {
  name: '', email: '', phone: '', company_name: '', source: 'email', title: '', request: '', notes: '',
  estimated_value: '', status: 'new', lost_reason: '', follow_up_on: '', source_ref: '',
};

function toForm(l: Lead): FormState {
  return {
    name: l.name, email: l.email ?? '', phone: l.phone ?? '', company_name: l.company_name ?? '',
    source: l.source, title: l.title ?? '', request: l.request ?? '', notes: l.notes ?? '',
    estimated_value: l.estimated_value == null ? '' : String(l.estimated_value),
    status: l.status === 'converted' ? 'quoted' : l.status, lost_reason: l.lost_reason ?? '',
    follow_up_on: l.follow_up_on ?? '', source_ref: l.source_ref ?? '',
  };
}

function toInput(f: FormState): LeadInput {
  const value = f.estimated_value.trim() ? Number(f.estimated_value.replace(',', '.')) : null;
  return {
    name: f.name, email: f.email, phone: f.phone, company_name: f.company_name, source: f.source,
    title: f.title, request: f.request, notes: f.notes,
    estimated_value: value != null && Number.isFinite(value) ? value : null,
    status: f.status, lost_reason: f.lost_reason, follow_up_on: f.follow_up_on, source_ref: f.source_ref,
  };
}

export const LeadsPanel: React.FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [editing, setEditing] = useState<Lead | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<Lead | null>(null);
  const [createDeal, setCreateDeal] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) { setLeads([]); setLoading(false); return; }
    setLoading(true);
    try {
      setLeads(await crmLeadsService.list(workspaceId));
    } catch (e) {
      toast({ title: 'Could not load leads', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter === 'open' && !OPEN.has(l.status)) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.name, l.email, l.phone, l.company_name, l.title, l.request]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [leads, search, statusFilter]);

  const filtered = search.trim() !== '' || statusFilter !== 'all';
  const today = todayLocalISO();

  const openNew = () => { setForm(EMPTY_FORM); setEditing('new'); };
  const openEdit = (l: Lead) => { setForm(toForm(l)); setEditing(l); };
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!workspaceId || !form.name.trim() || saving) return;
    setSaving(true);
    try {
      if (editing === 'new') await crmLeadsService.create(workspaceId, toInput(form));
      else if (editing) await crmLeadsService.update(editing.id, toInput(form));
      setEditing(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not save lead', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: Lead) => {
    if (!window.confirm(`Delete the lead "${l.name}"? This cannot be undone.`)) return;
    try {
      await crmLeadsService.remove(l.id);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete lead', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const convert = async () => {
    if (!converting || busy) return;
    setBusy(true);
    try {
      const r = await crmLeadsService.convert(converting.id, createDeal);
      setConverting(null);
      toast({
        title: r.already_converted ? 'Already converted' : r.reused_contact ? 'Linked to existing contact' : 'Converted to contact',
        description: r.deal_id ? 'A deal was opened in the pipeline.' : undefined,
      });
      navigate(`/crm/contacts/${r.contact_id}`);
    } catch (e) {
      toast({ title: 'Could not convert lead', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Leads</CardTitle>
          <CardDescription>Enquiries that are not contacts yet. Convert one when it proceeds.</CardDescription>
        </div>
        <Button size="sm" onClick={openNew} disabled={!workspaceId}><Plus className="h-4 w-4 mr-1" />New lead</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads…" className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="all">All</SelectItem>
              {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!loading && visible.length === 0 ? (
          <HubEmptyState
            variant={leads.length > 0 && filtered ? 'filtered' : 'empty'}
            icon={UserPlus}
            title={leads.length > 0 && filtered ? 'No leads match' : 'No leads yet'}
            description={leads.length > 0 && filtered
              ? 'Your search or status filter excluded every lead.'
              : 'Record an enquiry here instead of creating a contact for it.'}
            action={leads.length > 0 && filtered
              ? <Button size="sm" variant="outline" onClick={() => { setSearch(''); setStatusFilter('all'); }}>Clear filters</Button>
              : <Button size="sm" onClick={openNew} disabled={!workspaceId}><Plus className="h-4 w-4 mr-1" />New lead</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Est. value</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((l) => {
                const overdue = !!l.follow_up_on && OPEN.has(l.status) && l.follow_up_on < today;
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(' · ') || '—'}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={l.request ?? undefined}>{l.title ?? <HubCellEmpty />}</TableCell>
                    <TableCell>{LEAD_SOURCE_LABEL[l.source]}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.estimated_value, l.currency, { decimals: 0, maxDecimals: 0 })}</TableCell>
                    <TableCell className={overdue ? 'text-[hsl(var(--error))]' : undefined}>
                      {l.follow_up_on ? formatDate(fromLocalISODate(l.follow_up_on)) : <HubCellEmpty />}
                    </TableCell>
                    <TableCell>{formatDate(l.created_at)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {l.status === 'converted' && l.converted_contact_id ? (
                        <HubCellLink to={`/crm/contacts/${l.converted_contact_id}`}>Open contact</HubCellLink>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => { setCreateDeal(true); setConverting(l); }}>
                            <ArrowRightCircle className="h-4 w-4 mr-1" />Convert to contact
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Edit lead" onClick={() => openEdit(l)}><Pencil className="h-4 w-4" /></Button>
                        </>
                      )}
                      <Button size="icon" variant="ghost" aria-label="Delete lead" onClick={() => void remove(l)}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'New lead' : 'Edit lead'}</DialogTitle>
            <DialogDescription>A lead stays out of your contacts until you convert it.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="lead-name">Name *</Label>
              <Input id="lead-name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-email">Email</Label>
              <Input id="lead-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-phone">Phone</Label>
              <Input id="lead-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-company">Company</Label>
              <Input id="lead-company" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Source</Label>
              <Select value={form.source} onValueChange={(v) => set('source', v as LeadSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="lead-title">Interested in</Label>
              <Input id="lead-title" value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Floor tiles ~70m²" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="lead-request">Request</Label>
              <Textarea id="lead-request" rows={3} value={form.request} onChange={(e) => set('request', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="lead-notes">Notes</Label>
              <Textarea id="lead-notes" rows={4} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => set('status', v as EditableStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EDITABLE_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-value">Est. value (EUR)</Label>
              <Input id="lead-value" inputMode="decimal" value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-follow">Follow-up on</Label>
              <Input id="lead-follow" type="date" value={form.follow_up_on} onChange={(e) => set('follow_up_on', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-ref">Reference</Label>
              <Input id="lead-ref" value={form.source_ref} onChange={(e) => set('source_ref', e.target.value)} placeholder="Email subject, link…" />
            </div>
            {form.status === 'lost' && (
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="lead-lost">Lost reason</Label>
                <Input id="lead-lost" value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={converting !== null} onOpenChange={(o) => { if (!o && !busy) setConverting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convert to contact</DialogTitle>
            <DialogDescription>
              {converting?.name} becomes a CRM contact, with this lead&apos;s request and notes kept on the contact.
              A contact with the same email is reused rather than duplicated.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={createDeal} onCheckedChange={(v) => setCreateDeal(v === true)} />
            Also open a deal in the pipeline
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConverting(null)} disabled={busy}>Cancel</Button>
            <Button onClick={() => void convert()} disabled={busy}>{busy ? 'Converting…' : 'Convert'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
