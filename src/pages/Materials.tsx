import React, { useState, useEffect } from 'react';
import { MaterialCatalogListing } from '@/components/features/materials/MaterialCatalogListing';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, Package, Search, Filter, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { AddDealerProductDialog } from '@/components/business/marketplace/AddDealerProductDialog';
import type { Material } from '@/types/materials';
import {
  PRODUCT_IMAGE_SELECT,
  getProductImageUrl,
  getProductName,
  getManufacturer,
  getCollection,
  getMaterialCategory,
} from '@/utils/productMetadata';

/**
 * Materials Page
 *
 * Displays all products from the knowledge base in a searchable, filterable catalog.
 * Integrates with the MaterialCatalogListing component for consistent UI/UX.
 */
export const MaterialsPage: React.FC = () => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const { canSupplyProducts } = usePermissions();

  useEffect(() => {
    loadMaterials();
  }, []);

  const loadMaterials = async () => {
    try {
      setLoading(true);

      // Get current user and workspace
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to view materials',
          variant: 'destructive',
        });
        return;
      }

      // Get user's workspace
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .single();

      if (workspaceError || !workspaceData) {
        console.error('Error getting workspace:', workspaceError);
        toast({
          title: 'Error',
          description: 'Could not load workspace',
          variant: 'destructive',
        });
        return;
      }

      setWorkspaceId(workspaceData.workspace_id);

      // Load products from database, embedding the best image via image_product_associations
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select(`*, ${PRODUCT_IMAGE_SELECT}`)
        .eq('workspace_id', workspaceData.workspace_id)
        .neq('item_type', 'service') // services are sold via Finance, not shown as materials
        .order('created_at', { ascending: false });

      if (productsError) {
        console.error('Error loading products:', productsError);
        toast({
          title: 'Error',
          description: 'Failed to load materials',
          variant: 'destructive',
        });
        return;
      }

      // Transform products to Material format using shared metadata accessors,
      // so manufacturer / collection / image are picked up regardless of which
      // metadata key the extraction stored them under.
      const transformedMaterials: Material[] = (productsData || []).map(
        (product) => {
          const imageUrl = getProductImageUrl(product) || undefined;
          const manufacturer = getManufacturer(product.metadata);
          const collection = getCollection(product.metadata);
          return {
            id: product.id,
            name: getProductName(product),
            description: product.description || '',
            category:
              getMaterialCategory(product.metadata) ||
              product.category_id ||
              'other',
            properties: {
              ...(product.properties || {}),
            },
            metadata: {
              ...(product.metadata || {}),
              finish: product.properties?.finish,
              size: product.properties?.size,
              installationMethod: product.properties?.installation_method,
              application: product.properties?.application,
              manufacturer,
              collection,
            },
            standards: [],
            createdAt: product.created_at,
            updatedAt: product.updated_at,
            thumbnailUrl: imageUrl,
            imageUrl,
          };
        },
      );

      setMaterials(transformedMaterials);
    } catch (error) {
      console.error('Error loading materials:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialSelect = (material: Material) => {
    console.log('Material selected:', material);
    // Material selection handled by MaterialsGrid component
    toast({
      title: 'Material Selected',
      description: `You selected ${material.name}`,
    });
  };

  const handleMaterialEdit = (material: Material) => {
    console.log('Edit material:', material);
    // Material editing handled by MaterialsGrid component
    toast({
      title: 'Edit Material',
      description: `Editing ${material.name}`,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto py-8">
          <Card>
            <CardContent className="p-12">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg text-muted-foreground">
                  Loading materials catalog...
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="bg-card py-6">
        <div className="page-container">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary shrink-0" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold">Materials Catalog</h1>
                <p className="text-muted-foreground text-sm sm:text-base">
                  Browse and search through our comprehensive materials database
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              {canSupplyProducts && (
                <Button onClick={() => setAddOpen(true)} className="rounded-full">
                  <Plus className="h-4 w-4 mr-1" /> New product
                </Button>
              )}
              <Badge variant="outline" className="text-sm sm:text-lg px-3 sm:px-4 py-1.5 sm:py-2">
                {materials.length} Materials
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {canSupplyProducts && (
        <AddDealerProductDialog open={addOpen} onOpenChange={setAddOpen} onCreated={() => loadMaterials()} />
      )}

      {/* Main Content */}
      <div className="page-container py-6">
        {materials.length === 0 ? (
          <Card>
            <CardContent className="p-12">
              <div className="text-center">
                <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-xl font-semibold mb-2">
                  No Materials Found
                </h3>
                <p className="text-muted-foreground mb-6">
                  There are no materials in your catalog yet. Process PDFs or
                  import materials to get started.
                </p>
                <Button onClick={loadMaterials}>Refresh</Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <MaterialCatalogListing
            materials={materials}
            loading={loading}
            onMaterialSelect={handleMaterialSelect}
            onMaterialEdit={handleMaterialEdit}
            showImages={true}
            showMetaFields={true}
            allowFiltering={true}
            allowSorting={true}
            viewMode="grid"
          />
        )}
      </div>
    </div>
  );
};

export default MaterialsPage;
