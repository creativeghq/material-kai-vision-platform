/**
 * Dynamic Category Manager Component
 *
 * Displays and manages material and product categories with hierarchical structure
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Tag, Folder, Package } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  CategoryHierarchy,
  CategoryCreationRequest,
  dynamicCategoryManagementService,
  getProductCategories,
  getMaterialCategories,
  getCategoriesHierarchy,
} from '@/services/dynamicCategoryManagementService';

interface DynamicCategoryManagerProps {
  onCategorySelect?: (category: CategoryHierarchy) => void;
  showCreateButton?: boolean;
  mode?: 'view' | 'manage';
}

export const DynamicCategoryManager: React.FC<DynamicCategoryManagerProps> = ({
  onCategorySelect,
  showCreateButton = true,
  mode = 'view',
}) => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CategoryHierarchy[]>([]);
  const [productCategories, setProductCategories] = useState<CategoryHierarchy[]>([]);
  const [materialCategories, setMaterialCategories] = useState<CategoryHierarchy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<CategoryHierarchy | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCategory, setNewCategory] = useState<Partial<CategoryCreationRequest>>({
    hierarchyLevel: 0,
    sortOrder: 100,
    displayGroup: 'products',
    isActive: true,
    isPrimaryCategory: false,
    aiExtractionEnabled: true,
    aiConfidenceThreshold: 0.7,
    processingPriority: 1,
  });

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const [allCategories, products, materials] = await Promise.all([
        getCategoriesHierarchy(),
        getProductCategories(),
        getMaterialCategories(),
      ]);

      setCategories(allCategories);
      setProductCategories(products);
      setMaterialCategories(materials);
    } catch (error) {
      console.error('Failed to load categories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load categories',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleCreateCategory = async () => {
    if (!newCategory.categoryKey || !newCategory.name || !newCategory.displayName) {
      toast({
        title: 'Validation Error',
        description: 'Category key, name, and display name are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const created = await dynamicCategoryManagementService.createCategory(newCategory as CategoryCreationRequest);

      if (created) {
        toast({
          title: 'Success',
          description: 'Category created successfully',
        });
        setShowCreateDialog(false);
        setNewCategory({
          hierarchyLevel: 0,
          sortOrder: 100,
          displayGroup: 'products',
          isActive: true,
          isPrimaryCategory: false,
          aiExtractionEnabled: true,
          aiConfidenceThreshold: 0.7,
          processingPriority: 1,
        });
        await loadCategories();
      } else {
        throw new Error('Failed to create category');
      }
    } catch (error) {
      console.error('Failed to create category:', error);
      toast({
        title: 'Error',
        description: 'Failed to create category',
        variant: 'destructive',
      });
    }
  };

  const renderCategoryTree = (categories: CategoryHierarchy[], level = 0) => {
    return categories.map((category) => (
      <div key={category.id} className={`ml-${level * 4} mb-2`}>
        <Card
          className={`cursor-pointer transition-colors hover:bg-gray-50 ${
            selectedCategory?.id === category.id ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => {
            setSelectedCategory(category);
            onCategorySelect?.(category);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setSelectedCategory(category);
              onCategorySelect?.(category);
            }
          }}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                {category.displayGroup === 'products' ? (
                  <Package className="h-4 w-4 text-blue-500" />
                ) : (
                  <Tag className="h-4 w-4 text-green-500" />
                )}
                <span className="font-medium">{category.displayName}</span>
                <Badge variant={category.isActive ? 'default' : 'secondary'}>
                  {category.isActive ? 'Active' : 'Inactive'}
                </Badge>
                {category.aiExtractionEnabled && (
                  <Badge variant="outline">AI</Badge>
                )}
              </div>
              <div className="flex items-center space-x-1">
                <Badge variant="outline" className="text-xs">
                  Level {category.hierarchyLevel}
                </Badge>
                {category.children && category.children.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {category.children.length} children
                  </Badge>
                )}
              </div>
            </div>
            {category.description && (
              <p className="text-sm text-gray-600 mt-1">{category.description}</p>
            )}
          </CardContent>
        </Card>
        {category.children && category.children.length > 0 && (
          <div className="mt-2">
            {renderCategoryTree(category.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading categories...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Dynamic Categories</h2>
        {showCreateButton && mode === 'manage' && (
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Category</DialogTitle>
                <DialogDescription>
                  Add a new material or product category to the system
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="categoryKey">Category Key</Label><Input
                    id="categoryKey"
                    value={newCategory.categoryKey || ''}
                    onChange={(e) => setNewCategory({ ...newCategory, categoryKey: e.target.value })}
                    placeholder="e.g., smart_lighting"
                  />
                </div>
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newCategory.name || ''}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                    placeholder="e.g., Smart Lighting"
                  />
                </div>
                <div>
                  <Label htmlFor="displayName">Display Name</Label><Input
                    id="displayName"
                    value={newCategory.displayName || ''}
                    onChange={(e) => setNewCategory({ ...newCategory, displayName: e.target.value })}
                    placeholder="e.g., Smart Lighting Solutions"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newCategory.description || ''}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    placeholder="Brief description of the category"
                  />
                </div>
                <div>
                  <Label htmlFor="displayGroup">Display Group</Label><Select
                    value={newCategory.displayGroup}
                    onValueChange={(value) => setNewCategory({ ...newCategory, displayGroup: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="products">Products</SelectItem>
                      <SelectItem value="core_materials">Core Materials</SelectItem>
                      <SelectItem value="tile_types">Tile Types</SelectItem>
                      <SelectItem value="decor_types">Decor Types</SelectItem>
                      <SelectItem value="lighting_types">Lighting Types</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setShowCreateDialog(false);
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateCategory}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreateCategory();
                      }
                    }}
                  >
                    Create Category
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All Categories</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Folder className="h-5 w-5 mr-2" />
                All Categories ({categories.length})
              </CardTitle>
              <CardDescription>
                Complete hierarchical view of all categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {categories.length > 0 ? (
                renderCategoryTree(categories)
              ) : (
                <p className="text-gray-500 text-center py-4">No categories found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Package className="h-5 w-5 mr-2" />
                Product Categories ({productCategories.length})
              </CardTitle>
              <CardDescription>
                Tiles, Decor, Lighting, and other product categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {productCategories.length > 0 ? (
                renderCategoryTree(productCategories)
              ) : (
                <p className="text-gray-500 text-center py-4">No product categories found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Tag className="h-5 w-5 mr-2" />
                Material Categories ({materialCategories.length})
              </CardTitle>
              <CardDescription>
                Wood, Metal, Ceramic, and other material categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              {materialCategories.length > 0 ? (
                renderCategoryTree(materialCategories)
              ) : (
                <p className="text-gray-500 text-center py-4">No material categories found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedCategory && (
        <Card>
          <CardHeader>
            <CardTitle>Category Details</CardTitle>
          </CardHeader><CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category Key</Label>
                <p className="font-mono text-sm">{selectedCategory.categoryKey}</p>
              </div>
              <div>
                <Label>Display Group</Label>
                <p>{selectedCategory.displayGroup}</p>
              </div>
              <div>
                <Label>Hierarchy Level</Label>
                <p>{selectedCategory.hierarchyLevel}</p>
              </div>
              <div>
                <Label>AI Extraction</Label>
                <p>{selectedCategory.aiExtractionEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <Label>Confidence Threshold</Label>
                <p>{selectedCategory.aiConfidenceThreshold}</p>
              </div>
              <div>
                <Label>Processing Priority</Label>
                <p>{selectedCategory.processingPriority}</p>
              </div>
            </div>
            {selectedCategory.description && (
              <div className="mt-4">
                <Label>Description</Label>
                <p className="text-sm text-gray-600">{selectedCategory.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DynamicCategoryManager;
