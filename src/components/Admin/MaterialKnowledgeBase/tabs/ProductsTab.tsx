import React from 'react';
import { Package, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';

interface ProductsTabProps {
  products: any[];
  handleCreateProduct: () => void;
  handlePreviewProduct: (product: any) => void;
  handleEditProduct: (product: any) => void;
  handleDeleteProduct: (product: any) => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({
  products,
  handleCreateProduct,
  handlePreviewProduct,
  handleEditProduct,
  handleDeleteProduct,
}) => {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Products from PDF Chunks
              </CardTitle>
              <CardDescription>
                Products created from real PDF chunks with source tracking
                and metadata
              </CardDescription>
            </div>
            <Button onClick={handleCreateProduct} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Create Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <div className="text-center py-8">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No products created yet. Process PDFs and create products
                from chunks.
              </p>
              <Button onClick={handleCreateProduct} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Product
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {products.map((product) => (
                <Card key={product.id} className="border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-lg">
                          {product.name}
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {product.description?.substring(0, 150)}
                          {product.description &&
                          product.description.length > 150
                            ? '...'
                            : ''}
                        </p>
                      </div>
                      <Badge
                        variant={
                          product.status === 'published'
                            ? 'default'
                            : 'secondary'
                        }
                      >
                        {product.status || 'draft'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                      <div>
                        <span className="font-medium">Source:</span>
                        <p className="text-muted-foreground text-xs">
                          {product.created_from_type}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Material:</span>
                        <p className="text-muted-foreground text-xs">
                          {product.properties?.material_type || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Color:</span>
                        <p className="text-muted-foreground text-xs">
                          {product.properties?.color || 'N/A'}
                        </p>
                      </div>
                      <div>
                        <span className="font-medium">Created:</span>
                        <p className="text-muted-foreground text-xs">
                          {new Date(
                            product.created_at,
                          ).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {product.metadata?.supplier && (
                      <div className="mb-3 text-sm">
                        <span className="font-medium">Supplier:</span>
                        <p className="text-muted-foreground">
                          {product.metadata.supplier}
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handlePreviewProduct(product)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditProduct(product)}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteProduct(product)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProductsTab;
