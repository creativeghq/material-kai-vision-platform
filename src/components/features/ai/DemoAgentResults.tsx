/**
 * Demo Agent Results Component
 * Displays different types of demo results (products, 3D designs, heat pumps)
 */

import React, { useState } from 'react';
import type { Product } from '@/components/features/products/types';
import ProductCard from '@/components/features/products/ProductCard';
import ProductDetailModal from '@/components/features/products/ProductDetailModal';
import Design3DModal from './Design3DModal';
import SEOArticleViewer from './SEOArticleViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { useShowPrices } from '@/hooks/useShowPrices';


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
  const { showPrices } = useShowPrices();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected3DDesign, setSelected3DDesign] = useState<any>(null);
  const [is3DModalOpen, setIs3DModalOpen] = useState(false);
  const handleViewDetails = (product: Product) => {
    setSelectedProduct(product);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedProduct(null);
  };

  // Product List Display — image grid layout
  if (result.type === 'product_list' && result.data) {
    return (
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {result.message || 'Product Results'}
          </h3>
          <Badge className="bg-primary/10 text-primary border-0 rounded-full text-xs font-medium">
            {result.data.length} products
          </Badge>
        </div>

        {/* Product Grid — the shared ProductCard. The rich card showcases AR / Lighting / Add-to-Quote and respects
            the Show Prices toggle. Demo products keep their embedded retail (no live RPC for fake ids);
            real catalog grids pass a `viewerPrice` prop for per-viewer pricing. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.data.map((product: Product) => (
            <ProductCard
              key={product.id}
              product={product}
              onViewDetails={handleViewDetails}
              categoryColor={categoryColors[product.category] || categoryColors[product.type]}
              // Demo ids are not real products, so no pricing RPC can resolve them — this is
              // the one surface where the embedded retail is the only price there is (#368 PD-4).
              allowEmbeddedRetail
            />
          ))}
        </div>

        <ProductDetailModal
          product={selectedProduct}
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onGenerateVR={onGenerateVR}
          onGenerateVideo={onGenerateVideo}
          onUseIn3DScene={onUseIn3DScene}
          vrGenerating={vrGenerating}
        />
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
        <div className="space-y-4 bg-card text-card-foreground rounded-lg p-6 border border-border">
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-2">{design.title}</h3>
            <p className="text-muted-foreground mb-4">{design.description}</p>
            <div className="flex gap-2 mb-4">
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                Style: {design.style}
              </Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                Room: {design.room_type}
              </Badge>
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                {design.materials_used.length} Materials
              </Badge>
            </div>
          </div>

          {/* Clickable Design Image */}
          <button
            onClick={handle3DImageClick}
            className="relative w-full aspect-video rounded-lg overflow-hidden bg-muted border-2 border-border hover:border-primary transition-all group cursor-pointer"
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
      <div className="space-y-6 bg-card text-card-foreground rounded-lg p-6 border border-border">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Heat Pump Models</h3>
            <p className="text-sm text-muted-foreground mt-1">{result.message}</p>
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
            <Card key={index} className="bg-muted/40 border border-border hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="font-bold text-foreground">{model.model}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Capacity */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Heating</p>
                    <p className="text-sm font-semibold text-foreground">{model.heating_capacity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Cooling</p>
                    <p className="text-sm font-semibold text-foreground">{model.cooling_capacity}</p>
                  </div>
                </div>

                {/* Efficiency & Noise */}
                <div className="space-y-2 pb-3 border-b border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Efficiency</span>
                    <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      {model.energy_efficiency}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Noise Level</span>
                    <span className="text-sm font-semibold text-foreground">{model.noise_level}</span>
                  </div>
                </div>

                {/* Pricing — demo data, but still respects the Show Prices toggle. */}
                {showPrices && (
                  <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Retail</p>
                      <p className="font-semibold text-foreground">€{(model.price_retail ?? 0).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Wholesale</p>
                      <p className="font-semibold text-foreground">€{(model.price_wholesale ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {/* Stock */}
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-muted-foreground">Stock:</span>
                  <Badge
                    className={`text-sm px-3 py-1 ${
                      model.stock > 50
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                        : model.stock > 20
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                          : 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
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
        <Card className="bg-muted/40 border-border mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="font-bold text-foreground">Common Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(specifications).map(([key, value]) => (
                <div key={key} className="bg-card border border-border rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    {key.replace(/_/g, ' ')}
                  </p>
                  <p className="text-sm font-bold text-foreground">
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
      <div className="space-y-6 bg-card text-card-foreground rounded-lg p-6 border border-border">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge style={{ background: 'var(--mocha-color)', color: 'white' }}>B2B Research</Badge>
              <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10">
                {total_found} found
              </Badge>
            </div>
            <h2 className="text-lg font-bold text-foreground">{query}</h2>
          </div>
        </div>

        {/* Market overview */}
        {market_overview && (
          <div className="bg-muted/40 border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1">Market Overview</h3>
            <p className="text-sm text-muted-foreground">{market_overview}</p>
          </div>
        )}

        {/* Company cards */}
        <div className="space-y-4">
          {companies.map((company: any, i: number) => (
            <Card key={i} className="bg-muted/40 border border-border hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-foreground text-base">{company.name}</h3>
                    <p className="text-sm text-muted-foreground">{company.location}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">{company.annual_revenue}</p>
                    <p className="text-xs text-muted-foreground">{company.employees} employees</p>
                  </div>
                </div>

                <p className="text-sm text-muted-foreground mb-3">{company.specialization}</p>

                <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs">Min. Order</span>
                    <p className="font-medium text-foreground">{company.min_order}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Lead Time</span>
                    <p className="font-medium text-foreground">{company.lead_time}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Website</span>
                    <p className="font-medium text-foreground truncate">{company.website}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs">Contact</span>
                    <p className="font-medium text-foreground truncate">{company.contact}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {company.certifications.map((cert: string, j: number) => (
                    <Badge key={j} variant="outline" className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
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
        <p className="text-muted-foreground">{result.message || 'No results to display'}</p>
      </CardContent>
    </Card>
  );
};

export default DemoAgentResults;

