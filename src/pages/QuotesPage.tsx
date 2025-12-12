import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Eye,
  Trash2,
  Filter,
} from 'lucide-react';

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { CreateQuoteModal } from '@/components/Quotes/CreateQuoteModal';
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

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: { icon: Clock, className: 'bg-gray-100 text-gray-800' },
      submitted: { icon: FileText, className: 'bg-blue-100 text-blue-800' },
      quoted: { icon: CheckCircle, className: 'bg-purple-100 text-purple-800' },
      accepted: { icon: CheckCircle, className: 'bg-green-100 text-green-800' },
      rejected: { icon: XCircle, className: 'bg-red-100 text-red-800' },
      expired: { icon: XCircle, className: 'bg-gray-100 text-gray-600' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.className}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

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
      {/* Page Header */}
      <div className="bg-card py-6">
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">My Quotes</h1>
                <p className="text-muted-foreground">
                  Create and manage your material quotes
                </p>
              </div>
            </div>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Quote
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container py-6">
        {/* Stats Cards - Compact like /quotes/:id */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <ShoppingCart className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Total Quotes</p>
                <p className="text-lg font-semibold">{quotes.length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Clock className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'submitted').length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <CheckCircle className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Accepted</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'accepted').length}</p>
              </div>
            </div>
          </div>
          <div className="dashboard-card p-4" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <FileText className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Drafts</p>
                <p className="text-lg font-semibold">{quotes.filter(q => q.status === 'draft').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar - Minimal */}
        <div className="flex items-center justify-end py-3 mt-6 mb-4 border-b border-border">
          {/* Searchable Filter */}
          <Popover open={filterOpen} onOpenChange={setFilterOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-8 px-2 hover:bg-muted ${statusFilter !== 'all' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Filter className="h-4 w-4 mr-1.5" />
                <span className="text-sm">
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
                    <CommandItem
                      onSelect={() => { setStatusFilter('all'); setFilterOpen(false); }}
                      className={statusFilter === 'all' ? 'bg-primary/10' : ''}
                    >
                      All Statuses
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('draft'); setFilterOpen(false); }}
                      className={statusFilter === 'draft' ? 'bg-primary/10' : ''}
                    >
                      Draft
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('submitted'); setFilterOpen(false); }}
                      className={statusFilter === 'submitted' ? 'bg-primary/10' : ''}
                    >
                      Submitted
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('quoted'); setFilterOpen(false); }}
                      className={statusFilter === 'quoted' ? 'bg-primary/10' : ''}
                    >
                      Quoted
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('accepted'); setFilterOpen(false); }}
                      className={statusFilter === 'accepted' ? 'bg-primary/10' : ''}
                    >
                      Accepted
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('rejected'); setFilterOpen(false); }}
                      className={statusFilter === 'rejected' ? 'bg-primary/10' : ''}
                    >
                      Rejected
                    </CommandItem>
                    <CommandItem
                      onSelect={() => { setStatusFilter('expired'); setFilterOpen(false); }}
                      className={statusFilter === 'expired' ? 'bg-primary/10' : ''}
                    >
                      Expired
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Quotes Table */}
        <div className="dashboard-card" style={{ border: '1px solid hsl(var(--muted-foreground) / 0.2)' }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredQuotes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {quotes.length === 0 ? (
                      <div>
                        <ShoppingCart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="mb-4">No quotes yet. Create your first quote to get started.</p>
                        <Button onClick={() => setShowCreateModal(true)}>
                          <Plus className="h-4 w-4 mr-2" />
                          Create Your First Quote
                        </Button>
                      </div>
                    ) : (
                      'No quotes match your filter'
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filteredQuotes.map((quote) => (
                  <TableRow
                    key={quote.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleViewQuote(quote.id)}
                  >
                    <TableCell className="font-medium">
                      {quote.name || 'Untitled Quote'}
                    </TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell>{quote.total_items || quote.items?.length || 0}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(quote.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(quote.expires_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewQuote(quote.id);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteQuote(quote.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
