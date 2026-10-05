import React, { useCallback, useEffect, useRef, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Plus, Loader2, X, ChevronRight, Settings2, ShoppingCart, AlertTriangle, ExternalLink, Image as ImageIcon, CookingPot } from 'lucide-react';
import { projectPlansService } from '@/services/projectPlansService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { inboxApi, type InboxThread, type InboxThreadContext, type OrderIntake, type IntakeItem, type IntakeTotals, type IntakeConfirmation, type IntakeMatchMethod } from '@/services/inboxApi';
import { SectionTitle } from './InboxPrimitives';

export interface KitchenEstimate {
  reference?: string;
  currency?: string;
  subtotal?: number;
  dimensions?: Record<string, number>;
  lines?: { section: string; total: number }[];
  contact?: { name?: string | null; shape?: string | null };
  plan_id?: string | null;
  project_id?: string | null;
}

/**
 * Kitchen estimate — a configuration a visitor built on /tools/kitchen-cost.
 *
 * Same shape as order intake: what sits on the thread is a PROPOSAL, and nothing exists in
 * projects or quotes until a member approves. Approving builds the project plan; turning that
 * into a quote stays a second, deliberate click, because a quote is a priced document and
 * conjuring one behind the operator is exactly what the templates rule forbids.
 */
export const KitchenEstimatePanel: React.FC<{ thread: InboxThread }> = ({ thread }) => {
  const { toast } = useToast();
  const est = (thread.metadata as { kitchen_estimate?: KitchenEstimate } | null)?.kitchen_estimate;
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState<string | null>(est?.plan_id ?? null);
  const [projectId, setProjectId] = useState<string | null>(est?.project_id ?? null);

  if (!est) return null;
  const currency = est.currency || 'EUR';

  const approve = async () => {
    setBusy(true);
    try {
      const res = await projectPlansService.createFromKitchenEstimate(thread.id);
      setPlanId(res.plan_id);
      setProjectId(res.project_id);
      toast({
        title: res.already_exists ? 'Already approved' : 'Project plan created',
        description: 'Open the plan to adjust rates, then create the quote.',
      });
    } catch (e) {
      toast({ title: 'Could not create the plan', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const makeQuote = async () => {
    if (!planId) return;
    setBusy(true);
    try {
      const quoteId = await projectPlansService.createQuote(planId);
      window.location.href = `/quotes/${quoteId}`;
    } catch (e) {
      toast({ title: 'Could not create the quote', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <div className="p-5 border-b border-hairline">
      <SectionTitle icon={<CookingPot className="h-4 w-4" />}>Kitchen estimate</SectionTitle>
      <div className="rounded-sm bg-surface-sunken border border-hairline p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {formatMoney(est.subtotal ?? 0, currency)}
          </span>
          {est.reference && <Badge variant="outline" className="text-[10px]">{est.reference}</Badge>}
        </div>

        {est.dimensions && (
          <div className="text-xs text-muted-foreground">
            {Object.entries(est.dimensions).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}
          </div>
        )}
        {est.contact?.shape && <div className="text-xs text-muted-foreground">{est.contact.shape}</div>}

        {(est.lines ?? []).filter((l) => l.total > 0).map((l) => (
          <div key={l.section} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">{l.section}</span>
            <span className="tabular-nums shrink-0">{formatMoney(l.total, currency)}</span>
          </div>
        ))}

        {planId ? (
          <div className="flex flex-col gap-2 pt-1">
            {projectId && (
              <a href={`/projects/${projectId}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Open the project plan <ChevronRight className="h-3 w-3" />
              </a>
            )}
            <Button size="sm" disabled={busy} onClick={makeQuote}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create quote'}
            </Button>
          </div>
        ) : (
          <Button size="sm" className="w-full mt-1" disabled={busy} onClick={approve}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create project & plan'}
          </Button>
        )}
      </div>
    </div>
  );
};

/** One editable intake line. `line_no === null` marks a line the member added themselves. */
export interface DraftLine {
  key: string;
  line_no: number | null;
  product_id: string | null;
  description: string;
  raw_text: string;
  quantity: string;
  price: string;
  priceTouched: boolean;
  needsReview: boolean;
  matchMethod: IntakeMatchMethod;
}

/**
 * Repoint one line at a different product. Runs the same MIVAA → ilike ladder the extractor used,
 * server-side, so the reviewer picks from the catalog the reading was drawn from rather than a
 * second, differently-behaved search.
 */
export const IntakeProductPicker: React.FC<{
  threadId: string;
  onPick: (hit: { product_id: string; name: string }) => void;
}> = ({ threadId, onPick }) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<{ product_id: string; name: string; score: number | null }>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await inboxApi.searchIntakeProducts(threadId, q);
        if (!cancelled) setHits(res.candidates);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, threadId]);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the catalog…"
        aria-label="Search the catalog for a product"
        className="h-8 text-sm"
      />
      {searching && <div className="text-[11px] text-muted-foreground px-1">Searching…</div>}
      {!searching && query.trim().length >= 2 && hits.length === 0 && (
        <div className="text-[11px] text-muted-foreground px-1">
          Nothing matched. Leave the line as free text — an order can carry one.
        </div>
      )}
      <div className="max-h-56 overflow-y-auto">
        {hits.map((h) => (
          <button
            key={h.product_id}
            type="button"
            onClick={() => onPick(h)}
            className="w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover transition-colors"
          >
            <span className="block truncate">{h.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/** The per-line editor (#342 §4). */
export const IntakeLineEditor: React.FC<{
  threadId: string;
  intake: OrderIntake;
  busy: boolean;
  onSaved: (intake: OrderIntake, totals: IntakeTotals) => void;
  onCancel: () => void;
}> = ({ threadId, intake, busy, onSaved, onCancel }) => {
  const { toast } = useToast();
  const nextKey = useRef(0);
  const makeKey = () => `l${nextKey.current++}`;

  const [draft, setDraft] = useState<DraftLine[]>(() =>
    intake.items.map((it) => ({
      key: makeKey(),
      line_no: it.line_no,
      product_id: it.product_id,
      description: it.description,
      raw_text: it.raw_text,
      quantity: String(it.quantity),
      price: it.unit_price == null ? '' : String(it.unit_price),
      priceTouched: false,
      needsReview: it.needs_review,
      matchMethod: it.match_method,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const patch = (key: string, changes: Partial<DraftLine>) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  const addLine = () =>
    setDraft((rows) => [...rows, {
      key: makeKey(), line_no: null, product_id: null, description: '', raw_text: '',
      quantity: '1', price: '', priceTouched: false, needsReview: true, matchMethod: 'manual',
    }]);

  const displayTotal = draft.reduce((sum, r) => {
    const q = Number(r.quantity);
    const p = Number(r.price);
    return sum + (Number.isFinite(q) && Number.isFinite(p) && r.price !== '' ? q * p : 0);
  }, 0);

  const save = async () => {
    if (draft.length === 0) {
      toast({
        title: 'An order needs at least one line',
        description: 'Dismiss the whole thing instead if nothing here is real.',
        variant: 'destructive',
      });
      return;
    }
    for (const [i, r] of draft.entries()) {
      const q = Number(r.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        toast({ title: `Line ${i + 1} needs a quantity`, description: 'A quantity must be a positive number.', variant: 'destructive' });
        return;
      }
      if (!r.product_id && !r.description.trim()) {
        toast({ title: `Line ${i + 1} needs a description`, description: 'Pick a product, or say what it is in words.', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const items = draft.map((r) => ({
        ...(r.line_no === null ? {} : { line_no: r.line_no }),
        product_id: r.product_id,
        description: r.description.trim(),
        raw_text: r.raw_text,
        quantity: Number(r.quantity),
        // Touched only. An untouched field means "whatever the resolver said", not "this number".
        ...(r.priceTouched ? { unit_price: r.price.trim() === '' ? null : Number(r.price) } : {}),
      }));
      const res = await inboxApi.updateIntakeItems(threadId, items);
      onSaved(res.intake, res.totals);
      toast({ title: 'Lines saved', description: 'Prices were re-checked for anything you repointed.' });
    } catch (e) {
      toast({ title: 'Could not save the lines', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-2 mb-3">
        {draft.map((r, i) => (
          <div key={r.key} className="rounded-sm border border-hairline p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={r.quantity}
                onChange={(e) => patch(r.key, { quantity: e.target.value })}
                inputMode="decimal"
                aria-label={`Quantity for line ${i + 1}`}
                className="h-8 w-14 text-sm text-right tabular-nums px-1.5"
              />
              <Popover open={openPicker === r.key} onOpenChange={(o) => setOpenPicker(o ? r.key : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left text-sm h-8 px-2 rounded-sm border border-hairline hover:bg-surface-hover transition-colors"
                  >
                    <span className="block truncate">
                      {r.description || <span className="text-muted-foreground">Pick a product…</span>}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <IntakeProductPicker
                    threadId={threadId}
                    onPick={(hit) => {
                      // Repointing clears any manual price: the whole reason to repoint is to get
                      // THIS product's price for THIS customer, which only the resolver knows.
                      patch(r.key, {
                        product_id: hit.product_id,
                        description: hit.name,
                        price: '',
                        priceTouched: false,
                        matchMethod: 'manual',
                        needsReview: false,
                      });
                      setOpenPicker(null);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => setDraft((rows) => rows.filter((x) => x.key !== r.key))}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                value={r.price}
                onChange={(e) => patch(r.key, { price: e.target.value, priceTouched: true })}
                inputMode="decimal"
                placeholder="unit price"
                aria-label={`Unit price for line ${i + 1}`}
                className="h-7 w-24 text-xs text-right tabular-nums px-1.5"
              />
              <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                {r.priceTouched
                  ? 'your price'
                  : r.price === ''
                    ? 'no price yet — the resolver will try'
                    : r.raw_text || 'from the price list'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" className="w-full mb-3" onClick={addLine} disabled={saving}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a line
      </Button>

      <div className="flex items-center justify-between text-sm border-t border-hairline pt-2.5 mb-3">
        <span className="text-muted-foreground">Total (excl. VAT)</span>
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatMoney(displayTotal, intake.currency)}
        </span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={saving || busy} onClick={save}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save lines'}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
};

/**
 * Order intake (#342) — the "assign / set as an actual order" surface.
 *
 * Deliberately small: fix the customer, fix the lines, approve. It is NOT a second order editor —
 * per-line supplier, warehouse, customs, discounts and dispatch all already live on the real
 * order, and the panel links there the moment one exists.
 */
export const OrderIntakePanel: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  onChanged: () => void;
}> = ({ thread, context, onChanged }) => {
  const { toast } = useToast();
  const [intake, setIntake] = useState<OrderIntake | null>(null);
  const [totals, setTotals] = useState<IntakeTotals | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inboxApi.getThreadIntake(thread.id);
      setIntake(res.intake);
      setTotals(res.totals);
      setCanApprove(res.can_approve);
    } catch {
      setIntake(null);
    } finally {
      setLoading(false);
    }
  }, [thread.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !intake) return null;

  const needsCustomer = !intake.customer_contact_id && !intake.customer_company_id;
  const reviewCount = intake.items.filter((i) => i.needs_review).length;

  const assignThreadContact = async () => {
    if (!context?.contact?.id) return;
    setBusy(true);
    try {
      const res = await inboxApi.updateIntake(thread.id, { customer_contact_id: context.contact.id });
      setIntake(res.intake);
      setTotals(res.totals);
      // Prices are re-resolved server-side against the newly assigned customer, so the numbers
      // shown after this are that customer's, not the ones read before anyone was assigned.
      toast({ title: 'Customer assigned', description: 'Line prices were re-checked for this customer.' });
    } catch (e) {
      toast({ title: 'Could not assign', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      const res = await inboxApi.approveIntake(thread.id);
      await load();
      onChanged();
      // The confirmation is REPORTED, never assumed. An order the customer was never told about
      // is the failure this whole path exists to make visible (#342 §4a).
      const c: IntakeConfirmation = res.confirmation;
      if (c?.status === 'sent') {
        toast({
          title: `Order ${res.order_number ?? ''} created`.trim(),
          description: 'The customer has been sent a confirmation.',
        });
      } else {
        toast({
          title: `Order ${res.order_number ?? ''} created — customer NOT notified`.trim(),
          description: c?.detail || 'The confirmation could not be delivered. Reply on the thread to tell them.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Could not approve', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await inboxApi.rejectIntake(thread.id);
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'Could not dismiss', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 border-b border-hairline">
      <SectionTitle icon={<ShoppingCart className="h-4 w-4" />} count={intake.items.length}>
        {intake.status === 'approved' ? 'Order created' : intake.status === 'rejected' ? 'Order dismissed' : 'Order to approve'}
      </SectionTitle>

      {intake.status === 'approved' && intake.order_id ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            This conversation became a pre-order. Confirm it, price the rest and dispatch from Finance.
          </p>
          {intake.confirmation && intake.confirmation.status !== 'sent' && (
            <div className="flex items-start gap-2 text-xs text-destructive mb-3">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>The customer was not notified. {intake.confirmation.detail}</span>
            </div>
          )}
          <a
            href={`/finance/orders/${intake.order_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Open in Finance <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </>
      ) : intake.status === 'rejected' ? (
        <p className="text-xs text-muted-foreground">
          Dismissed. A new message from this customer starts a fresh reading.
        </p>
      ) : editing ? (
        <IntakeLineEditor
          threadId={thread.id}
          intake={intake}
          busy={busy}
          onSaved={(next, nextTotals) => { setIntake(next); setTotals(nextTotals); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {intake.items.map((it: IntakeItem) => (
              <div key={it.line_no} className="flex items-start gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                <span className="text-muted-foreground shrink-0 tabular-nums">{it.quantity}×</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{it.description}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {it.match_method === 'visual' && <ImageIcon className="w-3 h-3" />}
                    {it.needs_review
                      ? <span className="text-warning">{it.unit_price == null ? 'needs a price' : 'check this match'}</span>
                      : <span className="truncate">{it.raw_text}</span>}
                  </div>
                </div>
                <span className="text-xs shrink-0 tabular-nums">
                  {it.unit_price == null ? '—' : formatMoney(it.quantity * it.unit_price, intake.currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm border-t border-hairline pt-2.5 mb-3">
            <span className="text-muted-foreground">Total (excl. VAT)</span>
            <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatMoney(totals?.net ?? 0, intake.currency)}</span>
          </div>

          {reviewCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-warning mb-3">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {reviewCount} line{reviewCount === 1 ? '' : 's'} need a look before this is right.
                Fix {reviewCount === 1 ? 'it' : 'them'} below rather than dismissing the rest.
              </span>
            </div>
          )}

          <Button size="sm" variant="outline" className="w-full mb-3" disabled={busy} onClick={() => setEditing(true)}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Edit lines
          </Button>

          {needsCustomer && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">
                Assign a customer before approving — the price depends on who is buying.
              </p>
              {context?.contact?.id && (
                <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={assignThreadContact}>
                  Use {context.contact.name || 'this contact'}
                </Button>
              )}
            </div>
          )}

          {canApprove && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy || needsCustomer}
                onClick={approve}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve as pre-order'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={reject}>
                Dismiss
              </Button>
            </div>
          )}
          {!canApprove && (
            <p className="text-[11px] text-muted-foreground">
              An owner, admin or sales manager approves orders.
            </p>
          )}
        </>
      )}
    </div>
  );
};
