import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ImagesTabProps {
  onStatsUpdate: () => void;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ onStatsUpdate }) => {
  const [images, setImages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [imageEmbeddings, setImageEmbeddings] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('document_images')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setImages(data || []);
    } catch (error) {
      console.error('Failed to load images:', error);
      toast({
        title: 'Error',
        description: 'Failed to load images',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadImageEmbeddings = async (imageId: string) => {
    try {
      const { data, error } = await supabase
        .from('embeddings')
        .select('*')
        .eq('image_id', imageId);

      if (error) throw error;
      setImageEmbeddings(data || []);
    } catch (error) {
      console.error('Failed to load embeddings:', error);
    }
  };

  const handleViewImage = async (image: any) => {
    setSelectedImage(image);
    await loadImageEmbeddings(image.id);
  };

  const filteredImages = images.filter((image) =>
    image.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.ai_description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Images</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search images..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredImages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No images found
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredImages.map((image) => (
                <Card key={image.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <img
                      src={image.storage_path}
                      alt={image.filename}
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-4 space-y-2">
                      <p className="text-sm font-medium truncate">{image.filename}</p>
                      {image.ai_description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {image.ai_description}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => handleViewImage(image)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedImage && (
        <Dialog open={true} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedImage.filename}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <img
                src={selectedImage.storage_path}
                alt={selectedImage.filename}
                className="w-full rounded-lg"
              />
              
              {selectedImage.ai_description && (
                <div>
                  <h4 className="font-semibold mb-2">AI Description</h4>
                  <p className="text-sm">{selectedImage.ai_description}</p>
                </div>
              )}

              <div>
                <h4 className="font-semibold mb-2">Embeddings ({imageEmbeddings.length})</h4>
                {imageEmbeddings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No embeddings found</p>
                ) : (
                  <div className="space-y-2">
                    {imageEmbeddings.map((emb, idx) => (
                      <Card key={idx}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <Badge>{emb.embedding_type || 'text'}</Badge>
                            <span className="text-xs text-muted-foreground">
                              Dimension: {emb.embedding?.length || 0}
                            </span>
                          </div>
                          <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(emb.embedding?.slice(0, 5), null, 2)}... (truncated)
                          </pre>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

