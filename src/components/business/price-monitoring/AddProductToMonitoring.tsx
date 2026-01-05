/**
 * Add Product to Monitoring
 * Modal to add a product to price monitoring with product search and selection
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/core/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Plus, Search, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Product {
  id: string;
  name: string;
  description: string;
  metadata: any;
}

interface AddProductToMonitoringProps {
  onProductAdded: () => void;
}

export const AddProductToMonitoring: React.FC<AddProductToMonitoringProps> = ({
  onProductAdded,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [monitoringFrequency, setMonitoringFrequency] = useState<'hourly' | 'daily' | 'weekly'>('daily');
  const { toast } = useToast();

  // Search products when query changes
  useEffect(() => {
    const searchProducts = async () => {
      if (!searchQuery || searchQuery.length < 2) {
        setProducts([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data: user } = await supabase.auth.getUser();
        if (!user.user) throw new Error('Not authenticated');

        const { data: profile } = await supabase
          .from('profiles')
          .select('workspace_id')
          .eq('id', user.user.id)
          .single();

        if (!profile) throw new Error('Profile not found');

        const { data, error } = await supabase
          .from('products')
          .select('id, name, description, metadata')
          .eq('workspace_id', profile.workspace_id)
          .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
          .limit(10);

        if (error) throw error;
        setProducts(data || []);
      } catch (error) {
        console.error('Error searching products:', error);
        toast({
          title: 'Error',
          description: 'Failed to search products',
          variant: 'destructive',
        });
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(searchProducts, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleAddProduct = async () => {
    if (!selectedProductId) {
      toast({
        title: 'Error',
        description: 'Please select a product',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('workspace_id')
        .eq('id', user.user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Calculate next check time
      const intervals = {
        hourly: 1 * 60 * 60 * 1000,
        daily: 24 * 60 * 60 * 1000,
        weekly: 7 * 24 * 60 * 60 * 1000,
      };
      const nextCheckAt = new Date(Date.now() + intervals[monitoringFrequency]).toISOString();

      // Add product to monitoring
      const { error } = await supabase
        .from('price_monitoring_products')
        .upsert({
          product_id: selectedProductId,
          user_id: user.user.id,
          workspace_id: profile.workspace_id,
          monitoring_enabled: true,
          monitoring_frequency: monitoringFrequency,
          next_check_at: nextCheckAt,
          status: 'active',
        }, {
          onConflict: 'product_id,user_id'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Product added to monitoring with ${monitoringFrequency} frequency`,
      });

      setIsOpen(false);
      setSearchQuery('');
      setSelectedProductId('');
      setProducts([]);
      onProductAdded();
    } catch (error) {
      console.error('Error adding product to monitoring:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add product to monitoring',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Product to Monitoring</DialogTitle>
          <DialogDescription>
            Search and select a product to start monitoring its price across competitor websites
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Product Search */}
          <div className="space-y-2">
            <Label htmlFor="product-search">Search Products</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="product-search"
                placeholder="Search by product name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Product Selection */}
          {products.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="product-select">Select Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger id="product-select">
                  <SelectValue placeholder="Choose a product..." />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{product.name}</span>
                        {product.description && (
                          <span className="text-xs text-muted-foreground truncate max-w-md">
                            {product.description.substring(0, 100)}
                            {product.description.length > 100 ? '...' : ''}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Monitoring Frequency */}
          <div className="space-y-2">
            <Label htmlFor="frequency">Monitoring Frequency</Label>
            <Select value={monitoringFrequency} onValueChange={(value: any) => setMonitoringFrequency(value)}>
              <SelectTrigger id="frequency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly (High frequency)</SelectItem>
                <SelectItem value="daily">Daily (Recommended)</SelectItem>
                <SelectItem value="weekly">Weekly (Low frequency)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Higher frequencies consume more credits but provide more up-to-date pricing data
            </p>
          </div>

          {/* Search hint */}
          {searchQuery.length > 0 && products.length === 0 && !isSearching && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No products found matching "{searchQuery}"
            </p>
          )}

          {searchQuery.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Start typing to search for products
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleAddProduct} disabled={!selectedProductId || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to Monitoring
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddProductToMonitoring;
