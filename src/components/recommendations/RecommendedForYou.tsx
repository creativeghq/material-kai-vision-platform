/**
 * RecommendedForYou Component
 * Shows personalized recommendations using user-user collaborative filtering
 */

import { useEffect, useState } from 'react';
import { RecommendationsService, Recommendation } from '@/services/recommendationsService';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string;
  image_url: string;
  category: string;
  manufacturer: string;
}

interface RecommendedForYouProps {
  limit?: number;
  algorithm?: 'user_user' | 'item_item' | 'hybrid';
}

export const RecommendedForYou = ({ limit = 20, algorithm = 'user_user' }: RecommendedForYouProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchRecommendations = async () => {
      setLoading(true);

      // Fetch recommendations
      const recs = await RecommendationsService.getRecommendationsForUser(limit, algorithm);
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

    fetchRecommendations();
  }, [limit, algorithm]);

  const handleMaterialClick = (productId: string) => {
    RecommendationsService.trackClick(productId, {
      source: 'recommended_for_you',
      algorithm,
    });
    navigate(`/products/${productId}`);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-yellow-500" />
            Recommended for You
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-yellow-500" />
          Recommended for You
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                    {rec && rec.score > 0.8 && (
                      <div className="absolute top-2 right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        <Sparkles className="h-3 w-3" />
                        Top Pick
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
      </CardContent>
    </Card>
  );
};

