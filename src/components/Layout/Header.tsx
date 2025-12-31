import React, { useState } from 'react';
import { Bell, Settings, User, Sparkles, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SemanticSearchInput } from '@/components/Search/SemanticSearchInput';
import { ProductDetailModal as UnifiedProductDetailModal } from '@/components/Products/ProductDetailModal';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      // Get user's workspace
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to search products.',
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceError || !workspaceData) {
        console.error('Workspace error:', workspaceError);
        toast({
          title: 'Workspace Not Found',
          description: 'No active workspace found. Please contact support.',
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      // Search products using MIVAA API
      const MIVAA_API_URL = 'https://v1api.materialshub.gr';
      const { data: { session } } = await supabase.auth.getSession();
      const authToken = session?.access_token || '';

      console.log('Searching with query:', query, 'workspace:', workspaceData.workspace_id);

      const response = await fetch(`${MIVAA_API_URL}/api/rag/search?strategy=multi_vector`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          query,
          workspace_id: workspaceData.workspace_id,
          top_k: 5,
          similarity_threshold: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Search API error:', response.status, errorText);
        toast({
          title: 'Search Failed',
          description: `API returned error: ${response.status}`,
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      const data = await response.json();
      console.log('Search results:', data);

      if (data.products && data.products.length > 0) {
        // Open first product
        const product = data.products[0];
        setSelectedProduct({
          id: product.id,
          name: product.name,
          description: product.description,
          category: product.metadata?.material_category || 'Uncategorized',
          type: product.metadata?.material_category || 'other',
          status: 'active',
          sku: product.id.substring(0, 8),
          metadata: product.metadata || {},
          properties: {},
          specifications: {},
          images: [],
          tags: [],
          pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
          stock: { quantity: 0, status: 'Unknown', unit: 'pcs' },
        });
        toast({
          title: 'Search Complete',
          description: `Found ${data.products.length} result(s)`,
        });
      } else {
        toast({
          title: 'No Results',
          description: 'No products found matching your search.',
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <header
      className="sticky top-0 z-50 m-4 rounded-3xl"
      style={{
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--glass-border)',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      <div className="flex h-20 items-center px-8">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'var(--mocha-color)' }}>
            <Sparkles className="w-6 h-6 text-foreground/70" />
          </div>
          <span className="text-2xl font-bold text-foreground">
            KAI Platform
          </span>
        </div>

        <div className="ml-12 flex-1 max-w-xl">
          <SemanticSearchInput
            value={searchQuery}
            onChange={onSearchChange}
            onSearch={handleSearch}
            placeholder="Search materials by name, brand, color, or properties..."
            enableSemanticSuggestions={true}
            showHistory={true}
            maxSuggestions={5}
            disabled={isSearching}
            className="h-12"
          />
        </div>

        <div className="ml-auto flex items-center space-x-3">
          <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-white/10">
            <Bell className="w-5 h-5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 hover:bg-white/10">
            <Settings className="w-5 h-5" />
          </Button>
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-white/10">
                  <Avatar className="h-10 w-10 border-2 border-white/20">
                    <AvatarFallback className="text-foreground font-semibold" style={{ background: 'var(--mocha-color)' }}>
                      {user.email ? getInitials(user.email) : 'U'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56 rounded-xl" align="end" forceMount>
                <DropdownMenuItem disabled className="py-3">
                  <User className="mr-3 h-4 w-4" />
                  <span className="text-sm">{user.email}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/profile')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      navigate('/profile');
                    }
                  }}
                  className="py-3"
                >
                  <User className="mr-3 h-4 w-4" />
                  <span className="text-sm">My Profile</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSignOut();
                    }
                  }}
                  className="py-3 text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-3 h-4 w-4" />
                  <span className="text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <UnifiedProductDetailModal
          product={selectedProduct}
          isOpen={true}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </header>
  );
};
