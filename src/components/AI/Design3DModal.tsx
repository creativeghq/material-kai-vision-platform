import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X, Package } from 'lucide-react';
import ProductDetailModal from './ProductDetailModal';

interface Design3DModalProps {
  design: {
    id: string;
    title: string;
    description: string;
    style: string;
    room_type: string;
    image: {
      url: string;
      alt: string;
    };
    materials_used: any[];
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

const Design3DModal: React.FC<Design3DModalProps> = ({ design, isOpen, onClose }) => {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);

  if (!design) return null;

  const handleProductClick = (product: any) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  const handleProductModalClose = () => {
    setIsProductModalOpen(false);
    setSelectedProduct(null);
  };

  const categoryColors: Record<string, string> = {
    tile: 'hsl(var(--primary))',
    wood: '#8B4513',
    metal: '#708090',
    fabric: '#DDA0DD',
    ceramic: '#CD853F',
    flooring: '#D2691E',
    wall_covering: '#BC8F8F',
    heat_pump: '#4682B4',
    hvac: '#5F9EA0',
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden p-0 bg-white">
          <div className="flex h-[90vh]">
            {/* Left: 3D Design Image (70%) */}
            <div className="w-[70%] relative bg-gray-50 flex flex-col">
              <DialogHeader className="p-6 pb-4 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-2xl font-bold text-gray-900 mb-2">
                      {design.title}
                    </DialogTitle>
                    <p className="text-gray-600 text-sm">{design.description}</p>
                    <div className="flex gap-2 mt-3">
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                        Style: {design.style}
                      </Badge>
                      <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                        Room: {design.room_type}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
              </DialogHeader>

              {/* Design Image */}
              <div className="flex-1 p-6 overflow-hidden">
                <div className="relative w-full h-full rounded-lg overflow-hidden bg-white border border-gray-200 shadow-lg">
                  <img
                    src={design.image.url}
                    alt={design.image.alt}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Right: Materials List (30%) */}
            <div className="w-[30%] bg-white border-l border-gray-200 flex flex-col">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Materials Used ({design.materials_used.length})
                </h3>
              </div>

              {/* Materials List - Scrollable */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {design.materials_used.map((material: any) => (
                  <button
                    key={material.id}
                    onClick={() => handleProductClick(material)}
                    className="w-full text-left bg-white border-2 border-gray-200 rounded-lg p-4 hover:border-gray-900 hover:shadow-md transition-all group"
                  >
                    {/* Material Image */}
                    {material.images && material.images.length > 0 && (
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden mb-3 bg-gray-50">
                        <img
                          src={material.images[0].url}
                          alt={material.images[0].alt}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      </div>
                    )}

                    {/* Material Info */}
                    <h4 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-2">
                      {material.name}
                    </h4>
                    <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                      {material.description}
                    </p>

                    {/* Material Type Badge */}
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: categoryColors[material.category] || categoryColors[material.type],
                        color: categoryColors[material.category] || categoryColors[material.type],
                      }}
                    >
                      {material.type || material.category}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Detail Modal - Opens on top of 3D Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          isOpen={isProductModalOpen}
          onClose={handleProductModalClose}
          categoryColor={
            categoryColors[selectedProduct.category] || categoryColors[selectedProduct.type]
          }
        />
      )}
    </>
  );
};

export default Design3DModal;

