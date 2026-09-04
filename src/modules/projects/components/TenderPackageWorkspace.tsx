/**
 * The working surfaces of a tender package: what is being priced, who was asked, and what they
 * came back with.
 *
 * These existed only in the service until now. The comparison table could be rendered but a
 * package could never be filled, nobody could be invited and no rate could be entered — so the
 * whole feature was a screen that could only ever show an empty package. Unreachable work is the
 * failure this codebase guards against everywhere else, and it is the one I walked into here.
 *
 * ITEMS come from the priced schedule wherever possible, carrying description, unit, quantity and
 * cost code but NEVER our rate: sending our own price out with the enquiry answers the question
 * the tender exists to ask.
 *
 * RATES are typed per bidder against frozen quantities. Marking a bid received and stamping its
 * date happen in one write, because the database refuses one without the other.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, Trash2, UserPlus, Download, Check, ListOrdered, Users, Send,
  AlertTriangle, Copy, Scale,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney } from '@/utils/decimal';
import { UNITS } from '@/lib/units';
import {
  tendersService, isBidComparable,
  type PackageItem, type TenderBid, type BidAnalysisRow, type BidSummaryRow,
} from '../services/tendersService';
import { bidClarifications, clarificationsAsText } from '../lib/bidClarifications';
import { schedulesService } from '../services/schedulesService';

const n = (v: number | string | null | undefined) => Number(v ?? 0);

interface Props {
  projectId: string;
  workspaceId: string;
  packageId: string;
  currency: string;
  /** Awarded packages are read-only: the subcontract is let. */
  locked: boolean;
  onChanged: () => void;
}

