// Deal pipeline board. Stage columns with cards; a deal moves via a stage <Select>
// (the app's established "board" pattern — see HR RecruitmentSection — not drag-and-drop).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, Trophy, XCircle, Trash2, ListChecks, Loader2, RotateCcw, Pencil } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { realEstateService, type PropertyDeal, type DealStage, type DealTask, type PropertyListItem } from '../services/realEstateService';
import { formatDate } from '@/utils/datetime';

const STAGES: { key: DealStage; label: string }[] = [
  { key: 'lead', label: 'Lead' }, { key: 'viewing', label: 'Viewing' }, { key: 'offer', label: 'Offer' },
  { key: 'under_offer', label: 'Under offer' }, { key: 'conveyancing', label: 'Conveyancing' },
  { key: 'exchanged', label: 'Exchanged' }, { key: 'completed', label: 'Completed' },
];
const STAGE_LABEL = (s: DealStage) => STAGES.find((x) => x.key === s)?.label ?? s;
const money = (n: number | null, ccy: string) => formatMoney(n, ccy || 'EUR', { decimals: 0, fallback: '' });

export const PipelineBoard: React.FC<{ ws: string | null; canManage: boolean }> = ({ ws, canManage }) => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState<PropertyDeal[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [showLost, setShowLost] = useState(false);

  const load = useCallback(async () => { if (ws) setDeals(await realEstateService.listDeals(ws).catch(() => [])); }, [ws]);
  useEffect(() => { void load(); }, [load]);

  const open = (deals ?? []).filter((d) => d.status !== 'lost');
  const lost = (deals ?? []).filter((d) => d.status === 'lost');
  const byStage = useMemo(() => {
    const m: Record<string, PropertyDeal[]> = {};
    for (const s of STAGES) m[s.key] = [];
    for (const d of open) (m[d.stage] ??= []).push(d);
    return m;
  }, [open]);

  if (deals === null) return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {open.length} open deal{open.length === 1 ? '' : 's'}
          {lost.length > 0 && <> · <button className="hover:underline" onClick={() => setShowLost((v) => !v)}>{lost.length} lost</button></>}
        </div>
        {canManage && <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New deal</Button>}
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((s) => {
          const col = byStage[s.key] ?? [];
          const colValue = col.reduce((t, d) => t + Number(d.value ?? 0), 0);
          return (
            <div key={s.key} className="w-[248px] shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="text-[10px] text-muted-foreground">{col.length}{colValue ? ` · ${money(colValue, col[0]?.currency ?? 'EUR')}` : ''}</span>
              </div>
              <div className="space-y-2">
                {col.map((d) => <DealCard key={d.id} ws={ws!} deal={d} canManage={canManage} onChanged={load} onOpen={() => navigate(`/properties/${d.property_id}`)} />)}
                {col.length === 0 && <div className="rounded-lg border border-dashed border-border/50 py-6 text-center text-[11px] text-muted-foreground">—</div>}
              </div>
            </div>
          );
        })}
      </div>

      {showLost && lost.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Lost</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lost.map((d) => (
              <div key={d.id} className="dashboard-card flex items-center gap-2 p-2.5 opacity-70">
                <button onClick={() => navigate(`/properties/${d.property_id}`)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{d.property?.title || 'Property'}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{d.lost_reason || 'Lost'}</div>
                </button>
                {canManage && <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" onClick={async () => { await realEstateService.upsertDeal(ws!, { deal_id: d.id, status: 'open' }); load(); }}><RotateCcw className="h-3.5 w-3.5" /> Reopen</Button>}
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && ws && <DealDialog ws={ws} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </div>
  );
};

const DealCard: React.FC<{ ws: string; deal: PropertyDeal; canManage: boolean; onChanged: () => void; onOpen: () => void }> = ({ ws, deal, canManage, onChanged, onOpen }) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const act = async (fields: Parameters<typeof realEstateService.upsertDeal>[1]) => {
    try { await realEstateService.upsertDeal(ws, { deal_id: deal.id, ...fields }); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const del = async () => { try { await realEstateService.deleteDeal(ws, deal.id); onChanged(); } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); } };
  return (
    <div className="dashboard-card p-2.5">
      <div className="flex items-start justify-between gap-1">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium hover:underline">{deal.property?.title || 'Property'}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{deal.buyer?.name || 'No buyer'}{deal.value ? ` · ${money(deal.value, deal.currency)}` : ''}</div>
        </button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={() => act({ stage: 'completed', status: 'won' })}><Trophy className="mr-2 h-3.5 w-3.5" /> Mark won</DropdownMenuItem>
              <DropdownMenuItem onClick={() => act({ status: 'lost' })}><XCircle className="mr-2 h-3.5 w-3.5" /> Mark lost</DropdownMenuItem>
              <DropdownMenuItem onClick={del} className="text-red-500"><Trash2 className="mr-2 h-3.5 w-3.5" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {canManage ? (
          <Select value={deal.stage} onValueChange={(v) => act({ stage: v as DealStage })}>
            <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{STAGES.map((s) => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : <Badge className="rounded-full border-0 bg-muted text-[10px]">{STAGE_LABEL(deal.stage)}</Badge>}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" title="Checklist"><ListChecks className="h-3.5 w-3.5" />{deal.task_total ? `${deal.task_done}/${deal.task_total}` : ''}</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3"><DealTasks ws={ws} dealId={deal.id} canManage={canManage} onChanged={onChanged} /></PopoverContent>
        </Popover>
      </div>
      {deal.expected_close_date && <div className="mt-1.5 text-[10px] text-muted-foreground">Close ~ {formatDate(deal.expected_close_date)}</div>}
      {editing && <DealDialog ws={ws} deal={deal} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />}
    </div>
  );
};

const DealTasks: React.FC<{ ws: string; dealId: string; canManage: boolean; onChanged: () => void }> = ({ ws, dealId, canManage, onChanged }) => {
  const [tasks, setTasks] = useState<DealTask[] | null>(null);
  const [title, setTitle] = useState('');
  const load = useCallback(async () => { setTasks(await realEstateService.listDealTasks(ws, dealId).catch(() => [])); }, [ws, dealId]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => { if (!title.trim()) return; await realEstateService.addDealTask(ws, dealId, title.trim()); setTitle(''); await load(); onChanged(); };
  const toggle = async (t: DealTask) => { await realEstateService.toggleDealTask(ws, t.id, !t.done); await load(); onChanged(); };
  const del = async (t: DealTask) => { await realEstateService.deleteDealTask(ws, t.id); await load(); onChanged(); };
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">Checklist</div>
      {tasks === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : tasks.length === 0 ? <div className="text-[11px] text-muted-foreground">No tasks yet.</div>
        : (
          <div className="space-y-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox checked={t.done} onCheckedChange={() => toggle(t)} disabled={!canManage} />
                <span className={`flex-1 text-xs ${t.done ? 'text-muted-foreground line-through' : ''}`}>{t.title}</span>
                {canManage && <button onClick={() => del(t)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
              </div>
            ))}
          </div>
        )}
      {canManage && (
        <div className="flex gap-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Add task…" className="h-7 text-xs" />
          <Button size="sm" className="h-7 rounded-full px-2" onClick={add}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
};

// Create OR edit a deal. In edit mode the property is fixed; buyer/value/stage/close are editable.
const DealDialog: React.FC<{ ws: string; deal?: PropertyDeal; onClose: () => void; onSaved: () => void }> = ({ ws, deal, onClose, onSaved }) => {
  const { toast } = useToast();
  const [listings, setListings] = useState<PropertyListItem[]>([]);
  const [f, setF] = useState<Record<string, any>>(deal
    ? { property_id: deal.property_id, buyer_contact_id: deal.buyer_contact_id ?? '', stage: deal.stage, value: deal.value ?? '', currency: deal.currency ?? 'EUR', expected_close_date: deal.expected_close_date ?? '' }
    : { currency: 'EUR', stage: 'lead' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { realEstateService.listProperties(ws).then(setListings).catch(() => setListings([])); }, [ws]);
  const save = async () => {
    if (!f.property_id) { toast({ title: 'Pick a property', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await realEstateService.upsertDeal(ws, { deal_id: deal?.id, property_id: f.property_id, buyer_contact_id: f.buyer_contact_id || null, stage: f.stage, value: f.value ? Number(f.value) : null, currency: f.currency, expected_close_date: f.expected_close_date || null });
      toast({ title: deal ? 'Deal updated' : 'Deal created' }); onSaved();
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{deal ? 'Edit deal' : 'New deal'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Property</Label>
            <Select value={f.property_id} onValueChange={(v) => setF((p) => ({ ...p, property_id: v }))} disabled={!!deal}>
              <SelectTrigger><SelectValue placeholder="Select a listing…" /></SelectTrigger>
              <SelectContent>{listings.map((l) => <SelectItem key={l.id} value={l.id}>{l.title || l.reference_code || 'Listing'}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Buyer (CRM)</Label><ContactSearchDropdown selectedContactId={f.buyer_contact_id ?? null} onSelect={(id) => setF((p) => ({ ...p, buyer_contact_id: id }))} placeholder="Link buyer…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Value</Label><Input type="number" value={f.value ?? ''} onChange={(e) => setF((p) => ({ ...p, value: e.target.value }))} /></div>
            <div><Label className="text-xs">Expected close</Label><Input type="date" value={f.expected_close_date ?? ''} onChange={(e) => setF((p) => ({ ...p, expected_close_date: e.target.value }))} /></div>
          </div>
        </div>
        <DialogFooter><Button variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button><Button className="rounded-full" onClick={save} disabled={busy || !f.property_id}>{deal ? 'Save' : 'Create'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
