import React, { useState, useEffect } from 'react';
import { Receipt, Download, ArrowUpDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { CreditsService, type CreditTransaction } from '@/services/credits.service';

const creditsService = new CreditsService();

type Transaction = CreditTransaction;

export const BillingHistoryTab: React.FC = () => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
  }, [user]);

  const loadTransactions = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data } = await creditsService.getTransactions();
      setTransactions(data || []);
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

  const getTransactionBadge = (type: string) => {
    return type === 'credit' ? (
      <Badge variant="default" className="bg-green-500">
        Credit
      </Badge>
    ) : (
      <Badge variant="secondary">Debit</Badge>
    );
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Billing History
        </CardTitle>
        <CardDescription>View all your credit transactions and purchases</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No transactions yet. Purchase credits or subscribe to get started!
          </div>
        ) : (
          <div className="rounded-lg border">
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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      {formatDate(transaction.created_at)}
                    </TableCell>
                    <TableCell>{getTransactionBadge(transaction.transaction_type)}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {transaction.description}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        transaction.transaction_type !== 'debit'
                          ? 'text-green-600'
                          : 'text-red-600'
                      }`}
                    >
                      {transaction.transaction_type !== 'debit' ? '+' : '-'}
                      {Math.abs(transaction.amount ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {(transaction.balance_after ?? 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

