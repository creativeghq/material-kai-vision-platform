import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Loader2,
  Eye,
  Trash2,
  FileText,
  Clock,
  CheckCircle,
  ArrowDownUp,
  Settings,
} from 'lucide-react';
import { QuoteStatusWord } from '@/lib/quoteStatus';
import { QuoteSettingsPage } from './QuoteSettingsPage';
import { PageHeader } from '@/components/shared/PageHeader';

import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildQuoteFilters } from '../components/quoteFilters';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { CreateQuoteModal } from '../components/CreateQuoteModal';
import { RequestsInboxPanel } from '../components/RequestsInboxPanel';
import { quotesService, QuoteWithItems } from '../services/QuotesService';
import { formatDate } from '@/utils/datetime';

type QuotesTab = 'quotes' | 'requests' | 'settings';

/**
 * Main Quotes Page - Customer facing
 * Table-based design matching admin/quote-requests with stats cards
 */
export const QuotesPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canManageNetwork = can('network.manage');

  // Tab state (?tab=requests deep-links the procurement inbox, merged here from /requests).
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const activeTab: QuotesTab = canManageNetwork && (requestedTab === 'requests' || requestedTab === 'settings')
    ? (requestedTab as QuotesTab)
    : 'quotes';
  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val === 'requests' || val === 'settings') params.set('tab', val);
    else params.delete('tab');
    setSearchParams(params, { replace: true });
  };

  // State
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);

  // App Launcher deep-link: /quotes?new=quote opens the Create Quote modal.
  useEffect(() => {
    if (searchParams.get('new') === 'quote') {
      setShowCreateModal(true);
      const params = new URLSearchParams(searchParams);
      params.delete('new');
      setSearchParams(params, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  const filterGroups = useMemo(() => buildQuoteFilters(quotes), [quotes]);
  const { values: filterValues, setValues: setFilterValues, filtered: filteredQuotes, previewCount } =
    useFilters<QuoteWithItems>(quotes, filterGroups);

  // Narrowing the filter or deleting a quote can shrink the list under the current page.
  useEffect(() => { setPage(1); }, [filterValues]);
  useEffect(() => { setPage((p) => clampPage(p, filteredQuotes.length)); }, [filteredQuotes.length]);


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

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={ShoppingCart}
        title="My Quotes"
        subtitle="Create and manage your material quotes"
        actions={
          activeTab === 'quotes' ? (
            <Button onClick={() => setShowCreateModal(true)} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New quote
            </Button>
          ) : undefined
        }
      />

      {/* Main Content */}
      <div className="page-container pt-6 pb-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Tabs only appear for network-node personas (Requests merged in from /requests).
              End-users / staff / sales just see the quotes list with no tab chrome. */}
          {canManageNetwork && (
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2 mb-6">
              <TabsTrigger value="quotes" className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4" /> My Quotes
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4" /> Requests
              </TabsTrigger>
              <TabsTrigger value="settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" /> Settings
              </TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="quotes" className="space-y-6 mt-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                  <p>Loading quotes...</p>
                </div>
              </div>
            ) : (
              <>
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
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Quote Requests
            </h3>
            <FilterBar
              groups={filterGroups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter quotes"
            />
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
                      Create your first quote
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm">No quotes match your filter</p>
                )}
              </div>
            ) : (
              <>
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
                  {paginate(filteredQuotes, page).map((quote) => (
                    <tr
                      key={quote.id}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors cursor-pointer"
                      // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                      // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                      // row is invalid ARIA and yields a focus stop with no name.
                      onClick={() => handleViewQuote(quote.id)}
                    >
                      <td className="px-6 py-2.5 font-medium">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleViewQuote(quote.id); }}
                          className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {quote.name || 'Untitled Quote'}
                        </button>
                      </td>
                      <td className="px-3 py-2.5"><QuoteStatusWord status={quote.status} /></td>
                      <td className="px-3 py-2.5 tabular-nums">{quote.total_items || quote.items?.length || 0}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatDate(quote.created_at)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{formatDate(quote.expires_at)}</td>
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
              <TablePagination page={page} total={filteredQuotes.length} onPageChange={setPage} label="quotes" />
              </>
            )}
          </div>
        </div>
              </>
            )}
          </TabsContent>

          {canManageNetwork && (
            <TabsContent value="requests" className="mt-0">
              <RequestsInboxPanel />
            </TabsContent>
          )}
          {canManageNetwork && (
            <TabsContent value="settings" className="mt-0">
              <QuoteSettingsPage embedded />
            </TabsContent>
          )}
        </Tabs>
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
