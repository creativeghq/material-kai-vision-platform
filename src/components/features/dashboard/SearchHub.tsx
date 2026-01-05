import React, { useState, useCallback, useEffect } from 'react';
import {
  TrendingUp,
  Clock,
  Star,
  ArrowRight,
  Package,
  Sparkles,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { UnifiedSearchInterface } from '@/components/features/search/UnifiedSearchInterface';
import { getSearchSuggestionsService, type TrendingSearch } from '@/services/searchSuggestionsService';

interface SearchHubProps {
  onMaterialSelect?: (materialId: string) => void;
  onNavigateToMoodboard?: () => void;
  onNavigateTo3D?: () => void;
}

export const SearchHub: React.FC<SearchHubProps> = ({
  onMaterialSelect,
  onNavigateToMoodboard,
  onNavigateTo3D,
}) => {
  const [recentSearches] = useState([
    'Fire resistant tiles',
    'Waterproof laminate',
    'Sustainable concrete',
    'Anti-slip flooring',
  ]);

  const [popularMaterials] = useState([
    { id: '1', name: 'Porcelain Tiles', searches: 156, category: 'ceramic' },
    { id: '2', name: 'Hardwood Flooring', searches: 142, category: 'wood' },
    { id: '3', name: 'Quartz Countertops', searches: 138, category: 'stone' },
    { id: '4', name: 'Vinyl Plank', searches: 124, category: 'synthetic' },
  ]);

  const [trendingQueries, setTrendingQueries] = useState<TrendingSearch[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);

  // Load trending searches on mount
  useEffect(() => {
    const loadTrendingSearches = async () => {
      try {
        setLoadingTrending(true);
        const suggestionsService = getSearchSuggestionsService();
        const response = await suggestionsService.getTrendingSearches('daily', 5);

        if (response.success && response.trending_searches.length > 0) {
          setTrendingQueries(response.trending_searches);
        } else {
          // Fallback to default queries if API fails
          setTrendingQueries([
            {
              id: '1',
              query_text: 'Eco-friendly materials',
              search_count: 45,
              unique_users_count: 32,
              trend_score: 85,
              growth_rate: 25,
              time_window: 'daily',
            },
            {
              id: '2',
              query_text: 'Indoor air quality',
              search_count: 38,
              unique_users_count: 28,
              trend_score: 78,
              growth_rate: 18,
              time_window: 'daily',
            },
            {
              id: '3',
              query_text: 'Antimicrobial surfaces',
              search_count: 35,
              unique_users_count: 25,
              trend_score: 72,
              growth_rate: 15,
              time_window: 'daily',
            },
            {
              id: '4',
              query_text: 'Smart materials',
              search_count: 32,
              unique_users_count: 22,
              trend_score: 68,
              growth_rate: 12,
              time_window: 'daily',
            },
            {
              id: '5',
              query_text: 'Recycled content',
              search_count: 28,
              unique_users_count: 20,
              trend_score: 65,
              growth_rate: 10,
              time_window: 'daily',
            },
          ]);
        }
      } catch (error) {
        console.error('Error loading trending searches:', error);
        // Use fallback data on error
        setTrendingQueries([
          {
            id: '1',
            query_text: 'Eco-friendly materials',
            search_count: 45,
            unique_users_count: 32,
            trend_score: 85,
            growth_rate: 25,
            time_window: 'daily',
          },
        ]);
      } finally {
        setLoadingTrending(false);
      }
    };

    loadTrendingSearches();
  }, []);

  const handleQuickAction = useCallback(
    (action: string, data?: string) => {
      switch (action) {
        case 'moodboard':
          onNavigateToMoodboard?.();
          break;
        case '3d':
          onNavigateTo3D?.();
          break;
        case 'material':
          onMaterialSelect?.(data || '');
          break;
      }
    },
    [onMaterialSelect, onNavigateToMoodboard, onNavigateTo3D],
  );

  return (
    <div className="space-y-6">
      {/* Main Search Interface */}
      <UnifiedSearchInterface
        onMaterialSelect={onMaterialSelect || (() => {})}
        onResultsFound={(results) => {
          console.log('Search results found:', results.length);
        }}
      />

      {/* Search Insights & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Searches */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Recent Searches
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSearches.map((search, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer group"
                onClick={() => {
                  // Auto-fill search with recent query
                  const searchInput = document.querySelector(
                    'input[placeholder*="Search materials"]',
                  ) as HTMLInputElement;
                  if (searchInput) {
                    searchInput.value = search;
                    searchInput.focus();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Auto-fill search with recent query
                    const searchInput = document.querySelector(
                      'input[placeholder*="Search materials"]',
                    ) as HTMLInputElement;
                    if (searchInput) {
                      searchInput.value = search;
                      searchInput.focus();
                    }
                  }
                }}
              >
                <span className="text-sm">{search}</span>
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Trending Materials */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Popular Materials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {popularMaterials.map((material) => (
              <div
                key={material.id}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer"
                onClick={() => handleQuickAction('material', material.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleQuickAction('material', material.id);
                  }
                }}
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{material.name}</span>
                </div>
                <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs">
                  {material.searches}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Trending Queries */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" />
              Trending Topics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingTrending ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : trendingQueries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No trending searches available
              </div>
            ) : (
              trendingQueries.map((query, index) => (
                <div
                  key={query.id || index}
                  className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer group"
                  onClick={() => {
                    // Auto-fill search with trending query
                    const searchInput = document.querySelector(
                      'input[placeholder*="Search materials"]',
                    ) as HTMLInputElement;
                    if (searchInput) {
                      searchInput.value = query.query_text;
                      searchInput.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // Auto-fill search with trending query
                      const searchInput = document.querySelector(
                        'input[placeholder*="Search materials"]',
                      ) as HTMLInputElement;
                      if (searchInput) {
                        searchInput.value = query.query_text;
                        searchInput.focus();
                      }
                    }
                  }}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm">{query.query_text}</span>
                    {query.growth_rate > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {query.growth_rate.toFixed(0)}%
                      </Badge>
                    )}
                  </div>
                  <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
