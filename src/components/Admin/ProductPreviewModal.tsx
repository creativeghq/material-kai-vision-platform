import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Package, FileText, Image as ImageIcon, Database, Calendar, Tag } from 'lucide-react';
import type { Product } from '@/types/unified-material-api';

interface ProductPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
}

export const ProductPreviewModal: React.FC<ProductPreviewModalProps> = ({
  open,
  onOpenChange,
  product,
}) => {
  if (!product) return null;

  const productAny = product as any;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl">{product.name}</DialogTitle>
              <DialogDescription className="mt-2">
                {product.description}
              </DialogDescription>
            </div>
            <Badge variant={productAny.status === 'published' ? 'default' : 'secondary'}>
              {productAny.status || 'draft'}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Long Description */}
          {productAny.long_description && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Full Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {productAny.long_description}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {product.category && (
                  <div>
                    <p className="text-sm font-medium flex items-center gap-2">
                      <Tag className="h-3 w-3" />
                      Category
                    </p>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                )}
                {productAny.created_from_type && (
                  <div>
                    <p className="text-sm font-medium">Source Type</p>
                    <p className="text-sm text-muted-foreground">{productAny.created_from_type}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Created
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(product.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-3 w-3" />
                    Updated
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(product.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Properties */}
          {product.properties && Object.keys(product.properties).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Properties
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(product.properties).map(([key, value]) => (
                    <div key={key} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{key}</p>
                      <p className="text-sm mt-1">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Specifications */}
          {product.specifications && Object.keys(product.specifications).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4" />
                  Specifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(product.specifications).map(([key, value]) => (
                    <div key={key} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{key}</p>
                      <p className="text-sm mt-1">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metadata */}
          {product.metadata && Object.keys(product.metadata).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Metadata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(product.metadata).map(([key, value]) => (
                    <div key={key} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase">{key}</p>
                      <p className="text-sm mt-1">{String(value)}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Relationships */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4" />
                Relationships
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground">Source Chunks</p>
                  <p className="text-2xl font-bold mt-1">
                    {product.sourceChunkIds?.length || 0}
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground">Related Images</p>
                  <p className="text-2xl font-bold mt-1">
                    {product.relatedImageIds?.length || 0}
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <p className="text-xs font-medium text-muted-foreground">Metafield Values</p>
                  <p className="text-2xl font-bold mt-1">
                    {product.metafieldValues?.length || 0}
                  </p>
                </div>
              </div>

              {product.sourceChunkIds && product.sourceChunkIds.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Source Chunk IDs:</p>
                  <div className="flex flex-wrap gap-2">
                    {product.sourceChunkIds.slice(0, 10).map((chunkId) => (
                      <Badge key={chunkId} variant="outline" className="text-xs">
                        {chunkId.substring(0, 8)}...
                      </Badge>
                    ))}
                    {product.sourceChunkIds.length > 10 && (
                      <Badge variant="secondary" className="text-xs">
                        +{product.sourceChunkIds.length - 10} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Embeddings Info */}
          {productAny.embedding_model && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Database className="h-4 w-4" />
                  Embeddings
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Model:</span>
                    <Badge variant="outline">{productAny.embedding_model}</Badge>
                  </div>
                  {productAny.embedding && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Embedding Generated:</span>
                      <Badge variant="default">Yes</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

