import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Eye,
  Trash2,
  Filter,
  FileText,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { QuoteStatusBadge } from '@/lib/quoteStatus';
import { PageHeader } from '@/components/shared/PageHeader';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/core/ui/command';
import { useToast } from '@/hooks/use-toast';
import { CreateQuoteModal } from '@/components/business/quotes/CreateQuoteModal';
import { quotesService, QuoteWithItems } from '@/services/quotes/QuotesService';

type StatusFilter = 'all' | 'draft' | 'submitted' | 'quoted' | 'accepted' | 'rejected' | 'expired';

/**
 * Main Quotes Page - Customer facing
 * Table-based design matching admin/quote-requests with stats cards
 */
export const QuotesPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();

  // State
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Load quotes
  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await quotesService.getUserQuotes();
      setQuotes(data);
    } catch (error) {
      console.error('Error loading quotes:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quotes',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadQuotes();
  }, [loadQuotes]);

  // Filter quotes based on status
  const filteredQuotes = quotes.filter((quote) => {
    if (statusFilter !== 'all' && quote.status !== statusFilter) {
      return false;
    }
    return true;
  });


  // Handle quote click - navigate to detail page
  const handleViewQuote = (quoteId: string) => {
    navigate(`/quotes/${quoteId}`);
  };

  // Handle delete quote
  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    try {
      await quotesService.deleteQuoteRequest(quoteId);
      toast({
        title: 'Success',
        description: 'Quote deleted successfully',
      });
      loadQuotes();
    } catch (error) {
      console.error('Error deleting quote:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete quote';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  // Handle quote created - navigate to detail page
  const handleQuoteCreated = (quoteId: string) => {
    loadQuotes();
    navigate(`/quotes/${quoteId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading quotes...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={ShoppingCart}
        title="My Quotes"
        subtitle="Create and manage your material quotes"
        actions={
          <Button onClick={() => setShowCreateModal(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            New Quote
          </Button>
        }
      />

      {/* Main Content */}
      <div className="page-container pt-6 pb-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <ShoppingCart className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Quotes</p>
                <p className="text-lg font-semibold">{quotes.length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'submitted').length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Accepted</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'accepted').length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Drafts</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'draft').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quotes Table */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-3 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Quote Requests
              {statusFilter !== 'all' && (
                <span className="text-xs text-muted-foreground font-normal">· {statusFilter}</span>
              )}
            </h3>
            <Popover open={filterOpen} onOpenChange={setFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 hover:bg-muted ${statusFilter !== 'all' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  <span className="text-xs">
                    {statusFilter === 'all' ? 'Filter' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search status..." />
                  <CommandList>
                    <CommandEmpty>No status found.</CommandEmpty>
                    <CommandGroup>
                      {(['all', 'draft', 'submitted', 'quoted', 'accepted', 'rejected', 'expired'] as const).map((s) => (
                        <CommandItem
                          key={s}
                          onSelect={() => { setStatusFilter(s); setFilterOpen(false); }}
                          className={statusFilter === s ? 'bg-accent' : ''}
                        >
                          {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="overflow-hidden -mx-3 sm:-mx-6 -mb-6 mt-2">
            {filteredQuotes.length === 0 ? (
              <div className="px-6 pb-6 text-center py-12 text-muted-foreground">
                {quotes.length === 0 ? (
                  <div>
                    <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                    <p className="text-sm mb-4">No quotes yet. Create your first quote to get started.</p>
                    <Button onClick={() => setShowCreateModal(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Quote
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">No quotes match your filter</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                  <tr className="text-xs font-semibold text-muted-foreground">
                    <th className="text-left px-6 py-2.5 font-medium">Quote Name</th>
                    <th className="text-left px-3 py-2.5 font-medium">Status</th>
                    <th className="text-left px-3 py-2.5 font-medium">Items</th>
                    <th className="text-left px-3 py-2.5 font-medium">Created</th>
                    <th className="text-left px-3 py-2.5 font-medium">Expires</th>
                    <th className="text-right px-6 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQuotes.map((quote) => (
                    <tr
                      key={quote.id}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => handleViewQuote(quote.id)}
                    >
                      <td className="px-6 py-2.5 font-medium">{quote.name || 'Untitled Quote'}</td>
                      <td className="px-3 py-2.5"><QuoteStatusBadge status={quote.status} /></td>
                      <td className="px-3 py-2.5 tabular-nums">{quote.total_items || quote.items?.length || 0}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{new Date(quote.created_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{new Date(quote.expires_at).toLocaleDateString()}</td>
                      <td className="px-6 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); handleViewQuote(quote.id); }}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => { e.stopPropagation(); handleDeleteQuote(quote.id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Quote Modal */}
      <CreateQuoteModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleQuoteCreated}
      />
    </div>
  );
};

export default QuotesPage;
