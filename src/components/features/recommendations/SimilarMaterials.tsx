/**
 * SimilarMaterials Component
 * Shows materials similar to the current material using item-item collaborative filtering
 */

import { useEffect, useState } from 'react';
import { RecommendationsService, Recommendation } from '@/services/recommendationsService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import { useNavigate } from 'react-router-dom';

interface Product {
  id: string;
  name: string;
  description: string;
  image_url: string;
  category: string;
  manufacturer: string;
}

interface SimilarMaterialsProps {
  materialId: string;
  limit?: number;
}

export const SimilarMaterials = ({ materialId, limit = 10 }: SimilarMaterialsProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSimilarMaterials = async () => {
      setLoading(true);

      // Fetch recommendations
      const recs = await RecommendationsService.getSimilarMaterials(materialId, limit);
      setRecommendations(recs);

      if (recs.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch product details
      const materialIds = recs.map((r) => r.material_id);
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, image_url, category, manufacturer')
        .in('id', materialIds);

      if (!error && data) {
        // Sort products by recommendation score
        const sortedProducts = data.sort((a, b) => {
          const scoreA = recs.find((r) => r.material_id === a.id)?.score || 0;
          const scoreB = recs.find((r) => r.material_id === b.id)?.score || 0;
          return scoreB - scoreA;
        });
        setProducts(sortedProducts);
      }

      setLoading(false);
    };

    fetchSimilarMaterials();
  }, [materialId, limit]);

  const handleMaterialClick = (productId: string) => {
    RecommendationsService.trackClick(productId, {
      source: 'similar_materials',
      source_material_id: materialId,
    });
    navigate(`/products/${productId}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h3 className="text-xl font-semibold">Similar Materials</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold">Similar Materials</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {products.map((product) => {
          const rec = recommendations.find((r) => r.material_id === product.id);
          return (
            <Card
              key={product.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleMaterialClick(product.id)}
            >
              <CardContent className="p-0">
                <div className="relative">
                  <img
                    src={product.image_url || '/placeholder-material.png'}
                    alt={product.name}
                    className="w-full h-32 object-cover rounded-t-lg"
                  />
                  {rec && rec.confidence > 0.7 && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      {Math.round(rec.confidence * 100)}% match
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <h4 className="font-medium text-sm line-clamp-2">{product.name}</h4>
                  {product.manufacturer && (
                    <p className="text-xs text-gray-500 mt-1">{product.manufacturer}</p>
                  )}
                  {product.category && (
                    <p className="text-xs text-gray-400 mt-1">{product.category}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

