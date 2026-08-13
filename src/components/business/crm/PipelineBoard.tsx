/**
 * Deal pipeline board (#311) — one board for every deal type.
 *
 * Lifted out of Real Estate, which was only ever its first consumer. The stage columns come from
 * `crm_deal_stages` for the SELECTED TYPE, never from a constant in this file: the property stage
 * set ends `conveyancing → exchanged → completed`, and a construction deal must never land in one
 * of those. The database enforces the pairing (composite FK on `(deal_type_id, stage)`), so a bug
 * here fails loudly instead of writing a nonsense stage.
 *
 * A deal moves stage via a <Select> — the app's established board pattern (see HR
 * RecruitmentSection), not drag-and-drop.
 *
 * `lockedTypeKey` pins the board to one type and hides the type switcher; Real Estate passes
 * 'real_estate' so its tab is unchanged, while /crm shows all types with the switcher.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MoreVertical, Trophy, XCircle, Trash2, ListChecks, Loader2, RotateCcw, Pencil, Settings2 } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
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
import { supabase } from '@/integrations/supabase/client';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { CompanySearchDropdown } from '@/components/business/crm/CompanySearchDropdown';
import { dealsService, type Deal, type DealStage, type DealTask, type DealType } from '@/services/dealsService';
import { DealTypeManager } from '@/components/business/crm/DealTypeManager';

const money = (n: number | null, ccy: string) => formatMoney(n, ccy || 'EUR', { decimals: 0, fallback: '' });

/** What a card is called, in falling order of specificity. */
function dealLabel(d: Deal): string {
  return d.title?.trim() || d.property?.title || d.company?.name || d.contact?.name || 'Deal';
}

interface Props {
  ws: string | null;
  canManage: boolean;
  /** Pin to one deal type (by key) and hide the switcher — Real Estate passes 'real_estate'. */
  lockedTypeKey?: string;
  /** Workspace admins can define their own deal types and stages. */
  canManageTypes?: boolean;
}