export const TenderPackageWorkspace: React.FC<Props> = ({
  projectId, workspaceId, packageId, currency, locked, onChanged,
}) => {
  const { toast } = useToast();
  const [items, setItems] = useState<PackageItem[]>([]);
  const [bids, setBids] = useState<TenderBid[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [inviteId, setInviteId] = useState<string>('');
  const [pricing, setPricing] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<BidAnalysisRow[]>([]);
  const [summary, setSummary] = useState<BidSummaryRow[]>([]);

  const load = useCallback(async () => {
    try {
      const [i, b, c, a, sm] = await Promise.all([
        tendersService.items(packageId),
        tendersService.bids(packageId),
        tendersService.listCompanies(workspaceId),
        tendersService.analysis(packageId),
        tendersService.bidSummary(packageId),
      ]);
      setItems(i); setBids(b); setCompanies(c); setAnalysis(a); setSummary(sm);
    } catch (e) {
      toast({ title: 'Failed to load the package', description: (e as Error).message, variant: 'destructive' });
    }
  }, [packageId, workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); onChanged(); }
    catch (e) { toast({ title: label, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'Unnamed';
  const uninvited = useMemo(
    () => companies.filter((c) => !bids.some((b) => b.company_id === c.id)),
    [companies, bids],
  );

  /**
   * Pull the enquiry from the project's accepted contract schedule. Quantities and cost codes
   * come across; rates deliberately do not.
   */
  const pullFromSchedule = () =>
    act('Could not build the package from the schedule', async () => {
      const schedules = await schedulesService.list(projectId);
      const contract = schedules.find((s) => s.is_contract) ?? schedules[0];
      if (!contract) throw new Error('This project has no priced schedule to pull from.');
      const lines = await schedulesService.items(contract.id);
      if (lines.length === 0) throw new Error('That schedule has no lines yet.');
      await tendersService.addItemsFromSchedule(
        workspaceId,
        packageId,
        lines.map((l) => ({
          item_ref: l.item_ref,
          description: l.description,
          unit: l.unit,
          quantity: l.quantity,
          cost_code_id: l.cost_code_id,
        })),
      );
      toast({
        title: `${lines.length} items added`,
        description: 'Quantities and cost codes came across. Rates did not — that is what you are asking for.',
      });
    });

  return (
    <div className="space-y-4 px-5 py-4">
      {/* ---- what is being priced ---------------------------------------------------------- */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium">Items to price</h4>
          <span className="text-xs text-muted-foreground">{items.length}</span>
          {!locked && (
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void pullFromSchedule()} disabled={busy}>
                <Download className="h-3.5 w-3.5" /> From the schedule
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={busy}>
                <Plus className="h-3.5 w-3.5" /> Add item
              </Button>
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <HubEmptyState
            icon={ListOrdered}
            title="Nothing to price yet"
            description="Pull the lines straight from the priced schedule, or type them. Quantities and cost codes come across; rates do not — that is what you are asking for."
            action={!locked ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void pullFromSchedule()} disabled={busy}>
                  <Download className="h-3.5 w-3.5" /> From the schedule
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAdding(true)} disabled={busy}>
                  <Plus className="h-3.5 w-3.5" /> Type them
                </Button>
              </div>
            ) : undefined}
          />
        ) : (
          <div className="divide-y divide-border/60 rounded-sm border border-hairline">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {i.item_ref ?? '—'}
                </span>
                <span className="min-w-0 flex-1 truncate">{i.description}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {i.quantity ?? '—'}{i.unit ? ` ${i.unit}` : ''}
                </span>
                {!i.cost_code_id && (
                  <Badge variant="warning">no code</Badge>
                )}
                {!locked && (
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => void act('Could not remove the item', () => tendersService.removeItem(i.id))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {adding && !locked && (
          <NewPackageItem
            workspaceId={workspaceId} packageId={packageId}
            nextSort={(items[items.length - 1]?.sort ?? 0) + 10}
            onClose={() => setAdding(false)}
            onSaved={() => { setAdding(false); void load(); onChanged(); }}
          />
        )}
      </section>

      {/* ---- who was asked ------------------------------------------------------------------ */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-medium">Subcontractors asked</h4>
          <span className="text-xs text-muted-foreground">{bids.length}</span>
          {!locked && (
            <div className="ml-auto flex items-center gap-2">
              <Select value={inviteId} onValueChange={setInviteId}>
                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Pick a company" /></SelectTrigger>
                <SelectContent>
                  {uninvited.length === 0 ? (
                    <SelectItem value="__none" disabled>Everyone has been asked</SelectItem>
                  ) : uninvited.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm" variant="secondary" disabled={busy || !inviteId || items.length === 0}
                title={items.length === 0 ? 'Add the items first — an invite copies them onto the bid' : undefined}
                onClick={() => void act('Could not invite', async () => {
                  await tendersService.invite(workspaceId, packageId, inviteId);
                  setInviteId('');
                })}
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite
              </Button>
            </div>
          )}
        </div>

        {bids.length === 0 ? (
          <HubEmptyState
            icon={Users}
            title="Nobody asked yet"
            description={items.length === 0
              ? 'Add the items first — inviting a subcontractor copies them onto their bid with the quantities frozen as they stand now.'
              : 'Pick a company above and invite them. The items are copied onto their bid with the quantities frozen as they stand now.'}
            action={!locked && uninvited.length > 0 && items.length > 0 ? (
              <Button
                size="sm" disabled={busy || !inviteId}
                onClick={() => void act('Could not invite', async () => {
                  await tendersService.invite(workspaceId, packageId, inviteId);
                  setInviteId('');
                })}
              >
                <UserPlus className="h-3.5 w-3.5" /> Invite the selected company
              </Button>
            ) : undefined}
          />
        ) : (
          <div className="divide-y divide-border/60 rounded-sm border border-hairline">
            {bids.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1">{companyName(b.company_id)}</span>
                <Badge variant={
                  b.status === 'received' ? 'success'
                    : b.status === 'declined' || b.status === 'withdrawn' ? 'neutral' : 'info'
                }>
                  {humanizeLabel(b.status)}
                </Badge>
                {b.sent_at && (
                  <span className="text-[11px] text-muted-foreground">enquiry sent</span>
                )}
                {!locked && (
                  <div className="flex gap-1">
                    <Button
                      size="sm" variant={b.sent_at ? 'ghost' : 'secondary'} disabled={busy}
                      title="Email them a private link to price this themselves"
                      onClick={() => void act('Could not send the enquiry', async () => {
                        const res = await tendersService.sendEnquiry(b.id);
                        toast({
                          title: res.emailed ? 'Enquiry sent' : 'Link ready',
                          description: res.emailed
                            ? `${companyName(b.company_id)} has been emailed their pricing link.`
                            : res.has_email
                              ? `Email could not go out — send this link yourself: ${res.link}`
                              : `No email address on file. Send this link yourself: ${res.link}`,
                        });
                      })}
                    >
                      <Send className="h-3.5 w-3.5" /> {b.sent_at ? 'Resend' : 'Send enquiry'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => setPricing(pricing === b.id ? null : b.id)}>
                      {pricing === b.id ? 'Close' : 'Enter prices'}
                    </Button>
                    {b.status === 'invited' && (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => void act('Could not update the bid',
                          () => tendersService.setBidStatus(b.id, 'declined'))}>
                        Declined
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {pricing && !locked && (
          <BidRateGrid
            bidId={pricing}
            items={items}
            currency={currency}
            companyName={companyName(bids.find((b) => b.id === pricing)?.company_id ?? '')}
            isReceived={isBidComparable(bids.find((b) => b.id === pricing)?.status ?? 'invited')}
            onClose={() => setPricing(null)}
            onSaved={() => { void load(); onChanged(); }}
          />
        )}
      </section>

      {/* ---- what the bids actually say ----------------------------------------------------- */}
      {summary.length > 0 && (
        <BidAnalysisSection summary={summary} analysis={analysis} currency={currency} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

/**
 * The comparison, ranked on the figure that can be compared.
 *
 * `submitted_total` is whatever the bidder chose to price; `comparable_total` is that plus what
 * they left out, valued at what everybody else charged. Ranking on the first is how the bid with
 * the biggest gaps wins, and the gaps arrive later as variations at a rate nobody competed on.
 * Both are shown, because hiding the submitted figure would be its own kind of dishonesty when
 * the operator has the paper bid in front of them.
 */
const BidAnalysisSection: React.FC<{
  summary: BidSummaryRow[]; analysis: BidAnalysisRow[]; currency: string;
}> = ({ summary, analysis, currency }) => {
  const { toast } = useToast();
  const clarifications = useMemo(() => bidClarifications(analysis, currency), [analysis, currency]);
  const cheapestComparable = summary[0]?.comparable_total ?? null;

  const copy = async (text: string, who: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Copied', description: `Clarifications for ${who}.` });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-medium">
          <Scale className="h-3.5 w-3.5 text-primary" /> Bid analysis
        </h4>
        <span className="text-xs text-muted-foreground">
          {summary.length} comparable {summary.length === 1 ? 'bid' : 'bids'}
        </span>
      </div>

      <div className="table-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
              <th className="px-3 py-1.5 text-left">Subcontractor</th>
              <th className="px-3 py-1.5 text-right">As submitted</th>
              <th className="px-3 py-1.5 text-right">Not priced</th>
              <th className="px-3 py-1.5 text-right">Comparable</th>
              <th className="px-3 py-1.5 text-left">Flags</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((b) => (
              <tr key={b.bid_id} className="border-t border-hairline">
                <td className="px-3 py-1.5">{b.company_name ?? 'Unnamed'}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {formatMoney(b.submitted_total, currency)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {/* An estimate standing in for a price, labelled as one. The dash means nothing
                      is missing, which is a different thing from a gap worth zero. */}
                  {b.lines_unpriced === 0 ? (
                    <span className="text-muted-foreground">&mdash;</span>
                  ) : (
                    <span className="text-amber-800 dark:text-amber-400">
                      +{formatMoney(b.unpriced_value ?? 0, currency)}
                      <span className="ml-1 text-[11px]">
                        ({b.lines_unpriced} line{b.lines_unpriced === 1 ? '' : 's'})
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                  {formatMoney(b.comparable_total, currency)}
                  {b.comparable_total === cheapestComparable && (
                    <Badge variant="success" className="ml-2">lowest</Badge>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {b.lines_low_outlier > 0 && (
                      <Badge variant="warning">{b.lines_low_outlier} well under</Badge>
                    )}
                    {b.lines_high_outlier > 0 && (
                      <Badge variant="neutral">{b.lines_high_outlier} well over</Badge>
                    )}
                    {b.is_complete && b.lines_low_outlier === 0 && b.lines_high_outlier === 0 && (
                      <span className="text-xs text-muted-foreground">nothing to query</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Every question below names a line the analysis flagged. There is no path to a question
          without a finding &mdash; a query nothing supports teaches people the list is padding, and
          the two that matter get skimmed with the rest. */}
      {clarifications.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">
            Questions these numbers raise &mdash; each one names the line it came from.
          </p>
          {clarifications.map((c) => (
            <div key={c.bidId} className="rounded-sm border border-hairline bg-surface-sunken p-3">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-800 dark:text-amber-400" />
                <span className="text-sm font-medium">{c.companyName ?? 'Unnamed'}</span>
                <span className="text-xs text-muted-foreground">{c.items.length} to ask</span>
                <Button
                  size="sm" variant="ghost" className="ml-auto"
                  onClick={() => void copy(clarificationsAsText(c), c.companyName ?? 'this bidder')}
                >
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                </Button>
              </div>
              <ul className="mt-2 space-y-1.5">
                {c.items.map((q, i) => (
                  <li key={`${c.bidId}-${i}`} className="text-xs text-muted-foreground">
                    {q.question}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const NewPackageItem: React.FC<{
  workspaceId: string; packageId: string; nextSort: number;
  onClose: () => void; onSaved: () => void;
}> = ({ workspaceId, packageId, nextSort, onClose, onSaved }) => {
  const { toast } = useToast();
  const [itemRef, setItemRef] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [costCodeId, setCostCodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!description.trim()) { toast({ title: 'Describe the item', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await tendersService.addItem({
        workspace_id: workspaceId, package_id: packageId,
        item_ref: itemRef, description, unit: unit || null,
        quantity: quantity === '' ? null : Number(quantity),
        cost_code_id: costCodeId, sort: nextSort,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not add the item', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-6 gap-2 rounded-sm border border-hairline bg-surface-sunken p-3">
      <div className="space-y-1">
        <Label className="text-[11px]">Ref</Label>
        <Input value={itemRef} onChange={(e) => setItemRef(e.target.value)} placeholder="1.1" className="h-9" />
      </div>
      <div className="col-span-2 space-y-1">
        <Label className="text-[11px]">Description</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Unit</Label>
        <Select value={unit || 'none'} onValueChange={(v) => setUnit(v === 'none' ? '' : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Qty</Label>
        <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Cost code</Label>
        <CostCodePicker value={costCodeId} onChange={setCostCodeId} className="h-9" />
      </div>
      <div className="col-span-6 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !description.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
        </Button>
      </div>
    </div>
  );
};

/**
 * What one subcontractor quoted, line by line.
 *
 * Rates are typed against the quantities FROZEN onto the bid when they were invited — not against
 * the package's current quantities, which may since have been re-measured. Leaving a line blank is
 * a real answer (they did not price it) and stays blank rather than becoming a zero.
 */
const BidRateGrid: React.FC<{
  bidId: string;
  items: PackageItem[];
  currency: string;
  companyName: string;
  isReceived: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ bidId, items, currency, companyName, isReceived, onClose, onSaved }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<Array<{
    id: string; package_item_id: string; quantity: number | null; rate: number | null; amount: number | null;
  }> | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await tendersService.bidItems(bidId);
      setLines(rows);
      setDraft(Object.fromEntries(rows.map((r) => [r.id, r.rate === null ? '' : String(r.rate)])));
    } catch (e) {
      toast({ title: 'Failed to load the bid', description: (e as Error).message, variant: 'destructive' });
    }
  }, [bidId, toast]);

  useEffect(() => { void load(); }, [load]);

  const describe = (packageItemId: string) =>
    items.find((i) => i.id === packageItemId)?.description ?? 'Item';

  const total = useMemo(
    () => (lines ?? []).reduce((s, l) => s + n(l.amount), 0),
    [lines],
  );

  const saveRate = async (lineId: string) => {
    const raw = draft[lineId];
    // Blank means NOT PRICED, which is a different answer from zero and is stored as null.
    const rate = raw === '' ? null : Number(raw);
    if (rate !== null && !Number.isFinite(rate)) return;
    setBusy(true);
    try { await tendersService.setRate(lineId, rate); await load(); onSaved(); }
    catch (e) { toast({ title: 'Could not save the rate', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">{companyName}&rsquo;s prices</p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatMoney(total, currency)}
        </span>
        <div className="ml-auto flex gap-2">
          {!isReceived && (
            <Button
              size="sm" variant="secondary" disabled={busy}
              onClick={() => void (async () => {
                setBusy(true);
                try {
                  // Status and date move together — the DB refuses one without the other.
                  await tendersService.setBidStatus(bidId, 'received');
                  onSaved();
                } catch (e) {
                  toast({ title: 'Could not mark it received', description: (e as Error).message, variant: 'destructive' });
                } finally { setBusy(false); }
              })()}
            >
              <Check className="h-3.5 w-3.5" /> Mark received
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>

      {lines === null ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Loading…
        </div>
      ) : lines.length === 0 ? (
        <HubEmptyState
          icon={Users}
          title="This bid has no lines"
          description="It was invited before the package had any items, so there is nothing for them to price. Remove it and invite them again now the items exist."
          action={
            <Button
              size="sm" variant="outline" disabled={busy}
              onClick={() => void (async () => {
                setBusy(true);
                try { await tendersService.removeBid(bidId); onClose(); onSaved(); }
                catch (e) { toast({ title: 'Could not remove the bid', description: (e as Error).message, variant: 'destructive' }); }
                finally { setBusy(false); }
              })()}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove this bid
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-border/60 rounded-sm border border-hairline bg-card">
          {lines.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{describe(l.package_item_id)}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {l.quantity ?? '—'}
              </span>
              <Input
                inputMode="decimal"
                className="h-8 w-24 text-right"
                placeholder="rate"
                value={draft[l.id] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                onBlur={() => void saveRate(l.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') void saveRate(l.id); }}
                disabled={busy}
              />
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {l.rate === null ? 'not priced' : formatMoney(n(l.amount), currency)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Rates are against the quantities frozen when this subcontractor was invited. A blank line
        stays unpriced rather than becoming a zero — the comparison marks it as an omission.
      </p>
    </div>
  );
};
