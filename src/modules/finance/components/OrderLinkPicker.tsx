import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, ChevronRight, ChevronDown, Plus, FolderOpen, Building2, User, GitMerge, Link2, Loader2 } from 'lucide-react';

import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  ordersService, type OrderLinkTarget, type LinkTargetSearch, type LinkOrderSummary, type OrderType,
  type OrderListRow,
} from '@/modules/finance/services/ordersService';

/**
 * "What is this for?" — one field answering the question a cost always has an answer to, whether
 * that answer is a project, a customer, or an order that already exists.
 *
 * The grouping is load-bearing, not decorative. Three rows here look almost identical — an existing
 * PURCHASE order to merge into, an existing SALES order, and a purchase order this cost merely
 * rides along with — and they do three different things:
 *
 *   • a purchase order for the SAME supplier shares our direction (money OUT), so the lines MERGE into it
 *   • a sales order settles on money IN, so it is only ever LINKED (`covers_order_id`)
 *   • any other purchase order gets this cost as an EXPENSE on it (`supplier_bills.order_id`) —
 *     freight, customs, an installer: costs OF a purchase, not purchases of their own
 *
 * Appending purchase lines to a customer's sales order would bill the customer what we paid our
 * supplier. `search_order_link_targets` is what decides which orders may be merged into, so the
 * picker cannot offer an illegal target even if this file is edited carelessly.
 */
