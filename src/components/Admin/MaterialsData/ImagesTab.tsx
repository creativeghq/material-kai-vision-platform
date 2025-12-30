import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Eye, Loader2, FileText, Code, Globe } from 'lucide-react';
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
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [images, setImages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
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
  }, [workspaceId, sourceFilter, jobIdFilter]);

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

      let query = supabase
        .from('document_images')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId);

      // Apply source filter
      if (sourceFilter !== 'all') {
        query = query.eq('source_type', sourceFilter);
      }

      // Apply job ID filter
      if (jobIdFilter && jobIdFilter.trim()) {
        query = query.eq('source_job_id', jobIdFilter.trim());
      }

      const { data, error, count } = await query
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
    const description = image.vision_analysis?.description || image.claude_validation?.description || '';
    const pageNum = image.page_number?.toString() || '';

    return filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
           description.toLowerCase().includes(searchQuery.toLowerCase()) ||
           pageNum.includes(searchQuery);
  });

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return <Badge variant="outline">Unknown</Badge>;

    const badges = {
      pdf_processing: { label: 'PDF', icon: FileText, color: 'bg-blue-100 text-blue-700' },
      xml_import: { label: 'XML', icon: Code, color: 'bg-green-100 text-green-700' },
      web_scraping: { label: 'Web', icon: Globe, color: 'bg-purple-100 text-purple-700' },
    };

    const badge = badges[sourceType as keyof typeof badges];
    if (!badge) return <Badge variant="outline">{sourceType}</Badge>;

    const Icon = badge.icon;
    return (
      <Badge className={`${badge.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Images</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="pdf_processing">PDF Processing</SelectItem>
                  <SelectItem value="xml_import">XML Import</SelectItem>
                  <SelectItem value="web_scraping">Web Scraping</SelectItem>
                </SelectContent>
              </Select>
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
                <Card key={image.id} className="overflow-hidden flex flex-col">
                  <CardContent className="p-0 flex flex-col h-full">
                    <img
                      src={image.image_url}
                      alt={image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                      className="w-full h-48 object-cover flex-shrink-0"
                    />
                    <div className="p-4 space-y-2 flex-1 flex flex-col">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate flex-1" title={image.metadata?.filename || image.caption || `Page ${image.page_number}`}>
                          {image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                        </p>
                        {getSourceBadge(image.source_type)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Page {image.page_number}
                      </p>
                      {image.vision_analysis?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2" title={image.vision_analysis.description}>
                          {image.vision_analysis.description}
                        </p>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-auto"
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
              <DialogTitle className="break-words">
                {selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <img
                src={selectedImage.image_url}
                alt={selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
                className="w-full rounded-lg max-w-full"
              />

              <div>
                <h4 className="font-semibold mb-2">Page Number</h4>
                <p className="text-sm">{selectedImage.page_number}</p>
              </div>

              {selectedImage.vision_analysis?.description && (
                <div>
                  <h4 className="font-semibold mb-2">AI Description (Vision)</h4>
                  <p className="text-sm break-words">{selectedImage.vision_analysis.description}</p>
                </div>
              )}

              {selectedImage.claude_validation?.description && (
                <div>
                  <h4 className="font-semibold mb-2">AI Validation (Claude)</h4>
                  <p className="text-sm break-words">{selectedImage.claude_validation.description}</p>
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

