import React, { useState, useEffect } from 'react';
import { Receipt, ArrowUpDown } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { directionTone } from '@/utils/statusTone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { useAuth } from '@/contexts/AuthContext';
import { CreditsService, type CreditTransaction } from '@/services/credits.service';

const creditsService = new CreditsService();

type Transaction = CreditTransaction;

export const BillingHistoryTab: React.FC = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  // Server-side paging: getTransactions() only ever returns one page, so paging client-side over
  // its result would have made every row past the first page unreachable.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  const loadTransactions = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, count } = await creditsService.getTransactions(
        TABLE_PAGE_SIZE,
        (page - 1) * TABLE_PAGE_SIZE,
      );
      setTransactions(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Money-in (purchase / refund / bonus / monthly_grant) vs money-out (debit / deduction)
  // is decided by the sign of the amount — the transaction_type is only the label.
  const getTransactionBadge = (t: Transaction) => {
    const isCredit = Number(t.amount ?? 0) >= 0;
    const label = (t.transaction_type || (isCredit ? 'credit' : 'debit')).replace(/_/g, ' ');
    return (
      <span className={`text-xs capitalize ${directionTone(isCredit ? 'in' : 'out')}`}>{label}</span>
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={Receipt} title="Billing History" subtitle="All your credit transactions and purchases." />
      <Card className="rounded-2xl">
        <CardContent className="p-0">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No transactions yet. Purchase credits or subscribe to get started!
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      Date
                      <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      {formatDate(transaction.created_at)}
                    </TableCell>
                    <TableCell>{getTransactionBadge(transaction)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {transaction.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${directionTone(
                        Number(transaction.amount ?? 0) >= 0 ? 'in' : 'out',
                      )}`}
                    >
                      {Number(transaction.amount ?? 0) >= 0 ? '+' : ''}
                      {Number(transaction.amount ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(transaction.balance_after ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              total={total}
              onPageChange={setPage}
              label="transactions"
            />
          </div>
        )}
        </CardContent>
      </Card>
    </div>
  );
};

