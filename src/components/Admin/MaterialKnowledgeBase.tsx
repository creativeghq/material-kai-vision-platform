import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  Image as ImageIcon,
  Database,
  Eye,
  Filter,
  RefreshCw,
  Download,
  Hash,
  Layers,
  ChevronRight,
  Brain,
  ArrowLeft,
  Package,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  ExternalLink,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { ProductFormModal } from './ProductFormModal';
import { ProductDeleteConfirmation } from './ProductDeleteConfirmation';
import { ProductPreviewModal } from './ProductPreviewModal';
import { ChunkDetailModal } from './ChunkDetailModal';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  useKnowledgeBaseMetadata,
  useQualityScores,
  useEmbeddingsStats,
  useDetections,
  useQualityDashboard,
  usePatterns,
} from '@/hooks/useKnowledgeBaseAPI';

// Component to display AI cost information for an image
const ImageAICostDisplay: React.FC<{ imageId: string }> = ({ imageId }) => {
  const [aiCost, setAiCost] = React.useState<any>(null);

  React.useEffect(() => {
    const fetchAICost = async () => {
      if (imageId) {
        try {
          // Query ai_call_logs for this image
          const { data, error } = await supabase
            .from('ai_call_logs')
            .select('*')
            .or(
              `request_data->image_id.eq.${imageId},response_data->image_id.eq.${imageId}`,
            )
            .order('timestamp', { ascending: false });

          if (!error && data && data.length > 0) {
            const totalCost = data.reduce(
              (sum, log) => sum + (parseFloat(log.cost) || 0),
              0,
            );
            const clipCalls = data.filter(
              (log) =>
                log.task.includes('embedding') || log.model.includes('clip'),
            );
            const llamaCalls = data.filter((log) =>
              log.model.includes('llama'),
            );
            const claudeCalls = data.filter((log) =>
              log.model.includes('claude'),
            );

            setAiCost({
              total: totalCost,
              clip: clipCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              llama: llamaCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              claude: claudeCalls.reduce(
                (sum, log) => sum + (parseFloat(log.cost) || 0),
                0,
              ),
              calls: data.length,
            });
          }
        } catch (err) {
          console.error('Failed to fetch AI cost:', err);
        }
      }
    };

    fetchAICost();
  }, [imageId]);

  if (!aiCost || aiCost.total <= 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
      <h4 className="font-semibold mb-3 text-green-900 dark:text-green-100 flex items-center gap-2">
        <DollarSign className="h-4 w-4" />
        AI Processing Cost
      </h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-green-700 dark:text-green-300">
            Total Cost:
          </span>
          <span className="font-bold text-green-900 dark:text-green-100">
            ${aiCost.total.toFixed(4)}
          </span>
        </div>
        {aiCost.clip > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              CLIP Embedding:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.clip.toFixed(4)}
            </span>
          </div>
        )}
        {aiCost.llama > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              Llama Analysis:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.llama.toFixed(4)}
            </span>
          </div>
        )}
        {aiCost.claude > 0 && (
          <div className="flex justify-between">
            <span className="text-green-700 dark:text-green-300">
              Claude Vision:
            </span>
            <span className="font-medium text-green-900 dark:text-green-100">
              ${aiCost.claude.toFixed(4)}
            </span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-green-200 dark:border-green-700">
          <span className="text-green-700 dark:text-green-300">AI Calls:</span>
          <span className="font-medium text-green-900 dark:text-green-100">
            {aiCost.calls}
          </span>
        </div>
      </div>
    </div>
  );
};

interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: unknown;
  created_at: string;
  workspace_id?: string;
}

interface DocumentImage {
  id: string;
  document_id: string;
  chunk_id?: string;
  image_url: string;
  image_type?: string;
  caption?: string;
  alt_text?: string;
  bbox?: unknown;
  page_number?: number;
  proximity_score?: number;
  confidence?: number;
  metadata?: unknown;
  created_at: string;
  ocr_extracted_text?: string;
  ocr_confidence_score?: number;
  image_analysis_results?: unknown;
  visual_features?: unknown;
  processing_status?: string;
  multimodal_metadata?: unknown;
  contextual_name?: string;
  nearest_heading?: string;
  heading_level?: number;
  heading_distance?: number;
  related_chunks_count?: number;
  extracted_metadata?: unknown;
  material_properties?: unknown;
  quality_score?: number;
}

interface Embedding {
  id: string;
  chunk_id: string;
  workspace_id?: string;
  embedding: number[];
  model_name?: string;
  dimensions?: number;
  created_at: string;
  embedding_type?: string; // 'text', 'image', 'hybrid'
  generation_timestamp?: string;
  metadata?: unknown;
}

interface ImageChunkRelationship {
  id: string;
  image_id: string;
  chunk_id: string;
  similarity_score: number;
  relationship_type: 'primary' | 'related' | 'context';
  created_at: string;
}

interface KnowledgeBaseStats {
  totalChunks: number;
  totalImages: number;
  totalEmbeddings: number;
  totalDocuments: number;
  avgChunkSize: number;
  avgConfidence: number;
}

