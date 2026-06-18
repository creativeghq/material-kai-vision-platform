/**
 * ARPage Component
 * Standalone page for the /ar/:productId route.
 * Fetches product data from Supabase and renders the ARPreviewModal full-screen.
 * This is the handoff target from the QR code on desktop.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { ARPreviewModal } from './ARPreviewModal';
import {
  PRODUCT_IMAGE_SELECT,
  getProductImageUrl,
  getProductName,
} from '@/utils/productMetadata';

interface ProductData {
  id: string;
  name: string;
  image_url: string;
  metadata?: {
    pbr_maps?: {
      tileable_url?: string;
      normal_url?: string;
      roughness_url?: string;
      metalness_url?: string;
    };
    [key: string]: unknown;
  };
}

const ARPage: React.FC = () => {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) {
      setError('No product ID provided.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchProduct() {
      try {
        // Try the products table first, embedding the best image via the
        // image_product_associations relationship.
        const { data, error: fetchError } = await supabase
          .from('products')
          .select(`id, name, metadata, ${PRODUCT_IMAGE_SELECT}`)
          .eq('id', productId)
          .maybeSingle();

        if (cancelled) return;

        if (fetchError || !data) {
          // Fallback: try document_images table
          const { data: imgData, error: imgError } = await supabase
            .from('document_images')
            .select('id, description, image_url, metadata')
            .eq('id', productId)
            .maybeSingle();

          if (cancelled) return;

          if (imgError || !imgData) {
            setError('Product not found. It may have been removed or the link is invalid.');
            setLoading(false);
            return;
          }

          setProduct({
            id: imgData.id,
            name: imgData.description || 'Material',
            image_url: imgData.image_url,
            metadata: imgData.metadata as ProductData['metadata'],
          });
        } else {
          setProduct({
            id: data.id,
            name: getProductName(data),
            image_url: getProductImageUrl(data) || '',
            metadata: data.metadata as ProductData['metadata'],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load product data.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProduct();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  // Loading state
  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            Loading AR preview...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !product) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-4">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <div>
            <h1 className="text-lg font-medium">Product Not Found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {error || 'Unable to load this product.'}
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // Render full-screen AR modal
  return (
    <div className="h-screen w-screen">
      <ARPreviewModal
        isOpen={true}
        onClose={() => navigate(-1)}
        productId={product.id}
        productName={product.name}
        productImage={product.image_url}
        pbrMaps={product.metadata?.pbr_maps}
      />
    </div>
  );
};

export default ARPage;
