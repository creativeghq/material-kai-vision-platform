/**
 * PDF Image Gallery Component
 * 
 * Displays extracted images from PDF processing with thumbnails,
 * full-size viewing, and connection to related text content
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Image as ImageIcon, 
  Download, 
  Search, 
  Grid, 
  List, 
  ZoomIn, 
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  MapPin,
  Tag,
  Eye,
  Filter,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

export interface PDFImage {
  id: string;
  document_id: string;
  image_url: string;
  image_type: string;
  caption?: string;
  alt_text?: string;
  page_number: number;
  confidence: number;
  processing_status: string;
  metadata?: {
    filename?: string;
    width?: number;
    height?: number;
    size_bytes?: number;
    format?: string;
    extraction_method?: string;
    associated_chunks?: string[];
    nearest_heading?: string;
    layout_context?: any;
  };
  created_at: string;
}

interface PDFImageGalleryProps {
  documentId: string;
  showHeader?: boolean;
  viewMode?: 'grid' | 'list';
  onImageSelect?: (image: PDFImage) => void;
  onImageView?: (image: PDFImage, allImages: PDFImage[]) => void;
  className?: string;
}

export const PDFImageGallery: React.FC<PDFImageGalleryProps> = ({
  documentId,
  showHeader = true,
  viewMode: initialViewMode = 'grid',
  onImageSelect,
  onImageView,
  className
}) => {
  const [images, setImages] = useState<PDFImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'page' | 'confidence' | 'created'>('page');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedImage, setSelectedImage] = useState<PDFImage | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Load images from database
  const loadImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('document_images')
        .select('*')
        .eq('document_id', documentId)
        .order('page_number', { ascending: true });

      if (fetchError) {
        throw new Error(`Failed to load images: ${fetchError.message}`);
      }

      setImages(data || []);
    } catch (err) {
      console.error('Error loading images:', err);
      setError(err instanceof Error ? err.message : 'Failed to load images');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (documentId) {
      loadImages();
    }
  }, [documentId, loadImages]);

  // Filter and sort images
  const filteredAndSortedImages = React.useMemo(() => {
    let filtered = images;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(image => 
        image.caption?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        image.alt_text?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        image.metadata?.filename?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        image.metadata?.nearest_heading?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(image => image.image_type === filterType);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;
      
      switch (sortBy) {
        case 'page':
          aValue = a.page_number;
          bValue = b.page_number;
          break;
        case 'confidence':
          aValue = a.confidence;
          bValue = b.confidence;
          break;
        case 'created':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        default:
          aValue = a.page_number;
          bValue = b.page_number;
      }

      if (sortOrder === 'desc') {
        return bValue - aValue;
      }
      return aValue - bValue;
    });

    return filtered;
  }, [images, searchTerm, filterType, sortBy, sortOrder]);

  // Get unique image types for filter
  const imageTypes = React.useMemo(() => {
    const types = new Set(images.map(img => img.image_type));
    return Array.from(types);
  }, [images]);

  const handleImageClick = (image: PDFImage, index: number) => {
    setSelectedImage(image);
    setCurrentImageIndex(index);
    setIsModalOpen(true);
    
    if (onImageView) {
      onImageView(image, filteredAndSortedImages);
    }
    if (onImageSelect) {
      onImageSelect(image);
    }
  };

  const handleModalNavigate = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' 
      ? Math.max(0, currentImageIndex - 1)
      : Math.min(filteredAndSortedImages.length - 1, currentImageIndex + 1);
    
    setCurrentImageIndex(newIndex);
    setSelectedImage(filteredAndSortedImages[newIndex]);
  };

  const handleDownload = (image: PDFImage) => {
    const link = document.createElement('a');
    link.href = image.image_url;
    link.download = `${image.metadata?.filename || `image_${image.id}`}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderImageCard = (image: PDFImage, index: number) => {
    const isGridMode = viewMode === 'grid';
    
    return (
      <Card 
        key={image.id} 
        className={cn(
          "overflow-hidden transition-all hover:shadow-lg cursor-pointer group",
          isGridMode ? "h-fit" : "flex flex-row h-32"
        )}
        onClick={() => handleImageClick(image, index)}
      >
        {/* Image */}
        <div className={cn(
          "relative bg-gray-100 flex items-center justify-center",
          isGridMode ? "aspect-video" : "w-32 h-full flex-shrink-0"
        )}>
          <img
            src={image.image_url}
            alt={image.alt_text || image.caption || `Image ${index + 1}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          
          {/* Page number badge */}
          <Badge className="absolute top-2 left-2 bg-black/70 text-white border-0">
            Page {image.page_number}
          </Badge>
          
          {/* Confidence badge */}
          <Badge 
            variant="outline" 
            className="absolute top-2 right-2 bg-white/90 text-gray-800"
          >
            {Math.round(image.confidence * 100)}%
          </Badge>
        </div>

        {/* Content */}
        <CardContent className={cn(
          "p-3",
          isGridMode ? "" : "flex-1 flex flex-col justify-between"
        )}>
          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium text-sm truncate">
                {image.caption || image.metadata?.filename || `Image ${index + 1}`}
              </h4>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(image);
                }}
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
            
            {image.alt_text && (
              <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                {image.alt_text}
              </p>
            )}
            
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Badge variant="secondary" className="text-xs">
                {image.image_type}
              </Badge>
              {image.metadata?.width && image.metadata?.height && (
                <span>{image.metadata.width}×{image.metadata.height}</span>
              )}
              {image.metadata?.format && (
                <span>{image.metadata.format}</span>
              )}
            </div>
          </div>
          
          {/* Associated content info */}
          {image.metadata?.associated_chunks && image.metadata.associated_chunks.length > 0 && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <FileText className="h-3 w-3" />
                <span>{image.metadata.associated_chunks.length} related chunks</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
            <span>Loading images...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center">
            <div className="text-red-500 mb-2">Error loading images</div>
            <p className="text-gray-500 text-sm">{error}</p>
            <Button onClick={loadImages} className="mt-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={className}>
      {showHeader && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Extracted Images ({filteredAndSortedImages.length})
                </CardTitle>
                <CardDescription>
                  Images extracted from PDF processing with metadata and context
                </CardDescription>
              </div>
              
              {/* View mode toggle */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            {/* Filters and Search */}
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search images by caption, filename, or content..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {imageTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="page">Page Number</SelectItem>
                  <SelectItem value="confidence">Confidence</SelectItem>
                  <SelectItem value="created">Date Created</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              >
                {sortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Images Grid/List */}
      {filteredAndSortedImages.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No images found</h3>
            <p className="text-gray-500">
              {searchTerm || filterType !== 'all' 
                ? 'Try adjusting your search or filter criteria'
                : 'No images have been extracted from this document yet'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={cn(
          viewMode === 'grid' 
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-4"
        )}>
          {filteredAndSortedImages.map((image, index) => renderImageCard(image, index))}
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-6xl w-full h-[90vh] p-0">
            <DialogHeader className="p-4 pb-2">
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  <span>{selectedImage.caption || selectedImage.metadata?.filename || `Image ${currentImageIndex + 1}`}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {currentImageIndex + 1} of {filteredAndSortedImages.length}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(selectedImage)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setIsModalOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </DialogTitle>
            </DialogHeader>

            <div className="flex-1 flex overflow-hidden">
              {/* Image Display */}
              <div className="flex-1 relative bg-gray-50 flex items-center justify-center">
                <img
                  src={selectedImage.image_url}
                  alt={selectedImage.alt_text || selectedImage.caption || 'Image'}
                  className="max-w-full max-h-full object-contain"
                />
                
                {/* Navigation */}
                {filteredAndSortedImages.length > 1 && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute left-4 top-1/2 transform -translate-y-1/2"
                      onClick={() => handleModalNavigate('prev')}
                      disabled={currentImageIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="absolute right-4 top-1/2 transform -translate-y-1/2"
                      onClick={() => handleModalNavigate('next')}
                      disabled={currentImageIndex === filteredAndSortedImages.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>

              {/* Image Details Sidebar */}
              <div className="w-80 border-l bg-white">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Image Details</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Page:</span>
                          <span>{selectedImage.page_number}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Type:</span>
                          <Badge variant="secondary">{selectedImage.image_type}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Confidence:</span>
                          <span>{Math.round(selectedImage.confidence * 100)}%</span>
                        </div>
                        {selectedImage.metadata?.width && selectedImage.metadata?.height && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Dimensions:</span>
                            <span>{selectedImage.metadata.width}×{selectedImage.metadata.height}</span>
                          </div>
                        )}
                        {selectedImage.metadata?.format && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Format:</span>
                            <span>{selectedImage.metadata.format}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedImage.caption && (
                      <div>
                        <h4 className="font-medium mb-2">Caption</h4>
                        <p className="text-sm text-gray-600">{selectedImage.caption}</p>
                      </div>
                    )}

                    {selectedImage.alt_text && selectedImage.alt_text !== selectedImage.caption && (
                      <div>
                        <h4 className="font-medium mb-2">Description</h4>
                        <p className="text-sm text-gray-600">{selectedImage.alt_text}</p>
                      </div>
                    )}

                    {selectedImage.metadata?.nearest_heading && (
                      <div>
                        <h4 className="font-medium mb-2">Context</h4>
                        <p className="text-sm text-gray-600">{selectedImage.metadata.nearest_heading}</p>
                      </div>
                    )}

                    {selectedImage.metadata?.associated_chunks && selectedImage.metadata.associated_chunks.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Related Content</h4>
                        <div className="space-y-1">
                          {selectedImage.metadata.associated_chunks.map((chunkId, index) => (
                            <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                              <FileText className="h-3 w-3" />
                              <span>Chunk {chunkId}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PDFImageGallery;
