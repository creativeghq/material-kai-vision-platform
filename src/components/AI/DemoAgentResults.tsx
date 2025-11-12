/**
 * Demo Agent Results Component
 * Displays different types of demo results (products, 3D designs, heat pumps)
 */

import React, { useState } from 'react';
import { ProductCard, Product } from './ProductCard';
import { ProductDetailModal } from './ProductDetailModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface DemoAgentResultsProps {
  result: any;
  categoryColors?: Record<string, string>;
}

const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  tile: '#3b82f6',
  wood: '#16a34a',
  hvac: '#dc2626',
  carpet: '#9333ea',
  textile: '#ea580c',
  cement_tile: '#6366f1',
};

export const DemoAgentResults: React.FC<DemoAgentResultsProps> = ({
  result,
  categoryColors = DEFAULT_CATEGORY_COLORS,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleViewDetails = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  // Product List Display
  if (result.type === 'product_list' && result.data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">
            {result.message || 'Product Results'}
          </h3>
          <Badge
            variant="secondary"
            style={{
              background: 'var(--mocha-color)',
              color: 'var(--foreground-dark)',
            }}
          >
            {result.data.length} products
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {result.data.map((product: Product) => (
            <ProductCard
              key={product.id}
              product={product}
              onViewDetails={handleViewDetails}
              categoryColor={categoryColors[product.category] || categoryColors[product.type]}
            />
          ))}
        </div>

        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          categoryColor={
            selectedProduct
              ? categoryColors[selectedProduct.category] || categoryColors[selectedProduct.type]
              : undefined
          }
        />
      </div>
    );
  }

  // 3D Design Display
  if (result.type === '3d_design' && result.data) {
    const design = result.data;
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-bold mb-2">{design.title}</h3>
          <p className="text-gray-600 mb-4">{design.description}</p>
          <div className="flex gap-2 mb-4">
            <Badge variant="outline">Style: {design.style}</Badge>
            <Badge variant="outline">Room: {design.room_type}</Badge>
          </div>
        </div>

        {/* Design Image */}
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-100">
          <img
            src={design.image.url}
            alt={design.image.alt}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Materials Used */}
        <div>
          <h4 className="text-lg font-semibold mb-4">Materials Used in Design</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {design.materials_used.map((material: any) => (
              <DemoProductCard
                key={material.id}
                product={material}
                onViewDetails={handleViewDetails}
                categoryColor={categoryColors[material.category] || categoryColors[material.type]}
              />
            ))}
          </div>
        </div>

        <DemoProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          categoryColor={
            selectedProduct
              ? categoryColors[selectedProduct.category] || categoryColors[selectedProduct.type]
              : undefined
          }
        />
      </div>
    );
  }

  // Heat Pump Table Display
  if (result.type === 'heat_pump_table' && result.data) {
    const { models, specifications } = result.data;
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-2xl font-bold mb-2">Heat Pump Models</h3>
          <p className="text-gray-600">{result.message}</p>
        </div>

        {/* Models Table */}
        <Card>
          <CardHeader>
            <CardTitle>Available Models</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-3 font-semibold">Model</th>
                    <th className="text-left p-3 font-semibold">Heating</th>
                    <th className="text-left p-3 font-semibold">Cooling</th>
                    <th className="text-left p-3 font-semibold">Efficiency</th>
                    <th className="text-left p-3 font-semibold">Noise</th>
                    <th className="text-right p-3 font-semibold">Retail</th>
                    <th className="text-right p-3 font-semibold">Wholesale</th>
                    <th className="text-center p-3 font-semibold">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model: any, index: number) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">{model.model}</td>
                      <td className="p-3">{model.heating_capacity}</td>
                      <td className="p-3">{model.cooling_capacity}</td>
                      <td className="p-3">
                        <Badge variant="default">{model.energy_efficiency}</Badge>
                      </td>
                      <td className="p-3">{model.noise_level}</td>
                      <td className="p-3 text-right font-semibold">
                        €{model.price_retail.toFixed(2)}
                      </td>
                      <td className="p-3 text-right">
                        €{model.price_wholesale.toFixed(2)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={
                            model.stock > 50
                              ? 'default'
                              : model.stock > 20
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {model.stock}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Specifications */}
        <Card>
          <CardHeader>
            <CardTitle>Common Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(specifications).map(([key, value]) => (
                <div key={key} className="border rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {Array.isArray(value) ? value.join(', ') : String(value)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default/Error Display
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-gray-600">{result.message || 'No results to display'}</p>
      </CardContent>
    </Card>
  );
};

export default DemoAgentResults;

