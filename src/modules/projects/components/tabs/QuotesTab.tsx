import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, ArrowRight } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../../services/projectsService';

interface QuotesTabProps {
  projectId: string;
}

interface QuoteRow {
  id: string;
  name: string | null;
  status: string;
  grand_total: number | null;
  currency: string | null;
  total_items: number;
  quote_number: string | null;
  updated_at: string;
  created_at: string;
}

const STATUS_TONES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  submitted: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  quoted: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  accepted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-destructive/15 text-destructive border-destructive/30',
  expired: 'bg-muted text-muted-foreground border-border',
};

const formatMoney = (amount: number | null, currency: string | null) => {
  if (!amount) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(amount);
};

export const QuotesTab: React.FC<QuotesTabProps> = ({ projectId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listProjectQuotes(projectId);
      setQuotes(data as QuoteRow[]);
    } catch (err) {
      toast({ title: 'Failed to load quotes', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (quotes.length === 0) {
    return (
      <Card className="dashboard-card">
        <CardContent className="py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No quotes attached to this project yet.</p>
          <p className="text-xs text-muted-foreground mb-4">
            Create a quote and pick this project to start tracking budget vs. actual.
          </p>
          <Button variant="outline" onClick={() => navigate('/quotes')}>
            Go to Quotes
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card">
      <CardContent className="p-0">
        <div className="divide-y divide-white/8">
          {quotes.map(q => (
            <button
              key={q.id}
              onClick={() => navigate(`/admin/quotes/${q.id}`)}
              className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-center gap-3"
            >
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{q.name || `Quote #${q.id.slice(0, 8)}`}</p>
                  {q.quote_number && (
                    <span className="text-xs text-muted-foreground">{q.quote_number}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {q.total_items} {q.total_items === 1 ? 'item' : 'items'} ·
                  Updated {new Date(q.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">{formatMoney(q.grand_total, q.currency)}</p>
                <Badge variant="outline" className={`text-xs mt-1 ${STATUS_TONES[q.status] || ''}`}>
                  {q.status}
                </Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
