import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  Image as ImageIcon,
  Database,
  RefreshCw,
  Hash,
  Layers,
  Brain,
  ArrowLeft,
  Package,
  Filter,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ProductFormModal } from '../ProductFormModal';
import { ProductDeleteConfirmation } from '../ProductDeleteConfirmation';
import { ProductPreviewModal } from '../ProductPreviewModal';
import { ChunkDetailModal } from '../ChunkDetailModal';

import {
  Card,
  CardContent,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Input } from '@/components/core/ui/input';
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

import {
  DocumentChunk,
  DocumentImage,
  Embedding,
  ImageChunkRelationship,
  KnowledgeBaseStats,
} from './types';
import { OverviewTab } from './tabs/OverviewTab';
import { ChunksTab } from './tabs/ChunksTab';
import { ImagesTab } from './tabs/ImagesTab';
import { EmbeddingsTab } from './tabs/EmbeddingsTab';
import { ProductsTab } from './tabs/ProductsTab';
import { MetadataTab } from './tabs/MetadataTab';
import { RelationshipsTab } from './tabs/RelationshipsTab';
import { QualityTab } from './tabs/QualityTab';
import { DetectionsTab } from './tabs/DetectionsTab';

export const MaterialKnowledgeBase: React.FC = () => {
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
      setWorkspaceId(workspaceId);

      // Load ALL chunks with document information (no limit)
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
          page++;
          hasMore = chunksData.length === pageSize;
        }
      }

      setChunks(allChunks || []);

      // Load ALL images with pagination
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
            imagePage++;
            imagesHasMore = imagesData.length === pageSize;
          }
        } catch (err) {
          console.error('❌ Exception loading images:', err);
          imagesHasMore = false;
        }
      }

      setImages(allImages || []);

      // Load embeddings - query both embeddings and document_vectors tables
      // First try document_vectors (primary), then fall back to embeddings table
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
        embeddingsData = vectorsData;
      } else {
        if (vectorsError) {
          console.warn('⚠️ document_vectors query failed:', vectorsError);
        } else {
        }
        // embeddings table doesn't exist - only using document_vectors
        embeddingsData = [];
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
        setProducts(productsData || []);
      }

      // Load image chunk relationships
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
        setImageChunkRelationships(relationshipsData || []);
      }

      // Calculate stats
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

      // 3. Delete from image_metafield_values
      await supabase
        .from('image_metafield_values')
        .delete()
        .eq('image_id', imageId);

      // 4. Delete from image_validations
      await supabase.from('image_validations').delete().eq('image_id', imageId);

      // 5. Finally delete from document_images
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

  const handleExportDocumentImages = async (documentId: string) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to export images',
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Exporting Images',
        description: 'Preparing ZIP file...',
      });

      const response = await fetch(
        `https://v1api.materialshub.gr/api/images/export/${documentId}?format=PNG&quality=95&include_metadata=true`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Export failed: ${response.status} ${response.statusText}\n${errorText}`,
        );
      }

      // Download the ZIP file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `images_${documentId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: 'Images downloaded successfully',
      });
    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description:
          error instanceof Error ? error.message : 'Failed to export images',
        variant: 'destructive',
      });
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

  // Calculate total quality items count
  const getQualityItemsCount = useCallback(() => {
    if (!qualityData?.kpis) return 0;
    let total = 0;
    if (qualityData.kpis.chunks?.total_validated) {
      total += qualityData.kpis.chunks.total_validated;
    }
    if (qualityData.kpis.images?.total_validated) {
      total += qualityData.kpis.images.total_validated;
    }
    if (qualityData.kpis.products?.total_validated) {
      total += qualityData.kpis.products.total_validated;
    }
    return total;
  }, [qualityData]);

  // Manual refresh all admin data (memoized with useCallback)
  const refreshAllAdminData = useCallback(() => {
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
                <Brain className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalEmbeddings}</p>
                  <p className="text-xs text-muted-foreground">🧠 Embeddings</p>
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
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">📋 Overview</TabsTrigger>
          <TabsTrigger value="chunks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            📄 Chunks ({stats?.totalChunks || 0})
          </TabsTrigger>
          <TabsTrigger value="images" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            🖼️ Images ({stats?.totalImages || 0})
          </TabsTrigger>
          <TabsTrigger value="embeddings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            🧠 Embeddings ({stats?.totalEmbeddings || 0})
          </TabsTrigger>
          <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            📦 Products ({products.length})
          </TabsTrigger>
          <TabsTrigger value="metadata" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            📊 Metadata ({metadataData?.summary?.total_entities || 0})
          </TabsTrigger>
          <TabsTrigger value="relationships" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            🔗 Relationships ({imageChunkRelationships.length})
          </TabsTrigger>
          <TabsTrigger value="quality" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            ⭐ Quality ({getQualityItemsCount()})
          </TabsTrigger>
          <TabsTrigger value="detections" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            🔍 Detections ({detectionsData?.total_detections || 0})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <OverviewTab
            chunks={chunks}
            images={images}
            stats={stats}
            getChunksByDocument={getChunksByDocument}
            getImagesByDocument={getImagesByDocument}
            getDocumentDisplayName={getDocumentDisplayName}
            handleExportDocumentImages={handleExportDocumentImages}
          />
        </TabsContent>

        <TabsContent value="chunks" className="space-y-4">
          <ChunksTab
            filteredChunks={filteredChunks}
            searchQuery={searchQuery}
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            setCurrentPage={setCurrentPage}
            getImagesByChunk={getImagesByChunk}
            getEmbeddingByChunk={getEmbeddingByChunk}
            getDocumentDisplayName={getDocumentDisplayName}
            handleViewChunkDetail={handleViewChunkDetail}
            getPaginatedChunks={getPaginatedChunks}
            getTotalPages={getTotalPages}
            getPaginationNumbers={getPaginationNumbers}
          />
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <ImagesTab
            filteredImages={filteredImages}
            searchQuery={searchQuery}
            deletingImageId={deletingImageId}
            chunks={chunks}
            imageChunkRelationships={imageChunkRelationships}
            deleteImage={deleteImage}
            getImageDisplayName={getImageDisplayName}
            getRelatedChunksForImage={getRelatedChunksForImage}
            formatJsonForDisplay={formatJsonForDisplay}
          />
        </TabsContent>

        <TabsContent value="embeddings" className="space-y-4">
          <EmbeddingsTab
            embeddings={embeddings}
            chunks={chunks}
            getDocumentDisplayName={getDocumentDisplayName}
          />
        </TabsContent>

        {/* NEW: Products Tab */}
        <TabsContent value="products" className="space-y-4">
          <ProductsTab
            products={filteredProducts}
            handleCreateProduct={handleCreateProduct}
            handlePreviewProduct={handlePreviewProduct}
            handleEditProduct={handleEditProduct}
            handleDeleteProduct={handleDeleteProduct}
          />
        </TabsContent>

        {/* NEW: Metadata Tab */}
        <TabsContent value="metadata" className="space-y-4">
          <MetadataTab
            metadataLoading={metadataLoading}
            metadataData={metadataData}
            navigateToChunkDetails={navigateToChunkDetails}
            navigateToImageDetails={navigateToImageDetails}
            navigateToProductDetails={navigateToProductDetails}
          />
        </TabsContent>

        {/* NEW: Relationships Tab */}
        <TabsContent value="relationships" className="space-y-4">
          <RelationshipsTab
            imageChunkRelationships={imageChunkRelationships}
            stats={stats}
          />
        </TabsContent>

        {/* NEW: Quality Scores Tab */}
        <TabsContent value="quality" className="space-y-4">
          <QualityTab
            qualityLoading={qualityLoading}
            qualityData={qualityData}
            navigateToTab={navigateToTab}
          />
        </TabsContent>

        {/* Detections Tab */}
        <TabsContent value="detections" className="space-y-4">
          <DetectionsTab
            detectionsLoading={detectionsLoading}
            detectionsData={detectionsData}
          />
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

export default MaterialKnowledgeBase;
