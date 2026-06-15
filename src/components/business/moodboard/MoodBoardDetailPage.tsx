import React, { useState, useEffect, useMemo } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  FileText,
  Eye,
  Tag,
  Building2,
  Layers,
  ExternalLink,
  Palette,
  Video,
  Globe,
  Image,
  Link,
  LockKeyhole,
  Search,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';

import { useToast } from '@/hooks/use-toast';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';
import { ProductDetailModal } from '@/components/features/products/ProductDetailModal';
import type { Product } from '@/components/features/products/types';
import { PinterestImportModal } from './PinterestImportModal';
import { MoodboardProductSearchModal } from './MoodboardProductSearchModal';
import { RecommendationsService } from '@/services/recommendationsService';
import { quotesService } from '@/modules/quotes/services/QuotesService';
import { supabase } from '@/integrations/supabase/client';
import { getProductName, getManufacturer } from '@/utils/productMetadata';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { MoodboardSheetsTab } from './MoodboardSheetsTab';

// ─── Helper: pick the most visually interesting hero image ────────────────────
// Priority: generated images > 3D/VR/video renders > products with rich metadata > first available
function pickHeroImage(items: MoodBoardItem[]): string | null {
  if (items.length === 0) return null;

  // First: prefer generated media images (AI-created, visually rich)
  const generatedImage = items.find((i) => i.media_type === 'image' && i.media_url);
  if (generatedImage?.media_url) return generatedImage.media_url;

  // Second: prefer items whose name/category hints at a 3D or scenic product
  const scenic = items.find((item) => {
    const cat = (item.material?.category || '').toLowerCase();
    const name = (item.material?.name || '').toLowerCase();
    return (
      cat.includes('scene') ||
      cat.includes('interior') ||
      cat.includes('design') ||
      name.includes('3d') ||
      name.includes('render') ||
      name.includes('scene')
    );
  });
  if (scenic?.material?.thumbnail_url) return scenic.material.thumbnail_url;

  // Next: item with notes (curated items tend to be more meaningful)
  const curated = items.find((i) => i.notes && i.material?.thumbnail_url);
  if (curated?.material?.thumbnail_url) return curated.material.thumbnail_url;

  // Fallback: avoid obvious tile-like categories, prefer any other
  const notTile = items.find((i) => {
    const cat = (i.material?.category || '').toLowerCase();
    return (
      i.material?.thumbnail_url &&
      !cat.includes('tile') &&
      !cat.includes('texture')
    );
  });
  if (notTile?.material?.thumbnail_url) return notTile.material.thumbnail_url;

  // Last resort: just take the first one with an image
  return items.find((i) => i.material?.thumbnail_url)?.material?.thumbnail_url ?? null;
}


