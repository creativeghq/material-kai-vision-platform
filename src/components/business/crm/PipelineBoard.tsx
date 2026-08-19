/**
 * Deal pipeline board (#311) — one board for every deal type.
 *
 * Lifted out of Real Estate, which was only ever its first consumer. The stage columns come from
 * `crm_deal_stages` for the SELECTED TYPE, never from a constant in this file: the property stage
 * set ends `conveyancing → exchanged → completed`, and a construction deal must never land in one
 * of those. The database enforces the pairing (composite FK on `(deal_type_id, stage)`), so a bug
 * here fails loudly instead of writing a nonsense stage.
 *
 * A deal moves stage by DRAG, by the per-card <Select>, or from the drawer. All three go through
 * `dealsService.moveToStage`, so a winning stage wins the deal whichever route was taken. The
 * Select is not a leftover: drag-and-drop is unusable with a keyboard or a screen reader, and on a
 * touch device a horizontal board that also drags horizontally fights the user's scroll.
 *
 * `lockedTypeKey` pins the board to one type and hides the type switcher; Real Estate passes
 * 'real_estate' so its tab is unchanged, while /crm shows all types with the switcher.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  BarChart3,
  ExternalLink,
  GripVertical,
  ListChecks,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';

import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { Checkbox } from '@/components/core/ui/checkbox';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { CompanySearchDropdown } from '@/components/business/crm/CompanySearchDropdown';
import { DealDrawer } from '@/components/business/crm/DealDrawer';
import { dealsService, getDealForecast, getDealStageTotals, type Deal, type DealForecastRow, type DealStage, type DealStageTotalRow, type DealTask, type DealType } from '@/services/dealsService';
import { DealTypeManager } from '@/components/business/crm/DealTypeManager';

const money = (n: number | null, ccy: string) => formatMoney(n, ccy || 'EUR', { decimals: 0, fallback: '' });

/** How many properties/projects the deal subject picker offers. One extra row is fetched so a
 *  truncated list can SAY it is truncated rather than just being short. */
const SUBJECT_LIMIT = 500;

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
  /** Route to the analytics view for this pipeline. Omitted where there is nowhere to go. */
  analyticsHref?: string;
}

