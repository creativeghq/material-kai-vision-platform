import React, { useState } from 'react';
import { Plus, ShoppingCart } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { AddToQuoteModal } from './AddToQuoteModal';
import { trackProductQuote } from '@/services/manufacturerAnalyticsService';

interface AddToQuoteButtonProps {
  productId: string;
  productName?: string;
  productImage?: string;
  defaultQuantity?: number;
  variant?: 'default' | 'outline' | 'ghost' | 'icon';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  showText?: boolean;
}

/**
 * Reusable "Add to Quote" button component
 * Can be used in product cards, search results, agent responses, 3D generation, etc.
 */
export const AddToQuoteButton: React.FC<AddToQuoteButtonProps> = ({
  productId,
  productName,
  productImage,
  defaultQuantity = 1,
  variant = 'default',
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

  const handleSuccess = (quoteName: string) => {
    trackProductQuote(productId, '', window.location.pathname);
    toast({
      title: 'Added to Quote',
      description: `${productName || 'Product'} added to "${quoteName}"`,
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
          <ShoppingCart className="h-4 w-4" />
        ) : (
          <>
            <Plus className="h-4 w-4 mr-2" />
            {showText && 'Add to Quote'}
          </>
        )}
      </Button>

      {showModal && (
        <AddToQuoteModal
          productId={productId}
          productName={productName}
          productImage={productImage}
          defaultQuantity={defaultQuantity}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
};

