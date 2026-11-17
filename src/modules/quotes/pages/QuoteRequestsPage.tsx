import React, { useState, useEffect } from 'react';
import { formatDate as formatDateValue } from '@/utils/datetime';
import { FileText, Loader2, Eye, Plus, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import { statusTone } from '@/utils/statusTone';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { quotesService, QuoteWithItems } from '../services/QuotesService';
import { QuoteRequestModal } from '../components/QuoteRequestModal';
import { CreateQuoteModal } from '../components/CreateQuoteModal';

export const QuoteRequestsPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [quoteRequests, setQuoteRequests] = useState<QuoteWithItems[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteWithItems | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadQuoteRequests();
  }, []);

  // Deleting a request can leave us past the last page.
  useEffect(() => {
    setPage(prev => clampPage(prev, quoteRequests.length));
  }, [quoteRequests.length]);

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

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quote request?')) {
      return;
    }

    try {
      await quotesService.deleteQuoteRequest(quoteId);
      toast({
        title: 'Success',
        description: 'Quote request deleted successfully',
      });
      loadQuoteRequests();
    } catch (error) {
      console.error('Error deleting quote request:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete quote request',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: {
        color: 'bg-[hsl(var(--badge-pending-bg))] text-[hsl(var(--badge-pending-text))] border-[hsl(var(--badge-pending-border))]',
        icon: Clock,
      },
      updated: {
        color: 'bg-[hsl(var(--badge-updated-bg))] text-[hsl(var(--badge-updated-text))] border-[hsl(var(--badge-updated-border))]',
        icon: FileText,
      },
      approved: {
        color: 'bg-[hsl(var(--badge-approved-bg))] text-[hsl(var(--badge-approved-text))] border-[hsl(var(--badge-approved-border))]',
        icon: CheckCircle,
      },
      rejected: {
        color: 'bg-[hsl(var(--badge-rejected-bg))] text-[hsl(var(--badge-rejected-text))] border-[hsl(var(--badge-rejected-border))]',
        icon: XCircle,
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center text-xs capitalize ${statusTone(status)}`}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => formatDateValue(dateString);


  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                Quote Requests
              </h1>
              <p className="text-muted-foreground mt-2">
                Manage your material quote requests
              </p>
            </div>
            <Button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Plus className="h-4 w-4 mr-2" />
              New quote request
            </Button>
          </div>
        </div>
      </div>

      {/* Quote Requests Table */}
      <div className="page-container" style={{ marginTop: 'var(--space-xl)' }}>
        {quoteRequests.length === 0 ? (
          <div className="dashboard-card rounded-2xl border-0 shadow-sm flex flex-col items-center justify-center py-14 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No quote requests yet</p>
            <Button onClick={() => setShowCreateModal(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create your first quote request
            </Button>
          </div>
        ) : (
          <div className="dashboard-card rounded-2xl border-0 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div>
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <FileText className="h-4 w-4" /> All Quote Requests
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {quoteRequests.length} total request{quoteRequests.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">ID</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Items</TableHead>
                      <TableHead className="text-muted-foreground">Name</TableHead>
                      <TableHead className="text-muted-foreground">Created</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginate(quoteRequests, page).map((quote) => (
                      <TableRow key={quote.id} className="border-border">
                        <TableCell className="text-card-foreground font-mono text-sm">
                          {quote.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{getStatusBadge(quote.status)}</TableCell>
                        <TableCell className="text-card-foreground">
                          {quote.items?.length || 0} items
                        </TableCell>
                        <TableCell className="text-card-foreground">
                          {quote.name || 'Untitled Quote'}
                        </TableCell>
                        <TableCell className="text-card-foreground">
                          {formatDate(quote.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              onClick={() => handleViewQuote(quote.id)}
                              variant="outline"
                              size="sm"
                              className="border-border text-primary hover:bg-accent"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Button
                              onClick={() => handleDeleteQuote(quote.id)}
                              variant="outline"
                              size="sm"
                              className="border-border text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </div>
            <TablePagination
              page={page}
              total={quoteRequests.length}
              onPageChange={setPage}
              label="requests"
            />
          </div>
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

      {/* Create Quote Modal */}
      {showCreateModal && (
        <CreateQuoteModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(quoteId) => {
            setShowCreateModal(false);
            navigate(`/quotes?quote=${quoteId}`);
          }}
        />
      )}
    </div>
  );
};

