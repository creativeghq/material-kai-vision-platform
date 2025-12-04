import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Eye, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteRequest } from '@/services/quotes.service';
import { QuoteRequestModal } from './QuoteRequestModal';

export const QuoteRequestsPage: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteRequest | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadQuoteRequests();
  }, []);

  const loadQuoteRequests = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getQuoteRequests();
      setQuoteRequests(data);
    } catch (error) {
      console.error('Error loading quote requests:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote requests',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewQuote = async (quoteId: string) => {
    try {
      const quote = await quotesService.getQuoteRequest(quoteId);
      setSelectedQuote(quote);
      setShowModal(true);
    } catch (error) {
      console.error('Error loading quote details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote details',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-600/20 text-yellow-300', icon: Clock },
      updated: { color: 'bg-blue-600/20 text-blue-300', icon: FileText },
      approved: { color: 'bg-green-600/20 text-green-300', icon: CheckCircle },
      rejected: { color: 'bg-red-600/20 text-red-300', icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant="secondary" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-4xl font-bold text-white flex items-center gap-3">
              <FileText className="h-10 w-10" />
              Quote Requests
            </h1>
            <p className="text-white/60 text-lg mt-1">
              Manage your material quote requests
            </p>
          </div>
          <Button
            onClick={() => {
              // Navigate to cart or create quote flow
              toast({
                title: 'Info',
                description: 'Add items to cart first to request a quote',
              });
            }}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Quote Request
          </Button>
        </div>
      </div>

      {/* Quote Requests Table */}
      <div className="max-w-7xl mx-auto">
        {quoteRequests.length === 0 ? (
          <Card className="bg-white/10 border-white/20">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-16 w-16 text-white/40 mb-4" />
              <p className="text-white/60 text-lg mb-4">No quote requests yet</p>
              <Button
                onClick={() => {
                  toast({
                    title: 'Info',
                    description: 'Add items to cart first to request a quote',
                  });
                }}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Quote Request
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white/10 border-white/20">
            <CardHeader>
              <CardTitle className="text-white">All Quote Requests</CardTitle>
              <CardDescription className="text-white/60">
                {quoteRequests.length} total request{quoteRequests.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/80">ID</TableHead>
                      <TableHead className="text-white/80">Status</TableHead>
                      <TableHead className="text-white/80">Items</TableHead>
                      <TableHead className="text-white/80">Estimated</TableHead>
                      <TableHead className="text-white/80">Created</TableHead>
                      <TableHead className="text-white/80 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quoteRequests.map((quote) => (
                      <TableRow key={quote.id} className="border-white/10">
                        <TableCell className="text-white/80 font-mono text-sm">
                          {quote.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{getStatusBadge(quote.status)}</TableCell>
                        <TableCell className="text-white/80">
                          {quote.items_count || 0} items
                        </TableCell>
                        <TableCell className="text-white/80">
                          {formatPrice(quote.total_estimated)}
                        </TableCell>
                        <TableCell className="text-white/80">
                          {formatDate(quote.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleViewQuote(quote.id)}
                            variant="outline"
                            size="sm"
                            className="border-white/20 text-white hover:bg-white/10"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quote Detail Modal */}
      {showModal && selectedQuote && (
        <QuoteRequestModal
          quote={selectedQuote}
          onClose={() => {
            setShowModal(false);
            setSelectedQuote(null);
          }}
          onUpdate={loadQuoteRequests}
        />
      )}
    </div>
  );
};

