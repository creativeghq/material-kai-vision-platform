import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightCircle, FileText, Kanban, List, Plus, Trash2, UserPlus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { HubCellEmpty, HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate, fromLocalISODate, todayLocalISO } from '@/utils/datetime';
import {
  LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, LEAD_STATUS_VARIANT, type LeadStatus,
} from '@/modules/crm/leadVocabulary';
import { leadUrl } from '@/modules/crm/routes';
import { crmLeadsService, type Lead } from '@/services/crmLeadsService';
import { LeadFormFields, EMPTY_LEAD_FORM, formToLeadInput, type LeadFormState } from './LeadFormFields';
import { LeadsBoard } from './LeadsBoard';
import { ConvertLeadDialog } from './ConvertLeadDialog';

type StatusFilter = 'open' | 'all' | LeadStatus;

const OPEN: ReadonlySet<LeadStatus> = new Set(['new', 'contacted', 'quoted']);

export const LeadsPanel: React.FC<{ workspaceId: string | null }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get('view') === 'board' ? 'board' : 'list';
  const [leads, setLeads] = useState<Lead[]>([]);
  const [quoteCounts, setQuoteCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<LeadFormState>(EMPTY_LEAD_FORM);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLeads([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [rows, counts] = await Promise.all([crmLeadsService.list(workspaceId), crmLeadsService.quoteCounts(workspaceId)]);
      setLeads(rows);
      setQuoteCounts(counts);
    } catch (e) {
      toast({ title: 'Could not load leads', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const setView = (v: 'list' | 'board') => {
    const next = new URLSearchParams(searchParams);
    if (v === 'board') next.set('view', 'board'); else next.delete('view');
    setSearchParams(next, { replace: true });
  };

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) => [l.name, l.email, l.phone, l.company_name, l.title, l.request]
      .some((v) => v?.toLowerCase().includes(q)));
  }, [leads, search]);

  const visible = useMemo(() => matching.filter((l) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'open') return OPEN.has(l.status);
    return l.status === statusFilter;
  }), [matching, statusFilter]);

  const shown = view === 'board' ? matching : visible;
  const filtered = search.trim() !== '' || (view === 'list' && statusFilter !== 'all');
  const today = todayLocalISO();
  const open = (l: Lead) => navigate(leadUrl(l.id));

  const openNew = () => { setForm(EMPTY_LEAD_FORM); setCreating(true); };

  const save = async () => {
    if (!workspaceId || !form.name.trim() || saving) return;
    setSaving(true);
    try {
      const lead = await crmLeadsService.create(workspaceId, formToLeadInput(form));
      setCreating(false);
      navigate(leadUrl(lead.id));
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

  const move = async (lead: Lead, to: LeadStatus) => {
    if (to === 'converted') { setConverting(lead); return; }
    if (lead.status === 'converted') return;
    const previous = leads;
    setLeads((rows) => rows.map((r) => (r.id === lead.id ? { ...r, status: to } : r)));
    try {
      await crmLeadsService.setStatus(lead.id, to);
    } catch (e) {
      setLeads(previous);
      toast({ title: 'Could not move the lead', description: (e as Error).message, variant: 'destructive' });
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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads…" className="max-w-xs" />
          {view === 'list' && (
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="all">All</SelectItem>
                {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant={view === 'list' ? 'secondary' : 'ghost'} onClick={() => setView('list')}><List className="h-4 w-4 mr-1" />List</Button>
            <Button size="sm" variant={view === 'board' ? 'secondary' : 'ghost'} onClick={() => setView('board')}><Kanban className="h-4 w-4 mr-1" />Board</Button>
          </div>
        </div>

        {!loading && shown.length === 0 ? (
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
        ) : view === 'board' ? (
          <LeadsBoard leads={shown} quoteCounts={quoteCounts} today={today} onOpen={open} onMove={(l, to) => void move(l, to)} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Interest</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Est. value</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead>Follow-up</TableHead>
                <TableHead>Received</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((l) => {
                const overdue = !!l.follow_up_on && OPEN.has(l.status) && l.follow_up_on < today;
                const quotes = quoteCounts.get(l.id) ?? 0;
                return (
                  <TableRow key={l.id} className="cursor-pointer" onClick={() => open(l)}>
                    <TableCell>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(' · ') || '—'}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={l.request ?? undefined}>{l.title ?? <HubCellEmpty />}</TableCell>
                    <TableCell>{LEAD_SOURCE_LABEL[l.source]}</TableCell>
                    <TableCell><Badge variant={LEAD_STATUS_VARIANT[l.status]}>{LEAD_STATUS_LABEL[l.status]}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.estimated_value, l.currency, { decimals: 0, maxDecimals: 0 })}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quotes > 0 ? <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{quotes}</span> : <HubCellEmpty />}
                    </TableCell>
                    <TableCell className={overdue ? 'text-[hsl(var(--error))]' : undefined}>
                      {l.follow_up_on ? formatDate(fromLocalISODate(l.follow_up_on)) : <HubCellEmpty />}
                    </TableCell>
                    <TableCell>{formatDate(l.created_at)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {l.status !== 'converted' && (
                        <Button size="sm" variant="outline" onClick={() => setConverting(l)}>
                          <ArrowRightCircle className="h-4 w-4 mr-1" />Convert
                        </Button>
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

      <Dialog open={creating} onOpenChange={(o) => { if (!o) setCreating(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>A lead stays out of your contacts until you convert it.</DialogDescription>
          </DialogHeader>
          <LeadFormFields form={form} onChange={setForm} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving || !form.name.trim()}>{saving ? 'Saving…' : 'Create lead'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConvertLeadDialog lead={converting} onClose={() => { setConverting(null); void load(); }} />
    </Card>
  );
};