export const PipelineBoard: React.FC<Props> = ({ ws, canManage, lockedTypeKey, canManageTypes }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [types, setTypes] = useState<DealType[] | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [managingTypes, setManagingTypes] = useState(false);
  const [showLost, setShowLost] = useState(false);

  const activeType = useMemo(() => types?.find((t) => t.id === typeId) ?? null, [types, typeId]);

  const reloadTypes = useCallback(async () => {
    if (!ws) return;
    try {
      const all = await dealsService.listTypes(ws);
      const visible = lockedTypeKey ? all.filter((t) => t.key === lockedTypeKey) : all;
      setTypes(visible);
      // Keep the current selection unless it just disappeared (type deleted).
      setTypeId((prev) => (prev && visible.some((t) => t.id === prev) ? prev : visible[0]?.id ?? null));
    } catch (e) {
      setTypes([]);
      toast({ title: 'Could not load deal types', description: (e as Error).message, variant: 'destructive' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, lockedTypeKey]);

  useEffect(() => { void reloadTypes(); }, [reloadTypes]);

  const load = useCallback(async () => {
    if (!ws || !typeId) return;
    const [s, d] = await Promise.all([
      dealsService.listStages(typeId).catch(() => [] as DealStage[]),
      dealsService.listDeals(ws, typeId).catch(() => [] as Deal[]),
    ]);
    setStages(s);
    setDeals(d);
  }, [ws, typeId]);

  useEffect(() => { setDeals(null); void load(); }, [load]);

  const open = (deals ?? []).filter((d) => d.status !== 'lost');
  const lost = (deals ?? []).filter((d) => d.status === 'lost');

  const byStage = useMemo(() => {
    const m: Record<string, Deal[]> = {};
    for (const s of stages) m[s.key] = [];
    for (const d of open) (m[d.stage] ??= []).push(d);
    return m;
  }, [open, stages]);

  const wonStage = stages.find((s) => s.is_won) ?? null;

  if (types === null || (deals === null && typeId)) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!typeId || !activeType) {
    return <div className="py-16 text-center text-sm text-muted-foreground">No deal types are configured for this workspace.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* The segmentation the pipeline is organised by. Hidden when the caller pins a type. */}
          {!lockedTypeKey && types.length > 1 && (
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {types.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="text-xs text-muted-foreground">
            {open.length} open deal{open.length === 1 ? '' : 's'}
            {lost.length > 0 && <> · <button className="hover:underline" onClick={() => setShowLost((v) => !v)}>{lost.length} lost</button></>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManageTypes && !lockedTypeKey && (
            <Button size="sm" variant="ghost" className="rounded-full text-xs" onClick={() => setManagingTypes(true)}>
              <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Types
            </Button>
          )}
          {canManage && <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}><Plus className="mr-1.5 h-4 w-4" /> New deal</Button>}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.map((s) => {
          const col = byStage[s.key] ?? [];
          const colValue = col.reduce((t, d) => t + Number(d.value ?? 0), 0);
          return (
            <div key={s.id} className="w-[248px] shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-semibold">{s.label}</span>
                <span className="text-[10px] text-muted-foreground">{col.length}{colValue ? ` · ${money(colValue, col[0]?.currency ?? 'EUR')}` : ''}</span>
              </div>
              <div className="space-y-2">
                {col.map((d) => (
                  <DealCard
                    key={d.id} ws={ws!} deal={d} stages={stages} wonStage={wonStage} canManage={canManage}
                    onChanged={load}
                    onOpen={() => { if (d.property_id) navigate(`/properties/${d.property_id}`); }}
                  />
                ))}
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
                <button onClick={() => { if (d.property_id) navigate(`/properties/${d.property_id}`); }} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium">{dealLabel(d)}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{d.lost_reason || 'Lost'}</div>
                </button>
                {canManage && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]"
                    onClick={async () => { await dealsService.updateDeal(d.id, { status: 'open' }); load(); }}>
                    <RotateCcw className="h-3.5 w-3.5" /> Reopen
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && ws && (
        <DealDialog ws={ws} type={activeType} stages={stages} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
      )}

      {managingTypes && ws && (
        <DealTypeManager ws={ws} onClose={() => setManagingTypes(false)} onChanged={() => { void reloadTypes(); void load(); }} />
      )}
    </div>
  );
};

const DealCard: React.FC<{
  ws: string; deal: Deal; stages: DealStage[]; wonStage: DealStage | null;
  canManage: boolean; onChanged: () => void; onOpen: () => void;
}> = ({ ws, deal, stages, wonStage, canManage, onChanged, onOpen }) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const guard = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const stageLabel = stages.find((s) => s.key === deal.stage)?.label ?? deal.stage;
  const subtitle = [deal.contact?.name || deal.company?.name, deal.value ? money(deal.value, deal.currency) : '']
    .filter(Boolean).join(' · ');

  return (
    <div className="dashboard-card p-2.5">
      <div className="flex items-start justify-between gap-1">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium hover:underline">{dealLabel(deal)}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle || 'No party linked'}</div>
        </button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditing(true)}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
              {/* Which stage wins is the TYPE's data, not the string 'completed'. */}
              {wonStage && (
                <DropdownMenuItem onClick={() => guard(() => dealsService.moveToStage(deal.id, wonStage))}>
                  <Trophy className="mr-2 h-3.5 w-3.5" /> Mark won
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => guard(() => dealsService.updateDeal(deal.id, { status: 'lost' }))}>
                <XCircle className="mr-2 h-3.5 w-3.5" /> Mark lost
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => guard(() => dealsService.deleteDeal(deal.id))} className="text-red-500">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {canManage ? (
          <Select
            value={deal.stage}
            onValueChange={(v) => {
              const s = stages.find((x) => x.key === v);
              if (s) void guard(() => dealsService.moveToStage(deal.id, s));
            }}
          >
            <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : <Badge className="rounded-full border-0 bg-muted text-[10px]">{stageLabel}</Badge>}
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px]" title="Checklist">
              <ListChecks className="h-3.5 w-3.5" />{deal.task_total ? `${deal.task_done}/${deal.task_total}` : ''}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3"><DealTasks ws={ws} dealId={deal.id} canManage={canManage} onChanged={onChanged} /></PopoverContent>
        </Popover>
      </div>
      {deal.expected_close_date && <div className="mt-1.5 text-[10px] text-muted-foreground">Close ~ {formatDate(deal.expected_close_date)}</div>}
      {editing && <DealDialog ws={ws} deal={deal} stages={stages} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />}
    </div>
  );
};

const DealTasks: React.FC<{ ws: string; dealId: string; canManage: boolean; onChanged: () => void }> = ({ ws, dealId, canManage, onChanged }) => {
  const [tasks, setTasks] = useState<DealTask[] | null>(null);
  const [title, setTitle] = useState('');
  const load = useCallback(async () => { setTasks(await dealsService.listTasks(dealId).catch(() => [])); }, [dealId]);
  useEffect(() => { void load(); }, [load]);
  const add = async () => { if (!title.trim()) return; await dealsService.addTask(ws, dealId, title.trim()); setTitle(''); await load(); onChanged(); };
  const toggle = async (t: DealTask) => { await dealsService.toggleTask(t.id, !t.done); await load(); onChanged(); };
  const del = async (t: DealTask) => { await dealsService.deleteTask(t.id); await load(); onChanged(); };
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold">Checklist</div>
      {tasks === null ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        : tasks.length === 0 ? <div className="text-[11px] text-muted-foreground">No tasks yet.</div>
        : (
          <div className="space-y-1">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Checkbox checked={t.done} onCheckedChange={() => toggle(t)} disabled={!canManage} aria-label={t.title} />
                <span className={`flex-1 text-xs ${t.done ? 'text-muted-foreground line-through' : ''}`}>{t.title}</span>
                {canManage && <button onClick={() => del(t)} aria-label={`Delete ${t.title}`} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3 w-3" /></button>}
              </div>
            ))}
          </div>
        )}
      {canManage && (
        <div className="flex gap-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Add task…" aria-label="New task" className="h-7 text-xs" />
          <Button size="sm" className="h-7 rounded-full px-2" onClick={add} aria-label="Add task"><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
};

interface PropertyOption { id: string; title: string | null; reference_code: string | null }

/**
 * Create or edit a deal. The subject picker is driven by the TYPE's `subject_kind` — a property
 * select for real-estate deals, nothing for a type that has no subject. A tenant-created type
 * defaults to 'none', which is why a user-added tag can never demand a table that does not exist.
 */
const DealDialog: React.FC<{
  ws: string; type?: DealType; deal?: Deal; stages: DealStage[]; onClose: () => void; onSaved: () => void;
}> = ({ ws, type, deal, stages, onClose, onSaved }) => {
  const { toast } = useToast();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [busy, setBusy] = useState(false);
  const subjectKind = type?.subject_kind ?? (deal?.property_id ? 'property' : 'none');
  const [f, setF] = useState<Record<string, any>>(deal
    ? {
        title: deal.title ?? '', property_id: deal.property_id ?? '', contact_id: deal.contact_id ?? '',
        company_id: deal.company_id ?? '', stage: deal.stage, value: deal.value ?? '',
        currency: deal.currency ?? 'EUR', expected_close_date: deal.expected_close_date ?? '',
      }
    : { title: '', currency: 'EUR', stage: stages[0]?.key ?? '', contact_id: '', company_id: '', property_id: '' });

  useEffect(() => {
    if (subjectKind !== 'property') return;
    supabase.from('properties').select('id, title, reference_code').eq('workspace_id', ws).order('title').limit(500)
      .then(({ data }) => setProperties((data ?? []) as PropertyOption[]));
  }, [ws, subjectKind]);

  const save = async () => {
    // A deal is always attached to a party — the DB enforces it too (crm_deals_party_check).
    if (!f.contact_id && !f.company_id) { toast({ title: 'Link a contact or a company', variant: 'destructive' }); return; }
    if (subjectKind === 'property' && !f.property_id && !deal) { toast({ title: 'Pick a property', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const patch = {
        title: f.title?.trim() || null,
        contact_id: f.contact_id || null,
        company_id: f.company_id || null,
        property_id: subjectKind === 'property' ? (f.property_id || null) : null,
        stage: f.stage,
        value: f.value ? Number(f.value) : null,
        currency: f.currency,
        expected_close_date: f.expected_close_date || null,
      };
      if (deal) await dealsService.updateDeal(deal.id, patch);
      else await dealsService.createDeal(ws, { ...patch, deal_type_id: type!.id, stage: f.stage || stages[0]?.key });
      toast({ title: deal ? 'Deal updated' : 'Deal created' });
      onSaved();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{deal ? 'Edit deal' : `New ${type?.label ?? ''} deal`.trim()}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs" htmlFor="deal-title">Title</Label>
            <Input id="deal-title" value={f.title ?? ''} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="What is this deal?" />
          </div>
          {subjectKind === 'property' && (
            <div>
              <Label className="text-xs">Property</Label>
              <Select value={f.property_id} onValueChange={(v) => setF((p) => ({ ...p, property_id: v }))} disabled={!!deal}>
                <SelectTrigger><SelectValue placeholder="Select a listing…" /></SelectTrigger>
                <SelectContent>{properties.map((l) => <SelectItem key={l.id} value={l.id}>{l.title || l.reference_code || 'Listing'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Contact</Label>
            <ContactSearchDropdown selectedContactId={f.contact_id || null} onSelect={(id) => setF((p) => ({ ...p, contact_id: id }))} placeholder="Link a contact…" />
          </div>
          <div>
            <Label className="text-xs">Company</Label>
            <CompanySearchDropdown selectedCompanyId={f.company_id || null} onSelect={(id) => setF((p) => ({ ...p, company_id: id }))} placeholder="Link a company…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" htmlFor="deal-value">Value</Label>
              <Input id="deal-value" type="number" value={f.value ?? ''} onChange={(e) => setF((p) => ({ ...p, value: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs" htmlFor="deal-close">Expected close</Label>
              <Input id="deal-close" type="date" value={f.expected_close_date ?? ''} onChange={(e) => setF((p) => ({ ...p, expected_close_date: e.target.value }))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={busy}>{deal ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
