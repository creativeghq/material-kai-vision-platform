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
      <div className="space-y-4 bg-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {result.message || 'Product Results'}
          </h3>
          <Badge
            variant="secondary"
            style={{
              background: 'var(--mocha-color)',
              color: 'white',
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
      <div className="space-y-6 bg-white rounded-lg p-6 shadow-lg">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{design.title}</h3>
          <p className="text-gray-600 mb-4">{design.description}</p>
          <div className="flex gap-2 mb-4">
            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
              Style: {design.style}
            </Badge>
            <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
              Room: {design.room_type}
            </Badge>
          </div>
        </div>

        {/* Design Image */}
        <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-50 border border-gray-200">
          <img
            src={design.image.url}
            alt={design.image.alt}
            className="w-full h-full object-cover"
          />
        </div>

        {/* Materials Used */}
        <div>
          <h4 className="text-lg font-semibold text-gray-900 mb-4">Materials Used in Design</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {design.materials_used.map((material: any) => (
              <ProductCard
                key={material.id}
                product={material}
                onViewDetails={handleViewDetails}
                categoryColor={categoryColors[material.category] || categoryColors[material.type]}
              />
            ))}
          </div>
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

  // Heat Pump Table Display
  if (result.type === 'heat_pump_table' && result.data) {
    const { models, specifications } = result.data;
    return (
      <div className="space-y-6 bg-white rounded-lg p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Heat Pump Models</h3>
            <p className="text-sm text-gray-600 mt-1">{result.message}</p>
          </div>
          <Badge
            variant="secondary"
            style={{
              background: 'var(--mocha-color)',
              color: 'white',
            }}
          >
            {models.length} models
          </Badge>
        </div>

        {/* Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model: any, index: number) => (
            <Card key={index} className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-gray-900">{model.model}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Capacity */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Heating</p>
                    <p className="text-sm font-semibold text-gray-900">{model.heating_capacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Cooling</p>
                    <p className="text-sm font-semibold text-gray-900">{model.cooling_capacity}</p>
                  </div>
                </div>

                {/* Efficiency & Noise */}
                <div className="space-y-2 pb-3 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Efficiency</span>
                    <Badge className="bg-green-100 text-green-800 border-green-300">
                      {model.energy_efficiency}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Noise Level</span>
                    <span className="text-sm font-semibold text-gray-900">{model.noise_level}</span>
                  </div>
                </div>

                {/* Pricing */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-gray-200">
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Retail</p>
                    <p className="font-semibold text-gray-900">€{model.price_retail.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-0.5">Wholesale</p>
                    <p className="font-semibold text-gray-900">€{model.price_wholesale.toFixed(2)}</p>
                  </div>
                </div>

                {/* Stock */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-700">Stock:</span>
                  <Badge
                    className={`text-sm px-3 py-1 ${
                      model.stock > 50
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : model.stock > 20
                          ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                    }`}
                  >
                    {model.stock} units
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Common Specifications */}
        <Card className="bg-gray-50 border-gray-200 mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-gray-900">Common Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(specifications).map(([key, value]) => (
                <div key={key} className="bg-white border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm font-bold text-gray-900">
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

