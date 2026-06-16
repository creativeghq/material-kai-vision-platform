import React, { useState } from 'react';
import { Palette, Check, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AddToMoodboardModal } from './AddToMoodboardModal';
import { RecommendationsService } from '@/services/recommendationsService';
import { trackProductSave } from '@/services/manufacturerAnalyticsService';
import { moodboardAPI } from '@/services/moodboardAPI';
import { useActiveMoodboard } from '@/contexts/ActiveMoodboardContext';

interface AddToMoodboardButtonProps {
  productId: string;
  productName?: string;
  productImage?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showText?: boolean;
  /** Analytics source label (e.g. 'search', 'agent', 'product_card') */
  source?: string;
  /** Upload category for analytics (e.g. 'tiles', 'lighting') */
  category?: string;
  /** Fine-grained material type for analytics (e.g. 'porcelain_tile', 'pendant_light') */
  materialType?: string;
}

/**
 * Reusable "Add to Moodboard" button component
 * Can be used in product cards, search results, agent responses, 3D generation, etc.
 */
export const AddToMoodboardButton: React.FC<AddToMoodboardButtonProps> = ({
  productId,
  productName,
  productImage,
  variant = 'outline',
  size = 'default',
  className = '',
  showText = true,
  source: _source,
  category,
  materialType,
}) => {
  const { toast } = useToast();
  const { activeMoodboard } = useActiveMoodboard();
  const [showModal, setShowModal] = useState(false);
  const [quickAdding, setQuickAdding] = useState(false);
  const [quickAdded, setQuickAdded] = useState(false);

  const isValidUUID = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const trackSave = (moodboardName: string) => {
    trackProductSave(productId, '', window.location.pathname, undefined, category, materialType);
    RecommendationsService.trackClick(productId, {
      source: 'moodboard_button',
      moodboard_name: moodboardName,
    });
  };

  // When the user arrived from a specific moodboard (active context), a single
  // click adds straight to it — no picker. Falls back to the full modal otherwise.
  const handleQuickAdd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeMoodboard) return;
    if (!isValidUUID(productId)) {
      toast({ title: 'Cannot Add Product', description: 'Demo products cannot be added to moodboards', variant: 'destructive' });
      return;
    }
    try {
      setQuickAdding(true);
      await moodboardAPI.addMoodBoardItem({ moodboard_id: activeMoodboard.id, material_id: productId });
      trackSave(activeMoodboard.title);
      setQuickAdded(true);
      toast({ title: 'Added to Moodboard', description: `${productName || 'Product'} added to "${activeMoodboard.title}"` });
    } catch (err) {
      console.error('Quick add to moodboard failed:', err);
      toast({ title: 'Error', description: 'Failed to add product to moodboard', variant: 'destructive' });
    } finally {
      setQuickAdding(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    setShowModal(true);
  };

  const handleSuccess = (moodboardName: string) => {
    trackSave(moodboardName);
    toast({
      title: 'Added to Moodboard',
      description: `${productName || 'Product'} added to "${moodboardName}"`,
    });
    setShowModal(false);
  };

  // Active-moodboard mode: one-click add to the moodboard the user came from.
  if (activeMoodboard) {
    return (
      <Button
        onClick={handleQuickAdd}
        variant={quickAdded ? 'secondary' : variant}
        size={size}
        className={className}
        disabled={quickAdding || quickAdded}
        title={`Add to "${activeMoodboard.title}"`}
      >
        {size === 'icon' ? (
          quickAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : quickAdded ? <Check className="h-4 w-4" /> : <Palette className="h-4 w-4" />
        ) : (
          <>
            {quickAdding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : quickAdded ? <Check className="h-4 w-4 mr-2" /> : <Palette className="h-4 w-4 mr-2" />}
            {showText && (quickAdded ? 'Added' : `Add to ${activeMoodboard.title}`)}
          </>
        )}
      </Button>
    );
  }

  return (
    <>
      <Button
        onClick={handleClick}
        variant={variant}
        size={size}
        className={className}
      >
        {size === 'icon' ? (
          <Palette className="h-4 w-4" />
        ) : (
          <>
            <Palette className="h-4 w-4 mr-2" />
            {showText && 'Add to Moodboard'}
          </>
        )}
      </Button>

      {showModal && (
        <AddToMoodboardModal
          productId={productId}
          productName={productName}
          productImage={productImage}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
};

