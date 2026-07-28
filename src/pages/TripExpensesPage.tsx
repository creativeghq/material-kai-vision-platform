import React from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import TripExpensesPanel from '@/modules/finance/components/TripExpensesPanel';

/**
 * Sales-rep surface for trip cards (expense reports). Any workspace member can
 * log their own trips here and submit them to finance — this route is NOT
 * finance-gated. Finance reviews the same cards from the Finance → Trip cards tab.
 */
const TripExpensesPage: React.FC = () => {
  const { activeWorkspaceId, loading } = useWorkspace();

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-4">
      <SectionHeader
        title="My Expenses"
        subtitle="Track your expenses by card — a sales trip, a month of expenses, anything — attach receipts, and submit to finance for approval."
      />
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !activeWorkspaceId ? (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No active workspace found for your account.</CardContent></Card>
      ) : (
        <TripExpensesPanel workspaceId={activeWorkspaceId} canReview={false} />
      )}
    </div>
  );
};

export default TripExpensesPage;
