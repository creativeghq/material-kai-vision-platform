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
  workspaceId: string;
  onStatsUpdate: () => void;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ workspaceId, onStatsUpdate }) => {
  const [images, setImages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [imageEmbeddings, setImageEmbeddings] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (workspaceId) {
      setCurrentPage(1);
      loadImages(1);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) {
      loadImages(currentPage);
    }
  }, [currentPage]);

  const loadImages = async (page: number) => {
    try {
      setIsLoading(true);
      console.log('[ImagesTab] Loading images for workspace:', workspaceId, 'page:', page);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await supabase
        .from('document_images')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('[ImagesTab] Error loading images:', error);
        throw error;
      }

      console.log('[ImagesTab] Loaded images:', data?.length || 0, 'of', count);
      setImages(data || []);
      setTotalCount(count || 0);
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

  const filteredImages = images.filter((image) => {
    if (!searchQuery) return true; // Show all if no search query

    const filename = image.metadata?.filename || image.caption || '';
    const description = image.llama_analysis?.description || image.claude_validation?.description || '';
    const pageNum = image.page_number?.toString() || '';

    return filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
           description.toLowerCase().includes(searchQuery.toLowerCase()) ||
           pageNum.includes(searchQuery);
  });

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
                      src={image.image_url}
                      alt={image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                      className="w-full h-48 object-cover"
                    />
                    <div className="p-4 space-y-2">
                      <p className="text-sm font-medium truncate">
                        {image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Page {image.page_number}
                      </p>
                      {image.llama_analysis?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {image.llama_analysis.description}
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

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>

              {Array.from({ length: Math.ceil(totalCount / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage === Math.ceil(totalCount / ITEMS_PER_PAGE)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedImage && (
        <Dialog open={true} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <img
                src={selectedImage.image_url}
                alt={selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
                className="w-full rounded-lg"
              />

              <div>
                <h4 className="font-semibold mb-2">Page Number</h4>
                <p className="text-sm">{selectedImage.page_number}</p>
              </div>

              {selectedImage.llama_analysis?.description && (
                <div>
                  <h4 className="font-semibold mb-2">AI Description (Llama)</h4>
                  <p className="text-sm">{selectedImage.llama_analysis.description}</p>
                </div>
              )}

              {selectedImage.claude_validation?.description && (
                <div>
                  <h4 className="font-semibold mb-2">AI Validation (Claude)</h4>
                  <p className="text-sm">{selectedImage.claude_validation.description}</p>
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

