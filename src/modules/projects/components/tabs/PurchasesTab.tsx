/** Commercial → Purchases: everything going out on this job, from what still needs ordering to what is owed. */
import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Link2Off, Loader2, Plus, ReceiptText } from 'lucide-react';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { useToast } from '@/hooks/use-toast';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import { AttachFinanceDialog } from '../AttachFinanceDialog';
import { ProjectExpensesCard } from '../ProjectExpensesCard';
import { TenderPackagesCard } from '../TenderPackagesCard';
import { PurchaseItemsTab } from './PurchaseItemsTab';
import {
  projectsService, type ProjectFinanceRow, type ProjectFinanceSummary, type ProjectPurchaseSummary,
} from '../../services/projectsService';

const PurchaseTiles: React.FC<{ summary: ProjectPurchaseSummary | null; failed: boolean }> = ({ summary, failed }) => {
  if (failed) {
    return (
      <Card className="p-4 text-sm text-amber-800 dark:text-amber-300">
        The purchase summary could not be loaded. These figures are unknown, not zero.
      </Card>
    );
  }
  if (!summary) return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  const mixed = summary.currencies.length > 1;
  return (
    <HubStatGrid>
      <HubStatTile label="To Order" value={summary.to_order_count} help="Made-to-order items with no purchase order yet." />
      <HubStatTile label="On Order" value={summary.on_order} help="Purchase orders confirmed and not fully delivered." />
      <HubStatTile label="Delivered, not billed" value={summary.awaiting_bill} help="Goods have arrived and the supplier's bill does not cover them yet." />
      <HubStatTile
        label="To Pay"
        value={mixed ? 'Mixed Currencies' : formatMoney(summary.to_pay, summary.currencies[0] ?? 'EUR')}
        help={mixed ? `Bills in ${summary.currencies.join(', ')} cannot be added together.` : 'What is still unpaid on this project\'s supplier bills.'}
      />
    </HubStatGrid>
  );
};

const SupplierBillsCard: React.FC<{ projectId: string; onChanged: () => void }> = ({ projectId, onChanged }) => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try { setSummary(await projectsService.getProjectFinanceSummary(projectId)); }
    catch { setFailed(true); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const detach = async (row: ProjectFinanceRow) => {
    if (!confirm('Detach this bill from the project? The bill itself is kept.')) return;
    try {
      await projectsService.setFinanceAttachment(row.kind, row.id, null);
      await load();
      onChanged();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const attachButton = (
    <Button size="sm" variant="outline" onClick={() => setAttaching(true)}>
      <Plus className="h-3.5 w-3.5 mr-1" /> Attach a bill
    </Button>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2"><ReceiptText className="h-4 w-4" /> Supplier bills</CardTitle>
        {summary && summary.payables.length > 0 && attachButton}
      </CardHeader>
      <CardContent className="p-0">
        {failed ? (
          <div className="p-4 text-sm text-amber-800 dark:text-amber-300">
            <p>Supplier bills could not be loaded. Whether this project has any is unknown, not none.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void load()}>Try again</Button>
          </div>
        ) : !summary ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : summary.payables.length === 0 ? (
          <HubEmptyState
            title="No supplier bills on this project yet"
            description="A bill raised from one of these purchase orders lands here by itself. Attach any other bill that belongs to the job."
            action={attachButton}
          />
        ) : (
          <div className="divide-y divide-hairline">
            {summary.payables.map((r) => (
              <div key={r.id} className="p-4 flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.label || r.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{r.issued_at ? formatDate(r.issued_at) : 'Draft'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium tabular-nums">{formatMoney(r.total, r.currency ?? 'EUR')}</p>
                  <span className={`mt-1 inline-block text-[10px] ${statusTone(r.status)}`}>{humanizeLabel(r.status)}</span>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Detach from this project" aria-label="Detach from this project" onClick={() => void detach(r)}>
                  <Link2Off className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {attaching && (
        <AttachFinanceDialog
          projectId={projectId}
          direction="payable"
          onClose={() => setAttaching(false)}
          onAttached={() => { setAttaching(false); void load(); onChanged(); }}
        />
      )}
    </Card>
  );
};

export const PurchasesTab: React.FC<{
  projectId: string; workspaceId?: string | null; projectName: string; currency?: string | null; canFinance: boolean;
  /** Tender packages are a main-contractor feature; off unless the project's kind or sections include it. */
  showTenders?: boolean;
}> = ({ projectId, workspaceId, projectName, currency, canFinance, showTenders = false }) => {
  const [summary, setSummary] = useState<ProjectPurchaseSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [billsVersion, setBillsVersion] = useState(0);

  const loadSummary = useCallback(async () => {
    if (!canFinance) return;
    try { setSummary(await projectsService.purchaseSummary(projectId)); setFailed(false); }
    catch { setFailed(true); }
  }, [projectId, canFinance]);
  useEffect(() => { void loadSummary(); }, [loadSummary]);

  // Raising or awarding creates orders; an order can raise a bill. Each list reloads when another card changes it.
  const onOrdersCreated = () => { setOrdersVersion((v) => v + 1); void loadSummary(); };
  const onOrdersChanged = () => { setBillsVersion((v) => v + 1); void loadSummary(); };

  const items = (
    <PurchaseItemsTab
      projectId={projectId}
      workspaceId={workspaceId}
      projectName={projectName}
      canFinance={canFinance}
      onChanged={onOrdersCreated}
    />
  );
  if (!canFinance) return items;

  return (
    <div className="space-y-4">
      <PurchaseTiles summary={summary} failed={failed} />
      {items}
      <ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Purchase orders, tenders and supplier bills for this project.">
        <div className="space-y-4">
          <OrdersPanel key={ordersVersion} workspaceId={workspaceId ?? ''} projectId={projectId} projectName={projectName} orderType="purchase" onChanged={onOrdersChanged} />
          {showTenders && <TenderPackagesCard projectId={projectId} workspaceId={workspaceId ?? null} currency={currency ?? 'EUR'} isOwner={canFinance} onChanged={onOrdersCreated} />}
          <SupplierBillsCard key={billsVersion} projectId={projectId} onChanged={() => void loadSummary()} />
          <ProjectExpensesCard projectId={projectId} projectName={projectName} workspaceId={workspaceId ?? ''} onChanged={() => void loadSummary()} />
        </div>
      </ModuleTabGate>
    </div>
  );
};
