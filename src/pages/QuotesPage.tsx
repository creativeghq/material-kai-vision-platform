import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  Grid,
  List,
  Loader2,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Calendar,
  ChevronRight,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { QuoteManagementSidebar } from '@/components/Quotes/QuoteManagementSidebar';
import { CreateQuoteModal } from '@/components/Quotes/CreateQuoteModal';
import { quotesService, QuoteWithItems } from '@/services/quotes/QuotesService';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'draft' | 'submitted' | 'quoted' | 'accepted' | 'rejected' | 'expired';

/**
 * Main Quotes Page
 * Full-featured quotes management with list/grid view, search, filters, and quote cards
 */
export const QuotesPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // State
  const [quotes, setQuotes] = useState<QuoteWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | undefined>(
    searchParams.get('quote') || undefined
  );
  const [showCreateModal, setShowCreateModal] = useState(false);

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

  // Open sidebar if quote param is present
  useEffect(() => {
    const quoteId = searchParams.get('quote');
    if (quoteId) {
      setSelectedQuoteId(quoteId);
      setSidebarOpen(true);
    }
  }, [searchParams]);

  // Filter quotes based on search and status
  const filteredQuotes = quotes.filter((quote) => {
    // Status filter
    if (statusFilter !== 'all' && quote.status !== statusFilter) {
      return false;
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const name = (quote.name || '').toLowerCase();
      const customText = (quote.custom_request_text || '').toLowerCase();
      return name.includes(query) || customText.includes(query);
    }

    return true;
  });

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
      draft: { variant: 'secondary', icon: <FileText className="h-3 w-3" /> },
      submitted: { variant: 'default', icon: <Clock className="h-3 w-3" /> },
      quoted: { variant: 'outline', icon: <Package className="h-3 w-3" /> },
      accepted: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
      rejected: { variant: 'destructive', icon: <XCircle className="h-3 w-3" /> },
      expired: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
    };

    const config = statusConfig[status] || statusConfig.draft;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  // Get expiration status
  const getExpirationInfo = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const daysUntil = Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      return { text: 'Expired', color: 'text-red-500' };
    } else if (daysUntil <= 7) {
      return { text: `Expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`, color: 'text-yellow-500' };
    } else {
      return { text: `Expires in ${daysUntil} days`, color: 'text-muted-foreground' };
    }
  };

  // Handle quote click
  const handleQuoteClick = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    setSidebarOpen(true);
  };

  // Handle quote created
  const handleQuoteCreated = (quoteId: string, _quoteName: string) => {
    loadQuotes();
    setSelectedQuoteId(quoteId);
    setSidebarOpen(true);
  };

  // Status counts for filter badges
  const statusCounts = quotes.reduce((acc, quote) => {
    acc[quote.status] = (acc[quote.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card section-spacing">
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <ShoppingCart className="h-8 w-8 text-primary" />
                Quotes Cart
              </h1>
              <p className="text-muted-foreground mt-2">
                Create and manage your material quotes
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-lg px-4 py-2">
                {quotes.length} Quote{quotes.length !== 1 ? 's' : ''}
              </Badge>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Quote
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="page-container" style={{ marginTop: 'var(--space-lg)' }}>
        <div className="dashboard-card p-4">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search quotes..."
                className="pl-10"
              />
            </div>

            <div className="flex items-center gap-3">
              {/* Status Filter */}
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses ({quotes.length})</SelectItem>
                  <SelectItem value="draft">Draft ({statusCounts.draft || 0})</SelectItem>
                  <SelectItem value="submitted">Submitted ({statusCounts.submitted || 0})</SelectItem>
                  <SelectItem value="quoted">Quoted ({statusCounts.quoted || 0})</SelectItem>
                  <SelectItem value="accepted">Accepted ({statusCounts.accepted || 0})</SelectItem>
                  <SelectItem value="rejected">Rejected ({statusCounts.rejected || 0})</SelectItem>
                  <SelectItem value="expired">Expired ({statusCounts.expired || 0})</SelectItem>
                </SelectContent>
              </Select>

              {/* View Mode Toggle */}
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <TabsList>
                  <TabsTrigger value="grid" className="px-3">
                    <Grid className="h-4 w-4" />
                  </TabsTrigger>
                  <TabsTrigger value="list" className="px-3">
                    <List className="h-4 w-4" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="page-container" style={{ marginTop: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
        {loading ? (
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg text-muted-foreground">Loading quotes...</p>
              </div>
            </CardContent>
          </Card>
        ) : filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  {quotes.length === 0 ? 'No Quotes Yet' : 'No Matching Quotes'}
                </h3>
                <p className="text-muted-foreground mb-6">
                  {quotes.length === 0
                    ? 'Create your first quote to start requesting materials'
                    : 'Try adjusting your search or filters'}
                </p>
                {quotes.length === 0 && (
                  <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Quote
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredQuotes.map((quote) => {
              const expirationInfo = getExpirationInfo(quote.expires_at);
              const itemCount = quote.items?.length || quote.total_items || 0;

              return (
                <Card
                  key={quote.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleQuoteClick(quote.id)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {quote.name || 'Untitled Quote'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {quote.custom_request_text ? 'Custom Request' : `${itemCount} material${itemCount !== 1 ? 's' : ''}`}
                        </p>
                      </div>
                      {getStatusBadge(quote.status)}
                    </div>

                    {quote.custom_request_text && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {quote.custom_request_text}
                      </p>
                    )}

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(quote.created_at).toLocaleDateString()}
                      </div>
                      <span className={expirationInfo.color}>{expirationInfo.text}</span>
                    </div>

                    <div className="mt-3 pt-3 border-t flex items-center justify-end">
                      <Button variant="ghost" size="sm" className="text-primary">
                        View Details
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="dashboard-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium">Quote</th>
                  <th className="text-left p-4 font-medium">Type</th>
                  <th className="text-left p-4 font-medium">Status</th>
                  <th className="text-left p-4 font-medium">Created</th>
                  <th className="text-left p-4 font-medium">Expires</th>
                  <th className="text-right p-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => {
                  const expirationInfo = getExpirationInfo(quote.expires_at);
                  const itemCount = quote.items?.length || quote.total_items || 0;

                  return (
                    <tr
                      key={quote.id}
                      className="border-t hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => handleQuoteClick(quote.id)}
                    >
                      <td className="p-4">
                        <div className="font-medium">{quote.name || 'Untitled Quote'}</div>
                        {quote.custom_request_text && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {quote.custom_request_text}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {quote.custom_request_text ? 'Custom Request' : `${itemCount} material${itemCount !== 1 ? 's' : ''}`}
                      </td>
                      <td className="p-4">{getStatusBadge(quote.status)}</td>
                      <td className="p-4 text-muted-foreground">
                        {new Date(quote.created_at).toLocaleDateString()}
                      </td>
                      <td className={`p-4 ${expirationInfo.color}`}>{expirationInfo.text}</td>
                      <td className="p-4 text-right">
                        <Button variant="ghost" size="sm">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quote Management Sidebar */}
      <QuoteManagementSidebar
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false);
          setSelectedQuoteId(undefined);
        }}
        initialQuoteId={selectedQuoteId}
        onQuoteUpdate={loadQuotes}
      />

      {/* Create Quote Modal */}
      <CreateQuoteModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleQuoteCreated}
      />
    </div>
  );
};