export const PipelineBoard: React.FC<Props> = ({ ws, canManage, lockedTypeKey, canManageTypes, analyticsHref }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [types, setTypes] = useState<DealType[] | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [forecast, setForecast] = useState<DealForecastRow[]>([]);
  const [stageTotals, setStageTotals] = useState<DealStageTotalRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [managingTypes, setManagingTypes] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [drawerDealId, setDrawerDealId] = useState<string | null>(null);
  const [editingDealId, setEditingDealId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const activeType = useMemo(() => types?.find((t) => t.id === typeId) ?? null, [types, typeId]);

  /**
   * The full record page for a deal — team, tasks, documents, the lot.
   *
   * The drawer is the quick look; this is the record. Both exist and both are unconditional:
   * the card's open handler must never be `if (deal.property_id) navigate(…)`, which is what it
   * once was and which left every non-property deal with a title that looked clickable and did
   * nothing. Guarded by tests/unit/dealPipelineDerivation.test.ts.
   */
  const openDealPage = useCallback((d: Deal) => navigate(`/crm/deals/${d.id}`), [navigate]);

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
    const [s, d, f, t] = await Promise.all([
      dealsService.listStages(typeId).catch(() => [] as DealStage[]),
      dealsService.listDeals(ws, typeId).catch(() => [] as Deal[]),
      getDealForecast(ws, typeId).catch(() => [] as DealForecastRow[]),
      getDealStageTotals(ws, typeId).catch(() => [] as DealStageTotalRow[]),
    ]);
    setStages(s);
    setDeals(d);
    setForecast(f);
    setStageTotals(t);
  }, [ws, typeId]);

  useEffect(() => { setDeals(null); void load(); }, [load]);

  const open = useMemo(() => (deals ?? []).filter((d) => d.status !== 'lost'), [deals]);
  const lost = useMemo(() => (deals ?? []).filter((d) => d.status === 'lost'), [deals]);

  const byStage = useMemo(() => {
    const m: Record<string, Deal[]> = {};
    for (const s of stages) m[s.key] = [];
    for (const d of open) (m[d.stage] ??= []).push(d);
    return m;
  }, [open, stages]);

  const wonStage = stages.find((s) => s.is_won) ?? null;
  const drawerDeal = useMemo(() => (deals ?? []).find((d) => d.id === drawerDealId) ?? null, [deals, drawerDealId]);
  const editingDeal = useMemo(() => (deals ?? []).find((d) => d.id === editingDealId) ?? null, [deals, editingDealId]);
  const draggingDeal = useMemo(() => (deals ?? []).find((d) => d.id === draggingId) ?? null, [deals, draggingId]);

  // Column money, DERIVED in SQL by get_deal_stage_totals and only formatted here — one row per
  // (stage, currency), because adding EUR to USD makes a number that is true of nothing.
  const totalsByStage = new Map<string, DealStageTotalRow[]>();
  for (const t of stageTotals) {
    const list = totalsByStage.get(t.stage) ?? [];
    list.push(t);
    totalsByStage.set(t.stage, list);
  }

  // A drag must not fire on a click. Without the distance constraint every attempt to OPEN a card
  // starts a drag instead, and the card becomes unclickable. 6px is below the threshold of an
  // intentional grab and above the wobble of a normal click.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const onDragEnd = async (evt: DragEndEvent) => {
    setDraggingId(null);
    const dealId = String(evt.active.id);
    const toStageKey = evt.over ? String(evt.over.id) : null;
    if (!toStageKey) return;

    const deal = (deals ?? []).find((d) => d.id === dealId);
    const stage = stages.find((s) => s.key === toStageKey);
    if (!deal || !stage || deal.stage === stage.key) return;

    // Optimistic. A board that waits for the round trip snaps the card back to the old column for
    // as long as the request takes, which reads as "the drop did not work" and gets retried.
    const previous = deals;
    setDeals((rows) => (rows ?? []).map((d) => (d.id === dealId ? { ...d, stage: stage.key } : d)));
    try {
      await dealsService.moveToStage(dealId, stage);
      await load();
    } catch (e) {
      setDeals(previous);
      toast({ title: 'Could not move the deal', description: (e as Error).message, variant: 'destructive' });
    }
  };

  if (types === null || (deals === null && typeId)) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!typeId || !activeType) {
    return (
      <HubEmptyState
        icon={Settings2}
        title="No deal types configured"
        description="A pipeline needs a deal type to define its stages — sales, real estate, construction. Add one and its board appears here."
        action={canManageTypes ? <Button size="sm" onClick={() => setManagingTypes(true)}><Plus /> Add a deal type</Button> : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
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
          {/* Weighted pipeline, DERIVED in SQL by get_deal_forecast and only formatted here.
              One row per currency: adding EUR to GBP would be a made-up number. */}
          {forecast.map((f) => (
            <div key={f.currency} className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{money(f.weighted_value, f.currency)}</span> weighted
              <span className="opacity-70"> of {money(f.open_value, f.currency)} · avg {f.avg_probability}%</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {analyticsHref && (
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate(analyticsHref)}>
              <BarChart3 /> Analytics
            </Button>
          )}
          {canManageTypes && !lockedTypeKey && (
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setManagingTypes(true)}>
              <Settings2 /> Types
            </Button>
          )}
          {canManage && <Button size="sm" onClick={() => setCreating(true)}><Plus /> New deal</Button>}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        // pointerWithin, not the default rectIntersection: the columns are tall and adjacent, so
        // rectangle overlap resolves to whichever column the CARD overlaps most — which is often
        // not the one under the cursor. Deals then land one column away from where they were
        // dropped, which is worse than a drop that fails.
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setDraggingId(String(e.active.id))}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {stages.map((s) => (
            <StageColumn
              key={s.id}
              stage={s}
              deals={byStage[s.key] ?? []}
              totals={(totalsByStage.get(s.key) ?? []).filter((t) => Number(t.total_value) > 0)}
              canManage={canManage}
              isDragging={draggingId !== null}
              ws={ws!}
              stages={stages}
              wonStage={wonStage}
              onChanged={load}
              onOpen={(id) => setDrawerDealId(id)}
              onEdit={(id) => setEditingDealId(id)}
              onOpenPage={openDealPage}
            />
          ))}
        </div>

        {/* The card follows the cursor at full size. Without an overlay the original stays put and
            only a translucent ghost moves, so on a crowded board it is genuinely unclear what is
            being dragged. */}
        <DragOverlay dropAnimation={null}>
          {draggingDeal && (
            <div className="w-[248px] rotate-1 rounded-md border border-primary bg-card p-2.5 shadow-overlay">
              <div className="truncate text-sm font-semibold">{dealLabel(draggingDeal)}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {draggingDeal.value ? money(draggingDeal.value, draggingDeal.currency) : 'No value'}
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showLost && lost.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-muted-foreground">Lost</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lost.map((d) => (
              <div key={d.id} className="dashboard-card flex items-center gap-2 p-2.5 opacity-70">
                <button onClick={() => setDrawerDealId(d.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-semibold">{dealLabel(d)}</div>
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
        <DealDialog
          ws={ws}
          types={types}
          defaultTypeId={typeId}
          lockedTypeKey={lockedTypeKey}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}

      {editingDeal && ws && (
        <DealDialog
          ws={ws}
          types={types}
          deal={editingDeal}
          defaultTypeId={editingDeal.deal_type_id}
          lockedTypeKey={lockedTypeKey}
          onClose={() => setEditingDealId(null)}
          onSaved={() => { setEditingDealId(null); load(); }}
        />
      )}

      {drawerDeal && ws && (
        <DealDrawer
          deal={drawerDeal}
          stages={stages}
          canManage={canManage}
          onClose={() => setDrawerDealId(null)}
          onChanged={load}
          onEdit={() => { setEditingDealId(drawerDeal.id); setDrawerDealId(null); }}
        />
      )}

      {managingTypes && ws && (
        <DealTypeManager ws={ws} onClose={() => setManagingTypes(false)} onChanged={() => { void reloadTypes(); void load(); }} />
      )}
    </div>
  );
};

// ── Column ────────────────────────────────────────────────────────────────────────────────────

const StageColumn: React.FC<{
  stage: DealStage;
  deals: Deal[];
  totals: DealStageTotalRow[];
  canManage: boolean;
  isDragging: boolean;
  ws: string;
  stages: DealStage[];
  wonStage: DealStage | null;
  onChanged: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenPage: (deal: Deal) => void;
}> = ({ stage, deals, totals, canManage, isDragging, ws, stages, wonStage, onChanged, onOpen, onEdit, onOpenPage }) => {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !canManage });

  return (
    <div className="w-[248px] shrink-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <span className="text-xs font-semibold">{stage.label}</span>
        <span className="text-right text-[10px] text-muted-foreground">
          {deals.length}
          {totals.map((t) => <span key={t.currency}> · {money(Number(t.total_value), t.currency)}</span>)}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={[
          'min-h-[80px] space-y-2 rounded-md p-1 transition-colors',
          // The drop target is only outlined WHILE a drag is happening. A board that shows dashed
          // outlines at rest looks like it is waiting for something to be fixed.
          isOver ? 'bg-primary/[0.08] outline outline-2 outline-primary' : isDragging ? 'outline-dashed outline-1 outline-hairline' : '',
        ].join(' ')}
      >
        {deals.map((d) => (
          <DealCard
            key={d.id} ws={ws} deal={d} stages={stages} wonStage={wonStage} canManage={canManage}
            onChanged={onChanged}
            onOpen={() => onOpen(d.id)}
            onEdit={() => onEdit(d.id)}
            onOpenPage={() => onOpenPage(d)}
          />
        ))}
        {deals.length === 0 && !isDragging && (
          <div className="rounded-md border border-dashed border-hairline py-6 text-center text-[11px] text-muted-foreground">—</div>
        )}
      </div>
    </div>
  );
};

// ── Card ──────────────────────────────────────────────────────────────────────────────────────

const DealCard: React.FC<{
  ws: string; deal: Deal; stages: DealStage[]; wonStage: DealStage | null;
  canManage: boolean; onChanged: () => void; onOpen: () => void; onEdit: () => void; onOpenPage: () => void;
}> = ({ ws, deal, stages, wonStage, canManage, onChanged, onOpen, onEdit, onOpenPage }) => {
  const { toast } = useToast();
  const [losing, setLosing] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, disabled: !canManage });

  const guard = async (fn: () => Promise<unknown>) => {
    try { await fn(); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const stageLabel = stages.find((s) => s.key === deal.stage)?.label ?? deal.stage;
  const subtitle = [deal.contact?.name || deal.company?.name, deal.value ? money(deal.value, deal.currency) : '']
    .filter(Boolean).join(' · ');

  return (
    <div ref={setNodeRef} className={`dashboard-card p-2.5 ${isDragging ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        {/* The grip is the ONLY drag handle. Making the whole card draggable means every attempt
            to select the title text or press a control inside it starts a drag instead. */}
        {canManage && (
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label={`Drag ${dealLabel(deal)} to another stage`}
            {...listeners}
            {...attributes}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-semibold hover:underline">{dealLabel(deal)}</div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{subtitle || 'No party linked'}</div>
        </button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-6 w-6 p-0"><MoreVertical className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onOpenPage}><ExternalLink className="mr-2 h-3.5 w-3.5" /> Open deal page</DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}><Pencil className="mr-2 h-3.5 w-3.5" /> Edit</DropdownMenuItem>
              {/* Which stage wins is the TYPE's data, not the string 'completed'. */}
              {wonStage && (
                <DropdownMenuItem onClick={() => guard(() => dealsService.moveToStage(deal.id, wonStage))}>
                  <Trophy className="mr-2 h-3.5 w-3.5" /> Mark won
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setLosing(true)}>
                <XCircle className="mr-2 h-3.5 w-3.5" /> Mark lost
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => guard(() => dealsService.deleteDeal(deal.id))} className="text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        {canManage ? (
          /* Kept alongside the drag: this is the keyboard and screen-reader path to the same
             move, and on a phone it is the only one that does not fight the board's own
             horizontal scroll. */
          <Select
            value={deal.stage}
            onValueChange={(v) => {
              const s = stages.find((x) => x.key === v);
              if (s) void guard(() => dealsService.moveToStage(deal.id, s));
            }}
          >
            <SelectTrigger className="h-7 flex-1 text-xs" aria-label="Move to stage"><SelectValue /></SelectTrigger>
            <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
          </Select>
        ) : <Badge variant="neutral">{stageLabel}</Badge>}
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
      {losing && (
        <LostDialog
          onClose={() => setLosing(false)}
          onConfirm={(reason) => { setLosing(false); void guard(() => dealsService.markLost(deal.id, reason)); }}
        />
      )}
    </div>
  );
};

/** Why a deal was lost is the only thing a lost deal is worth reading later, and the board
 *  rendered `lost_reason` from the first day while nothing ever wrote it. */
const LostDialog: React.FC<{ onClose: () => void; onConfirm: (reason: string | null) => void }> = ({ onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Mark this deal lost</DialogTitle></DialogHeader>
        <div>
          <Label className="text-xs" htmlFor="lost-reason">Reason</Label>
          <Input
            id="lost-reason" value={reason} autoFocus
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(reason.trim() || null); }}
            placeholder="Price, timing, went elsewhere…"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onConfirm(reason.trim() || null)}>Mark lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
                {canManage && <button onClick={() => del(t)} aria-label={`Delete ${t.title}`} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>}
              </div>
            ))}
          </div>
        )}
      {canManage && (
        <div className="flex gap-1.5">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} placeholder="Add task…" aria-label="New task" className="h-7 text-xs" />
          <Button size="sm" className="h-7 px-2" onClick={add} aria-label="Add task"><Plus className="h-3.5 w-3.5" /></Button>
        </div>
      )}
    </div>
  );
};

interface SubjectOption { id: string; label: string }

/**
 * Create or edit a deal.
 *
 * ── Type comes FIRST ────────────────────────────────────────────────────────────────────────
 * The dialog used to inherit its type silently from whichever board tab happened to be selected,
 * and open straight onto a "Property" picker. From inside the dialog there was no way to see what
 * kind of deal was being created, and no way to change it — so picking a property was the first
 * question asked about a deal whose type nobody had been asked about.
 *
 * Type is now the first field, and everything downstream follows from it: the stage list, and
 * whether the subject picker offers properties, projects or nothing at all. Changing it resets
 * both, which is not a nicety — `crm_deals` has a composite FK on `(deal_type_id, stage)`, so
 * carrying the old stage across would be rejected by the database, and carrying the old
 * property_id across would attach a listing to a construction deal.
 *
 * On an EDIT the type is fixed and shown read-only. Retyping a live deal would have to move it to
 * a stage in the new type's set and silently drop its subject; that is a different operation from
 * editing, and doing it behind an innocuous-looking dropdown is how a deal loses its history.
 */
const DealDialog: React.FC<{
  ws: string;
  types: DealType[];
  deal?: Deal;
  /** Which type the dialog opens on — the board's current tab, or the deal's own type. */
  defaultTypeId: string | null;
  lockedTypeKey?: string;
  onClose: () => void;
  onSaved: () => void;
}> = ({ ws, types, deal, defaultTypeId, lockedTypeKey, onClose, onSaved }) => {
  const { toast } = useToast();
  const isEdit = !!deal;

  const [typeId, setTypeId] = useState<string>(deal?.deal_type_id ?? defaultTypeId ?? types[0]?.id ?? '');
  const type = useMemo(() => types.find((t) => t.id === typeId) ?? null, [types, typeId]);
  const subjectKind = type?.subject_kind ?? 'none';

  const [stages, setStages] = useState<DealStage[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [subjectsTruncated, setSubjectsTruncated] = useState(false);
  const [busy, setBusy] = useState(false);

  const [f, setF] = useState<Record<string, any>>(deal
    ? {
        title: deal.title ?? '', property_id: deal.property_id ?? '', project_id: deal.project_id ?? '',
        contact_id: deal.contact_id ?? '', company_id: deal.company_id ?? '', stage: deal.stage,
        value: deal.value ?? '', currency: deal.currency ?? 'EUR',
        expected_close_date: deal.expected_close_date ?? '',
        probability: deal.probability ?? '', notes: deal.notes ?? '',
      }
    : { title: '', currency: 'EUR', stage: '', contact_id: '', company_id: '',
        property_id: '', project_id: '', probability: '', notes: '' });

  // Stages follow the SELECTED type, not the board's. Reloading them here is what makes the type
  // field real: without it the dialog would offer the old type's stages and the insert would be
  // refused by the composite FK.
  useEffect(() => {
    if (!typeId) { setStages([]); setStagesLoading(false); return; }
    let cancelled = false;
    setStagesLoading(true);
    dealsService.listStages(typeId)
      .then((s) => {
        if (cancelled) return;
        setStages(s);
        setF((p) => ({
          ...p,
          // Keep the stage only if the new type actually has it. On a create that is almost never
          // true, so this lands on the new type's first stage.
          stage: s.some((x) => x.key === p.stage) ? p.stage : (s[0]?.key ?? ''),
        }));
      })
      .catch(() => { if (!cancelled) setStages([]); })
      .finally(() => { if (!cancelled) setStagesLoading(false); });
    return () => { cancelled = true; };
  }, [typeId]);

  // The subject list follows the TYPE. A 'project' type had no picker at all, so a Project deal
  // could never actually link its project — the column was reachable only from SQL.
  useEffect(() => {
    if (subjectKind === 'none') { setSubjects([]); setSubjectError(null); setSubjectsTruncated(false); return; }
    let cancelled = false;
    const q = subjectKind === 'property'
      ? supabase.from('properties').select('id, title, reference_code').eq('workspace_id', ws).order('title').limit(SUBJECT_LIMIT + 1)
      : supabase.from('projects').select('id, name').eq('workspace_id', ws).order('name').limit(SUBJECT_LIMIT + 1);
    // `.then(({ data }) => …)` — the swallowed-error signature. A failed load rendered as "no
    // properties/projects", which reads as an empty workspace rather than a broken query, and
    // past the cap the list was silently short (#366 BU-6). Say both out loud.
    q.then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setSubjectError(error.message); setSubjects([]); setSubjectsTruncated(false); return; }
      const rows = (data ?? []) as any[];
      setSubjectError(null);
      setSubjectsTruncated(rows.length > SUBJECT_LIMIT);
      setSubjects(rows.slice(0, SUBJECT_LIMIT).map((r) => ({
        id: r.id, label: r.title || r.name || r.reference_code || 'Untitled',
      })));
    });
    return () => { cancelled = true; };
  }, [ws, subjectKind]);

  /** Switching type invalidates both downstream answers — see the header comment. */
  const changeType = (next: string) => {
    setTypeId(next);
    setF((p) => ({ ...p, property_id: '', project_id: '' }));
  };

  const save = async () => {
    if (!type) { toast({ title: 'Pick a deal type', variant: 'destructive' }); return; }
    // A deal is always attached to a party — the DB enforces it too (crm_deals_party_check).
    if (!f.contact_id && !f.company_id) { toast({ title: 'Link a contact or a company', variant: 'destructive' }); return; }
    if (subjectKind !== 'none' && !deal && !(subjectKind === 'property' ? f.property_id : f.project_id)) {
      toast({ title: subjectKind === 'property' ? 'Pick a property' : 'Pick a project', variant: 'destructive' });
      return;
    }
    setBusy(true);
    try {
      const patch = {
        title: f.title?.trim() || null,
        contact_id: f.contact_id || null,
        company_id: f.company_id || null,
        property_id: subjectKind === 'property' ? (f.property_id || null) : null,
        project_id: subjectKind === 'project' ? (f.project_id || null) : null,
        stage: f.stage,
        value: f.value ? Number(f.value) : null,
        currency: f.currency,
        probability: f.probability === '' || f.probability === null ? null : Number(f.probability),
        notes: f.notes?.trim() || null,
        expected_close_date: f.expected_close_date || null,
      };
      if (deal) await dealsService.updateDeal(deal.id, patch);
      else await dealsService.createDeal(ws, { ...patch, deal_type_id: type.id, stage: f.stage || stages[0]?.key });
      toast({ title: deal ? 'Deal updated' : 'Deal created' });
      onSaved();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const subjectLabel = subjectKind === 'property' ? 'Property' : 'Project';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-3rem)] max-w-md overflow-y-auto">
        <DialogHeader><DialogTitle>{deal ? 'Edit deal' : 'New deal'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {/* 1. TYPE — first, because the stage list and the subject picker below both depend on it. */}
          <div>
            <Label className="text-xs" htmlFor="deal-type">Deal type</Label>
            {isEdit || lockedTypeKey || types.length === 1 ? (
              <div className="flex h-9 items-center rounded-sm border border-hairline bg-surface-sunken px-2.5 text-sm">
                {type?.label ?? '—'}
                {isEdit && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    Fixed after creation
                  </span>
                )}
              </div>
            ) : (
              <Select value={typeId} onValueChange={changeType}>
                <SelectTrigger id="deal-type"><SelectValue placeholder="What kind of deal is this?" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 2. SUBJECT — what this deal is ABOUT, offered only for a type that has one. */}
          {subjectKind !== 'none' && (
            <div>
              <Label className="text-xs">{subjectLabel}</Label>
              <Select
                value={(subjectKind === 'property' ? f.property_id : f.project_id) || undefined}
                onValueChange={(v) => setF((p) => ({ ...p, [subjectKind === 'property' ? 'property_id' : 'project_id']: v }))}
                disabled={!!deal}
              >
                <SelectTrigger><SelectValue placeholder={subjectKind === 'property' ? 'Select a listing…' : 'Select a project…'} /></SelectTrigger>
                <SelectContent>{subjects.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
              {/* An empty picker used to mean either "none exist" or "the query failed" with no way
                  to tell them apart, and a full one gave no hint that it stopped at the cap. */}
              {subjectError && <p className="mt-1 text-[11px] text-destructive">Could not load the list: {subjectError}</p>}
              {subjectsTruncated && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Showing the first {SUBJECT_LIMIT} — there are more than this in the workspace.
                </p>
              )}
              {!subjectError && subjects.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  This workspace has no {subjectLabel.toLowerCase()}s yet.
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs" htmlFor="deal-stage">Stage</Label>
            <Select value={f.stage || undefined} onValueChange={(v) => setF((p) => ({ ...p, stage: v }))} disabled={stagesLoading || !stages.length}>
              <SelectTrigger id="deal-stage"><SelectValue placeholder={stagesLoading ? 'Loading…' : 'Pick a stage'} /></SelectTrigger>
              <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs" htmlFor="deal-title">Title</Label>
            <Input id="deal-title" value={f.title ?? ''} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} placeholder="What is this deal?" />
          </div>

          {/* 3. PARTY — `allowCreate` lets a brand-new customer be added without abandoning the
                 deal. It is reachable only from a search that found nothing, which is how the
                 duplicate check stays mandatory. */}
          <div>
            <Label className="text-xs">Contact</Label>
            <ContactSearchDropdown
              selectedContactId={f.contact_id || null}
              onSelect={(id) => setF((p) => ({ ...p, contact_id: id }))}
              placeholder="Link a contact…"
              allowCreate
            />
          </div>
          <div>
            <Label className="text-xs">Company</Label>
            <CompanySearchDropdown
              selectedCompanyId={f.company_id || null}
              onSelect={(id) => setF((p) => ({ ...p, company_id: id }))}
              placeholder="Link a company…"
              allowCreate
            />
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
          <div>
            <Label className="text-xs" htmlFor="deal-probability">Probability %</Label>
            <Input
              id="deal-probability" type="number" min={0} max={100} value={f.probability ?? ''}
              onChange={(e) => setF((p) => ({ ...p, probability: e.target.value }))}
              placeholder="Feeds the weighted forecast"
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor="deal-notes">Notes</Label>
            <Textarea id="deal-notes" rows={3} value={f.notes ?? ''} onChange={(e) => setF((p) => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || stagesLoading}>{deal ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