export const OrderLinkPicker: React.FC<{
  workspaceId: string;
  value: OrderLinkTarget;
  onChange: (v: OrderLinkTarget) => void;
  /** The type of order being composed — merge candidates must match it. */
  orderType?: OrderType | null;
  /** Its counterparty. Merge candidates are that party's open orders; without one there are none. */
  partyCompanyId?: string | null;
  partyContactId?: string | null;
  currency?: string | null;
  /** Offer the customers group at all. Off for a sales order, which already has a customer. */
  allowCustomer?: boolean;
  /**
   * Offer "New sales order for X" inside an expanded customer. Separate from `allowCustomer`
   * because a caller can be able to LINK to a customer's existing order while having nothing to
   * raise a new one from — the order detail panel, where the lines already belong to this order.
   * A caller that leaves this on MUST handle `kind: 'customer'`, or the row does nothing.
   */
  allowRaiseCustomerOrder?: boolean;
  /** Offer merging into an existing order. */
  allowMerge?: boolean;
  /**
   * Offer "this is a cost OF an existing purchase order". Unlike merging, the target is NOT
   * restricted to this party or to orders with no bill yet — the freight invoice that belongs to
   * a purchase comes from the forwarder, not the supplier, and arrives after that purchase was
   * billed. A caller that turns this on MUST handle `kind: 'cost_of_order'` by writing the
   * expense's `order_id`, or the row does nothing.
   */
  allowCostOf?: boolean;
  /**
   * Inline mode: no stacked <Label>, control sized to sit in a toolbar row beside Status. Used on
   * the order detail header, where "which project" is one more attribute of the order rather than
   * a form field deserving its own block.
   */
  compact?: boolean;
  label?: string;
  disabled?: boolean;
  /** Rendered under the field when set — used to warn about lines that could not be priced. */
  hint?: React.ReactNode;
}> = ({
  workspaceId, value, onChange, orderType, partyCompanyId, partyContactId, currency,
  allowCustomer = true, allowRaiseCustomerOrder = true, allowMerge = true, allowCostOf = false,
  compact = false, label = 'What is this for?', disabled, hint,
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<LinkTargetSearch>({ projects: [], customers: [], merge_targets: [] });
  /** Purchase orders this cost can ride along with — a plain order search, since "may I book an
   *  expense on this order?" has no constraint beyond the workspace, which RLS already applies. */
  const [costTargets, setCostTargets] = useState<OrderListRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Blank query is a real query here — it returns the most recent projects, the customers with open
  // orders and this supplier's open POs. "What is this for?" almost always has a recent answer;
  // make the operator guess a search term to see it and the field sits empty forever.
  useEffect(() => {
    if (!open || disabled) return;
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(async () => {
      const [targets, costs] = await Promise.all([
        ordersService.searchLinkTargets({
          workspaceId, query,
          orderType: allowMerge ? orderType ?? null : null,
          partyCompanyId: allowMerge ? partyCompanyId ?? null : null,
          partyContactId: allowMerge ? partyContactId ?? null : null,
          currency: currency ?? null,
        }).catch(() => ({ projects: [], customers: [], merge_targets: [] } as LinkTargetSearch)),
        allowCostOf
          ? ordersService.search({ workspaceId, orderType: 'purchase', search: query.trim() || undefined, limit: 8 })
              .then((r) => r.rows.filter((o) => o.status !== 'cancelled'))
              .catch(() => [] as OrderListRow[])
          : Promise.resolve([] as OrderListRow[]),
      ]);
      if (cancelled) return;
      setRes(targets);
      setCostTargets(costs);
      setBusy(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, disabled, workspaceId, orderType, partyCompanyId, partyContactId, currency, allowMerge, allowCostOf]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = useCallback((v: OrderLinkTarget) => {
    onChange(v);
    setQuery('');
    setOpen(false);
    setExpanded(null);
  }, [onChange]);

  const customers = allowCustomer ? res.customers : [];
  const mergeTargets = allowMerge ? res.merge_targets : [];
  // An order that may be MERGED into is offered as a merge and nothing else — the same row under
  // two headings, doing two different things to the same order, is how the wrong one gets picked.
  const costOfTargets = allowCostOf
    ? costTargets.filter((o) => !mergeTargets.some((m) => m.id === o.id))
    : [];
  const empty = res.projects.length === 0 && customers.length === 0 && mergeTargets.length === 0 && costOfTargets.length === 0;

  const orderLine = (o: LinkOrderSummary) => (
    <>
      <span className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</span>
      <span className="text-muted-foreground"> · {o.status}</span>
      <span className="tabular-nums text-muted-foreground"> · {formatMoney(Number(o.total), o.currency)}</span>
      {o.project_name && <span className="text-muted-foreground"> · {o.project_name}</span>}
    </>
  );

  if (value.kind !== 'none') {
    return (
      <div className={compact ? '' : 'space-y-1'} ref={boxRef}>
        {!compact && <Label>{label}</Label>}
        <div className={`flex items-center justify-between rounded-md border border-border/60 ${compact ? 'h-8 gap-1 pl-2 pr-1 text-xs' : 'px-3 py-2'}`}>
          <span className={compact ? 'truncate text-xs' : 'text-sm'}>
            {!compact && <LinkKindWord kind={value.kind} />}
            <span className={compact ? '' : 'ml-1.5'}>{value.label}</span>
          </span>
          {!disabled && (
            <Button size="sm" variant="ghost" className={compact ? 'h-6 px-1.5 text-[11px]' : ''}
              onClick={() => onChange({ kind: 'none' })}>Change</Button>
          )}
        </div>
        {hint}
      </div>
    );
  }

  return (
    <div className={compact ? 'relative' : 'space-y-1'} ref={boxRef}>
      {!compact && <Label>{label}</Label>}
      <div className="relative">
        <Search className={`absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`} />
        <Input
          className={compact ? 'h-8 w-48 pl-6 text-xs' : 'pl-7'}
          placeholder={compact ? 'Link a project…' : 'Project, customer, or an order to add this to…'}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        />
        {open && !disabled && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border/60 bg-popover shadow">
            {busy && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            )}

            {!busy && empty && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                {query.trim() ? 'Nothing matches that.' : 'No projects, customers or open orders yet.'}
              </div>
            )}

            {res.projects.length > 0 && (
              <GroupHeading icon={<FolderOpen className="h-3 w-3" />} text="Projects" />
            )}
            {res.projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => pick({ kind: 'project', projectId: p.id, label: p.name })}
              >
                <div>{p.name}</div>
                {p.client_name && <div className="text-[10px] text-muted-foreground">Client: {p.client_name}</div>}
              </button>
            ))}

            {customers.length > 0 && (
              <GroupHeading icon={<Building2 className="h-3 w-3" />} text="Customers" />
            )}
            {customers.map((c) => {
              const key = `${c.party_type}:${c.id}`;
              const isOpen = expanded === key;
              return (
                <div key={key}>
                  {/* Expanding is the whole point of the customer row: pick the person, THEN decide
                      between a new order and one they already have — without leaving the field. */}
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => setExpanded(isOpen ? null : key)}
                  >
                    <span className="flex items-center gap-1.5">
                      {c.party_type === 'contact' ? <User className="h-3 w-3 text-muted-foreground" /> : <Building2 className="h-3 w-3 text-muted-foreground" />}
                      {c.name ?? 'Unnamed'}
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {c.open_count > 0 ? `${c.open_count} open order${c.open_count === 1 ? '' : 's'}` : 'no open orders'}
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-l-2 border-border/60 bg-muted/30">
                      {allowRaiseCustomerOrder && (
                        <button
                          type="button"
                          className="flex w-full items-center gap-1.5 px-5 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => pick({
                            kind: 'customer',
                            party: { party_type: c.party_type, id: c.id, name: c.name },
                            label: `New order for ${c.name ?? 'customer'}`,
                          })}
                        >
                          <Plus className="h-3 w-3 text-muted-foreground" />
                          New sales order for {c.name ?? 'this customer'}
                        </button>
                      )}
                      {!allowRaiseCustomerOrder && c.orders.length === 0 && (
                        <div className="px-5 py-2 text-xs text-muted-foreground">
                          No open orders to attach this to.
                        </div>
                      )}
                      {c.orders.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className="block w-full px-5 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => pick({
                            kind: 'sales_order', orderId: o.id, projectId: o.project_id,
                            label: `${o.order_number ?? o.id.slice(0, 8)} · ${c.name ?? 'customer'}`,
                          })}
                        >
                          {orderLine(o)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {mergeTargets.length > 0 && (
              <GroupHeading
                icon={<GitMerge className="h-3 w-3" />}
                text={orderType === 'sales' ? 'Merge into sales order' : 'Merge into purchase order'}
              />
            )}
            {mergeTargets.map((o) => (
              <button
                key={o.id}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => pick({
                  kind: 'merge_order', orderId: o.id, orderType: (orderType ?? 'purchase'),
                  projectId: o.project_id,
                  label: `${o.order_number ?? o.id.slice(0, 8)} · ${o.party_name ?? 'counterparty'}`,
                })}
              >
                {orderLine(o)}
                <div className="text-[10px] text-muted-foreground">
                  {o.line_count} line{o.line_count === 1 ? '' : 's'} · these items are added to it instead of raising a new order
                </div>
              </button>
            ))}

            {costOfTargets.length > 0 && (
              <GroupHeading icon={<Link2 className="h-3 w-3" />} text="A cost of an existing order" />
            )}
            {costOfTargets.map((o) => (
              <button
                key={`cost:${o.id}`}
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => pick({
                  kind: 'cost_of_order', orderId: o.id, projectId: o.project_id ?? null,
                  label: `${o.order_number ?? o.id.slice(0, 8)}${o.party_name ? ` · ${o.party_name}` : ''}`,
                })}
              >
                <span className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</span>
                <span className="text-muted-foreground"> · {o.status}</span>
                <span className="tabular-nums text-muted-foreground"> · {formatMoney(Number(o.total), o.currency)}</span>
                {o.party_name && <span className="text-muted-foreground"> · {o.party_name}</span>}
                <div className="text-[10px] text-muted-foreground">
                  booked as an expense on this order · no second order, and its own lines are untouched
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {hint}
    </div>
  );
};

const GroupHeading: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-1.5 border-b border-border/40 bg-muted/50 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {icon}{text}
  </div>
);

/** Names the VERB, so "merge" and "link" are never mistaken for each other after the fact. */
const LinkKindWord: React.FC<{ kind: OrderLinkTarget['kind'] }> = ({ kind }) => {
  if (kind === 'project') return <span className="text-xs font-medium text-muted-foreground">Project</span>;
  if (kind === 'customer') return <span className="text-xs font-medium text-muted-foreground">New customer order</span>;
  if (kind === 'sales_order') return <span className="text-xs font-medium text-muted-foreground">For customer order</span>;
  if (kind === 'merge_order') return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Merging into</span>;
  if (kind === 'cost_of_order') return <span className="text-xs font-medium text-muted-foreground">A cost of</span>;
  return null;
};
