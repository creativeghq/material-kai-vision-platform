import React, { useState, useEffect } from 'react';
import { Activity, Brain, ArrowUpDown } from 'lucide-react';
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
import { CreditsService } from '@/services/credits.service';

const creditsService = new CreditsService();

interface UsageLog {
  id: string;
  created_at: string;
  operation_type: string;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  credits_debited: number;
}

export const UsageHistoryTab: React.FC = () => {
  const { user } = useAuth();
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsageLogs();
  }, [user]);

  const loadUsageLogs = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { logs, error } = await creditsService.getUsageLogs();
      if (error) throw new Error(error);
      setUsageLogs(logs || []);
    } catch (error) {
      console.error('Error loading usage logs:', error);
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

  const getOperationBadge = (operation: string) => {
    const colors: Record<string, string> = {
      pdf_processing: 'bg-blue-500',
      agent_chat: 'bg-purple-500',
      material_search: 'bg-green-500',
      vision_analysis: 'bg-orange-500',
    };

    return (
      <Badge className={colors[operation] || 'bg-gray-500'}>
        {operation.replace(/_/g, ' ')}
      </Badge>
    );
  };

  const totalCreditsUsed = usageLogs.reduce((sum, log) => sum + log.credits_debited, 0);
  const totalTokens = usageLogs.reduce(
    (sum, log) => sum + log.input_tokens + log.output_tokens,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Usage Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 shadow-lg rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-blue-900">Total Operations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-900">{usageLogs.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 shadow-lg rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-purple-900">Credits Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-900">{totalCreditsUsed.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 shadow-lg rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-green-900">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-900">{totalTokens.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Logs Table */}
      <Card className="bg-white/80 backdrop-blur-sm border-white/20 shadow-lg rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            AI Usage History
          </CardTitle>
          <CardDescription>Detailed log of all AI operations and costs</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading usage logs...</div>
          ) : usageLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No AI operations yet. Start using the platform to see your usage history!
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
                    <TableHead>Operation</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Input Tokens</TableHead>
                    <TableHead className="text-right">Output Tokens</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">
                        {formatDate(log.created_at)}
                      </TableCell>
                      <TableCell>{getOperationBadge(log.operation_type)}</TableCell>
                      <TableCell className="flex items-center gap-2">
                        <Brain className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{log.model_name}</span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {log.input_tokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {log.output_tokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        ${log.total_cost_usd.toFixed(6)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {log.credits_debited.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

