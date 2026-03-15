import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Loader2,
  Plus,
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
  Share2,
  Link,
  LockKeyhole,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { PageHeader } from '@/components/shared/PageHeader';

import { useToast } from '@/hooks/use-toast';
import { moodboardAPI } from '@/services/moodboardAPI';
import type { MoodBoard, MoodBoardItem } from '@/types/materials';
import { ProductDetailModal } from '@/components/features/products/ProductDetailModal';
import type { Product } from '@/components/features/products/types';
import { RecommendationsService } from '@/services/recommendationsService';
import { quotesService } from '@/services/quotes/QuotesService';
import { supabase } from '@/integrations/supabase/client';

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
      name: item.material.name || 'Unnamed Product',
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
      const props = item.material?.properties as Record<string, any> | undefined;
      if (props?.factory_name) facs.add(props.factory_name);
      if (props?.manufacturer) facs.add(props.manufacturer);
      if (props?.supplier) facs.add(props.supplier);
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
      <div className="mt-4 mx-4 relative rounded-2xl h-[380px] overflow-hidden">
        {/* Background image */}
        {heroImage ? (
          <img
            src={heroImage}
            alt={moodboard.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/80 via-primary/60 to-primary/40" />
        )}

        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Top-right controls */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          {/* Share / visibility toggle */}
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-full gap-1.5 backdrop-blur-sm ${
              moodboard.isPublic
                ? 'text-green-300 hover:text-green-200 hover:bg-black/30'
                : 'text-white/70 hover:text-white hover:bg-black/30'
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
              className="rounded-full gap-1.5 text-white/70 hover:text-white hover:bg-black/30 backdrop-blur-sm"
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
            className="rounded-full gap-1.5 text-white/70 hover:text-red-300 hover:bg-black/30 backdrop-blur-sm"
            onClick={handleDeleteMoodboard}
            title="Delete this moodboard"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>

        {/* Hero content — bottom aligned */}
        <div className="absolute bottom-0 left-0 right-0 px-8 pb-7">
          {/* Title + description */}
          <h1 className="text-4xl font-light text-white mb-1 tracking-tight drop-shadow-lg">
            {moodboard.title}
          </h1>
          {moodboard.description && (
            <p className="text-white/70 text-sm mb-4 max-w-2xl line-clamp-2">
              {moodboard.description}
            </p>
          )}

          {/* Stats row */}
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <Badge className="bg-white/15 text-white border-white/20 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
              <Layers className="h-3 w-3" />
              {items.length} {items.length === 1 ? 'material' : 'materials'}
            </Badge>

            {categories.length > 0 && (
              <Badge className="bg-white/15 text-white border-white/20 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
                <Tag className="h-3 w-3" />
                {categories.slice(0, 3).join(', ')}
                {categories.length > 3 && ` +${categories.length - 3}`}
              </Badge>
            )}

            {factories.length > 0 && (
              <Badge className="bg-white/15 text-white border-white/20 backdrop-blur-sm rounded-full gap-1.5 px-3 py-1">
                <Building2 className="h-3 w-3" />
                {factories.length} {factories.length === 1 ? 'factory' : 'factories'}
              </Badge>
            )}

            {relatedQuotes.length > 0 ? (
              <button
                onClick={() => navigate(`/quotes?quote=${relatedQuotes[0].id}`)}
                className="flex items-center gap-1.5 px-3 py-1 bg-white/15 text-white border border-white/20 backdrop-blur-sm rounded-full text-xs font-medium hover:bg-white/25 transition-colors"
              >
                <FileText className="h-3 w-3" />
                {relatedQuotes.length} {relatedQuotes.length === 1 ? 'quote' : 'quotes'}
                <ExternalLink className="h-2.5 w-2.5 opacity-70" />
              </button>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-200 border-amber-400/30 backdrop-blur-sm rounded-full px-3 py-1">
                No quotes yet
              </Badge>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Quote action */}
            {relatedQuotes.length === 0 ? (
              <Button
                size="sm"
                className="rounded-full bg-white text-primary hover:bg-white/90 gap-1.5"
                onClick={handleCreateProposal}
                disabled={creatingProposal || items.length === 0}
              >
                {creatingProposal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                Generate Quote
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="rounded-full bg-white/10 border-white/30 text-white hover:bg-white/20 gap-1.5 backdrop-blur-sm"
                onClick={handleCreateProposal}
                disabled={creatingProposal || items.length === 0}
              >
                {creatingProposal ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                New Quote
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Products Grid ─────────────────────────────────────────────────── */}
      <div className="container mx-auto px-6 py-8">
        {items.length === 0 ? (
          <div className="dashboard-card rounded-2xl p-12 text-center">
            <p className="text-muted-foreground mb-4">No products in this moodboard yet</p>
            <Button onClick={() => navigate('/agent-hub')} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
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
                        src={mediaUrl}
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
                      src={item.material.thumbnail_url}
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
                      {isMedia ? (mediaTitle || 'Generated Media') : (item.material?.name || 'Unnamed')}
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
      </div>

      {/* ── Product Detail Modal ──────────────────────────────────────────── */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={showProductModal}
        onClose={() => { setShowProductModal(false); setSelectedProduct(null); }}
      />
    </div>
  );
};
