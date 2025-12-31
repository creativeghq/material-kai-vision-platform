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

  const openProductById = async (productId: string) => {
    try {
      const { data: product, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (error || !product) {
        console.error('Error fetching product:', error);
        toast({
          title: 'Product Not Found',
          description: 'Could not load product details.',
          variant: 'destructive',
        });
        return;
      }

      setSelectedProduct({
        id: product.id,
        name: product.name,
        description: product.description || '',
        category: product.metadata?.material_category || 'Uncategorized',
        type: product.metadata?.material_category || 'other',
        status: product.status || 'active',
        sku: product.id.substring(0, 8),
        metadata: product.metadata || {},
        properties: product.properties || {},
        specifications: product.specifications || {},
        images: [],
        tags: [],
        pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
        stock: { quantity: 0, status: 'Unknown', unit: 'pcs' },
      });
    } catch (error) {
      console.error('Error opening product:', error);
    }
  };

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      console.log('Empty query, skipping search');
      return;
    }

    console.log('=== SEARCH STARTED ===');
    console.log('Query:', query);

    setIsSearching(true);
    try {
      // Get user's workspace
      console.log('Step 1: Getting current user...');
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error('User error:', userError);
      }

      if (!currentUser) {
        console.error('No user found');
        toast({
          title: 'Authentication Required',
          description: 'Please log in to search products.',
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      console.log('User ID:', currentUser.id);

      console.log('Step 2: Getting workspace...');
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceError) {
        console.error('Workspace query error:', workspaceError);
      }

      if (!workspaceData) {
        console.error('No workspace data returned');
        toast({
          title: 'Workspace Not Found',
          description: 'No active workspace found. Please contact support.',
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      console.log('Workspace ID:', workspaceData.workspace_id);

      // Try simple text search first (search in name and description only - id is UUID)
      console.log('Step 3: Searching products in Supabase...');
      const { data: products, error: searchError } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceData.workspace_id)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (searchError) {
        console.error('Search error:', searchError);
        toast({
          title: 'Search Failed',
          description: searchError.message,
          variant: 'destructive',
        });
        setIsSearching(false);
        return;
      }

      console.log('Search results:', products);

      if (products && products.length > 0) {
        console.log('Found', products.length, 'products');
        // Open first product
        const product = products[0];
        setSelectedProduct({
          id: product.id,
          name: product.name,
          description: product.description || '',
          category: product.metadata?.material_category || 'Uncategorized',
          type: product.metadata?.material_category || 'other',
          status: product.status || 'active',
          sku: product.id.substring(0, 8),
          metadata: product.metadata || {},
          properties: product.properties || {},
          specifications: product.specifications || {},
          images: [],
          tags: [],
          pricing: { retail: 0, wholesale: 0, currency: 'EUR' },
          stock: { quantity: 0, status: 'Unknown', unit: 'pcs' },
        });
        toast({
          title: 'Search Complete',
          description: `Found ${products.length} result(s). Showing: ${product.name}`,
        });
      } else {
        console.log('No products found');
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
      console.log('=== SEARCH ENDED ===');
    }
  };

  const handleSuggestionSelect = (suggestion: any) => {
    console.log('Suggestion selected:', suggestion);

    // If suggestion has a product_id, open that product directly
    if (suggestion.metadata?.product_id) {
      openProductById(suggestion.metadata.product_id);
    } else {
      // Otherwise, perform a search with the suggestion text
      handleSearch(suggestion.text);
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
            onSuggestionSelect={handleSuggestionSelect}
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
