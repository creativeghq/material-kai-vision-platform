import React, { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  X,
  ShoppingCart,
  Trash2,
  Send,
  Loader2,
  Search,
  Package,
  Clock,
  AlertCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Quote, QuoteWithItems } from '@/services/quotes/QuotesService';
import { QuoteBuilderView } from './QuoteBuilderView';
import { CreateQuoteModal } from './CreateQuoteModal';

interface QuoteManagementSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuoteId?: string;
}

export const QuoteManagementSidebar: React.FC<QuoteManagementSidebarProps> = ({
  isOpen,
  onClose,
  initialQuoteId,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuote, setSelectedQuote] = useState<QuoteWithItems | null>(null);
  const [view, setView] = useState<'list' | 'detail' | 'create'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadQuotes();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialQuoteId && quotes.length > 0) {
      handleSelectQuote(initialQuoteId);
    }
  }, [initialQuoteId, quotes]);

  const loadQuotes = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getQuotes({ status: 'draft' });
      setQuotes(data || []);
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
  };

  const handleSelectQuote = async (quoteId: string) => {
    try {
      const quoteData = await quotesService.getQuote(quoteId);
      setSelectedQuote(quoteData);
      setView('detail');
    } catch (error) {
      console.error('Error loading quote details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load quote details',
        variant: 'destructive',
      });
    }
  };

  const handleCreateQuote = (quoteId: string, quoteName: string) => {
    loadQuotes();
    handleSelectQuote(quoteId);
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    try {
      await quotesService.deleteQuote(quoteId);
      await loadQuotes();
      if (selectedQuote?.id === quoteId) {
        setSelectedQuote(null);
        setView('list');
      }
      toast({
        title: 'Success',
        description: 'Quote deleted',
      });
    } catch (error) {
      console.error('Error deleting quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete quote',
        variant: 'destructive',
      });
    }
  };

  const getExpirationStatus = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const daysUntilExpiration = Math.ceil(
      (expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiration < 0) {
      return { status: 'expired', days: 0, color: 'text-red-400' };
    } else if (daysUntilExpiration <= 7) {
      return { status: 'expiring-soon', days: daysUntilExpiration, color: 'text-yellow-400' };
    } else {
      return { status: 'active', days: daysUntilExpiration, color: 'text-green-400' };
    }
  };

  const filteredQuotes = quotes.filter((quote) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      quote.id.toLowerCase().includes(searchLower) ||
      quote.name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <>
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-2xl bg-gray-900 border-white/20 text-white p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-2xl text-white flex items-center gap-2">
                  <ShoppingCart className="h-6 w-6" />
                  {view === 'list' ? 'My Quotes' : view === 'detail' ? 'Quote Details' : 'Create Quote'}
                </SheetTitle>
                <SheetDescription className="text-white/60">
                  {view === 'list'
                    ? 'Manage your material quote requests'
                    : view === 'detail'
                    ? 'View and edit quote materials'
                    : 'Add materials to your new quote'}
                </SheetDescription>
              </div>
              {view !== 'list' && (
                <Button
                  onClick={() => {
                    setView('list');
                    setSelectedQuote(null);
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-white/60 hover:text-white"
                >
                  Back to List
                </Button>
              )}
            </div>
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {view === 'list' && (
              <div className="space-y-4">
                {/* Search & Create */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search quotes..."
                      className="pl-10 bg-white/5 border-white/20 text-white"
                    />
                  </div>
                  <Button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    New Quote
                  </Button>
                </div>

                {/* Quotes List */}
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                  </div>
                ) : filteredQuotes.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-white/40 mx-auto mb-4" />
                    <p className="text-white/60 mb-4">
                      {searchQuery ? 'No quotes found' : 'No quotes yet'}
                    </p>
                    {!searchQuery && (
                      <Button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Quote
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredQuotes.map((quote) => (
                      <div
                        key={quote.id}
                        className="bg-white/5 rounded-lg p-4 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer"
                        onClick={() => handleSelectQuote(quote.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <FileText className="h-5 w-5 text-purple-400" />
                              <h3 className="text-white font-medium">
                                {quote.name || `Quote #${quote.id.substring(0, 8)}`}
                              </h3>
                              <Badge variant="secondary" className="bg-[hsl(var(--badge-updated-bg))] text-[hsl(var(--badge-updated-text))] border-[hsl(var(--badge-updated-border))]">
                                {quote.status}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-white/60">
                              <span className="flex items-center gap-1">
                                <Package className="h-4 w-4" />
                                {quote.total_items || 0} items
                              </span>
                              <span>
                                {new Date(quote.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {/* Expiration Status */}
                            {quote.expires_at && (() => {
                              const expStatus = getExpirationStatus(quote.expires_at);
                              return (
                                <div className={`flex items-center gap-1 text-xs mt-2 ${expStatus.color}`}>
                                  {expStatus.status === 'expired' ? (
                                    <>
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Expired</span>
                                    </>
                                  ) : expStatus.status === 'expiring-soon' ? (
                                    <>
                                      <Clock className="h-3 w-3" />
                                      <span>Expires in {expStatus.days} day{expStatus.days !== 1 ? 's' : ''}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Clock className="h-3 w-3" />
                                      <span>Expires in {expStatus.days} days</span>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteQuote(quote.id);
                            }}
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'detail' && selectedQuote && (
              <QuoteBuilderView
                quote={selectedQuote}
                onUpdate={() => {
                  loadQuotes();
                  if (selectedQuote) {
                    handleSelectQuote(selectedQuote.id);
                  }
                }}
                onClose={() => {
                  setView('list');
                  setSelectedQuote(null);
                }}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>

    <CreateQuoteModal
      open={showCreateModal}
      onClose={() => setShowCreateModal(false)}
      onSuccess={handleCreateQuote}
    />
  </>
  );
};

