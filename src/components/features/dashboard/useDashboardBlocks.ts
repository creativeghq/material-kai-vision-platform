import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { quoteUrl } from '@/modules/quotes/routes';

/* ────────────────────────────────────────────────────────────────────────────
   Data for the dashboard's operational blocks.

   Counts are read with `{ count: 'exact', head: true }` — one COUNT per bucket,
   no rows transferred, exact at any table size. The obvious alternative (fetch
   the status column and group in JS) needs a row cap, and a silent cap reads as
   "you have 200 orders" when you have 5,000. See the "no silent caps" rule in
   CLAUDE.md.

   Every query is bound to the ACTIVE WORKSPACE. These tables are workspace-scoped
   and RLS enforces it, but the filter is explicit here too so a policy change can
   never silently widen what the dashboard totals.
   ──────────────────────────────────────────────────────────────────────────── */

/** Status vocabularies, taken from the live CHECK constraints — not guessed.
 *  orders_status_check: draft | confirmed | partially_fulfilled | fulfilled | cancelled
 *  quotes valid_status: draft | submitted | quoted | accepted | rejected | expired */
export const ORDER_BUCKETS = ['draft', 'confirmed', 'partially_fulfilled', 'fulfilled'] as const;
export const QUOTE_BUCKETS = ['draft', 'submitted', 'quoted', 'accepted'] as const;

export interface PipelineCounts {
  orders: Record<string, number>;
  quotes: Record<string, number>;
  /** Orders still owed to a customer — confirmed + partially fulfilled. */
  ordersOpen: number;
  /** Quotes still in play — anything before accepted/rejected/expired. */
  quotesActive: number;
}

export interface CrmCounts {
  total: number;
  customers: number;
  suppliers: number;
}

const EMPTY_PIPELINE: PipelineCounts = {
  orders: Object.fromEntries(ORDER_BUCKETS.map((b) => [b, 0])),
  quotes: Object.fromEntries(QUOTE_BUCKETS.map((b) => [b, 0])),
  ordersOpen: 0,
  quotesActive: 0,
};

const EMPTY_CRM: CrmCounts = { total: 0, customers: 0, suppliers: 0 };

/** One exact COUNT, scoped to the workspace. Returns 0 rather than throwing —
 *  a dashboard tile must never take the page down with it. */
async function countWhere(
  table: 'orders' | 'quotes' | 'crm_companies',
  workspaceId: string,
  apply?: (q: any) => any,
): Promise<number> {
  let q = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  if (apply) q = apply(q);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export function usePipelineCounts() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [counts, setCounts] = useState<PipelineCounts>(EMPTY_PIPELINE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) {
      // Hold the skeleton while the workspace is still resolving; only settle to
      // empty once we KNOW there is no workspace.
      if (!workspaceLoading) setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const [orderCounts, quoteCounts] = await Promise.all([
        Promise.all(
          ORDER_BUCKETS.map((s) => countWhere('orders', activeWorkspaceId, (q) => q.eq('status', s))),
        ),
        Promise.all(
          QUOTE_BUCKETS.map((s) => countWhere('quotes', activeWorkspaceId, (q) => q.eq('status', s))),
        ),
      ]);
      if (!alive) return;

      const orders = Object.fromEntries(ORDER_BUCKETS.map((s, i) => [s, orderCounts[i] ?? 0]));
      const quotes = Object.fromEntries(QUOTE_BUCKETS.map((s, i) => [s, quoteCounts[i] ?? 0]));

      setCounts({
        orders,
        quotes,
        ordersOpen: (orders.confirmed ?? 0) + (orders.partially_fulfilled ?? 0),
        quotesActive: (quotes.draft ?? 0) + (quotes.submitted ?? 0) + (quotes.quoted ?? 0),
      });
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  return { counts, loading };
}

export function useCrmCounts() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [counts, setCounts] = useState<CrmCounts>(EMPTY_CRM);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) {
      if (!workspaceLoading) setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const [total, customers, suppliers] = await Promise.all([
        countWhere('crm_companies', activeWorkspaceId),
        countWhere('crm_companies', activeWorkspaceId, (q) => q.eq('is_customer', true)),
        countWhere('crm_companies', activeWorkspaceId, (q) => q.eq('is_supplier', true)),
      ]);
      if (!alive) return;
      setCounts({ total, customers, suppliers });
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  return { counts, loading };
}

export type ActivityKind = 'order' | 'quote' | 'company';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  at: string;
  to: string;
}

/** A single merged feed of what moved lately across orders, quotes and CRM.
 *  Each source is capped at ROWS_PER_SOURCE and the merged list is trimmed to
 *  FEED_SIZE — both stated, so this is a deliberate "most recent" window rather
 *  than a silent truncation of everything. */
const ROWS_PER_SOURCE = 6;
const FEED_SIZE = 7;

export function useRecentActivity() {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspace();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) {
      if (!workspaceLoading) setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    (async () => {
      const [ordersRes, quotesRes, companiesRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, order_number, status, order_type, updated_at, created_at')
          .eq('workspace_id', activeWorkspaceId)
          .order('updated_at', { ascending: false })
          .limit(ROWS_PER_SOURCE),
        supabase
          .from('quotes')
          .select('id, quote_number, name, status, updated_at, created_at')
          .eq('workspace_id', activeWorkspaceId)
          .order('updated_at', { ascending: false })
          .limit(ROWS_PER_SOURCE),
        supabase
          .from('crm_companies')
          .select('id, name, is_customer, is_supplier, created_at')
          .eq('workspace_id', activeWorkspaceId)
          .order('created_at', { ascending: false })
          .limit(ROWS_PER_SOURCE),
      ]);
      if (!alive) return;

      const merged: ActivityItem[] = [];

      for (const o of (ordersRes.data ?? []) as any[]) {
        merged.push({
          id: `order-${o.id}`,
          kind: 'order',
          title: o.order_number ? `Order ${o.order_number}` : 'Order',
          detail: `${o.order_type === 'purchase' ? 'Purchase' : 'Sales'} · ${String(o.status ?? '').replace(/_/g, ' ')}`,
          at: o.updated_at ?? o.created_at,
          to: `/finance/orders/${o.id}`,
        });
      }
      for (const q of (quotesRes.data ?? []) as any[]) {
        merged.push({
          id: `quote-${q.id}`,
          kind: 'quote',
          title: q.quote_number ? `Quote ${q.quote_number}` : (q.name || 'Quote'),
          detail: String(q.status ?? '').replace(/_/g, ' '),
          at: q.updated_at ?? q.created_at,
          // THE quote, not the list. Every other kind in this feed opens the record it names
          // (`/finance/orders/:id`, `/crm/companies/:id`); a quote row dropped the reader on the
          // full list to find it again — and `quoteUrl` is the address QuotesPage itself
          // navigates to on a row click, so there is one answer to "where does a quote live".
          to: quoteUrl(q.id),
        });
      }
      for (const c of (companiesRes.data ?? []) as any[]) {
        merged.push({
          id: `company-${c.id}`,
          kind: 'company',
          title: c.name || 'Company',
          detail: c.is_supplier ? (c.is_customer ? 'Customer · Supplier' : 'Supplier') : 'Customer',
          at: c.created_at,
          to: `/crm/companies/${c.id}`,
        });
      }

      merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      setItems(merged.slice(0, FEED_SIZE));
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [activeWorkspaceId, workspaceLoading]);

  return { items, loading };
}
