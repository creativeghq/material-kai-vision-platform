import React, { useState, useEffect } from 'react';
import { User, Sparkles, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { SemanticSearchInput } from '@/components/features/search/SemanticSearchInput';
import UnifiedProductDetailModal from '@/components/features/products/ProductDetailModal';
import { NotificationsPanel } from '@/components/core/NotificationsPanel';
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('avatar_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);
      setUnreadCount(count ?? 0);
    };

    fetchUnread();

    const channel = supabase
      .channel('header-notifications')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { fetchUnread(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

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
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (!currentUser) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to search products.',
          variant: 'destructive',
        });
        return;
      }

      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', currentUser.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (!workspaceData) {
        toast({
          title: 'Workspace Not Found',
          description: 'No active workspace found.',
          variant: 'destructive',
        });
        return;
      }

      const { data: products, error: searchError } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceData.workspace_id)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (searchError) {
        toast({ title: 'Search Failed', description: searchError.message, variant: 'destructive' });
        return;
      }

      if (products && products.length > 0) {
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
        toast({ title: 'No Results', description: 'No products found matching your search.' });
      }
    } catch (error) {
      toast({
        title: 'Search Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSuggestionSelect = (suggestion: any) => {
    if (suggestion.metadata?.product_id) {
      openProductById(suggestion.metadata.product_id);
    } else {
      handleSearch(suggestion.text);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 m-4 rounded-3xl glass-panel bg-white/50 border border-white/30 h-20">
        <div className="flex h-full items-center px-8">
          {/* Brand icon */}
          <div className="flex items-center space-x-3 mr-12">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--mocha-color)' }}
            >
              <Sparkles className="w-6 h-6 text-foreground/70" />
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xl">
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

          {/* Right actions */}
          <div className="ml-auto flex items-center space-x-3">
            <NotificationsPanel
              unreadCount={unreadCount}
              onCountChange={setUnreadCount}
            />
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10 border-2 border-white/20">
                      {avatarUrl && <AvatarImage src={avatarUrl} alt="Profile" />}
                      <AvatarFallback
                        className="font-semibold"
                        style={{ background: 'var(--mocha-color)' }}
                      >
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
                  <DropdownMenuItem onClick={() => navigate('/profile')} className="py-3">
                    <User className="mr-3 h-4 w-4" />
                    <span className="text-sm">My Profile</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleSignOut}
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
      </header>

      {selectedProduct && (
        <UnifiedProductDetailModal
          product={selectedProduct}
          isOpen={true}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
};
