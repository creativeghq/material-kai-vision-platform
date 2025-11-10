/**
 * Demo Product Card Component
 * Displays product information in a card format matching the reference design
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export interface DemoProduct {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  type: string;
  status: string;
  images: Array<{
    url: string;
    alt: string;
    isPrimary?: boolean;
  }>;
  metadata: Record<string, any>;
  pricing: {
    retail: number;
    wholesale: number;
    currency: string;
  };
  stock: {
    quantity: number;
    status: string;
    unit: string;
  };
  tags: string[];
  variants?: Array<{
    name: string;
    sku: string;
  }>;
}

interface DemoProductCardProps {
  product: DemoProduct;
  onViewDetails: (product: DemoProduct) => void;
  categoryColor?: string;
}

export const DemoProductCard: React.FC<DemoProductCardProps> = ({
  product,
  onViewDetails,
  categoryColor = '#3b82f6',
}) => {
  const primaryImage = product.images.find((img) => img.isPrimary) || product.images[0];
  const stockStatusColor =
    product.stock.status === 'High'
      ? 'bg-green-100 text-green-800 border-green-300'
      : product.stock.status === 'Medium'
        ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
        : 'bg-red-100 text-red-800 border-red-300';

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-200 bg-white border border-gray-200">
      {/* Product Image */}
      <div className="relative h-48 bg-gray-100">
        {primaryImage && (
          <img
            src={primaryImage.url}
            alt={primaryImage.alt}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        )}
      </div>

      <CardContent className="p-4">
        {/* Product Header */}
        <div className="mb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-base line-clamp-1">
                {product.name}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">SKU {product.sku}</p>
            </div>
            <Badge
              className="ml-2"
              style={{
                backgroundColor: `${categoryColor}20`,
                color: categoryColor,
                borderColor: categoryColor,
              }}
            >
              {product.status}
            </Badge>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {product.tags.slice(0, 3).map((tag, index) => (
              <Badge
                key={index}
                variant="outline"
                className="text-xs capitalize"
                style={{
                  backgroundColor: `${categoryColor}10`,
                  borderColor: `${categoryColor}40`,
                  color: categoryColor,
                }}
              >
                {tag}
              </Badge>
            ))}
            {product.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{product.tags.length - 3}
              </Badge>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Retail</p>
            <p className="font-semibold text-gray-900">
              {product.pricing.currency === 'EUR' ? '€' : '$'}
              {product.pricing.retail.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Wholesale</p>
            <p className="font-semibold text-gray-900">
              {product.pricing.currency === 'EUR' ? '€' : '$'}
              {product.pricing.wholesale.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Stock Status */}
        <div className="mb-3">
          <div className={`px-3 py-2 rounded-md border ${stockStatusColor}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {product.stock.quantity} {product.stock.unit}
              </span>
              <span className="text-xs font-semibold">{product.stock.status} stock</span>
            </div>
          </div>
        </div>

        {/* Variants */}
        {product.variants && product.variants.length > 0 && (
          <div className="mb-3 text-xs text-gray-600">
            <span className="font-medium">Variants ({product.variants.length}):</span>{' '}
            {product.variants.map((v) => v.name).join(', ')}
          </div>
        )}

        {/* View Details Button */}
        <Button
          onClick={() => onViewDetails(product)}
          variant="outline"
          className="w-full justify-between hover:bg-gray-50"
          size="sm"
        >
          <span>View Details</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default DemoProductCard;

