import React, { useState } from 'react';
import { Plus, Palette } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AddToMoodboardModal } from './AddToMoodboardModal';
import { RecommendationsService } from '@/services/recommendationsService';

interface AddToMoodboardButtonProps {
  productId: string;
  productName?: string;
  productImage?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'icon';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showText?: boolean;
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
}) => {
  const { toast } = useToast();
  const [showModal, setShowModal] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering parent click events
    setShowModal(true);
  };

  const handleSuccess = (moodboardName: string) => {
    // Track save interaction
    RecommendationsService.trackSave(productId, {
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
        {variant === 'icon' || size === 'icon' ? (
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

