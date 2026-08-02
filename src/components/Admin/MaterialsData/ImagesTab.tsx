import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { MIVAA_API_URL } from '@/config/mivaa';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Loader2, FileText, Code, Globe, Image as ImageIcon, Database } from 'lucide-react';
import { FilterBar, applyFiltersToQuery, type FilterValues } from '@/components/core/filters';
import { buildMaterialsDataFilters } from './materialsDataFilters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SmartPagination } from '@/components/core/ui/smart-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { ImageEmbeddingsInspector } from './ImageEmbeddingsInspector';

import { onEnterOrSpace } from '@/utils/a11y';

interface ImagesTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const ImagesTab: React.FC<ImagesTabProps> = ({ workspaceId, jobIdFilter}) => {
  const [images, setImages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<any | null>(null);
  const [imageEmbeddings, setImageEmbeddings] = useState<any[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  const groups = useMemo(() => buildMaterialsDataFilters('images', { jobIdFilter }), [jobIdFilter]);
  const [filterValues, setFilterValues] = useState<FilterValues>(
    () => (jobIdFilter?.trim() ? { source_job_id: jobIdFilter.trim() } : {}),
  );

  // The `?jobId=` deep link lives on the page above; mirror it into the values bag so it
  // shows up as a removable chip instead of an invisible predicate.
  useEffect(() => {
    setFilterValues((v) => ({ ...v, source_job_id: jobIdFilter?.trim() || undefined }));
  }, [jobIdFilter]);

  const buildQuery = useCallback((values: FilterValues, head: boolean) => {
    const query: any = supabase
      .from('document_images')
      .select(head ? 'id' : '*', { count: 'exact', head })
      .eq('workspace_id', workspaceId);
    return applyFiltersToQuery(query, groups, values);
  }, [workspaceId, groups]);

  const loadImages = useCallback(async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await buildQuery(filterValues, false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error('[ImagesTab] Error loading images:', error);
        throw error;
      }

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
  }, [buildQuery, filterValues, toast]);

  useEffect(() => { setCurrentPage(1); }, [filterValues]);

  // Debounced so typing in the search box doesn't fire a query per keystroke; the cleanup
  // also collapses the extra render caused by the page reset above into one fetch.
  useEffect(() => {
    if (!workspaceId) return;
    const timer = setTimeout(() => { void loadImages(currentPage); }, 250);
    return () => clearTimeout(timer);
  }, [workspaceId, currentPage, loadImages]);

  const previewCount = useCallback(async (values: FilterValues) => {
    const { count } = await buildQuery(values, true);
    return count ?? 0;
  }, [buildQuery]);

  const loadImageEmbeddings = async (imageId: string) => {
    try {
      // document_images carries no embedding columns — presence is tracked
      // via has_*_slig boolean flags; vectors live in vecs.image_*_embeddings.
      const { data: imageData, error: imageError } = await supabase
        .from('document_images')
        .select(
          'has_slig_embedding, has_understanding_embedding, has_color_slig, has_texture_slig, has_style_slig, has_material_slig',
        )
        .eq('id', imageId)
        .single();

      if (imageError) {
        console.error('[ImagesTab] Failed to load embeddings:', imageError);
        setImageEmbeddings([]);
        return;
      }

      const embeddings = [];

      if (imageData?.has_slig_embedding) {
        embeddings.push({
          embedding_type: 'Visual (SLIG)',
          model_name: 'SigLIP2-base-patch16-512',
          vector_dimensions: 768,
        });
      }
      // Aspect collections post-2026-05-04 are 1024D Voyage embeddings of
      // VisionAnalysis text — flag column names retained for cross-stack
      // stability. Detailed per-aspect status (model, schema_version,
      // source_text, rebuild controls) lives in the Embeddings tab of the
      // dialog via ImageEmbeddingsInspector.
      if (imageData?.has_color_slig) {
        embeddings.push({
          embedding_type: 'Color (aspect)',
          model_name: 'voyage-3',
          vector_dimensions: 1024,
        });
      }
      if (imageData?.has_texture_slig) {
        embeddings.push({
          embedding_type: 'Texture (aspect)',
          model_name: 'voyage-3',
          vector_dimensions: 1024,
        });
      }
      if (imageData?.has_style_slig) {
        embeddings.push({
          embedding_type: 'Style (aspect)',
          model_name: 'voyage-3',
          vector_dimensions: 1024,
        });
      }
      if (imageData?.has_material_slig) {
        embeddings.push({
          embedding_type: 'Material (aspect)',
          model_name: 'voyage-3',
          vector_dimensions: 1024,
        });
      }
      if (imageData?.has_understanding_embedding) {
        embeddings.push({
          embedding_type: 'Understanding',
          model_name: 'voyage-3',
          vector_dimensions: 1024,
        });
      }

      setImageEmbeddings(embeddings);
    } catch (error) {
      console.error('[ImagesTab] Failed to load embeddings:', error);
      setImageEmbeddings([]);
    }
  };

  const handleViewImage = async (image: any) => {
    // Load full image data with ALL relations
    const { data: fullImageData, error } = await supabase
      .from('document_images')
      .select(`
        *,
        documents(id, filename, title)
      `)
      .eq('id', image.id)
      .single();

    if (error) {
      console.error('[ImagesTab] Error loading full image data:', error);
      setSelectedImage(image);
    } else {
      // Load chunk relationships
      const { data: chunkRels } = await supabase
        .from('chunk_image_relationships')
        .select(`
          relationship_type,
          relevance_score,
          document_chunks!inner(
            id,
            content,
            metadata
          )
        `)
        .eq('image_id', image.id);

      // Load product relationships from image_product_associations
      const { data: productRels } = await supabase
        .from('image_product_associations')
        .select(`
          reasoning,
          overall_score,
          product_enrichments!inner(
            id,
            product_name,
            product_category
          )
        `)
        .eq('image_id', image.id);

      setSelectedImage({
        ...fullImageData,
        chunk_relationships: chunkRels || [],
        product_relationships: productRels || [],
      });
    }

    await loadImageEmbeddings(image.id);
  };

  const handleReclassify = async (imageId: string) => {
    setIsReclassifying(true);
    try {
      const response = await fetch(`${MIVAA_API_URL}/api/images/reclassify/${imageId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Re-classification failed');
      }

      const result = await response.json();

      toast({
        title: 'Re-classification Complete',
        description: `Image re-classified as ${result.updated_data.category}`,
      });

      // Reload the image data
      await loadImages(currentPage);

      // Update the selected image if it's still open
      if (selectedImage?.id === imageId) {
        const { data, error } = await supabase
          .from('document_images')
          .select('*')
          .eq('id', imageId)
          .single();

        if (!error && data) {
          setSelectedImage(data);
        }
      }
    } catch (error) {
      console.error('Re-classification failed:', error);
      toast({
        title: 'Error',
        description: 'Failed to re-classify image',
        variant: 'destructive',
      });
    } finally {
      setIsReclassifying(false);
    }
  };

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
            <div>
              <CardTitle className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                All Images
              </CardTitle>
              <CardDescription>
                View and manage images extracted from documents
              </CardDescription>
            </div>
            <FilterBar
              groups={groups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter images"
              searchPlaceholder="Search caption / OCR text…"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No images found
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 'var(--grid-gap)' }}>
              {images.map((image) => (
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={onEnterOrSpace(() => handleViewImage(image))}
                  key={image.id}
                  className="dashboard-card transition-all duration-200 hover:shadow-md cursor-pointer"
                  style={{ padding: 'var(--card-padding)' }}
                  onClick={() => handleViewImage(image)}
                >
                  {/* Image */}
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden" style={{ marginBottom: 'var(--space-sm)' }}>
                    <img
                      src={getOptimizedImageUrl(image.image_url, 'preview')}
                      alt={image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 'var(--space-xs)' }}>
                    <Badge variant="outline" className="text-xs">
                      {image.image_type || 'Unknown'}
                    </Badge>
                    {getSourceBadge(image.source_type)}
                  </div>

                  {/* Title */}
                  <h4 className="font-medium truncate" style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-xs)' }}>
                    {image.metadata?.filename || image.caption || `Page ${image.page_number}`}
                  </h4>

                  {/* Description */}
                  {image.vision_analysis?.description && (
                    <p className="text-muted-foreground line-clamp-2" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-xs)' }}>
                      {image.vision_analysis.description}
                    </p>
                  )}

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-2" style={{ fontSize: 'var(--text-xs)', color: 'hsl(var(--muted-foreground))' }}>
                    <div>
                      <span className="font-medium">Page:</span> {image.page_number || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span> {image.processing_status || 'N/A'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6">
              <SmartPagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedImage && (
        <Dialog open={true} onOpenChange={() => setSelectedImage(null)}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="break-words">
                {selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
              </DialogTitle>
            </DialogHeader>
            <div className="flex gap-6 overflow-hidden flex-1">
              {/* Left Side - Image */}
              <div className="flex-1 flex items-center justify-center bg-muted rounded-lg overflow-hidden">
                <img
                  src={getOptimizedImageUrl(selectedImage.image_url, 'display')}
                  alt={selectedImage.metadata?.filename || selectedImage.caption || `Page ${selectedImage.page_number}`}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* Right Side - Classification & Metadata + Embeddings inspector */}
              <div className="w-96 overflow-y-auto pr-2">
                <Tabs defaultValue="details" className="w-full">
                  <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-3">
                    <TabsTrigger
                      value="details"
                      className="flex items-center gap-2 rounded-full"
                    >
                      <FileText className="h-3 w-3" />
                      Details
                    </TabsTrigger>
                    <TabsTrigger
                      value="embeddings"
                      className="flex items-center gap-2 rounded-full"
                    >
                      <Database className="h-3 w-3" />
                      Embeddings
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="embeddings" className="mt-0 space-y-4">
                    <ImageEmbeddingsInspector
                      imageId={selectedImage.id}
                      onRebuilt={() => {
                        // Refresh badge state after a rebuild — flag changes
                        // are reflected in the parent grid via loadImages.
                        void loadImages(currentPage);
                      }}
                    />
                  </TabsContent>

                  <TabsContent value="details" className="mt-0 space-y-4">
                {/* Classification Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Classification</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">

                    {selectedImage.category && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Category:</span>
                        <Badge variant="default">{selectedImage.category}</Badge>
                      </div>
                    )}
                    {(selectedImage.vision_analysis?.material_type || selectedImage.image_type) && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Type:</span>
                        <Badge variant="secondary">
                          {(() => {
                            const materialType = selectedImage.vision_analysis?.material_type;
                            if (typeof materialType === 'string') {
                              return materialType.replace(/_/g, ' ');
                            }
                            return selectedImage.image_type || 'Unknown';
                          })()}
                        </Badge>
                      </div>
                    )}
                    {selectedImage.confidence && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Confidence:</span>
                        <span className="text-xs font-medium">{(selectedImage.confidence * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {selectedImage.confidence_score && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">AI Confidence:</span>
                        <span className="text-xs font-medium">{(selectedImage.confidence_score * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    {selectedImage.quality_score && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Quality Score:</span>
                        <span className="text-xs font-medium">{(selectedImage.quality_score * 100).toFixed(1)}%</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Page:</span>
                      <span className="text-xs font-medium">{selectedImage.page_number}</span>
                    </div>
                    {selectedImage.processing_status && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Status:</span>
                        <Badge variant={selectedImage.processing_status === 'completed' ? 'default' : 'secondary'}>
                          {selectedImage.processing_status}
                        </Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Vision Analysis - Rich Details */}
                {selectedImage.vision_analysis && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Vision Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Material Type */}
                      {selectedImage.vision_analysis.material_type && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Material Type:</span>
                          <Badge variant="outline" className="text-xs">
                            {typeof selectedImage.vision_analysis.material_type === 'string'
                              ? selectedImage.vision_analysis.material_type.replace(/_/g, ' ')
                              : String(selectedImage.vision_analysis.material_type)}
                          </Badge>
                        </div>
                      )}

                      {/* Patterns */}
                      {selectedImage.vision_analysis.patterns && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Patterns:</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedImage.vision_analysis.patterns.primary && (
                              <Badge variant="default" className="text-xs">
                                {typeof selectedImage.vision_analysis.patterns.primary === 'string'
                                  ? selectedImage.vision_analysis.patterns.primary.replace(/_/g, ' ')
                                  : String(selectedImage.vision_analysis.patterns.primary)}
                                {selectedImage.vision_analysis.patterns.confidence &&
                                  ` (${(selectedImage.vision_analysis.patterns.confidence * 100).toFixed(0)}%)`}
                              </Badge>
                            )}
                            {Array.isArray(selectedImage.vision_analysis.patterns.secondary) &&
                              selectedImage.vision_analysis.patterns.secondary.map((pattern: any, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {typeof pattern === 'string' ? pattern.replace(/_/g, ' ') : String(pattern)}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Colors */}
                      {selectedImage.vision_analysis.colors && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Colors:</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedImage.vision_analysis.colors.primary && (
                              <Badge variant="default" className="text-xs">
                                {String(selectedImage.vision_analysis.colors.primary)}
                                {selectedImage.vision_analysis.colors.confidence &&
                                  ` (${(selectedImage.vision_analysis.colors.confidence * 100).toFixed(0)}%)`}
                              </Badge>
                            )}
                            {Array.isArray(selectedImage.vision_analysis.colors.secondary) &&
                              selectedImage.vision_analysis.colors.secondary.map((color: any, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {String(color)}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Finish */}
                      {selectedImage.vision_analysis.finish && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Finish:</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedImage.vision_analysis.finish.primary && (
                              <Badge variant="default" className="text-xs">
                                {String(selectedImage.vision_analysis.finish.primary)}
                                {selectedImage.vision_analysis.finish.confidence &&
                                  ` (${(selectedImage.vision_analysis.finish.confidence * 100).toFixed(0)}%)`}
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Style */}
                      {selectedImage.vision_analysis.style && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Style:</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedImage.vision_analysis.style.primary && (
                              <Badge variant="default" className="text-xs">
                                {typeof selectedImage.vision_analysis.style.primary === 'string'
                                  ? selectedImage.vision_analysis.style.primary.replace(/_/g, ' ')
                                  : String(selectedImage.vision_analysis.style.primary)}
                                {selectedImage.vision_analysis.style.confidence &&
                                  ` (${(selectedImage.vision_analysis.style.confidence * 100).toFixed(0)}%)`}
                              </Badge>
                            )}
                            {Array.isArray(selectedImage.vision_analysis.style.secondary) &&
                              selectedImage.vision_analysis.style.secondary.map((style: any, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {typeof style === 'string' ? style.replace(/_/g, ' ') : String(style)}
                                </Badge>
                              ))}
                          </div>
                        </div>
                      )}

                      {/* Technical Specs */}
                      {selectedImage.vision_analysis.technical_specs && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Technical Specs:</span>
                          <div className="bg-muted p-2 rounded space-y-1">
                            {selectedImage.vision_analysis.technical_specs.measurements && (
                              <div className="text-xs">
                                <span className="font-medium">Dimensions:</span> {selectedImage.vision_analysis.technical_specs.measurements}
                              </div>
                            )}
                            {selectedImage.vision_analysis.technical_specs.dimensions_visible !== undefined && (
                              <div className="text-xs">
                                <span className="font-medium">Dimensions Visible:</span> {selectedImage.vision_analysis.technical_specs.dimensions_visible ? 'Yes' : 'No'}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      {selectedImage.vision_analysis.description && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Description:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{selectedImage.vision_analysis.description}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Material Properties Section */}
                {selectedImage.material_properties && Object.keys(selectedImage.material_properties).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Material Properties (Extracted)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.material_properties).map(([key, value]: [string, any]) => {
                        // Handle different value types safely
                        const displayValue = typeof value === 'object' && value !== null
                          ? (value.primary || JSON.stringify(value))
                          : String(value || '');

                        return (
                          <div key={key} className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                              <span className="text-xs font-medium">{displayValue}</span>
                            </div>
                            {typeof value === 'object' && value?.confidence && (
                              <div className="text-xs text-muted-foreground ml-auto">
                                {(value.confidence * 100).toFixed(0)}% confidence
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                {/* Caption & Alt Text */}
                {(selectedImage.caption || selectedImage.alt_text) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Image Text</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedImage.caption && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Caption:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{selectedImage.caption}</p>
                        </div>
                      )}
                      {selectedImage.alt_text && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Alt Text:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{selectedImage.alt_text}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* AI Analysis Section */}
                {(selectedImage.vision_analysis?.description || selectedImage.claude_validation?.description) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>AI Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {selectedImage.vision_analysis?.description && (
                        <div>
                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">Vision Model</h5>
                          <p className="text-xs break-words bg-muted p-2 rounded">{selectedImage.vision_analysis.description}</p>
                        </div>
                      )}
                      {selectedImage.claude_validation?.description && (
                        <div>
                          <h5 className="text-xs font-semibold text-muted-foreground mb-1">Claude Validation</h5>
                          <p className="text-xs break-words bg-muted p-2 rounded">{selectedImage.claude_validation.description}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Quality Metrics */}
                {(selectedImage.quality_score || selectedImage.quality_metrics) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Quality Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedImage.quality_score && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Quality Score:</span>
                          <span className="text-xs font-medium">{Number(selectedImage.quality_score).toFixed(2)}</span>
                        </div>
                      )}
                      {selectedImage.quality_metrics && Object.entries(selectedImage.quality_metrics).map(([key, value]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-xs font-medium">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* OCR Data */}
                {(selectedImage.ocr_extracted_text || selectedImage.ocr_confidence_score) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>OCR Data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedImage.ocr_confidence_score && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">OCR Confidence:</span>
                          <span className="text-xs font-medium">{Number(selectedImage.ocr_confidence_score).toFixed(1)}%</span>
                        </div>
                      )}
                      {selectedImage.ocr_extracted_text && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Extracted Text:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded max-h-32 overflow-y-auto">{selectedImage.ocr_extracted_text}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Context Information */}
                {(selectedImage.contextual_name || selectedImage.nearest_heading) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Context</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedImage.contextual_name && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Contextual Name:</span>
                          <p className="text-xs break-words">{selectedImage.contextual_name}</p>
                        </div>
                      )}
                      {selectedImage.nearest_heading && (
                        <div>
                          <span className="text-xs text-muted-foreground block mb-1">Nearest Heading:</span>
                          <p className="text-xs break-words">{selectedImage.nearest_heading}</p>
                          {selectedImage.heading_level && (
                            <span className="text-xs text-muted-foreground">Level {selectedImage.heading_level}</span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Visual Features */}
                {selectedImage.visual_features && Object.keys(selectedImage.visual_features).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Visual Features</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.visual_features).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs break-words">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Image Analysis Results */}
                {selectedImage.image_analysis_results && Object.keys(selectedImage.image_analysis_results).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Image Analysis</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.image_analysis_results).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground capitalize block mb-1">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Metadata Section */}
                {selectedImage.metadata && Object.keys(selectedImage.metadata).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {selectedImage.metadata.filename && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs text-muted-foreground">Filename:</span>
                          <span className="text-xs font-medium text-right break-all">{selectedImage.metadata.filename}</span>
                        </div>
                      )}
                      {selectedImage.metadata.width && selectedImage.metadata.height && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Dimensions:</span>
                          <span className="text-xs font-medium">{selectedImage.metadata.width} × {selectedImage.metadata.height}</span>
                        </div>
                      )}
                      {selectedImage.metadata.format && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Format:</span>
                          <span className="text-xs font-medium uppercase">{selectedImage.metadata.format}</span>
                        </div>
                      )}
                      {selectedImage.metadata.size && (
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">File Size:</span>
                          <span className="text-xs font-medium">{(selectedImage.metadata.size / 1024).toFixed(1)} KB</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Visual Metadata */}
                {selectedImage.visual_metadata && Object.keys(selectedImage.visual_metadata).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Visual Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.visual_metadata).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground capitalize block mb-1">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Multimodal Metadata */}
                {selectedImage.multimodal_metadata && Object.keys(selectedImage.multimodal_metadata).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Multimodal Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.multimodal_metadata).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground capitalize block mb-1">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Extracted Metadata */}
                {selectedImage.extracted_metadata && Object.keys(selectedImage.extracted_metadata).length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Extracted Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Object.entries(selectedImage.extracted_metadata).map(([key, value]: [string, any]) => (
                        <div key={key}>
                          <span className="text-xs text-muted-foreground capitalize block mb-1">{key.replace(/_/g, ' ')}:</span>
                          <p className="text-xs break-words bg-muted p-2 rounded">{typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Relations Section */}
                {((selectedImage.chunk_relationships && selectedImage.chunk_relationships.length > 0) ||
                  (selectedImage.product_relationships && selectedImage.product_relationships.length > 0)) && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Relationships</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Related Chunks */}
                      {selectedImage.chunk_relationships && selectedImage.chunk_relationships.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-muted-foreground mb-2">
                            Related Chunks ({selectedImage.chunk_relationships.length})
                          </h5>
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {selectedImage.chunk_relationships.map((rel: any, idx: number) => (
                              <div key={idx} className="p-2 bg-muted rounded space-y-1">
                                <div className="flex items-center justify-between">
                                  <Badge variant="outline" className="text-xs">
                                    {rel.relationship_type || 'related'}
                                  </Badge>
                                  {rel.relevance_score && (
                                    <span className="text-xs text-muted-foreground">
                                      {(rel.relevance_score * 100).toFixed(0)}% relevance
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs break-words">
                                  {rel.document_chunks?.content?.substring(0, 150)}...
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  Page {rel.document_chunks?.metadata?.page_number}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Related Products */}
                      {selectedImage.product_relationships && selectedImage.product_relationships.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-muted-foreground mb-2">
                            Related Products ({selectedImage.product_relationships.length})
                          </h5>
                          <div className="space-y-2">
                            {selectedImage.product_relationships.map((rel: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                                <div className="flex-1">
                                  <div className="font-medium">{rel.product_enrichments?.product_name}</div>
                                  <div className="text-muted-foreground text-xs">
                                    {rel.product_enrichments?.product_category}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {rel.relationship_type || 'related'}
                                  </Badge>
                                  {rel.relevance_score && (
                                    <span className="text-xs text-muted-foreground">
                                      {(rel.relevance_score * 100).toFixed(0)}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No Relationships */}
                      {(!selectedImage.chunk_relationships || selectedImage.chunk_relationships.length === 0) &&
                       (!selectedImage.product_relationships || selectedImage.product_relationships.length === 0) && (
                        <p className="text-xs text-muted-foreground">No relationships found</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Bounding Box */}
                {selectedImage.bbox && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Bounding Box</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <div className="text-xs bg-muted p-2 rounded font-mono">
                        {JSON.stringify(selectedImage.bbox, null, 2)}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Embeddings Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle>Embeddings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {imageEmbeddings.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No embeddings found</p>
                    ) : (
                      <div className="space-y-2">
                        {imageEmbeddings.map((emb: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="default" className="text-xs">
                                  {emb.embedding_type}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {emb.vector_dimensions}D
                                </span>
                              </div>
                              {emb.model_name && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  Model: {emb.model_name}
                                </div>
                              )}
                            </div>
                            <Badge variant="outline" className="text-xs">
                              ✓ Present
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => handleReclassify(selectedImage.id)}
                    disabled={isReclassifying}
                  >
                    <Code className="h-4 w-4 mr-2" />
                    {isReclassifying ? 'Re-classifying...' : 'Request Re-classification'}
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    <FileText className="h-4 w-4 mr-2" />
                    Edit manually
                  </Button>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => {
                    console.log('Full image data:', selectedImage);
                    toast({
                      title: 'Full Metadata',
                      description: 'Check browser console for complete image data',
                    });
                  }}>
                    <Globe className="h-4 w-4 mr-2" />
                    View full metadata
                  </Button>
                </div>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

