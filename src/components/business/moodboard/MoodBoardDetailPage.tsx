import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Upload, Trash2, Edit, Loader2, Plus, FileText } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';
import { DashboardCard } from '@/components/core/DesignSystem/DashboardCard';
import { ProductDetailModal } from '@/components/features/products/ProductDetailModal';
import type { Product } from '@/components/features/products/types';
import { RecommendationsService } from '@/services/recommendationsService';
import { quotesService } from '@/services/quotes/QuotesService';

export const MoodBoardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [moodboard, setMoodboard] = useState<MoodBoard | null>(null);
  const [items, setItems] = useState<MoodBoardItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);

  useEffect(() => {
    if (id) {
      loadMoodboardDetails();
    }
  }, [id]);

  const loadMoodboardDetails = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const [boardData, itemsData] = await Promise.all([
        moodboardAPI.getMoodBoard(id),
        moodboardAPI.getMoodBoardItems(id),
      ]);

      setMoodboard(boardData);
      setItems(itemsData);
    } catch (error) {
      console.error('Error loading moodboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to load moodboard details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMoodboard = async () => {
    if (!moodboard) return;
    if (!confirm(`Are you sure you want to delete "${moodboard.title}"?`)) return;
    try {
      await moodboardAPI.deleteMoodBoard(moodboard.id);
      toast({ title: 'Deleted', description: `"${moodboard.title}" has been deleted` });
      navigate('/moodboard');
    } catch (error) {
      console.error('Error deleting moodboard:', error);
      toast({ title: 'Error', description: 'Failed to delete moodboard', variant: 'destructive' });
    }
  };

  const handleCreateProposal = async () => {
    if (!moodboard || items.length === 0) {
      toast({ title: 'Error', description: 'Cannot create proposal from an empty moodboard', variant: 'destructive' });
      return;
    }
    setCreatingProposal(true);
    try {
      const quote = await quotesService.createQuote({
        name: `Proposal from ${moodboard.title}`,
        notes: `Created from moodboard: ${moodboard.title}`,
      });
      for (const item of items) {
        if (item.material_id) {
          await quotesService.addItem({
            quote_id: quote.id,
            product_id: item.material_id,
            quantity: 1,
            notes: item.notes || '',
            added_from: 'moodboard',
          });
        }
      }
      toast({ title: 'Proposal Created', description: `Quote created with ${items.length} items` });
      navigate(`/quotes?quote=${quote.id}`);
    } catch (error) {
      console.error('Error creating proposal:', error);
      toast({ title: 'Error', description: 'Failed to create proposal', variant: 'destructive' });
    } finally {
      setCreatingProposal(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    try {
      await moodboardAPI.removeMoodBoardItem(itemId);
      setItems(items.filter((item) => item.id !== itemId));
      toast({
        title: 'Success',
        description: 'Item removed from moodboard',
      });
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove item',
        variant: 'destructive',
      });
    }
  };

  const handleProductClick = (item: MoodBoardItem) => {
    if (item.material) {
      // Track click interaction
      RecommendationsService.trackClick(item.material.id, {
        source: 'moodboard',
        moodboard_id: id,
      });

      // Convert MoodBoardItem material to Product format
      const product: Product = {
        id: item.material.id,
        name: item.material.name || 'Unnamed Product',
        category: item.material.category || 'Uncategorized',
        images: item.material.thumbnail_url ? [item.material.thumbnail_url] : [],
        metadata: item.material.properties || {},
        description: item.notes || '',
      };
      setSelectedProduct(product);
      setShowProductModal(true);
    }
  };

  const filteredItems = items.filter((item) =>
    item.material?.name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!moodboard) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-lg text-muted-foreground">Moodboard not found</p>
        <Button onClick={() => navigate('/moodboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Moodboards
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/moodboard')}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Moodboards
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">{moodboard.title}</h1>
            {moodboard.description && (
              <p className="text-muted-foreground">{moodboard.description}</p>
            )}
          </div>
          <TooltipProvider>
            <div className="flex gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCreateProposal}
                    disabled={creatingProposal || items.length === 0}
                  >
                    {creatingProposal
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileText className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create Proposal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDeleteMoodboard}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete Moodboard</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Search and Actions */}
      <div className="mb-6 flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products in this moodboard..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Products Grid */}
      {filteredItems.length === 0 ? (
        <DashboardCard className="text-center py-12">
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {searchQuery
                ? 'No products match your search'
                : 'No products in this moodboard yet'}
            </p>
            {!searchQuery && (
              <Button onClick={() => navigate('/agent-hub')}>
                <Plus className="h-4 w-4 mr-2" />
                Search for Products
              </Button>
            )}
          </CardContent>
        </DashboardCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredItems.map((item) => (
            <DashboardCard
              key={item.id}
              className="group cursor-pointer"
              hover={true}
              onClick={() => handleProductClick(item)}
            >
              <CardHeader className="pb-3">
                {item.material?.thumbnail_url && (
                  <div className="aspect-square rounded-lg overflow-hidden mb-3 bg-gray-100">
                    <img
                      src={item.material.thumbnail_url}
                      alt={item.material.name || 'Product'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                )}
                <CardTitle className="text-lg line-clamp-2">
                  {item.material?.name || 'Unnamed Product'}
                </CardTitle>
                {item.material?.category && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.material.category}
                  </p>
                )}
                {item.notes && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {item.notes}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveItem(item.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              </CardContent>
            </DashboardCard>
          ))}
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={showProductModal}
        onClose={() => {
          setShowProductModal(false);
          setSelectedProduct(null);
        }}
      />
    </div>
  );
};