export const MoodBoardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [moodboard, setMoodboard] = useState<MoodBoard | null>(null);
  const [items, setItems] = useState<MoodBoardItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showProductModal, setShowProductModal] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [showPinterestImport, setShowPinterestImport] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);

  const [relatedQuotes, setRelatedQuotes] = useState<any[]>([]);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [sharingToggle, setSharingToggle] = useState(false);

  useEffect(() => {
    if (id) loadMoodboardDetails();
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

      // Look up quotes that were created from this moodboard
      if (boardData) {
        try {
          const { data: quotes } = await supabase
            .from('quotes')
            .select('id, name, status, created_at')
            .or(`name.ilike.%${boardData.title}%,notes.ilike.%${boardData.title}%`)
            .order('created_at', { ascending: false })
            .limit(5);
          setRelatedQuotes(quotes || []);
        } catch {
          // non-fatal — quotes are optional
        }
      }
    } catch (error) {
      console.error('Error loading moodboard:', error);
      toast({ title: 'Error', description: 'Failed to load moodboard details', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMoodboard = async () => {
    if (!moodboard) return;
    if (!confirm(`Delete "${moodboard.title}"? This cannot be undone.`)) return;
    try {
      await moodboardAPI.deleteMoodBoard(moodboard.id);
      toast({ title: 'Deleted', description: `"${moodboard.title}" has been deleted` });
      navigate('/moodboard');
    } catch {
      toast({ title: 'Error', description: 'Failed to delete moodboard', variant: 'destructive' });
    }
  };

  const handleToggleShare = async () => {
    if (!moodboard) return;
    const newPublic = !moodboard.isPublic;
    setSharingToggle(true);
    try {
      const { error } = await supabase
        .from('moodboards')
        .update({ is_public: newPublic })
        .eq('id', moodboard.id);
      if (error) throw error;
      setMoodboard({ ...moodboard, isPublic: newPublic });
      if (newPublic) {
        const url = `${window.location.origin}/board/${moodboard.id}`;
        await navigator.clipboard.writeText(url).catch(() => {});
        toast({ title: 'Board is now public', description: 'Share link copied to clipboard.' });
      } else {
        toast({ title: 'Board is now private' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update visibility', variant: 'destructive' });
    } finally {
      setSharingToggle(false);
    }
  };

  const handleCopyShareLink = async () => {
    if (!moodboard) return;
    const url = `${window.location.origin}/board/${moodboard.id}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    toast({ title: 'Link copied!' });
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
            added_from: 'manual',
          });
        }
      }
      toast({ title: 'Proposal Created', description: `Quote created with ${items.length} items` });
      navigate(`/quotes?quote=${quote.id}`);
    } catch {
      toast({ title: 'Error', description: 'Failed to create proposal', variant: 'destructive' });
    } finally {
      setCreatingProposal(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setRemovingId(itemId);
    try {
      await moodboardAPI.removeMoodBoardItem(itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch {
      toast({ title: 'Error', description: 'Failed to remove item', variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const handleProductClick = (item: MoodBoardItem) => {
    if (!item.material) return;
    RecommendationsService.trackClick(item.material.id, { source: 'moodboard', moodboard_id: id });
    const props = item.material.properties as Record<string, any> || {};
    const product: Product = {
      id: item.material.id,
      sku: props.sku || '',
      name: getProductName(item.material),
      description: item.notes || props.description || '',
      category: item.material.category || 'Uncategorized',
      type: props.type || item.material.category || '',
      status: props.status || 'active',
      images: item.material.thumbnail_url
        ? [{ url: item.material.thumbnail_url, alt: item.material.name, isPrimary: true }]
        : [],
      metadata: props,
      properties: props,
      pricing: props.pricing || { retail: 0, wholesale: 0, currency: 'USD' },
      stock: props.stock || { quantity: 0, status: 'unknown', unit: 'unit' },
      tags: props.tags || [],
    };
    setSelectedProduct(product);
    setShowProductModal(true);
  };

  // ─── Computed stats ────────────────────────────────────────────────────────
  const { categories, factories } = useMemo(() => {
    const cats = new Set<string>();
    const facs = new Set<string>();
    for (const item of items) {
      if (item.material?.category) cats.add(item.material.category);
      // Check both properties and metadata, since extraction sources differ
      const mfg =
        getManufacturer((item.material as any)?.metadata) ||
        getManufacturer((item.material as any)?.properties);
      if (mfg) facs.add(mfg);
    }
    return { categories: Array.from(cats), factories: Array.from(facs) };
  }, [items]);

  const heroImage = useMemo(() => pickHeroImage(items), [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!moodboard) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader
          icon={Palette}
          title="Moodboards"
          subtitle="Moodboard not found"
          actions={
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full gap-1.5"
              onClick={() => navigate('/moodboard')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Moodboards
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── Standard Page Header ──────────────────────────────────────────── */}
      <PageHeader
        icon={Palette}
        title="Moodboards"
        subtitle="Organize and curate your favourite materials"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full gap-1.5"
            onClick={() => navigate('/moodboard')}
          >
            <ArrowLeft className="h-4 w-4" />
            All Moodboards
          </Button>
        }
      />

      {/* ── Hero Section ─────────────────────────────────────────────────── */}
      <div className="mt-4 mx-2 sm:mx-4 relative rounded-2xl h-[240px] sm:h-[380px] overflow-hidden">
        {/* Background image */}
        {heroImage ? (
          <img
            src={getOptimizedImageUrl(heroImage, 'display')}
            alt={moodboard.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0" style={{ background: 'var(--brand-gradient)' }} />
        )}

        {/* Dark gradient overlay — guarantees a contrast floor over any background (image or gradient).
            Bottom scrim for the title/stats, top scrim for the controls, plus a mid-floor so the
            bright middle of the brand gradient can't wash out white text. */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Share / visibility toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-full gap-1.5 bg-black/35 backdrop-blur-sm ${
              moodboard.isPublic
                ? 'text-green-300 hover:text-green-200 hover:bg-black/50'
                : 'text-white hover:text-white hover:bg-black/50'
            }`}
            onClick={handleToggleShare}
            disabled={sharingToggle}
            title={moodboard.isPublic ? 'Public — click to make private' : 'Private — click to make public'}
          >
            {moodboard.isPublic ? <Globe className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
            {moodboard.isPublic ? 'Public' : 'Private'}
          </Button>

          {/* Copy link (only when public) */}
          {moodboard.isPublic && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full gap-1.5 bg-black/35 text-white hover:text-white hover:bg-black/50 backdrop-blur-sm"
              onClick={handleCopyShareLink}
              title="Copy share link"
            >
              <Link className="h-3.5 w-3.5" />
              Copy link
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="rounded-full gap-1.5 bg-black/35 text-white hover:text-red-300 hover:bg-black/50 backdrop-blur-sm"
            onClick={handleDeleteMoodboard}
            title="Delete this moodboard"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>

        {/* Hero content — bottom aligned */}
        <div className="absolute bottom-0 left-0 right-0 px-4 sm:px-8 pb-4 sm:pb-7">
          {/* Title + description */}
          <h1 className="text-2xl sm:text-4xl font-light text-white mb-1 tracking-tight drop-shadow-lg">
            {moodboard.title}
          </h1>
          {moodboard.description && (
            <p className="text-white/70 text-sm mb-4 max-w-2xl line-clamp-2">
              {moodboard.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Badge className="bg-black/40 text-white border-white/25 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
              <Layers className="h-3 w-3" />
              {items.length} {items.length === 1 ? 'material' : 'materials'}
            </Badge>

            {categories.length > 0 && (
              <Badge className="bg-black/40 text-white border-white/25 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
                <Tag className="h-3 w-3" />
                {categories.slice(0, 3).join(', ')}
                {categories.length > 3 && ` +${categories.length - 3}`}
              </Badge>
            )}

            {factories.length > 0 && (
              <Badge className="bg-black/40 text-white border-white/25 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
                <Building2 className="h-3 w-3" />
                {factories.length} {factories.length === 1 ? 'factory' : 'factories'}
              </Badge>
            )}

            {relatedQuotes.length > 0 ? (
              <button
                onClick={() => navigate(`/quotes?quote=${relatedQuotes[0].id}`)}
                className="flex items-center gap-1.5 px-3 py-1 bg-black/40 text-white border border-white/25 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-black/55 transition-colors"
              >
                <FileText className="h-3 w-3" />
                {relatedQuotes.length} {relatedQuotes.length === 1 ? 'quote' : 'quotes'}
                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
              </button>
            ) : (
              <button
                onClick={handleCreateProposal}
                disabled={creatingProposal || items.length === 0}
                className="flex items-center gap-1.5 px-3 py-1 bg-black/40 text-white border border-white/25 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-black/55 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingProposal ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                Generate Quote
              </button>
            )}

            {/* Add Products (catalog search) */}
            <button
              onClick={() => setShowProductSearch(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-black/40 text-white border border-white/25 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-black/55 transition-colors"
            >
              <Search className="h-3 w-3" />
              Add Products
            </button>

            {/* Pinterest Import */}
            <button
              onClick={() => setShowPinterestImport(true)}
              className="flex items-center gap-1.5 px-3 py-1 bg-black/40 text-white border border-white/25 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-black/55 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current"><path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z"/></svg>
              Import from Pinterest
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs: Items grid | Tools (presentation-sheet generators) ────────── */}
      <div className="px-3 sm:px-6 py-4 sm:py-8">
        <Tabs defaultValue="products" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger
              value="products"
              className="flex items-center gap-2"
            >
              <Layers className="h-4 w-4" />
              Items
            </TabsTrigger>
            <TabsTrigger
              value="sheets"
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Tools
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="m-0">
        {items.length === 0 ? (
          <div className="dashboard-card rounded-2xl p-12 text-center">
            <p className="text-muted-foreground mb-4">No products in this moodboard yet</p>
            <Button onClick={() => setShowProductSearch(true)} className="rounded-full">
              <Search className="h-4 w-4 mr-2" />
              Find Products
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item) => {
              const isMedia = !item.material_id && !!item.media_url;
              const { media_url: mediaUrl, media_type: mediaType, media_title: mediaTitle } = item;

              const MediaTypeIcon = mediaType === 'video' ? Video : mediaType === 'vr_world' ? Globe : Image;

              return (
                <div key={item.id} className="group relative rounded-xl overflow-hidden bg-muted aspect-square shadow-sm">
                  {/* Thumbnail */}
                  {isMedia ? (
                    mediaType === 'image' && mediaUrl ? (
                      <img
                        src={getOptimizedImageUrl(mediaUrl, 'preview')}
                        alt={mediaTitle || 'Generated image'}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : mediaType === 'video' && mediaUrl ? (
                      <video
                        src={mediaUrl}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-violet-50 to-purple-100 gap-2">
                        <MediaTypeIcon className="h-10 w-10 text-violet-400" />
                        <span className="text-xs text-violet-600 font-medium">VR World</span>
                      </div>
                    )
                  ) : item.material?.thumbnail_url ? (
                    <img
                      src={getOptimizedImageUrl(item.material.thumbnail_url, 'preview')}
                      alt={item.material.name || 'Product'}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Layers className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                  )}

                  {/* Media type badge */}
                  {isMedia && mediaType && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-medium">
                      <MediaTypeIcon className="h-3 w-3" />
                      {mediaType === 'vr_world' ? 'VR' : mediaType === 'video' ? 'Video' : 'Image'}
                    </div>
                  )}

                  {/* Name tag at bottom */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 py-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                    <p className="text-white text-xs font-medium line-clamp-1">
                      {isMedia ? (mediaTitle || 'Generated Media') : (item.material ? getProductName(item.material) : 'Unnamed')}
                    </p>
                    {!isMedia && item.material?.category && (
                      <p className="text-white/60 text-[10px] line-clamp-1">{item.material.category}</p>
                    )}
                  </div>

                  {/* Hover action overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    {!isMedia && (
                      <button
                        className="w-9 h-9 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transition-colors"
                        title="View details"
                        onClick={(e) => { e.stopPropagation(); handleProductClick(item); }}
                      >
                        <Eye className="h-4 w-4 text-gray-800" />
                      </button>
                    )}
                    <button
                      className="w-9 h-9 rounded-full bg-white/90 hover:bg-red-50 flex items-center justify-center shadow-lg transition-colors"
                      title="Remove from moodboard"
                      onClick={(e) => { e.stopPropagation(); handleRemoveItem(item.id); }}
                      disabled={removingId === item.id}
                    >
                      {removingId === item.id ? (
                        <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-red-500" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </TabsContent>

          <TabsContent value="sheets" className="m-0">
            {moodboard && (
              <MoodboardSheetsTab
                moodboardId={moodboard.id}
                moodboardTitle={moodboard.title}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Product Detail Modal ──────────────────────────────────────────── */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={showProductModal}
        onClose={() => { setShowProductModal(false); setSelectedProduct(null); }}
      />

      {/* Pinterest Import Modal */}
      {moodboard && (
        <PinterestImportModal
          isOpen={showPinterestImport}
          onClose={() => setShowPinterestImport(false)}
          moodboardId={moodboard.id}
          moodboardName={moodboard.title}
          onImportComplete={() => { loadMoodboardDetails(); }}
        />
      )}

      {/* Catalog product search → add to this moodboard */}
      {moodboard && (
        <MoodboardProductSearchModal
          open={showProductSearch}
          onClose={() => setShowProductSearch(false)}
          moodboardId={moodboard.id}
          moodboardTitle={moodboard.title}
          existingMaterialIds={items.map((i) => i.material_id).filter((x): x is string => !!x)}
          onAdded={() => { loadMoodboardDetails(); }}
        />
      )}
    </div>
  );
};
