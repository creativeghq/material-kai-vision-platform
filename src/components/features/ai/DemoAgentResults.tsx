/**
 * Demo Agent Results Component
 * Displays different types of demo results (products, 3D designs, heat pumps)
 */

import React, { useState } from 'react';
import type { Product } from '@/components/features/products/types';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import Design3DModal from './Design3DModal';
import SEOArticleViewer from './SEOArticleViewer';
import { AddToMoodboardModal } from '@/components/business/moodboard/AddToMoodboardModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { AddToQuoteButton } from '@/components/business/quotes/AddToQuoteButton';
import { Star, Package, BookmarkPlus, Globe, Video, Box } from 'lucide-react';


interface DemoAgentResultsProps {
  result: any;
  categoryColors?: Record<string, string>;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  onGenerateVideo?: (imageUrl: string) => void;
  onUseIn3DScene?: (imageUrl: string, productName: string) => void;
  vrGenerating?: boolean;
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
  onGenerateVR,
  onGenerateVideo,
  onUseIn3DScene,
  vrGenerating,
}) => {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected3DDesign, setSelected3DDesign] = useState<any>(null);
  const [is3DModalOpen, setIs3DModalOpen] = useState(false);
  const [moodboardProduct, setMoodboardProduct] = useState<{ id: string; name?: string; image?: string } | null>(null);

  const handleViewDetails = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  // Product List Display — table/list layout
  if (result.type === 'product_list' && result.data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {result.message || 'Product Results'}
          </h3>
          <Badge className="bg-primary/10 text-primary border-0 rounded-full text-xs font-medium">
            {result.data.length} products
          </Badge>
        </div>

        {/* Column headers */}
        <div
          className="grid px-5 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold uppercase tracking-wider text-gray-400"
          style={{ gridTemplateColumns: '1fr 120px 100px 200px' }}
        >
          <span>Product Details</span>
          <span>Category</span>
          <span className="text-center">Rate</span>
          <span className="text-right">Actions</span>
        </div>

        {/* Product Rows */}
        <div className="divide-y divide-gray-50">
          {result.data.map((product: Product) => {
            const primaryImage = product.images?.find((img) => img.isPrimary) || product.images?.[0];
            const rating = (product as any).metadata?.rating ?? 4.2;
            const reviewCount = (product as any).metadata?.review_count ?? null;
            const ratingInt = Math.round(rating);

            return (
              <div
                key={product.id}
                className="grid items-center px-5 py-3 hover:bg-gray-50/70 transition-colors cursor-pointer group"
                style={{ gridTemplateColumns: '1fr 120px 100px 200px' }}
                onClick={() => handleViewDetails(product)}
              >
                {/* Thumbnail + name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                    {primaryImage ? (
                      <img
                        src={primaryImage.url}
                        alt={primaryImage.alt || product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-5 w-5 text-gray-300" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 line-clamp-1">{product.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                      {(product as any).metadata?.factory_name || (product as any).metadata?.manufacturer || 'Offer new products...'}
                    </p>
                  </div>
                </div>

                {/* Category */}
                <div className="flex flex-wrap gap-1">
                  {product.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 rounded font-normal">
                      {product.category}
                    </Badge>
                  )}
                  {product.type && product.type !== product.category && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 rounded font-normal">
                      {product.type}
                    </Badge>
                  )}
                </div>

                {/* Rating */}
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`h-2.5 w-2.5 ${star <= ratingInt ? 'text-amber-400 fill-amber-400' : 'text-gray-200 fill-gray-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {rating.toFixed(1)}{reviewCount ? ` (${reviewCount})` : ''}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-3 text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleViewDetails(product)}
                  >
                    View
                  </Button>
                  <AddToQuoteButton
                    productId={product.id}
                    productName={product.name}
                    productImage={primaryImage?.url}
                    variant="ghost"
                    size="sm"
                    showText={false}
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                    title="Add to Moodboard"
                    onClick={() => setMoodboardProduct({ id: product.id, name: product.name, image: primaryImage?.url })}
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" />
                  </Button>
                  {onUseIn3DScene && primaryImage?.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                      title="Use in 3D Scene"
                      onClick={() => onUseIn3DScene(primaryImage.url, product.name)}
                    >
                      <Box className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onGenerateVR && primaryImage?.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-violet-500 hover:text-violet-700 hover:bg-violet-50"
                      title="Generate VR World (50 credits)"
                      disabled={vrGenerating}
                      onClick={() => onGenerateVR(primaryImage.url, { prompt: product.name })}
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {onGenerateVideo && primaryImage?.url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                      title="Generate Video (30 credits)"
                      onClick={() => onGenerateVideo(primaryImage.url)}
                    >
                      <Video className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
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

        {moodboardProduct && (
          <AddToMoodboardModal
            productId={moodboardProduct.id}
            productName={moodboardProduct.name}
            productImage={moodboardProduct.image}
            onClose={() => setMoodboardProduct(null)}
            onSuccess={(_name) => setMoodboardProduct(null)}
          />
        )}
      </div>
    );
  }

  // 3D Design Display
  if (result.type === '3d_design' && result.data) {
    const design = result.data;

    const handle3DImageClick = () => {
      setSelected3DDesign(design);
      setIs3DModalOpen(true);
    };

    const handle3DModalClose = () => {
      setIs3DModalOpen(false);
      setSelected3DDesign(null);
    };

    return (
      <>
        <div className="space-y-4 bg-white rounded-lg p-6 shadow-lg">
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
              <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
                {design.materials_used.length} Materials
              </Badge>
            </div>
          </div>

          {/* Clickable Design Image */}
          <button
            onClick={handle3DImageClick}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-gray-50 border-2 border-gray-200 hover:border-gray-900 transition-all group cursor-pointer"
          >
            <img
              src={design.image.url}
              alt={design.image.alt}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
              <div className="bg-white/90 px-6 py-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-sm font-semibold text-gray-900">Click to view details & materials</p>
              </div>
            </div>
          </button>
        </div>

        {/* 3D Design Modal */}
        <Design3DModal
          design={selected3DDesign}
          isOpen={is3DModalOpen}
          onClose={handle3DModalClose}
          onGenerateVR={onGenerateVR}
          vrGenerating={vrGenerating}
        />
      </>
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

  // SEO Article Display — uses the full Frase-style SEOArticleViewer
  if (result.type === 'seo_article' && result.data) {
    return <SEOArticleViewer initialArticle={result.data} />;
  }

  // B2B Manufacturer Results Display
  if (result.type === 'b2b_results' && result.data) {
    const { query, total_found, market_overview, companies } = result.data;
    return (
      <div className="space-y-6 bg-white rounded-lg p-6 shadow-lg">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge style={{ background: 'var(--mocha-color)', color: 'white' }}>B2B Research</Badge>
              <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50">
                {total_found} found
              </Badge>
            </div>
            <h2 className="text-lg font-bold text-gray-900">{query}</h2>
          </div>
        </div>

        {/* Market overview */}
        {market_overview && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Market Overview</h3>
            <p className="text-sm text-blue-800">{market_overview}</p>
          </div>
        )}

        {/* Company cards */}
        <div className="space-y-4">
          {companies.map((company: any, i: number) => (
            <Card key={i} className="bg-white border border-gray-200 hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-900 text-base">{company.name}</h3>
                    <p className="text-sm text-gray-500">{company.location}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{company.annual_revenue}</p>
                    <p className="text-xs text-gray-500">{company.employees} employees</p>
                  </div>
                </div>

                <p className="text-sm text-gray-700 mb-3">{company.specialization}</p>

                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Min. Order</span>
                    <p className="font-medium text-gray-800">{company.min_order}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Lead Time</span>
                    <p className="font-medium text-gray-800">{company.lead_time}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Website</span>
                    <p className="font-medium text-gray-800 truncate">{company.website}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Contact</span>
                    <p className="font-medium text-gray-800 truncate">{company.contact}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {company.certifications.map((cert: string, j: number) => (
                    <Badge key={j} variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
                      {cert}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
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

