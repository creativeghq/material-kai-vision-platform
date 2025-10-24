import React, { useState, useCallback } from 'react';
import {
  TrendingUp,
  Clock,
  Star,
  ArrowRight,
  Package,
  BookOpen,
  Sparkles,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { UnifiedSearchInterface } from '@/components/Search/UnifiedSearchInterface';

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

  const [trendingQueries] = useState([
    'Eco-friendly materials',
    'Indoor air quality',
    'Antimicrobial surfaces',
    'Smart materials',
    'Recycled content',
  ]);

  const handleQuickAction = useCallback((action: string, data?: string) => {
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
  }, [onMaterialSelect, onNavigateToMoodboard, onNavigateTo3D]);

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
          </CardHeader><CardContent className="space-y-2">
            {recentSearches.map((search, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer group"
                onClick={() => {
                  // Auto-fill search with recent query
                  const searchInput = document.querySelector('input[placeholder*="Search materials"]') as HTMLInputElement;
                  if (searchInput) {
                    searchInput.value = search;
                    searchInput.focus();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Auto-fill search with recent query
                    const searchInput = document.querySelector('input[placeholder*="Search materials"]') as HTMLInputElement;
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
            {trendingQueries.map((query, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 rounded hover:bg-muted/50 cursor-pointer group"
                onClick={() => {
                  // Auto-fill search with trending query
                  const searchInput = document.querySelector('input[placeholder*="Search materials"]') as HTMLInputElement;
                  if (searchInput) {
                    searchInput.value = query;
                    searchInput.focus();
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Auto-fill search with trending query
                    const searchInput = document.querySelector('input[placeholder*="Search materials"]') as HTMLInputElement;
                    if (searchInput) {
                      searchInput.value = query;
                      searchInput.focus();
                    }
                  }
                }}
              >
                <span className="text-sm">{query}</span>
                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>What would you like to do next?</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              className="h-20 flex flex-col items-center gap-2 border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleQuickAction('3d')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleQuickAction('3d');
                }
              }}
            >
              <Sparkles className="h-6 w-6" />
              <span className="text-sm">Generate 3D</span>
            </Button>

            <Button
              className="h-20 flex flex-col items-center gap-2 border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleQuickAction('moodboard')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleQuickAction('moodboard');
                }
              }}
            >
              <Star className="h-6 w-6" />
              <span className="text-sm">Create Moodboard</span>
            </Button>
            <Button
              className="h-20 flex flex-col items-center gap-2 border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                // Open catalog view
                window.location.href = '/catalog';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Open catalog view
                  window.location.href = '/catalog';
                }
              }}
            >
              <Package className="h-6 w-6" />
              <span className="text-sm">Browse Catalog</span>
            </Button>

            <Button
              className="h-20 flex flex-col items-center gap-2 border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                // Open knowledge base
                window.location.href = '/rag';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Open knowledge base
                  window.location.href = '/rag';
                }
              }}
            >
              <BookOpen className="h-6 w-6" />
              <span className="text-sm">Knowledge Base</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