export const MaterialKnowledgeBase: React.FC = () => {
  const navigate = useNavigate();
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [embeddings, setEmbeddings] = useState<Embedding[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [imageChunkRelationships, setImageChunkRelationships] = useState<
    ImageChunkRelationship[]
  >([]);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Pagination state for chunks
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const [activeTab, setActiveTab] = useState('overview');
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // seconds
  const { toast } = useToast();

  // Product management modal states
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFormMode, setProductFormMode] = useState<'create' | 'edit'>(
    'create',
  );
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<any | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [productToPreview, setProductToPreview] = useState<any | null>(null);

  // Chunk detail modal state
  const [chunkDetailOpen, setChunkDetailOpen] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(
    null,
  );

  // Use the new API hooks
  const {
    data: metadataData,
    loading: metadataLoading,
    refetch: refetchMetadata,
  } = useKnowledgeBaseMetadata(workspaceId);
  const {
    data: qualityData,
    loading: qualityLoading,
    refetch: refetchQuality,
  } = useQualityScores(workspaceId);
  const {
    data: embeddingsStatsData,
    loading: embeddingsStatsLoading,
    refetch: refetchEmbeddings,
  } = useEmbeddingsStats(workspaceId);
  const {
    data: detectionsData,
    loading: detectionsLoading,
    refetch: refetchDetections,
  } = useDetections(workspaceId);
  const {
    data: dashboardData,
    loading: dashboardLoading,
    refetch: refetchDashboard,
  } = useQualityDashboard(workspaceId, 30);
  const {
    data: patternsData,
    loading: patternsLoading,
    refetch: refetchPatterns,
  } = usePatterns(workspaceId);

  useEffect(() => {
    // Load page immediately, then fetch data in background
    setLoading(false);
    // Start loading data asynchronously without blocking UI
    loadKnowledgeBaseData();
  }, []);

  // Auto-refresh effect for new admin tabs
  useEffect(() => {
    if (!autoRefreshEnabled || !workspaceId) return;

    const intervalId = setInterval(() => {
      console.log('🔄 Auto-refreshing admin data...');
      refetchMetadata?.();
      refetchQuality?.();
      refetchEmbeddings?.();
      refetchDetections?.();
      refetchDashboard?.();
      refetchPatterns?.();
      setLastRefreshTime(new Date());

      toast({
        title: 'Data Refreshed',
        description: 'Admin data has been updated',
        duration: 2000,
      });
    }, refreshInterval * 1000);

    return () => clearInterval(intervalId);
  }, [autoRefreshEnabled, workspaceId, refreshInterval]);

  // Debounced search effect for performance
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const loadKnowledgeBaseData = async () => {
    try {
      // Don't set loading=true to keep UI responsive
      console.log('🚀 Starting background data load...');

      // Get current user and their workspace
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ User not authenticated');
        return;
      }

      // Get user's workspace (now allowed by RLS policy)
      const { data: workspaceDataArray, error: workspaceError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1);

      if (
        workspaceError ||
        !workspaceDataArray ||
        workspaceDataArray.length === 0
      ) {
        console.error('❌ Error getting workspace:', workspaceError);
        console.error('❌ User has no active workspace membership');
        return;
      }

      const workspaceId = workspaceDataArray[0].workspace_id;
      console.log(`✅ Using workspace: ${workspaceId}`);
      setWorkspaceId(workspaceId);

      // Load ALL chunks with document information (no limit)
      console.log('📊 Loading chunks from database...');
      let allChunks: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      let totalCount = 0;

      // Fetch chunks with pagination to handle large datasets
      while (hasMore) {
        const {
          data: chunksData,
          error: chunksError,
          count: chunksCount,
        } = await supabase
          .from('document_chunks')
          .select(
            `
            *,
            documents(
              id,
              filename,
              metadata,
              processing_status,
              created_at
            )
          `,
            { count: 'exact' },
          )
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (chunksError) {
          console.error('❌ Error loading chunks:', chunksError);
          throw chunksError;
        }

        if (!chunksData || chunksData.length === 0) {
          hasMore = false;
        } else {
          allChunks = allChunks.concat(chunksData);
          totalCount = chunksCount || 0;
          console.log(
            `📖 Fetched page ${page + 1}: ${chunksData.length} chunks (total so far: ${allChunks.length}/${totalCount})`,
          );
          page++;
          hasMore = chunksData.length === pageSize;
        }
      }

      console.log(
        `✅ Loaded ${allChunks.length} chunks (total count: ${totalCount})`,
      );
      setChunks(allChunks || []);

      // Load ALL images with pagination
      console.log('🖼️ Loading images from database...');
      let allImages: any[] = [];
      let imagePage = 0;
      let imagesTotalCount = 0;
      let imagesHasMore = true;

      while (imagesHasMore) {
        try {
          const {
            data: imagesData,
            error: imagesError,
            count: imagesCount,
          } = await supabase
            .from('document_images')
            .select('*', { count: 'exact' })
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .range(imagePage * pageSize, (imagePage + 1) * pageSize - 1);

          if (imagesError) {
            console.error('❌ Error loading images:', imagesError);
            console.error('❌ Error details:', {
              code: imagesError.code,
              message: imagesError.message,
            });
            // Don't throw - continue with empty images
            imagesHasMore = false;
          } else if (!imagesData || imagesData.length === 0) {
            imagesHasMore = false;
          } else {
            allImages = allImages.concat(imagesData);
            imagesTotalCount = imagesCount || 0;
            console.log(
              `📷 Fetched image page ${imagePage + 1}: ${imagesData.length} images (total so far: ${allImages.length}/${imagesTotalCount})`,
            );
            imagePage++;
            imagesHasMore = imagesData.length === pageSize;
          }
        } catch (err) {
          console.error('❌ Exception loading images:', err);
          imagesHasMore = false;
        }
      }

      console.log(
        `✅ Loaded ${allImages.length} images (total count: ${imagesTotalCount})`,
      );
      setImages(allImages || []);

      // Load embeddings - query both embeddings and document_vectors tables
      // First try document_vectors (primary), then fall back to embeddings table
      console.log('🔢 Loading embeddings from database...');
      let embeddingsData: unknown[] = [];

      const {
        data: vectorsData,
        error: vectorsError,
        count: vectorsCount,
      } = await supabase
        .from('document_vectors')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!vectorsError && vectorsData && vectorsData.length > 0) {
        console.log(
          `✅ Loaded ${vectorsData.length} embeddings from document_vectors (total count: ${vectorsCount})`,
        );
        embeddingsData = vectorsData;
      } else {
        if (vectorsError) {
          console.warn('⚠️ document_vectors query failed:', vectorsError);
        } else {
          console.log('⚠️ No embeddings found in document_vectors table');
        }

        // Fall back to embeddings table
        const {
          data: embeddingsTableData,
          error: embeddingsError,
          count: embeddingsCount,
        } = await supabase
          .from('embeddings')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (embeddingsError) {
          console.warn('⚠️ embeddings table query failed:', embeddingsError);
        } else {
          console.log(
            `✅ Loaded ${embeddingsTableData?.length || 0} embeddings from embeddings table (total count: ${embeddingsCount})`,
          );
          embeddingsData = embeddingsTableData || [];
        }
      }

      setEmbeddings((embeddingsData || []) as Embedding[]);

      // Load products created from PDF chunks
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('created_from_type', 'pdf_processing')
        .order('created_at', { ascending: false });

      if (productsError) {
        console.error('❌ Error loading products:', productsError);
        // Don't throw - just log and continue with empty products
        setProducts([]);
      } else {
        console.log(
          `✅ Loaded ${productsData?.length || 0} products from database`,
        );
        setProducts(productsData || []);
      }

      // Load image chunk relationships
      console.log('🔗 Loading image chunk relationships...');
      const { data: relationshipsData, error: relationshipsError } =
        await supabase
          .from('image_chunk_relationships')
          .select('*')
          .order('similarity_score', { ascending: false });

      if (relationshipsError) {
        console.warn(
          '⚠️ Error loading image chunk relationships:',
          relationshipsError,
        );
        setImageChunkRelationships([]);
      } else {
        console.log(
          `✅ Loaded ${relationshipsData?.length || 0} image chunk relationships`,
        );
        setImageChunkRelationships(relationshipsData || []);
      }

      // Calculate stats
      console.log('📈 Calculating statistics...');
      const uniqueDocuments = new Set(
        allChunks?.map((c: unknown) => (c as any).document_id) || [],
      ).size;
      const avgChunkSize = allChunks?.length
        ? allChunks.reduce(
            (sum: number, chunk: any) => sum + chunk.content.length,
            0,
          ) / allChunks.length
        : 0;
      const avgConfidence = allImages?.length
        ? allImages.reduce(
            (sum: number, img: any) => sum + (img.confidence || 0),
            0,
          ) / allImages.length
        : 0;

      const calculatedStats = {
        totalChunks: allChunks?.length || 0,
        totalImages: allImages?.length || 0,
        totalEmbeddings: embeddingsData?.length || 0,
        totalDocuments: uniqueDocuments,
        avgChunkSize: Math.round(avgChunkSize),
        avgConfidence: Math.round(avgConfidence * 100) / 100,
      };

      console.log('📊 Final stats:', calculatedStats);
      setStats(calculatedStats);
    } catch (error) {
      console.error('❌ Error loading knowledge base data:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : 'No stack trace',
      });
      toast({
        title: 'Error',
        description: 'Failed to load knowledge base data in background',
        variant: 'destructive',
      });
    }
  };

  const deleteImage = async (imageId: string) => {
    try {
      setDeletingImageId(imageId);
      console.log(`🗑️ Deleting image: ${imageId}`);

      // Delete from all related tables first (cascade delete)
      // 1. Delete from chunk_image_relationships
      await supabase
        .from('chunk_image_relationships')
        .delete()
        .eq('image_id', imageId);

      // 2. Delete from image_product_associations
      await supabase
        .from('image_product_associations')
        .delete()
        .eq('image_id', imageId);

      // 3. Delete from product_image_relationships
      await supabase
        .from('product_image_relationships')
        .delete()
        .eq('image_id', imageId);

      // 4. Delete from image_metafield_values
      await supabase
        .from('image_metafield_values')
        .delete()
        .eq('image_id', imageId);

      // 5. Delete from image_validations
      await supabase.from('image_validations').delete().eq('image_id', imageId);

      // 6. Finally delete from document_images
      const { error: deleteError } = await supabase
        .from('document_images')
        .delete()
        .eq('id', imageId);

      if (deleteError) {
        console.error('❌ Error deleting image:', deleteError);
        toast({
          title: 'Error',
          description: 'Failed to delete image',
          variant: 'destructive',
        });
        return;
      }

      // Remove from local state
      setImages(images.filter((img) => img.id !== imageId));
      console.log(`✅ Image deleted successfully: ${imageId}`);
      toast({
        title: 'Success',
        description: 'Image deleted successfully',
      });
    } catch (error) {
      console.error('❌ Error deleting image:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete image',
        variant: 'destructive',
      });
    } finally {
      setDeletingImageId(null);
    }
  };

  const getChunksByDocument = (documentId: string) => {
    return chunks.filter((chunk) => chunk.document_id === documentId);
  };

  const getImagesByDocument = (documentId: string) => {
    return images.filter((image) => image.document_id === documentId);
  };

  const getImagesByChunk = (chunkId: string) => {
    return images.filter((image) => image.chunk_id === chunkId);
  };

  const getEmbeddingByChunk = (chunkId: string) => {
    return embeddings.find((embedding) => embedding.chunk_id === chunkId);
  };

  // IMPROVED: Find related chunks based on document proximity
  const getRelatedChunks = (chunk: DocumentChunk, limit: number = 3) => {
    return chunks
      .filter(
        (c) =>
          c.document_id === chunk.document_id &&
          c.id !== chunk.id &&
          Math.abs(c.chunk_index - chunk.chunk_index) <= 2,
      )
      .slice(0, limit);
  };

  // Get all related chunks for an image using semantic relationships
  const getRelatedChunksForImage = (imageId: string): DocumentChunk[] => {
    const relationships = imageChunkRelationships.filter(
      (r) => r.image_id === imageId,
    );
    const relatedChunkIds = relationships.map((r) => r.chunk_id);
    return chunks.filter((c) => relatedChunkIds.includes(c.id));
  };

  // Pagination helpers
  const getPaginatedChunks = () => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredChunks.slice(startIndex, endIndex);
  };

  const getTotalPages = () => {
    return Math.ceil(filteredChunks.length / itemsPerPage);
  };

  // Generate smart pagination numbers with ellipsis
  const getPaginationNumbers = () => {
    const totalPages = getTotalPages();
    const delta = 2; // Number of pages to show on each side of current page
    const range: (number | string)[] = [];

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 || // Always show first page
        i === totalPages || // Always show last page
        (i >= currentPage - delta && i <= currentPage + delta) // Show pages around current
      ) {
        range.push(i);
      } else if (range[range.length - 1] !== '...') {
        range.push('...');
      }
    }

    return range;
  };

  // Product Management Handlers
  const handleCreateProduct = () => {
    setProductFormMode('create');
    setSelectedProduct(null);
    setProductFormOpen(true);
  };

  const handleEditProduct = (product: any) => {
    setProductFormMode('edit');
    setSelectedProduct(product);
    setProductFormOpen(true);
  };

  const handleDeleteProduct = (product: any) => {
    setProductToDelete(product);
    setDeleteConfirmOpen(true);
  };

  const handlePreviewProduct = (product: any) => {
    setProductToPreview(product);
    setPreviewModalOpen(true);
  };

  const handleSaveProduct = async (productData: Partial<any>) => {
    if (!workspaceId) {
      toast({
        title: 'Error',
        description: 'Workspace not found',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (productFormMode === 'create') {
        // Create new product
        const { data, error } = await supabase
          .from('products')
          .insert({
            ...productData,
            workspace_id: workspaceId,
            created_from_type: 'manual',
          })
          .select()
          .single();

        if (error) throw error;

        setProducts([data, ...products]);
        toast({
          title: 'Success',
          description: 'Product created successfully',
        });
      } else {
        // Update existing product
        const { data, error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', selectedProduct.id)
          .select()
          .single();

        if (error) throw error;

        setProducts(products.map((p) => (p.id === data.id ? data : p)));
        toast({
          title: 'Success',
          description: 'Product updated successfully',
        });
      }
    } catch (error) {
      console.error('Error saving product:', error);
      throw error;
    }
  };

  const handleConfirmDelete = async (productId: string) => {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      setProducts(products.filter((p) => p.id !== productId));
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  };

  // Chunk detail handler
  const handleViewChunkDetail = (chunk: DocumentChunk) => {
    setSelectedChunk(chunk);
    setChunkDetailOpen(true);
  };

  // Cross-tab navigation helpers for Phase 4 (memoized with useCallback)
  const navigateToTab = useCallback((tab: string) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateToChunkDetails = useCallback((chunkId: string) => {
    setActiveTab('chunks');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const element = document.getElementById(`chunk-${chunkId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  const navigateToImageDetails = useCallback((imageId: string) => {
    setActiveTab('images');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const element = document.getElementById(`image-${imageId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  const navigateToProductDetails = useCallback((productId: string) => {
    setActiveTab('products');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      const element = document.getElementById(`product-${productId}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, []);

  // Manual refresh all admin data (memoized with useCallback)
  const refreshAllAdminData = useCallback(() => {
    console.log('🔄 Manually refreshing all admin data...');
    refetchMetadata?.();
    refetchQuality?.();
    refetchEmbeddings?.();
    refetchDetections?.();
    refetchDashboard?.();
    refetchPatterns?.();
    setLastRefreshTime(new Date());

    toast({
      title: 'Refreshing Data',
      description: 'Fetching latest admin data...',
      duration: 2000,
    });
  }, [
    refetchMetadata,
    refetchQuality,
    refetchEmbeddings,
    refetchDetections,
    refetchDashboard,
    refetchPatterns,
    toast,
  ]);

  const formatJsonForDisplay = (data: unknown): string => {
    if (!data) return 'N/A';
    try {
      if (typeof data === 'string') {
        return data;
      }
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  // Memoized filtered data for performance (using debounced search)
  const filteredChunks = useMemo(() => {
    if (!debouncedSearchQuery) return chunks;
    const query = debouncedSearchQuery.toLowerCase();
    return chunks.filter(
      (chunk) =>
        chunk.content?.toLowerCase().includes(query) ||
        chunk.chunk_index?.toString().includes(query) ||
        getDocumentDisplayName(chunk).toLowerCase().includes(query),
    );
  }, [chunks, debouncedSearchQuery]);

  const filteredImages = useMemo(() => {
    if (!debouncedSearchQuery) return images;
    const query = debouncedSearchQuery.toLowerCase();
    return images.filter(
      (image) =>
        image.caption?.toLowerCase().includes(query) ||
        image.contextual_name?.toLowerCase().includes(query) ||
        image.nearest_heading?.toLowerCase().includes(query),
    );
  }, [images, debouncedSearchQuery]);

  const filteredProducts = useMemo(() => {
    if (!debouncedSearchQuery) return products;
    const query = debouncedSearchQuery.toLowerCase();
    return products.filter(
      (product) =>
        product.name?.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query),
    );
  }, [products, debouncedSearchQuery]);

  // Memoized pagination for chunks
  const paginatedChunks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredChunks.slice(startIndex, endIndex);
  }, [filteredChunks, currentPage, itemsPerPage]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredChunks.length / itemsPerPage);
  }, [filteredChunks.length, itemsPerPage]);

  const getImageDisplayName = (image: DocumentImage): string => {
    // Priority: contextual_name > caption > nearest_heading > "Untitled Image"
    if (image.contextual_name) return image.contextual_name;
    if (image.caption) return image.caption;
    if (image.nearest_heading) return `Near: ${image.nearest_heading}`;
    return 'Untitled Image';
  };

  const getDocumentDisplayName = (chunk: DocumentChunk) => {
    if (!chunk) return 'Unknown Document';

    // First, check chunk metadata for document_name (newly added field)
    if ((chunk.metadata as any)?.document_name) {
      return (chunk.metadata as any).document_name;
    }

    // Try to get document info from the joined data
    const doc = (chunk as any).documents;
    if (doc) {
      // Check for title first
      if (doc.title) return doc.title;

      // Check for catalog name in metadata
      if (doc.metadata?.title) return doc.metadata.title;
      if (doc.metadata?.catalog_name) return doc.metadata.catalog_name;
      if (doc.metadata?.document_name) return doc.metadata.document_name;

      // Clean up filename if it's a UUID-based name
      if (doc.filename && !doc.filename.match(/^[0-9a-f-]{36}\.pdf$/i)) {
        return doc.filename.replace(/\.[^/.]+$/, ''); // Remove extension
      }

      // For UUID-based filenames, try to get a better name
      if (doc.metadata?.source === 'mivaa_processing') {
        return `PDF Document (${doc.filename.substring(0, 8)}...)`;
      }
    }

    // Fallback to chunk metadata
    if ((chunk.metadata as any)?.filename) {
      // Remove extension from filename
      return (chunk.metadata as any).filename.replace(/\.[^/.]+$/, '');
    }
    if ((chunk.metadata as any)?.title) return (chunk.metadata as any).title;
    if ((chunk.metadata as any)?.source)
      return `${(chunk.metadata as any).source} Document`;

    return 'Unknown Document';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading knowledge base...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Material Knowledge Base</h1>
            <p className="text-muted-foreground">
              Comprehensive view of processed documents, chunks, images, and
              embeddings
              {lastRefreshTime && (
                <span className="text-xs ml-2">
                  • Last updated: {lastRefreshTime.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
            variant={autoRefreshEnabled ? 'default' : 'outline'}
            size="sm"
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${autoRefreshEnabled ? 'animate-spin' : ''}`}
            />
            Auto-Refresh {autoRefreshEnabled ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={refreshAllAdminData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
          <Button onClick={loadKnowledgeBaseData} variant="outline" size="sm">
            <Database className="h-4 w-4 mr-2" />
            Reload Data
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalDocuments}</p>
                  <p className="text-xs text-muted-foreground">Documents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Layers className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalChunks}</p>
                  <p className="text-xs text-muted-foreground">Chunks</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <ImageIcon className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalImages}</p>
                  <p className="text-xs text-muted-foreground">Images</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-orange-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalEmbeddings}</p>
                  <p className="text-xs text-muted-foreground">Embeddings</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Hash className="h-4 w-4 text-cyan-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.avgChunkSize}</p>
                  <p className="text-xs text-muted-foreground">
                    Avg Chunk Size
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.avgConfidence}</p>
                  <p className="text-xs text-muted-foreground">
                    Avg Confidence
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center space-x-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chunks, images, metadata..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline">
          <Filter className="h-4 w-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-12">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chunks">
            Chunks ({stats?.totalChunks || 0})
          </TabsTrigger>
          <TabsTrigger value="images">
            Images ({stats?.totalImages || 0})
          </TabsTrigger>
          <TabsTrigger value="embeddings">
            Embeddings ({stats?.totalEmbeddings || 0})
          </TabsTrigger>
          <TabsTrigger value="products">
            📦 Products ({products.length})
          </TabsTrigger>
          <TabsTrigger value="metadata">📊 Metadata</TabsTrigger>
          <TabsTrigger value="relationships">🔗 Relationships</TabsTrigger>
          <TabsTrigger value="quality">⭐ Quality</TabsTrigger>
          <TabsTrigger value="embeddings-stats">🧠 Embeddings</TabsTrigger>
          <TabsTrigger value="detections">🔍 Detections</TabsTrigger>
          <TabsTrigger value="dashboard">📈 Dashboard</TabsTrigger>
          <TabsTrigger value="insights">💡 Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Documents Overview - IMPROVED: Show complete details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documents by Source
                </CardTitle>
                <CardDescription>
                  Complete PDF details with processing status and metadata
                </CardDescription>
              </CardHeader>
              <CardContent>
                {chunks.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No documents processed yet. Upload PDFs to see content here.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(new Set(chunks.map((c) => c.document_id))).map(
                      (docId) => {
                        const docChunks = getChunksByDocument(docId);
                        const docImages = getImagesByDocument(docId);
                        const firstChunk = docChunks[0];
                        const doc = (firstChunk as any).documents;

                        return (
                          <div
                            key={docId}
                            className="border rounded-lg p-4 hover:bg-muted/50 transition-colors cursor-pointer group"
                            onClick={() =>
                              navigate(`/admin/documents/${docId}`)
                            }
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <p className="font-semibold flex items-center gap-2 group-hover:text-primary">
                                  {getDocumentDisplayName(firstChunk)}
                                  <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  📄 {doc?.filename || 'Unknown filename'}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  doc?.processing_status === 'completed'
                                    ? 'default'
                                    : 'secondary'
                                }
                              >
                                {doc?.processing_status || 'unknown'}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                              <div>
                                <span className="text-muted-foreground">
                                  Chunks:
                                </span>
                                <span className="ml-1 font-medium">
                                  {docChunks.length}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Images:
                                </span>
                                <span className="ml-1 font-medium">
                                  {docImages.length}
                                </span>
                              </div>
                            </div>

                            <div className="flex gap-2 text-xs text-muted-foreground mb-3">
                              <Badge variant="outline">
                                {docChunks.length} chunks
                              </Badge>
                              <Badge variant="outline">
                                {docImages.length} images
                              </Badge>
                              <Badge variant="outline">
                                {new Date(doc?.created_at).toLocaleDateString()}
                              </Badge>
                            </div>

                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/admin/documents/${docId}`);
                              }}
                            >
                              View Details
                              <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Processing Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Processing Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Text Chunks</span>
                    <Badge variant="secondary">
                      {stats?.totalChunks || 0} processed
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Images Extracted</span>
                    <Badge variant="secondary">
                      {stats?.totalImages || 0} extracted
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Embeddings Generated</span>
                    <Badge variant="secondary">
                      {stats?.totalEmbeddings || 0} generated
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="chunks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Chunks</CardTitle>
              <CardDescription>
                Text chunks extracted from processed documents with their
                metadata and relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredChunks.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? 'No chunks match your search.'
                      : 'No chunks available. Process some PDFs to see content here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Pagination Info */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                      {Math.min(
                        currentPage * itemsPerPage,
                        filteredChunks.length,
                      )}{' '}
                      of {filteredChunks.length} chunks
                    </span>
                  </div>

                  {/* Chunks List */}
                  {getPaginatedChunks().map((chunk) => {
                    const relatedImages = getImagesByChunk(chunk.id);
                    const embedding = getEmbeddingByChunk(chunk.id);

                    return (
                      <div
                        key={chunk.id}
                        className="border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => handleViewChunkDetail(chunk)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="outline">
                                Chunk {chunk.chunk_index}
                              </Badge>
                              <Badge variant="secondary">
                                {getDocumentDisplayName(chunk)}
                              </Badge>
                              {relatedImages.length > 0 && (
                                <Badge
                                  variant="outline"
                                  className="text-purple-600"
                                >
                                  <ImageIcon className="h-3 w-3 mr-1" />
                                  {relatedImages.length} images
                                </Badge>
                              )}
                              {embedding && (
                                <Badge
                                  variant="outline"
                                  className="text-orange-600"
                                >
                                  <Brain className="h-3 w-3 mr-1" />
                                  Embedded
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {chunk.content.substring(0, 200)}...
                            </p>
                            {/* IMPROVED: Add context information */}
                            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
                              <div>
                                <span className="font-medium">Position:</span>{' '}
                                {chunk.chunk_index + 1}
                              </div>
                              <div>
                                <span className="font-medium">Size:</span>{' '}
                                {chunk.content.length} chars
                              </div>
                              <div>
                                <span className="font-medium">Quality:</span>{' '}
                                {(chunk.metadata as any)?.quality_score
                                  ? `${Math.round((chunk.metadata as any).quality_score * 100)}%`
                                  : 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span>{' '}
                                {new Date(
                                  chunk.created_at,
                                ).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <Eye className="h-4 w-4" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Pagination Controls */}
                  {getTotalPages() > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && setCurrentPage(1)
                        }
                        disabled={currentPage === 1}
                        className="px-3"
                      >
                        &lt;&lt;
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          setCurrentPage(Math.max(1, currentPage - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-3"
                      >
                        &lt;
                      </Button>

                      {/* Smart pagination with ellipsis */}
                      <div className="flex gap-1">
                        {getPaginationNumbers().map((page, index) =>
                          page === '...' ? (
                            <span
                              key={`ellipsis-${index}`}
                              className="px-2 py-1 text-muted-foreground"
                            >
                              ...
                            </span>
                          ) : (
                            <Button
                              key={page}
                              variant={
                                currentPage === page ? 'default' : 'outline'
                              }
                              size="sm"
                              onClick={() => setCurrentPage(page as number)}
                              onKeyDown={(e) =>
                                e.key === 'Enter' &&
                                setCurrentPage(page as number)
                              }
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          ),
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage(
                            Math.min(getTotalPages(), currentPage + 1),
                          )
                        }
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          setCurrentPage(
                            Math.min(getTotalPages(), currentPage + 1),
                          )
                        }
                        disabled={currentPage === getTotalPages()}
                        className="px-3"
                      >
                        &gt;
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(getTotalPages())}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && setCurrentPage(getTotalPages())
                        }
                        disabled={currentPage === getTotalPages()}
                        className="px-3"
                      >
                        &gt;&gt;
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Images</CardTitle>
              <CardDescription>
                Images extracted from documents with their metadata, analysis
                results, and relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredImages.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery
                      ? 'No images match your search.'
                      : 'No images available. Process PDFs with images to see content here.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredImages.map((image) => (
                    <Card key={image.id} className="overflow-hidden">
                      <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                        {image.image_url ? (
                          <img
                            src={image.image_url}
                            alt={image.caption || 'Document image'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              console.warn(
                                `Failed to load image: ${image.image_url}`,
                              );
                              (e.target as HTMLImageElement).style.display =
                                'none';
                            }}
                          />
                        ) : (
                          <ImageIcon className="h-12 w-12 text-muted-foreground" />
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">
                              {image.image_type || 'Unknown'}
                            </Badge>
                            <Badge variant="secondary">
                              {Math.round((image.confidence || 0) * 100)}%
                              confidence
                            </Badge>
                          </div>

                          <h4 className="font-medium">
                            {getImageDisplayName(image)}
                          </h4>

                          {image.alt_text && (
                            <p className="text-sm text-muted-foreground">
                              {image.alt_text}
                            </p>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="font-medium">Page:</span>{' '}
                              {image.page_number || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Status:</span>{' '}
                              {image.processing_status || 'N/A'}
                            </div>
                          </div>

                          {image.nearest_heading && (
                            <div className="text-xs">
                              <span className="font-medium">Near:</span>{' '}
                              {image.nearest_heading}
                            </div>
                          )}

                          {image.ocr_extracted_text && (
                            <div className="text-xs">
                              <span className="font-medium">OCR Text:</span>
                              <p className="bg-muted/50 rounded p-2 mt-1 line-clamp-3">
                                {image.ocr_extracted_text}
                              </p>
                            </div>
                          )}

                          <div className="flex gap-2 pt-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1"
                                >
                                  <Eye className="h-4 w-4 mr-2" />
                                  Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                                <DialogHeader>
                                  <DialogTitle>Image Details</DialogTitle>
                                </DialogHeader>
                                <div className="flex-1 overflow-y-auto pr-4 space-y-4">
                                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center overflow-hidden">
                                    {image.image_url ? (
                                      <img
                                        src={image.image_url}
                                        alt={image.caption || 'Document image'}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          console.warn(
                                            `Failed to load image in modal: ${image.image_url}`,
                                          );
                                          (
                                            e.target as HTMLImageElement
                                          ).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                                      <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">
                                        Basic Information
                                      </h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">
                                            Type:
                                          </span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">
                                            {image.image_type || 'Unknown'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">
                                            Page:
                                          </span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">
                                            {image.page_number || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">
                                            Confidence:
                                          </span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">
                                            {Math.round(
                                              (image.confidence || 0) * 100,
                                            )}
                                            %
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">
                                            Status:
                                          </span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">
                                            {image.processing_status || 'N/A'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                                      <h4 className="font-semibold mb-3 text-purple-900 dark:text-purple-100">
                                        Context Information
                                      </h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">
                                            Contextual Name:
                                          </span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">
                                            {image.contextual_name || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">
                                            Nearest Heading:
                                          </span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">
                                            {image.nearest_heading || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">
                                            Heading Level:
                                          </span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">
                                            {image.heading_level || 'N/A'}
                                          </span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">
                                            Distance:
                                          </span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">
                                            {image.heading_distance || 'N/A'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {image.ocr_extracted_text && (
                                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                      <h4 className="font-semibold mb-2 text-green-900 dark:text-green-100">
                                        OCR Extracted Text
                                      </h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                        {image.ocr_extracted_text}
                                      </div>
                                    </div>
                                  )}

                                  {/* IMPROVED: Show ALL related chunks */}
                                  {(() => {
                                    const relatedChunks =
                                      getRelatedChunksForImage(image.id);
                                    return relatedChunks.length > 0 ? (
                                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                        <h4 className="font-semibold mb-3 text-amber-900 dark:text-amber-100">
                                          Related Chunks ({relatedChunks.length}
                                          )
                                        </h4>
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {relatedChunks.map((chunk) => {
                                            const relationship =
                                              imageChunkRelationships.find(
                                                (r) =>
                                                  r.image_id === image.id &&
                                                  r.chunk_id === chunk.id,
                                              );
                                            return (
                                              <div
                                                key={chunk.id}
                                                className="bg-white dark:bg-gray-900 rounded p-3 border border-amber-100 dark:border-amber-800"
                                              >
                                                <div className="flex items-center justify-between mb-2">
                                                  <Badge
                                                    variant="outline"
                                                    className="text-xs"
                                                  >
                                                    Chunk {chunk.chunk_index}
                                                  </Badge>
                                                  {relationship && (
                                                    <Badge
                                                      variant="secondary"
                                                      className="text-xs"
                                                    >
                                                      {Math.round(
                                                        relationship.similarity_score *
                                                          100,
                                                      )}
                                                      % match
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                                                  {chunk.content.substring(
                                                    0,
                                                    200,
                                                  )}
                                                  ...
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : image.chunk_id ? (
                                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                        <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-100">
                                          Related Chunk
                                        </h4>
                                        <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                          {chunks
                                            .find(
                                              (c) => c.id === image.chunk_id,
                                            )
                                            ?.content.substring(0, 300) ||
                                            'Chunk not found'}
                                          ...
                                        </div>
                                      </div>
                                    ) : null;
                                  })()}

                                  {/* Material Properties */}
                                  {image.material_properties &&
                                    Object.keys(
                                      image.material_properties as any,
                                    ).length > 0 && (
                                      <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 rounded-lg p-4 border border-teal-200 dark:border-teal-800">
                                        <h4 className="font-semibold mb-3 text-teal-900 dark:text-teal-100">
                                          Material Properties
                                        </h4>
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                          {Object.entries(
                                            image.material_properties as any,
                                          ).map(([key, value]) => (
                                            <div
                                              key={key}
                                              className="bg-white dark:bg-gray-900 rounded p-2 border border-teal-100 dark:border-teal-800"
                                            >
                                              <span className="font-medium text-teal-700 dark:text-teal-300">
                                                {key}:
                                              </span>
                                              <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                                {typeof value === 'object'
                                                  ? JSON.stringify(value)
                                                  : String(value)}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                  {/* Extracted Metadata */}
                                  {image.extracted_metadata &&
                                    Object.keys(image.extracted_metadata as any)
                                      .length > 0 && (
                                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                                        <h4 className="font-semibold mb-3 text-orange-900 dark:text-orange-100">
                                          Extracted Metadata
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                          {Object.entries(
                                            image.extracted_metadata as any,
                                          ).map(([key, value]) => (
                                            <div
                                              key={key}
                                              className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-800"
                                            >
                                              <span className="font-medium text-orange-700 dark:text-orange-300">
                                                {key}:
                                              </span>
                                              <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                                {Array.isArray(value)
                                                  ? value.join(', ')
                                                  : typeof value === 'object'
                                                    ? JSON.stringify(value)
                                                    : String(value)}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                  {image.visual_features && (
                                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                                      <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-100">
                                        Visual Features
                                      </h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-indigo-100 dark:border-indigo-800">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                          {formatJsonForDisplay(
                                            image.visual_features,
                                          )}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {image.image_analysis_results && (
                                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
                                      <h4 className="font-semibold mb-2 text-cyan-900 dark:text-cyan-100">
                                        Analysis Results
                                      </h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-cyan-100 dark:border-cyan-800">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                          {formatJsonForDisplay(
                                            image.image_analysis_results,
                                          )}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {/* AI Cost Information */}
                                  <ImageAICostDisplay imageId={image.id} />

                                  {image.metadata && (
                                    <div className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 rounded-lg p-4 border border-rose-200 dark:border-rose-800">
                                      <h4 className="font-semibold mb-2 text-rose-900 dark:text-rose-100">
                                        Metadata
                                      </h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-rose-100 dark:border-rose-800">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                          {formatJsonForDisplay(image.metadata)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteImage(image.id)}
                              disabled={deletingImageId === image.id}
                              className="flex-1"
                            >
                              {deletingImageId === image.id
                                ? '🗑️ Deleting...'
                                : '🗑️ Delete'}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generated Embeddings</CardTitle>
              <CardDescription>
                Vector embeddings generated for text chunks to enable semantic
                search and RAG
              </CardDescription>
            </CardHeader>
            <CardContent>
              {embeddings.length === 0 ? (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No embeddings available. Process documents to generate
                    embeddings.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {embeddings.map((embedding) => {
                    const relatedChunk = chunks.find(
                      (c) => c.id === embedding.chunk_id,
                    );

                    return (
                      <Card key={embedding.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-orange-500" />
                              <span className="font-medium">
                                Embedding {embedding.id.substring(0, 8)}
                              </span>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline">
                                {embedding.model_name || 'Unknown Model'}
                              </Badge>
                              <Badge variant="secondary">
                                {embedding.dimensions || 0}D
                              </Badge>
                            </div>
                          </div>

                          {relatedChunk && (
                            <div className="mb-3">
                              <h4 className="font-medium mb-1">
                                Related Chunk
                              </h4>
                              <p className="text-sm text-muted-foreground bg-muted/50 rounded p-2 line-clamp-2">
                                {relatedChunk.content.substring(0, 200)}...
                              </p>
                              <div className="flex gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {getDocumentDisplayName(relatedChunk)}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  Chunk {relatedChunk.chunk_index}
                                </Badge>
                              </div>
                            </div>
                          )}

                          {/* IMPROVED: Show embedding type and complete metadata */}
                          <div className="grid grid-cols-4 gap-3 text-sm mb-3">
                            <div>
                              <span className="font-medium">Model:</span>
                              <p className="text-muted-foreground text-xs">
                                {embedding.model_name ||
                                  'text-embedding-3-small'}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Dimensions:</span>
                              <p className="text-muted-foreground text-xs">
                                {embedding.dimensions || 1536}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Type:</span>
                              <p className="text-muted-foreground text-xs">
                                {embedding.embedding_type || 'text'}
                              </p>
                            </div>
                            <div>
                              <span className="font-medium">Generated:</span>
                              <p className="text-muted-foreground text-xs">
                                {new Date(
                                  embedding.created_at,
                                ).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">
                                Vector Status
                              </span>
                              <Badge
                                variant="outline"
                                className="text-green-600"
                              >
                                ✓ Generated ({embedding.dimensions || 1536}D)
                              </Badge>
                            </div>
                            <div className="mt-2 bg-muted/50 rounded p-2 text-xs">
                              <p className="text-muted-foreground">
                                Vector embedding successfully generated and
                                stored. This chunk is ready for semantic search
                                and RAG operations.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* NEW: Products Tab */}
        <TabsContent value="products" className="space-y-4">
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
        </TabsContent>

        {/* NEW: Metadata Tab */}
        <TabsContent value="metadata" className="space-y-4">
          {metadataLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading metadata...</p>
                </div>
              </CardContent>
            </Card>
          ) : metadataData ? (
            <>
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
                    {metadataData.summary.metadata_fields.map((field) => (
                      <Badge key={field} variant="secondary">
                        {field}
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
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No metadata available</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* NEW: Relationships Tab */}
        <TabsContent value="relationships" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                Entity Relationships
              </CardTitle>
              <CardDescription>
                View relevance-scored relationships between chunks, products, and images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-3">
                    <Link className="h-5 w-5 text-blue-600" />
                    <div>
                      <h4 className="font-medium text-blue-900">Relevancy Management</h4>
                      <p className="text-sm text-blue-700">
                        View and manage all entity relationships with detailed scoring algorithms
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => navigate('/admin/relevancy')}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    Open Relevancy Manager
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <FileText className="h-4 w-4 text-blue-600" />
                        Chunk → Product
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-blue-600">
                        {stats?.totalChunks || 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Text chunks linked to products
                      </p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Page Proximity</span>
                          <span className="font-medium">40%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Embedding Similarity</span>
                          <span className="font-medium">30%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mention Score</span>
                          <span className="font-medium">30%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-purple-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-purple-600" />
                        Product → Image
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-purple-600">
                        {stats?.totalImages || 0}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Images linked to products
                      </p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Page Overlap</span>
                          <span className="font-medium">40%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Visual Similarity</span>
                          <span className="font-medium">40%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Detection Score</span>
                          <span className="font-medium">20%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-green-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Link className="h-4 w-4 text-green-600" />
                        Chunk → Image
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {(stats?.totalChunks || 0) + (stats?.totalImages || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Chunks linked to images
                      </p>
                      <div className="mt-3 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Same Page</span>
                          <span className="font-medium">50%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Visual-Text Similarity</span>
                          <span className="font-medium">30%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Spatial Proximity</span>
                          <span className="font-medium">20%</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-gray-50">
                  <CardHeader>
                    <CardTitle className="text-sm">About Relevancy Scoring</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                      <strong>Relevancy scores</strong> (0.0-1.0) indicate how closely two entities are related.
                      Higher scores mean stronger relationships.
                    </p>
                    <p>
                      Each relationship type uses a different scoring algorithm with weighted components
                      to ensure accurate entity linking across the knowledge base.
                    </p>
                    <p className="text-xs mt-3">
                      <strong>Relationship Types:</strong> source, related, component, alternative (Chunk→Product) |
                      depicts, illustrates, variant, related (Product→Image) |
                      illustrates, depicts, related, example (Chunk→Image)
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* NEW: Quality Scores Tab */}
        <TabsContent value="quality" className="space-y-4">
          {qualityLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    Loading quality scores...
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : qualityData ? (
            <>
              {/* Chunks Quality KPIs */}
              {qualityData.kpis.chunks && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Chunks Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Validated
                        </p>
                        <p className="text-2xl font-bold">
                          {qualityData.kpis.chunks.total_validated}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Overall Score
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.chunks.avg_overall_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Valid</p>
                        <p className="text-2xl font-bold text-green-600">
                          {qualityData.kpis.chunks.valid_count}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Needs Review
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {qualityData.kpis.chunks.needs_review_count}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Content Quality
                        </p>
                        <p className="text-lg font-semibold">
                          {(
                            parseFloat(
                              qualityData.kpis.chunks.avg_content_quality,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Boundary Quality
                        </p>
                        <p className="text-lg font-semibold">
                          {(
                            parseFloat(
                              qualityData.kpis.chunks.avg_boundary_quality,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Semantic Coherence
                        </p>
                        <p className="text-lg font-semibold">
                          {(
                            parseFloat(
                              qualityData.kpis.chunks.avg_semantic_coherence,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Completeness
                        </p>
                        <p className="text-lg font-semibold">
                          {(
                            parseFloat(
                              qualityData.kpis.chunks.avg_completeness,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    </div>
                    {qualityData.distributions.chunks && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">
                          Quality Distribution
                        </p>
                        <div className="flex gap-2">
                          <Badge variant="default" className="bg-green-600">
                            Excellent:{' '}
                            {qualityData.distributions.chunks.excellent}
                          </Badge>
                          <Badge variant="default" className="bg-blue-600">
                            Good: {qualityData.distributions.chunks.good}
                          </Badge>
                          <Badge variant="default" className="bg-yellow-600">
                            Fair: {qualityData.distributions.chunks.fair}
                          </Badge>
                          <Badge variant="default" className="bg-red-600">
                            Poor: {qualityData.distributions.chunks.poor}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Images Quality KPIs */}
              {qualityData.kpis.images && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Images Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Validated
                        </p>
                        <p className="text-2xl font-bold">
                          {qualityData.kpis.images.total_validated}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality Score
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.images.avg_quality_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Relevance
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.images.avg_relevance_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg OCR Confidence
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.images.avg_ocr_confidence,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    </div>
                    {qualityData.distributions.images && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">
                          Quality Distribution
                        </p>
                        <div className="flex gap-2">
                          <Badge variant="default" className="bg-green-600">
                            Excellent:{' '}
                            {qualityData.distributions.images.excellent}
                          </Badge>
                          <Badge variant="default" className="bg-blue-600">
                            Good: {qualityData.distributions.images.good}
                          </Badge>
                          <Badge variant="default" className="bg-yellow-600">
                            Fair: {qualityData.distributions.images.fair}
                          </Badge>
                          <Badge variant="default" className="bg-red-600">
                            Poor: {qualityData.distributions.images.poor}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Products Quality KPIs */}
              {qualityData.kpis.products && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Products Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Scored
                        </p>
                        <p className="text-2xl font-bold">
                          {qualityData.kpis.products.total_scored}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.products.avg_quality_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Confidence
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.products.avg_confidence_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Completeness
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.products.avg_completeness_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    </div>
                    {qualityData.distributions.products && (
                      <div className="mt-4">
                        <p className="text-sm font-medium mb-2">
                          Quality Distribution
                        </p>
                        <div className="flex gap-2">
                          <Badge variant="default" className="bg-green-600">
                            Excellent:{' '}
                            {qualityData.distributions.products.excellent}
                          </Badge>
                          <Badge variant="default" className="bg-blue-600">
                            Good: {qualityData.distributions.products.good}
                          </Badge>
                          <Badge variant="default" className="bg-yellow-600">
                            Fair: {qualityData.distributions.products.fair}
                          </Badge>
                          <Badge variant="default" className="bg-red-600">
                            Poor: {qualityData.distributions.products.poor}
                          </Badge>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Documents Quality */}
              {qualityData.kpis.documents && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Documents Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Documents
                        </p>
                        <p className="text-2xl font-bold">
                          {qualityData.kpis.documents.total_documents}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Coherence
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.documents.avg_coherence_score,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Overall Quality
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            parseFloat(
                              qualityData.kpis.documents.avg_overall_quality,
                            ) * 100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Navigation */}
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold mb-1">
                        Need Deeper Analysis?
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        View AI-driven patterns, anomalies, and recommendations
                      </p>
                    </div>
                    <Button
                      onClick={() => navigateToTab('insights')}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      View Insights
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No quality data available
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* NEW: Embeddings Stats Tab */}
        <TabsContent value="embeddings-stats" className="space-y-4">
          {embeddingsStatsLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    Loading embeddings statistics...
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : embeddingsStatsData ? (
            <>
              {/* Total Embeddings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Total Embeddings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold">
                    {embeddingsStatsData.total_embeddings}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vector embeddings generated
                  </p>
                </CardContent>
              </Card>

              {/* Coverage Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Chunks Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {embeddingsStatsData.coverage.chunks.coverage_percentage}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {embeddingsStatsData.coverage.chunks.with_embeddings} /{' '}
                      {embeddingsStatsData.coverage.chunks.total} chunks
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Images Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {embeddingsStatsData.coverage.images.coverage_percentage}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {embeddingsStatsData.coverage.images.with_embeddings} /{' '}
                      {embeddingsStatsData.coverage.images.total} images
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Products Coverage
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {
                        embeddingsStatsData.coverage.products
                          .coverage_percentage
                      }
                      %
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {embeddingsStatsData.coverage.products.with_embeddings} /{' '}
                      {embeddingsStatsData.coverage.products.total} products
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* By Entity Type */}
              {Object.keys(embeddingsStatsData.by_type).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      Embeddings by Entity Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(embeddingsStatsData.by_type).map(
                        ([type, count]) => (
                          <div
                            key={type}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{type}</Badge>
                            </div>
                            <div className="text-lg font-semibold">
                              {count as number}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* By Model */}
              {Object.keys(embeddingsStatsData.by_model).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Embeddings by Model
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(embeddingsStatsData.by_model).map(
                        ([model, count]) => (
                          <div
                            key={model}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary">{model}</Badge>
                            </div>
                            <div className="text-lg font-semibold">
                              {count as number}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* By Embedding Type */}
              {embeddingsStatsData.by_embedding_type &&
                Object.keys(embeddingsStatsData.by_embedding_type).length >
                  0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Hash className="h-5 w-5" />
                        Embeddings by Type
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(
                          embeddingsStatsData.by_embedding_type,
                        ).map(([type, count]) => (
                          <Badge key={type} variant="default">
                            {type}: {count as number}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Document Vectors */}
              {embeddingsStatsData.document_vectors && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Document Vectors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold mb-4">
                      {embeddingsStatsData.document_vectors.total}
                    </div>
                    {embeddingsStatsData.document_vectors.by_type && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">By Vector Type:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(
                            embeddingsStatsData.document_vectors.by_type,
                          ).map(([type, count]) => (
                            <Badge key={type} variant="outline">
                              {type}: {count as number}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Quality Metrics */}
              {embeddingsStatsData.quality && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Embedding Quality
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Stability Score
                        </p>
                        <p className="text-2xl font-bold">
                          {(
                            embeddingsStatsData.quality.avg_stability_score *
                            100
                          ).toFixed(0)}
                          %
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Anomalies Detected
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {embeddingsStatsData.quality.anomaly_count}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Analyzed
                        </p>
                        <p className="text-2xl font-bold">
                          {embeddingsStatsData.quality.total_analyzed}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No embeddings data available
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* NEW: Detections Tab */}
        <TabsContent value="detections" className="space-y-4">
          {detectionsLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">Loading detections...</p>
                </div>
              </CardContent>
            </Card>
          ) : detectionsData ? (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Total Detections
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {detectionsData.total_detections}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Avg Confidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {(
                        parseFloat(detectionsData.summary.avg_confidence) * 100
                      ).toFixed(0)}
                      %
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      High Confidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-green-600">
                      {detectionsData.summary.high_confidence_count}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ≥80% confidence
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Low Confidence
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600">
                      {detectionsData.summary.low_confidence_count}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      &lt;50% confidence
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* By Type */}
              {Object.keys(detectionsData.summary.by_type).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Layers className="h-5 w-5" />
                      Detections by Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(detectionsData.summary.by_type).map(
                        ([type, count]) => (
                          <Badge
                            key={type}
                            variant="default"
                            className="text-base px-4 py-2"
                          >
                            {type}: {count as number}
                          </Badge>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* By Event */}
              {Object.keys(detectionsData.summary.by_event).length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Hash className="h-5 w-5" />
                      Detections by Event
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(detectionsData.summary.by_event).map(
                        ([event, count]) => (
                          <div
                            key={event}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded"
                          >
                            <span className="font-medium">{event}</span>
                            <Badge variant="secondary">{count as number}</Badge>
                          </div>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timeline */}
              {detectionsData.timeline &&
                Object.keys(detectionsData.timeline).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ChevronRight className="h-5 w-5" />
                        Detection Timeline (Last 30 Days)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-1">
                        {Object.entries(detectionsData.timeline)
                          .sort(([a], [b]) => b.localeCompare(a))
                          .slice(0, 10)
                          .map(([date, count]) => (
                            <div
                              key={date}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {date}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-32 bg-muted rounded-full h-2">
                                  <div
                                    className="bg-primary h-2 rounded-full"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        ((count as number) /
                                          Math.max(
                                            ...Object.values(
                                              detectionsData.timeline!,
                                            ),
                                          )) *
                                          100,
                                      )}%`,
                                    }}
                                  />
                                </div>
                                <span className="font-medium w-8 text-right">
                                  {count as number}
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Recent Detections */}
              {detectionsData.detections.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Recent Detections ({detectionsData.detections.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {detectionsData.detections
                        .slice(0, 50)
                        .map((detection: any) => (
                          <Card key={detection.id} className="border">
                            <CardContent className="p-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">
                                    {detection.detection_type || 'chunk'}
                                  </Badge>
                                  <Badge variant="secondary">
                                    {detection.event}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {detection.confidence !== null && (
                                    <Badge
                                      variant={
                                        detection.confidence >= 0.8
                                          ? 'default'
                                          : detection.confidence >= 0.5
                                            ? 'secondary'
                                            : 'destructive'
                                      }
                                    >
                                      {(detection.confidence * 100).toFixed(0)}%
                                    </Badge>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(
                                      detection.created_at,
                                    ).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              {detection.details && (
                                <div className="mt-2 text-xs text-muted-foreground">
                                  Entity: {detection.entity_id?.substring(0, 8)}
                                  ...
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No detection data available
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* NEW: Quality Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-4">
          {dashboardLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    Loading quality dashboard...
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : dashboardData ? (
            <>
              {/* Period Info */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Reporting Period
                      </p>
                      <p className="font-medium">
                        {dashboardData.period.start_date} to{' '}
                        {dashboardData.period.end_date}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {dashboardData.period.days} days
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Alerts */}
              {dashboardData.alerts.length > 0 && (
                <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
                      <Filter className="h-5 w-5" />
                      Active Alerts ({dashboardData.alerts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {dashboardData.alerts.map((alert: any, idx: number) => (
                        <Card key={idx} className="border-orange-300">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Badge
                                variant={
                                  alert.severity === 'high'
                                    ? 'destructive'
                                    : 'default'
                                }
                                className={
                                  alert.severity === 'medium'
                                    ? 'bg-orange-500'
                                    : ''
                                }
                              >
                                {alert.severity}
                              </Badge>
                              <div className="flex-1">
                                <p className="font-medium text-orange-900 dark:text-orange-100">
                                  {alert.category}
                                </p>
                                <p className="text-sm text-orange-800 dark:text-orange-200 mt-1">
                                  {alert.message}
                                </p>
                                <p className="text-xs text-orange-700 dark:text-orange-300 mt-2">
                                  💡 {alert.recommendation}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <div className="mt-4 pt-4 border-t">
                      <Button
                        onClick={() => navigateToTab('insights')}
                        variant="outline"
                        className="w-full gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        View All Patterns & Insights
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Current KPIs - Chunks */}
              {dashboardData.current_kpis.chunks && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Chunks Quality KPIs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.chunks.avg_quality
                            ? (
                                dashboardData.current_kpis.chunks.avg_quality *
                                100
                              ).toFixed(0) + '%'
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Processed
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.chunks.total_processed ||
                            0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Below Threshold
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {dashboardData.current_kpis.chunks.below_threshold ||
                            0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Below %</p>
                        <p className="text-2xl font-bold">
                          {
                            dashboardData.current_kpis.chunks
                              .below_threshold_percentage
                          }
                          %
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Current KPIs - Images */}
              {dashboardData.current_kpis.images && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Images Quality KPIs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.images.avg_quality
                            ? (
                                dashboardData.current_kpis.images.avg_quality *
                                100
                              ).toFixed(0) + '%'
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Extracted
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.images.total_extracted ||
                            0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Below Threshold
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {dashboardData.current_kpis.images.below_threshold ||
                            0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Below %</p>
                        <p className="text-2xl font-bold">
                          {
                            dashboardData.current_kpis.images
                              .below_threshold_percentage
                          }
                          %
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Current KPIs - Products */}
              {dashboardData.current_kpis.products && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Products Quality KPIs
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Avg Quality
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.products.avg_quality
                            ? (
                                dashboardData.current_kpis.products
                                  .avg_quality * 100
                              ).toFixed(0) + '%'
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Total Created
                        </p>
                        <p className="text-2xl font-bold">
                          {dashboardData.current_kpis.products.total_created ||
                            0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Below Threshold
                        </p>
                        <p className="text-2xl font-bold text-orange-600">
                          {dashboardData.current_kpis.products
                            .below_threshold || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Below %</p>
                        <p className="text-2xl font-bold">
                          {
                            dashboardData.current_kpis.products
                              .below_threshold_percentage
                          }
                          %
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Trends */}
              {dashboardData.trends &&
                Object.keys(dashboardData.trends).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <ChevronRight className="h-5 w-5" />
                        Quality Trends
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {Object.entries(dashboardData.trends).map(
                          ([key, trend]: [string, any]) => (
                            <div
                              key={key}
                              className="flex items-center justify-between p-3 bg-muted/50 rounded"
                            >
                              <span className="font-medium capitalize">
                                {key.replace(/_/g, ' ')}
                              </span>
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={
                                    trend.trend === 'improving'
                                      ? 'default'
                                      : trend.trend === 'declining'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {trend.trend}
                                </Badge>
                                <span className="text-sm font-medium">
                                  {trend.change_percentage}%
                                </span>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No dashboard data available
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* NEW: Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          {patternsLoading ? (
            <Card>
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-primary" />
                  <p className="text-muted-foreground">
                    Analyzing patterns and insights...
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : patternsData ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Total Patterns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold">
                      {patternsData.summary.total_patterns}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Anomalies
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-orange-600">
                      {patternsData.summary.total_anomalies}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      High Severity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-red-600">
                      {patternsData.summary.high_severity_count}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">
                      Medium Severity
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold text-yellow-600">
                      {patternsData.summary.medium_severity_count}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Patterns */}
              {patternsData.patterns.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Detected Patterns ({patternsData.patterns.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {patternsData.patterns.map(
                        (pattern: any, idx: number) => (
                          <Card
                            key={idx}
                            className={`border-2 ${
                              pattern.severity === 'high'
                                ? 'border-red-200 bg-red-50 dark:bg-red-950'
                                : pattern.severity === 'medium'
                                  ? 'border-yellow-200 bg-yellow-50 dark:bg-yellow-950'
                                  : 'border-blue-200 bg-blue-50 dark:bg-blue-950'
                            }`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <Badge
                                  variant={
                                    pattern.severity === 'high'
                                      ? 'destructive'
                                      : pattern.severity === 'medium'
                                        ? 'default'
                                        : 'secondary'
                                  }
                                  className={
                                    pattern.severity === 'medium'
                                      ? 'bg-yellow-500'
                                      : ''
                                  }
                                >
                                  {pattern.severity}
                                </Badge>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold capitalize">
                                      {pattern.type.replace(/_/g, ' ')}
                                    </h4>
                                    <Badge variant="outline">
                                      {pattern.affected_entities} entities
                                    </Badge>
                                  </div>
                                  <p className="text-sm mb-3">
                                    {pattern.description}
                                  </p>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 mb-3">
                                    <p className="text-xs font-medium mb-1">
                                      💡 Recommendation:
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {pattern.recommendation}
                                    </p>
                                  </div>
                                  {pattern.data && (
                                    <details className="text-xs">
                                      <summary className="cursor-pointer font-medium mb-2">
                                        View Details
                                      </summary>
                                      <pre className="bg-muted/50 p-2 rounded overflow-x-auto">
                                        {JSON.stringify(pattern.data, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Anomalies */}
              {patternsData.anomalies.length > 0 && (
                <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
                      <Filter className="h-5 w-5" />
                      Anomalies Detected ({patternsData.anomalies.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {patternsData.anomalies.map(
                        (anomaly: any, idx: number) => (
                          <Card key={idx} className="border-orange-300">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <Badge variant="destructive">
                                  {anomaly.severity}
                                </Badge>
                                <div className="flex-1">
                                  <h4 className="font-semibold capitalize mb-2">
                                    {anomaly.type.replace(/_/g, ' ')}
                                  </h4>
                                  <p className="text-sm text-orange-900 dark:text-orange-100 mb-3">
                                    {anomaly.description}
                                  </p>
                                  <div className="bg-white dark:bg-gray-900 rounded p-3 mb-3">
                                    <p className="text-xs font-medium mb-1">
                                      💡 Recommendation:
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {anomaly.recommendation}
                                    </p>
                                  </div>
                                  {anomaly.data && (
                                    <details className="text-xs">
                                      <summary className="cursor-pointer font-medium mb-2">
                                        View Details
                                      </summary>
                                      <pre className="bg-muted/50 p-2 rounded overflow-x-auto">
                                        {JSON.stringify(anomaly.data, null, 2)}
                                      </pre>
                                    </details>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ),
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No Issues Found */}
              {patternsData.patterns.length === 0 &&
                patternsData.anomalies.length === 0 && (
                  <Card className="border-green-200 bg-green-50 dark:bg-green-950">
                    <CardContent className="p-8">
                      <div className="text-center">
                        <div className="text-6xl mb-4">✅</div>
                        <h3 className="text-xl font-semibold text-green-900 dark:text-green-100 mb-2">
                          All Systems Healthy!
                        </h3>
                        <p className="text-green-800 dark:text-green-200">
                          No patterns or anomalies detected. Your knowledge base
                          is performing optimally.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
            </>
          ) : (
            <Card>
              <CardContent className="p-8">
                <div className="text-center">
                  <Eye className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No insights data available
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Product Management Modals */}
      <ProductFormModal
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        product={selectedProduct}
        onSave={handleSaveProduct}
        mode={productFormMode}
      />

      <ProductDeleteConfirmation
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        product={productToDelete}
        onConfirm={handleConfirmDelete}
      />

      <ProductPreviewModal
        open={previewModalOpen}
        onOpenChange={setPreviewModalOpen}
        product={productToPreview}
      />

      {/* Chunk Detail Modal */}
      <ChunkDetailModal
        open={chunkDetailOpen}
        onOpenChange={setChunkDetailOpen}
        chunk={selectedChunk}
        relatedChunks={selectedChunk ? getRelatedChunks(selectedChunk) : []}
        images={selectedChunk ? getImagesByChunk(selectedChunk.id) : []}
        embedding={selectedChunk ? getEmbeddingByChunk(selectedChunk.id) : null}
        documentName={
          selectedChunk ? getDocumentDisplayName(selectedChunk) : ''
        }
      />
    </div>
  );
};
