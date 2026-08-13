import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FINANCE_BASE } from '@/modules/finance/routes';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OrderDetailDialog } from '@/modules/finance/components/OrdersPanel';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

/**
 * Dedicated page for ONE order: `/finance/orders/:orderId`.
 *
 * An order needs a URL of its own. Reachable only as a modal over the Orders list, "open the
 * order" from a receivable, an invoice or a notification lands you on the list with a dialog on
 * top — nothing to bookmark or send someone. This is the order equivalent of
 * `/finance/invoices/:id`.
 *
 * It renders the EXISTING `OrderDetailDialog` rather than a second copy of the order form, so
 * the page and the list row can never drift apart. Closing returns to wherever you came from.
 */
const OrderDetailPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const financeBase = FINANCE_BASE;
  const { activeWorkspaceId } = useWorkspace();
  const [categories, setCategories] = useState<FinanceCategory[]>([]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void financeCategoriesService.list(activeWorkspaceId).then(setCategories).catch(() => setCategories([]));
  }, [activeWorkspaceId]);

  // Back to the previous surface (the receivable, the invoice, the list) when there is history to
  // go back to; the orders list otherwise, so a pasted link still lands somewhere sensible.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(`${financeBase}?tab=doc_orders`);
  };

  return (
    <div className="container mx-auto p-6">
      <Button variant="ghost" size="sm" onClick={goBack} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-1" /> Back
      </Button>
      <OrderDetailDialog
        orderId={orderId ?? null}
        categories={categories}
        open={!!orderId}
        onClose={goBack}
        onChanged={() => { /* the page holds no list to refresh — the dialog reloads itself */ }}
        onOpenOrder={(id) => navigate(`${financeBase}/orders/${id}`)}
      />
    </div>
  );
};

export default OrderDetailPage;
