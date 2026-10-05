// Sales Team portal. A focused, capability-gated surface for invited sales reps
// (persona 'sales', capability 'sales.portal'). A rep picks/creates a customer, names an
// order, and we create a draft `quotes` row (customer_contact_id/customer_company_id +
// user_id = rep) then hand off to the existing quote detail page to build line items from
// the catalog (cascade pricing applies there). RLS (`consolidated_quotes_select_public`)
// already scopes a non-admin to their OWN quotes, so a rep never sees other reps' orders.
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Plus, Loader2, Eye, ShoppingCart, Clock, CheckCircle, FileText } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { QuoteStatusWord } from '@/lib/quoteStatus';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { quotesService, type QuoteWithItems } from '@/modules/quotes/services/QuotesService';
import { StatementActions } from '@/modules/finance/components/StatementActions';
import { formatDate } from '@/utils/datetime';
import { NewOrderDialog } from '@/modules/quotes/components/NewOrderDialog';


export const SalesPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  // Sales manager: RLS (is_workspace_sales_manager) already returns the whole team's book,
  // so this only decides whether to label + total it as a team view.
  const { can } = usePermissions();
  const canSeeTeam = can('sales.team.view');

  const [orders, setOrders] = useState<QuoteWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Per-order customer label + CRM deep-link, resolved after load.
  const [customers, setCustomers] = useState<Record<string, { label: string; href: string }>>({});
  // Sales manager only: which rep owns each row (RLS widens the read; this labels it).
  const [reps, setReps] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // A reload can return fewer orders than the current page covers.
  useEffect(() => { setPage((p) => clampPage(p, orders.length)); }, [orders.length]);

  // App Launcher deep-link: /sales?new=order opens the New Order dialog.
  useEffect(() => {
    if (searchParams.get('new') === 'order') {
      setDialogOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      // RLS scopes a non-admin rep to their own rows.
      const data = await quotesService.getUserQuotes();
      setOrders(data);

      // Resolve customer names for the distinct contact/company ids in one round trip each.
      const contactIds = [...new Set(data.map((q) => (q as any).customer_contact_id).filter(Boolean))] as string[];
      const companyIds = [...new Set(data.map((q) => (q as any).customer_company_id).filter(Boolean))] as string[];
      const map: Record<string, { label: string; href: string }> = {};
      const [contacts, companies] = await Promise.all([
        contactIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contactIds) : Promise.resolve({ data: [] as any[] }),
        companyIds.length ? supabase.from('crm_companies').select('id, name').in('id', companyIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      for (const c of (contacts.data ?? [])) {
        const label = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ') || 'Contact';
        map[`contact:${(c as any).id}`] = { label, href: `/crm/contacts/${(c as any).id}` };
      }
      for (const co of (companies.data ?? [])) {
        map[`company:${(co as any).id}`] = { label: (co as any).name, href: `/crm/companies/${(co as any).id}` };
      }
      setCustomers(map);

      // A manager's list spans the team, so each row needs an owner. Reps get one row-owner
      // (themselves) and don't need the lookup.
      if (canSeeTeam) {
        const repIds = [...new Set(data.map((q) => (q as any).user_id).filter(Boolean))] as string[];
        if (repIds.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles').select('user_id, full_name, email').in('user_id', repIds);
          setReps(Object.fromEntries(
            (profiles ?? []).map((p: any) => [p.user_id, p.full_name || p.email || '—']),
          ));
        }
      }
    } catch (err) {
      console.error('Error loading sales orders:', err);
      toast({ title: 'Error', description: 'Failed to load your orders', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, canSeeTeam]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading your orders...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Briefcase}
        title="Sales"
        subtitle="Create orders and quotes for your customers"
        actions={
          <Button onClick={() => setDialogOpen(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New order
          </Button>
        }
      />

      <div className="page-container pt-6 pb-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: ShoppingCart, label: 'Total Orders', value: orders.length },
            { icon: Clock, label: 'Submitted', value: orders.filter((q) => q.status === 'submitted').length },
            { icon: CheckCircle, label: 'Accepted', value: orders.filter((q) => q.status === 'accepted').length },
            { icon: FileText, label: 'Drafts', value: orders.filter((q) => q.status === 'draft').length },
          ].map((s) => (
            <div key={s.label} className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-lg font-semibold">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Orders table */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-3 sm:p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4">
            <FileText className="h-4 w-4" />
            {canSeeTeam ? 'Team Orders' : 'My Orders'}
          </h3>
          <div className="overflow-hidden -mx-3 sm:-mx-6 -mb-6 mt-2">
            {orders.length === 0 ? (
              <div className="px-6 pb-6 text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm mb-4">No orders yet. Create one for a customer to get started.</p>
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create your first order
                </Button>
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs font-semibold text-muted-foreground">
                      <th className="text-left px-6 py-2.5 font-medium">Order</th>
                      <th className="text-left px-3 py-2.5 font-medium">Customer</th>
                      {canSeeTeam && <th className="text-left px-3 py-2.5 font-medium">Rep</th>}
                      <th className="text-left px-3 py-2.5 font-medium">Status</th>
                      <th className="text-left px-3 py-2.5 font-medium">Items</th>
                      <th className="text-left px-3 py-2.5 font-medium">Created</th>
                      <th className="text-right px-6 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginate(orders, page).map((q) => {
                      const cid = (q as any).customer_company_id ? `company:${(q as any).customer_company_id}` : (q as any).customer_contact_id ? `contact:${(q as any).customer_contact_id}` : null;
                      const cust = cid ? customers[cid] : null;
                      const partyCompanyId = (q as any).customer_company_id as string | null;
                      const partyContactId = (q as any).customer_contact_id as string | null;
                      const partyId = partyCompanyId ?? partyContactId;
                      return (
                      <tr
                        key={q.id}
                        className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                        // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                        // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                        // row is invalid ARIA and yields a focus stop with no name.
                        onClick={() => navigate(`/quotes/${q.id}`)}
                      >
                        <td className="px-6 py-2.5 font-medium">
                          <button type="button" onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${q.id}`); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{q.name || 'Untitled Order'}</button>
                        </td>
                        <td className="px-3 py-2.5">
                          {cust ? (
                            <button className="text-primary hover:underline" onClick={(e) => { e.stopPropagation(); navigate(cust.href); }}>{cust.label}</button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        {canSeeTeam && (
                          <td className="px-3 py-2.5 text-muted-foreground">
                            {reps[(q as any).user_id as string] || '—'}
                          </td>
                        )}
                        <td className="px-3 py-2.5"><QuoteStatusWord status={q.status} /></td>
                        <td className="px-3 py-2.5 tabular-nums">{q.total_items || q.items?.length || 0}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{formatDate(q.created_at)}</td>
                        <td className="px-6 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1" role="presentation" onClick={(e) => e.stopPropagation()}>
                            {partyId && (
                              <StatementActions
                                partyType={partyCompanyId ? 'company' : 'contact'}
                                partyId={partyId}
                                workspaceId={activeWorkspaceId}
                                crmHref={cust?.href}
                              />
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={(e) => { e.stopPropagation(); navigate(`/quotes/${q.id}`); }}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <TablePagination page={page} total={orders.length} onPageChange={setPage} label="orders" />
              </>
            )}
          </div>
        </div>
      </div>

      <NewOrderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={activeWorkspaceId}
        onCreated={(quoteId) => { setDialogOpen(false); navigate(`/quotes/${quoteId}`); }}
      />
    </div>
  );
};

export default SalesPage;
