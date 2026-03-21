import React from 'react';
import { Hash, FileText, Image as ImageIcon, Package, Database, RefreshCw, ChevronRight } from 'lucide-react';
import { formatLabel } from '@/lib/labelUtils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';

interface MetadataTabProps {
  metadataLoading: boolean;
  metadataData: any;
  navigateToChunkDetails: (chunkId: string) => void;
  navigateToImageDetails: (imageId: string) => void;
  navigateToProductDetails: (productId: string) => void;
}

export const MetadataTab: React.FC<MetadataTabProps> = ({
  metadataLoading,
  metadataData,
  navigateToChunkDetails,
  navigateToImageDetails,
  navigateToProductDetails,
}) => {
  if (metadataLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="flex items-center justify-center gap-3">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading metadata...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!metadataData) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-8">
            <div className="text-center">
              <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No metadata available</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Total Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metadataData.summary.total_entities}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across chunks, images, and products
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              With Metadata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metadataData.summary.entities_with_metadata}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metadataData.summary.total_entities > 0
                ? `${((metadataData.summary.entities_with_metadata / metadataData.summary.total_entities) * 100).toFixed(1)}% coverage`
                : '0% coverage'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Unique Fields
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {metadataData.summary.metadata_fields.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Different metadata properties
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Metadata Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Metadata Fields (
            {metadataData.summary.metadata_fields.length})
          </CardTitle>
          <CardDescription>
            All unique metadata fields across entities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {metadataData.summary.metadata_fields.map((field: string) => (
              <Badge key={field} variant="secondary">
                {formatLabel(field)}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Chunks Metadata */}
      {metadataData.metadata.chunks &&
        metadataData.metadata.chunks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Chunks Metadata ({metadataData.metadata.chunks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {metadataData.metadata.chunks
                  .slice(0, 20)
                  .map((chunk: any) => (
                    <Card
                      key={chunk.id}
                      className="border hover:border-primary transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {chunk.content_preview}
                          </p>
                          <div className="flex gap-2">
                            {chunk.quality?.quality_score && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                Q:{' '}
                                {(
                                  chunk.quality.quality_score * 100
                                ).toFixed(0)}
                                %
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                navigateToChunkDetails(chunk.id)
                              }
                            >
                              <ChevronRight className="h-3 w-3" />
                              View
                            </Button>
                          </div>
                        </div>
                        {chunk.metadata &&
                          Object.keys(chunk.metadata).length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(
                                  chunk.metadata,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  ))}
                {metadataData.metadata.chunks.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center">
                    Showing 20 of {metadataData.metadata.chunks.length}{' '}
                    chunks
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Images Metadata */}
      {metadataData.metadata.images &&
        metadataData.metadata.images.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Images Metadata ({metadataData.metadata.images.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {metadataData.metadata.images
                  .slice(0, 10)
                  .map((image: any) => (
                    <Card
                      key={image.id}
                      className="border hover:border-primary transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex gap-3">
                          {image.image_url && (
                            <img
                              src={image.image_url}
                              alt="Image"
                              className="w-20 h-20 object-cover rounded cursor-pointer"
                              onClick={() =>
                                navigateToImageDetails(image.id)
                              }
                            />
                          )}
                          <div className="flex-1">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className="text-xs"
                                >
                                  Page {image.page_number || 'N/A'}
                                </Badge>
                                {image.quality?.quality_score && (
                                  <Badge
                                    variant="secondary"
                                    className="text-xs"
                                  >
                                    Q:{' '}
                                    {(
                                      image.quality.quality_score * 100
                                    ).toFixed(0)}
                                    %
                                  </Badge>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() =>
                                  navigateToImageDetails(image.id)
                                }
                              >
                                <ChevronRight className="h-3 w-3" />
                                View
                              </Button>
                            </div>
                            {image.metadata &&
                              Object.keys(image.metadata).length >
                                0 && (
                                <div className="p-2 bg-muted/50 rounded text-xs">
                                  <pre className="whitespace-pre-wrap line-clamp-3">
                                    {JSON.stringify(
                                      image.metadata,
                                      null,
                                      2,
                                    )}
                                  </pre>
                                </div>
                              )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                {metadataData.metadata.images.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center col-span-2">
                    Showing 10 of {metadataData.metadata.images.length}{' '}
                    images
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

      {/* Products Metadata */}
      {metadataData.metadata.products &&
        metadataData.metadata.products.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Products Metadata (
                {metadataData.metadata.products.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {metadataData.metadata.products
                  .slice(0, 20)
                  .map((product: any) => (
                    <Card
                      key={product.id}
                      className="border hover:border-primary transition-colors"
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h4 className="font-medium">
                              {product.name}
                            </h4>
                            <p className="text-sm text-muted-foreground line-clamp-1">
                              {product.description_preview}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {product.quality?.quality_score && (
                              <Badge
                                variant="outline"
                                className="text-xs"
                              >
                                Q:{' '}
                                {(
                                  product.quality.quality_score * 100
                                ).toFixed(0)}
                                %
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              onClick={() =>
                                navigateToProductDetails(product.id)
                              }
                            >
                              <ChevronRight className="h-3 w-3" />
                              View
                            </Button>
                          </div>
                        </div>
                        {product.metadata &&
                          Object.keys(product.metadata).length > 0 && (
                            <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                              <pre className="whitespace-pre-wrap">
                                {JSON.stringify(
                                  product.metadata,
                                  null,
                                  2,
                                )}
                              </pre>
                            </div>
                          )}
                      </CardContent>
                    </Card>
                  ))}
                {metadataData.metadata.products.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center">
                    Showing 20 of{' '}
                    {metadataData.metadata.products.length} products
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
};

export default MetadataTab;
