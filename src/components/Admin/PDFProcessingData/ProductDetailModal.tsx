import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProductDetailModalProps {
  product: any;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [images, setImages] = useState<any[]>([]);
  const [chunks, setChunks] = useState<any[]>([]);

  useEffect(() => {
    loadProductDetails();
  }, [product.id]);

  const loadProductDetails = async () => {
    try {
      setIsLoading(true);

      // Load images related to this product
      const { data: imageRelations } = await supabase
        .from('product_image_relationships')
        .select('image_id')
        .eq('product_id', product.id);

      if (imageRelations && imageRelations.length > 0) {
        const imageIds = imageRelations.map((r) => r.image_id);
        const { data: imagesData } = await supabase
          .from('document_images')
          .select('*')
          .in('id', imageIds);
        setImages(imagesData || []);
      }

      // Load chunks related to this product
      const { data: chunkRelations } = await supabase
        .from('chunk_product_relationships')
        .select('chunk_id')
        .eq('product_id', product.id);

      if (chunkRelations && chunkRelations.length > 0) {
        const chunkIds = chunkRelations.map((r) => r.chunk_id);
        const { data: chunksData } = await supabase
          .from('document_chunks')
          .select('*')
          .in('id', chunkIds);
        setChunks(chunksData || []);
      }
    } catch (error) {
      console.error('Failed to load product details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{product.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
              <TabsTrigger value="chunks">Chunks ({chunks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Product Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Name</h4>
                    <p>{product.name}</p>
                  </div>

                  {product.metadata && (
                    <>
                      {product.metadata.category && (
                        <div>
                          <h4 className="font-semibold mb-2">Category</h4>
                          <Badge>{product.metadata.category}</Badge>
                        </div>
                      )}

                      {product.metadata.manufacturer && (
                        <div>
                          <h4 className="font-semibold mb-2">Manufacturer</h4>
                          <p>{product.metadata.manufacturer}</p>
                        </div>
                      )}

                      {product.metadata.dimensions && (
                        <div>
                          <h4 className="font-semibold mb-2">Dimensions</h4>
                          <p>{JSON.stringify(product.metadata.dimensions)}</p>
                        </div>
                      )}

                      <div>
                        <h4 className="font-semibold mb-2">All Metadata</h4>
                        <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                          {JSON.stringify(product.metadata, null, 2)}
                        </pre>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="images" className="space-y-4">
              {images.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No images found for this product
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {images.map((image) => (
                    <Card key={image.id}>
                      <CardContent className="p-4">
                        <img
                          src={image.image_url}
                          alt={image.filename}
                          className="w-full h-48 object-cover rounded-lg mb-2"
                        />
                        <p className="text-sm font-medium truncate">{image.filename}</p>
                        {image.ai_description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {image.ai_description}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="chunks" className="space-y-4">
              {chunks.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No chunks found for this product
                </p>
              ) : (
                chunks.map((chunk, index) => (
                  <Card key={chunk.id}>
                    <CardHeader>
                      <CardTitle className="text-sm">Chunk {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{chunk.content}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

