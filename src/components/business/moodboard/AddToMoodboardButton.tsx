import React, { useState } from 'react';
import { Plus, Palette } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AddToMoodboardModal } from './AddToMoodboardModal';
import { RecommendationsService } from '@/services/recommendationsService';
import { trackProductSave } from '@/services/manufacturerAnalyticsService';

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
}) => {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    setShowModal(true);
  };

  const handleSuccess = (moodboardName: string) => {
    // Track as product save for manufacturer analytics
    trackProductSave(productId, '', window.location.pathname);
    // Track as click interaction (strong engagement signal)
    RecommendationsService.trackClick(productId, {
      source: 'moodboard_button',
      moodboard_name: moodboardName,
    });

    toast({
      title: 'Added to Moodboard',
      description: `${productName || 'Product'} added to "${moodboardName}"`,
    });
    setShowModal(false);
  };

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

