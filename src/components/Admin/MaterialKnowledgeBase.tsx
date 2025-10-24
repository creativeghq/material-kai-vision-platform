import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [embeddings, setEmbeddings] = useState<Embedding[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [imageChunkRelationships, setImageChunkRelationships] = useState<ImageChunkRelationship[]>([]);

  // Pagination state for chunks
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  const [activeTab, setActiveTab] = useState('overview');
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load page immediately, then fetch data in background
    setLoading(false);
    // Start loading data asynchronously without blocking UI
    loadKnowledgeBaseData();
  }, []);

  const loadKnowledgeBaseData = async () => {
    try {
      // Don't set loading=true to keep UI responsive
      console.log('🚀 Starting background data load...');

      // Get current user and their workspace
      const { data: { user } } = await supabase.auth.getUser();
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

      if (workspaceError || !workspaceDataArray || workspaceDataArray.length === 0) {
        console.error('❌ Error getting workspace:', workspaceError);
        console.error('❌ User has no active workspace membership');
        return;
      }

      const workspaceId = workspaceDataArray[0].workspace_id;
      console.log(`✅ Using workspace: ${workspaceId}`);

      // Load ALL chunks with document information (no limit)
      console.log('📊 Loading chunks from database...');
      let allChunks: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      let totalCount = 0;

      // Fetch chunks with pagination to handle large datasets
      while (hasMore) {
        const { data: chunksData, error: chunksError, count: chunksCount } = await supabase
          .from('document_chunks')
          .select(`
            *,
            documents(
              id,
              filename,
              metadata,
              processing_status,
              created_at
            )
          `, { count: 'exact' })
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
          console.log(`📖 Fetched page ${page + 1}: ${chunksData.length} chunks (total so far: ${allChunks.length}/${totalCount})`);
          page++;
          hasMore = chunksData.length === pageSize;
        }
      }

      console.log(`✅ Loaded ${allChunks.length} chunks (total count: ${totalCount})`);
      setChunks(allChunks || []);

      // Load ALL images with pagination
      console.log('🖼️ Loading images from database...');
      let allImages: any[] = [];
      let imagePage = 0;
      let imagesTotalCount = 0;
      let imagesHasMore = true;

      while (imagesHasMore) {
        try {
          const { data: imagesData, error: imagesError, count: imagesCount } = await supabase
            .from('document_images')
            .select('*', { count: 'exact' })
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .range(imagePage * pageSize, (imagePage + 1) * pageSize - 1);

          if (imagesError) {
            console.error('❌ Error loading images:', imagesError);
            console.error('❌ Error details:', { code: imagesError.code, message: imagesError.message });
            // Don't throw - continue with empty images
            imagesHasMore = false;
          } else if (!imagesData || imagesData.length === 0) {
            imagesHasMore = false;
          } else {
            allImages = allImages.concat(imagesData);
            imagesTotalCount = imagesCount || 0;
            console.log(`📷 Fetched image page ${imagePage + 1}: ${imagesData.length} images (total so far: ${allImages.length}/${imagesTotalCount})`);
            imagePage++;
            imagesHasMore = imagesData.length === pageSize;
          }
        } catch (err) {
          console.error('❌ Exception loading images:', err);
          imagesHasMore = false;
        }
      }

      console.log(`✅ Loaded ${allImages.length} images (total count: ${imagesTotalCount})`);
      setImages(allImages || []);

      // Load embeddings - query both embeddings and document_vectors tables
      // First try document_vectors (primary), then fall back to embeddings table
      console.log('🔢 Loading embeddings from database...');
      let embeddingsData: unknown[] = [];

      const { data: vectorsData, error: vectorsError, count: vectorsCount } = await supabase
        .from('document_vectors')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (!vectorsError && vectorsData && vectorsData.length > 0) {
        console.log(`✅ Loaded ${vectorsData.length} embeddings from document_vectors (total count: ${vectorsCount})`);
        embeddingsData = vectorsData;
      } else {
        if (vectorsError) {
          console.warn('⚠️ document_vectors query failed:', vectorsError);
        } else {
          console.log('⚠️ No embeddings found in document_vectors table');
        }

        // Fall back to embeddings table
        const { data: embeddingsTableData, error: embeddingsError, count: embeddingsCount } = await supabase
          .from('embeddings')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });

        if (embeddingsError) {
          console.warn('⚠️ embeddings table query failed:', embeddingsError);
        } else {
          console.log(`✅ Loaded ${embeddingsTableData?.length || 0} embeddings from embeddings table (total count: ${embeddingsCount})`);
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
        console.log(`✅ Loaded ${productsData?.length || 0} products from database`);
        setProducts(productsData || []);
      }

      // Load image chunk relationships
      console.log('🔗 Loading image chunk relationships...');
      const { data: relationshipsData, error: relationshipsError } = await supabase
        .from('image_chunk_relationships')
        .select('*')
        .order('similarity_score', { ascending: false });

      if (relationshipsError) {
        console.warn('⚠️ Error loading image chunk relationships:', relationshipsError);
        setImageChunkRelationships([]);
      } else {
        console.log(`✅ Loaded ${relationshipsData?.length || 0} image chunk relationships`);
        setImageChunkRelationships(relationshipsData || []);
      }

      // Calculate stats
      console.log('📈 Calculating statistics...');
      const uniqueDocuments = new Set(allChunks?.map((c: unknown) => (c as any).document_id) || []).size;
      const avgChunkSize = allChunks?.length ?
        allChunks.reduce((sum: number, chunk: any) => sum + chunk.content.length, 0) / allChunks.length : 0;
      const avgConfidence = allImages?.length ?
        allImages.reduce((sum: number, img: any) => sum + (img.confidence || 0), 0) / allImages.length : 0;

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
      await supabase
        .from('image_validations')
        .delete()
        .eq('image_id', imageId);

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
      setImages(images.filter(img => img.id !== imageId));
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

  const filteredChunks = chunks.filter(chunk =>
    chunk.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chunk.metadata as any)?.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (chunk.metadata as any)?.title?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const filteredImages = images.filter(image =>
    image.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.alt_text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.contextual_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.nearest_heading?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const getChunksByDocument = (documentId: string) => {
    return chunks.filter(chunk => chunk.document_id === documentId);
  };

  const getImagesByDocument = (documentId: string) => {
    return images.filter(image => image.document_id === documentId);
  };

  const getImagesByChunk = (chunkId: string) => {
    return images.filter(image => image.chunk_id === chunkId);
  };

  const getEmbeddingByChunk = (chunkId: string) => {
    return embeddings.find(embedding => embedding.chunk_id === chunkId);
  };

  // IMPROVED: Find related chunks based on document proximity
  const getRelatedChunks = (chunk: DocumentChunk, limit: number = 3) => {
    return chunks
      .filter(c =>
        c.document_id === chunk.document_id &&
        c.id !== chunk.id &&
        Math.abs(c.chunk_index - chunk.chunk_index) <= 2,
      )
      .slice(0, limit);
  };

  // Get all related chunks for an image using semantic relationships
  const getRelatedChunksForImage = (imageId: string): DocumentChunk[] => {
    const relationships = imageChunkRelationships.filter(r => r.image_id === imageId);
    const relatedChunkIds = relationships.map(r => r.chunk_id);
    return chunks.filter(c => relatedChunkIds.includes(c.id));
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
    if ((chunk.metadata as any)?.source) return `${(chunk.metadata as any).source} Document`;

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
              Comprehensive view of processed documents, chunks, images, and embeddings
            </p>
          </div>
        </div>
        <Button onClick={loadKnowledgeBaseData} onKeyDown={(e) => e.key === 'Enter' && loadKnowledgeBaseData()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
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
          </Card><Card>
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
                  <p className="text-xs text-muted-foreground">Avg Chunk Size</p>
                </div>
              </div>
            </CardContent>
          </Card><Card>
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.avgConfidence}</p>
                  <p className="text-xs text-muted-foreground">Avg Confidence</p>
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
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chunks">Chunks ({stats?.totalChunks || 0})</TabsTrigger>
          <TabsTrigger value="images">Images ({stats?.totalImages || 0})</TabsTrigger>
          <TabsTrigger value="embeddings">Embeddings ({stats?.totalEmbeddings || 0})</TabsTrigger>
          <TabsTrigger value="products">📦 Products ({products.length})</TabsTrigger>
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
                    {Array.from(new Set(chunks.map(c => c.document_id))).map(docId => {
                      const docChunks = getChunksByDocument(docId);
                      const docImages = getImagesByDocument(docId);
                      const firstChunk = docChunks[0];
                      const doc = (firstChunk as any).documents;

                      return (
                        <div key={docId} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <p className="font-semibold">
                                {getDocumentDisplayName(firstChunk)}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                📄 {doc?.filename || 'Unknown filename'}
                              </p>
                            </div>
                            <Badge variant={doc?.processing_status === 'completed' ? 'default' : 'secondary'}>
                              {doc?.processing_status || 'unknown'}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                            <div>
                              <span className="text-muted-foreground">Chunks:</span>
                              <span className="ml-1 font-medium">{docChunks.length}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Images:</span>
                              <span className="ml-1 font-medium">{docImages.length}</span>
                            </div>
                          </div>

                          <div className="flex gap-2 text-xs text-muted-foreground mb-3">
                            <Badge variant="outline">{docChunks.length} chunks</Badge>
                            <Badge variant="outline">{docImages.length} images</Badge>
                            <Badge variant="outline">
                              {new Date(doc?.created_at).toLocaleDateString()}
                            </Badge>
                          </div>


                        </div>
                      );
                    })}
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
                    <Badge variant="secondary">{stats?.totalChunks || 0} processed</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Images Extracted</span>
                    <Badge variant="secondary">{stats?.totalImages || 0} extracted</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Embeddings Generated</span>
                    <Badge variant="secondary">{stats?.totalEmbeddings || 0} generated</Badge>
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
                Text chunks extracted from processed documents with their metadata and relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredChunks.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery ? 'No chunks match your search.' : 'No chunks available. Process some PDFs to see content here.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Pagination Info */}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>
                      Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredChunks.length)} of {filteredChunks.length} chunks
                    </span>
                  </div>

                  {/* Chunks List */}
                  {getPaginatedChunks().map((chunk) => {
                    const relatedImages = getImagesByChunk(chunk.id);
                    const embedding = getEmbeddingByChunk(chunk.id);

                    return (
                      <Collapsible key={chunk.id}>
                        <CollapsibleTrigger asChild>
                          <div className="border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <Badge variant="outline">Chunk {chunk.chunk_index}</Badge>
                                  <Badge variant="secondary">
                                    {getDocumentDisplayName(chunk)}
                                  </Badge>
                                  {relatedImages.length > 0 && (
                                    <Badge variant="outline" className="text-purple-600">
                                      <ImageIcon className="h-3 w-3 mr-1" />
                                      {relatedImages.length} images
                                    </Badge>
                                  )}
                                  {embedding && (
                                    <Badge variant="outline" className="text-orange-600">
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
                                    <span className="font-medium">Position:</span> {chunk.chunk_index + 1}
                                  </div>
                                  <div>
                                    <span className="font-medium">Size:</span> {chunk.content.length} chars
                                  </div>
                                  <div>
                                    <span className="font-medium">Quality:</span> {(chunk.metadata as any)?.quality_score ? `${Math.round((chunk.metadata as any).quality_score * 100)}%` : 'N/A'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Date:</span> {new Date(chunk.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4" />
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="border-l-2 border-muted ml-4 pl-4 mt-4 space-y-4">
                            {/* Full Content */}
                            <div>
                              <h4 className="font-medium mb-2">Full Content</h4>
                              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                {chunk.content}
                              </div>
                            </div>

                            {/* IMPROVED: Related Chunks - Show relationships */}
                            {getRelatedChunks(chunk).length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                  <Layers className="h-4 w-4" />
                                  Related Chunks ({getRelatedChunks(chunk).length})
                                </h4>
                                <div className="space-y-2">
                                  {getRelatedChunks(chunk).map((relChunk) => (
                                    <div key={relChunk.id} className="border rounded-lg p-2 bg-muted/30">
                                      <div className="flex items-start justify-between mb-1">
                                        <Badge variant="outline" className="text-xs">
                                          Chunk {relChunk.chunk_index}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          Distance: {Math.abs(relChunk.chunk_index - chunk.chunk_index)} positions
                                        </span>
                                      </div>
                                      <p className="text-xs text-muted-foreground line-clamp-2">
                                        {relChunk.content.substring(0, 150)}...
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Related Images */}
                            {relatedImages.length > 0 && (
                              <div>
                                <h4 className="font-medium mb-2">Related Images ({relatedImages.length})</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                  {relatedImages.map((image) => (
                                    <div key={image.id} className="border rounded-lg p-2">
                                      <div className="aspect-video bg-muted rounded mb-2 flex items-center justify-center">
                                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                      </div>
                                      <p className="text-xs font-medium">
                                        {image.contextual_name || image.caption || 'Untitled Image'}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Page {image.page_number} • {Math.round((image.confidence || 0) * 100)}% confidence
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Embedding Info - IMPROVED: Show actual metadata */}
                            {embedding ? (
                              <div>
                                <h4 className="font-medium mb-2 flex items-center gap-2">
                                  <Brain className="h-4 w-4" />
                                  Embedding Information
                                </h4>
                                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="font-medium">Model:</span>
                                      <p className="text-muted-foreground">{embedding.model_name || 'text-embedding-3-small'}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Dimensions:</span>
                                      <p className="text-muted-foreground">{embedding.dimensions || 1536}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Type:</span>
                                      <p className="text-muted-foreground">{embedding.embedding_type || 'text'}</p>
                                    </div>
                                    <div>
                                      <span className="font-medium">Status:</span>
                                      <Badge variant="outline" className="text-green-600 mt-1">Generated</Badge>
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium">Generated:</span>
                                    <p className="text-muted-foreground text-xs">{new Date(embedding.created_at).toLocaleString()}</p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <h4 className="font-medium mb-2">Embedding Information</h4>
                                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                  <p className="text-muted-foreground">No embedding generated for this chunk</p>
                                </div>
                              </div>
                            )}

                            {/* Metadata */}
                            <div>
                              <h4 className="font-medium mb-2">Metadata</h4>
                              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(chunk.metadata, null, 2)}
                                </pre>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2">

                              <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-2" />
                                Export
                              </Button>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}

                  {/* Pagination Controls */}
                  {getTotalPages() > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(1)} onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(1)}
                        disabled={currentPage === 1}
                        className="px-3"
                      >
                        &lt;&lt;
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3"
                      >
                        &lt;
                      </Button>

                      {/* Smart pagination with ellipsis */}
                      <div className="flex gap-1">
                        {getPaginationNumbers().map((page, index) => (
                          page === '...' ? (
                            <span key={`ellipsis-${index}`} className="px-2 py-1 text-muted-foreground">
                              ...
                            </span>
                          ) : (
                            <Button
                              key={page}
                              variant={currentPage === page ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setCurrentPage(page as number)}
                              onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(page as number)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          )
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(getTotalPages(), currentPage + 1))} onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(Math.min(getTotalPages(), currentPage + 1))}
                        disabled={currentPage === getTotalPages()}
                        className="px-3"
                      >
                        &gt;
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(getTotalPages())} onKeyDown={(e) => e.key === 'Enter' && setCurrentPage(getTotalPages())}
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
                Images extracted from documents with their metadata, analysis results, and relationships
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredImages.length === 0 ? (
                <div className="text-center py-8">
                  <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    {searchQuery ? 'No images match your search.' : 'No images available. Process PDFs with images to see content here.'}
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
                              console.warn(`Failed to load image: ${image.image_url}`);
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <ImageIcon className="h-12 w-12 text-muted-foreground" />
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{image.image_type || 'Unknown'}</Badge>
                            <Badge variant="secondary">
                              {Math.round((image.confidence || 0) * 100)}% confidence
                            </Badge>
                          </div>

                          <h4 className="font-medium">
                            {getImageDisplayName(image)}
                          </h4>

                          {image.alt_text && (
                            <p className="text-sm text-muted-foreground">{image.alt_text}</p>
                          )}

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="font-medium">Page:</span> {image.page_number || 'N/A'}
                            </div>
                            <div>
                              <span className="font-medium">Status:</span> {image.processing_status || 'N/A'}
                            </div>
                          </div>

                          {image.nearest_heading && (
                            <div className="text-xs">
                              <span className="font-medium">Near:</span> {image.nearest_heading}
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
                                <Button variant="outline" size="sm" className="flex-1">
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
                                          console.warn(`Failed to load image in modal: ${image.image_url}`);
                                          (e.target as HTMLImageElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <ImageIcon className="h-16 w-16 text-muted-foreground" />
                                    )}
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                                      <h4 className="font-semibold mb-3 text-blue-900 dark:text-blue-100">Basic Information</h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">Type:</span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">{image.image_type || 'Unknown'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">Page:</span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">{image.page_number || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">Confidence:</span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">{Math.round((image.confidence || 0) * 100)}%</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-blue-700 dark:text-blue-300">Status:</span>
                                          <span className="font-medium text-blue-900 dark:text-blue-100">{image.processing_status || 'N/A'}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
                                      <h4 className="font-semibold mb-3 text-purple-900 dark:text-purple-100">Context Information</h4>
                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">Contextual Name:</span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">{image.contextual_name || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">Nearest Heading:</span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">{image.nearest_heading || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">Heading Level:</span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">{image.heading_level || 'N/A'}</span>
                                        </div>
                                        <div className="flex justify-between">
                                          <span className="text-purple-700 dark:text-purple-300">Distance:</span>
                                          <span className="font-medium text-purple-900 dark:text-purple-100">{image.heading_distance || 'N/A'}</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {image.ocr_extracted_text && (
                                    <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 rounded-lg p-4 border border-green-200 dark:border-green-800">
                                      <h4 className="font-semibold mb-2 text-green-900 dark:text-green-100">OCR Extracted Text</h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                        {image.ocr_extracted_text}
                                      </div>
                                    </div>
                                  )}

                                  {/* IMPROVED: Show ALL related chunks */}
                                  {(() => {
                                    const relatedChunks = getRelatedChunksForImage(image.id);
                                    return relatedChunks.length > 0 ? (
                                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                        <h4 className="font-semibold mb-3 text-amber-900 dark:text-amber-100">
                                          Related Chunks ({relatedChunks.length})
                                        </h4>
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                          {relatedChunks.map((chunk) => {
                                            const relationship = imageChunkRelationships.find(
                                              r => r.image_id === image.id && r.chunk_id === chunk.id
                                            );
                                            return (
                                              <div key={chunk.id} className="bg-white dark:bg-gray-900 rounded p-3 border border-amber-100 dark:border-amber-800">
                                                <div className="flex items-center justify-between mb-2">
                                                  <Badge variant="outline" className="text-xs">
                                                    Chunk {chunk.chunk_index}
                                                  </Badge>
                                                  {relationship && (
                                                    <Badge variant="secondary" className="text-xs">
                                                      {Math.round(relationship.similarity_score * 100)}% match
                                                    </Badge>
                                                  )}
                                                </div>
                                                <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-3">
                                                  {chunk.content.substring(0, 200)}...
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : image.chunk_id ? (
                                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                                        <h4 className="font-semibold mb-2 text-amber-900 dark:text-amber-100">Related Chunk</h4>
                                        <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm text-gray-700 dark:text-gray-300 max-h-32 overflow-y-auto">
                                          {chunks.find(c => c.id === image.chunk_id)?.content.substring(0, 300) || 'Chunk not found'}...
                                        </div>
                                      </div>
                                    ) : null;
                                  })()}

                                  {/* Material Properties */}
                                  {image.material_properties && Object.keys(image.material_properties as any).length > 0 && (
                                    <div className="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900 rounded-lg p-4 border border-teal-200 dark:border-teal-800">
                                      <h4 className="font-semibold mb-3 text-teal-900 dark:text-teal-100">Material Properties</h4>
                                      <div className="grid grid-cols-2 gap-3 text-sm">
                                        {Object.entries(image.material_properties as any).map(([key, value]) => (
                                          <div key={key} className="bg-white dark:bg-gray-900 rounded p-2 border border-teal-100 dark:border-teal-800">
                                            <span className="font-medium text-teal-700 dark:text-teal-300">{key}:</span>
                                            <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Extracted Metadata */}
                                  {image.extracted_metadata && Object.keys(image.extracted_metadata as any).length > 0 && (
                                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                                      <h4 className="font-semibold mb-3 text-orange-900 dark:text-orange-100">Extracted Metadata</h4>
                                      <div className="space-y-2 text-sm">
                                        {Object.entries(image.extracted_metadata as any).map(([key, value]) => (
                                          <div key={key} className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-800">
                                            <span className="font-medium text-orange-700 dark:text-orange-300">{key}:</span>
                                            <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                                              {Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {image.visual_features && (
                                    <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                                      <h4 className="font-semibold mb-2 text-indigo-900 dark:text-indigo-100">Visual Features</h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-indigo-100 dark:border-indigo-800">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                          {formatJsonForDisplay(image.visual_features)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {image.image_analysis_results && (
                                    <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
                                      <h4 className="font-semibold mb-2 text-cyan-900 dark:text-cyan-100">Analysis Results</h4>
                                      <div className="bg-white dark:bg-gray-900 rounded p-3 text-sm max-h-48 overflow-y-auto border border-cyan-100 dark:border-cyan-800">
                                        <pre className="whitespace-pre-wrap text-xs font-mono text-gray-700 dark:text-gray-300">
                                          {formatJsonForDisplay(image.image_analysis_results)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {image.metadata && (
                                    <div className="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900 rounded-lg p-4 border border-rose-200 dark:border-rose-800">
                                      <h4 className="font-semibold mb-2 text-rose-900 dark:text-rose-100">Metadata</h4>
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
                              {deletingImageId === image.id ? '🗑️ Deleting...' : '🗑️ Delete'}
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
        </TabsContent><TabsContent value="embeddings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generated Embeddings</CardTitle>
              <CardDescription>
                Vector embeddings generated for text chunks to enable semantic search and RAG
              </CardDescription>
            </CardHeader>
            <CardContent>
              {embeddings.length === 0 ? (
                <div className="text-center py-8">
                  <Brain className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No embeddings available. Process documents to generate embeddings.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {embeddings.map((embedding) => {
                    const relatedChunk = chunks.find(c => c.id === embedding.chunk_id);

                    return (
                      <Card key={embedding.id}>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Brain className="h-4 w-4 text-orange-500" />
                              <span className="font-medium">Embedding {embedding.id.substring(0, 8)}</span>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline">{embedding.model_name || 'Unknown Model'}</Badge>
                              <Badge variant="secondary">{embedding.dimensions || 0}D</Badge>
                            </div>
                          </div>

                          {relatedChunk && (
                            <div className="mb-3">
                              <h4 className="font-medium mb-1">Related Chunk</h4>
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
                              <p className="text-muted-foreground text-xs">{embedding.model_name || 'text-embedding-3-small'}</p>
                            </div>
                            <div>
                              <span className="font-medium">Dimensions:</span>
                              <p className="text-muted-foreground text-xs">{embedding.dimensions || 1536}</p>
                            </div>
                            <div>
                              <span className="font-medium">Type:</span>
                              <p className="text-muted-foreground text-xs">{embedding.embedding_type || 'text'}</p>
                            </div>
                            <div>
                              <span className="font-medium">Generated:</span>
                              <p className="text-muted-foreground text-xs">
                                {new Date(embedding.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 pt-3 border-t">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Vector Status</span>
                              <Badge variant="outline" className="text-green-600">
                                ✓ Generated ({embedding.dimensions || 1536}D)
                              </Badge>
                            </div>
                            <div className="mt-2 bg-muted/50 rounded p-2 text-xs">
                              <p className="text-muted-foreground">
                                Vector embedding successfully generated and stored.
                                This chunk is ready for semantic search and RAG operations.
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
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Products from PDF Chunks
              </CardTitle>
              <CardDescription>
                Products created from real PDF chunks with source tracking and metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              {products.length === 0 ? (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No products created yet. Process PDFs and create products from chunks.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {products.map((product) => (
                    <Card key={product.id} className="border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-semibold text-lg">{product.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {product.description?.substring(0, 150)}...
                            </p>
                          </div>
                          <Badge variant={product.status === 'published' ? 'default' : 'secondary'}>
                            {product.status || 'draft'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                          <div>
                            <span className="font-medium">Source:</span>
                            <p className="text-muted-foreground text-xs">{product.created_from_type}</p>
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
                              {new Date(product.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        {product.metadata?.supplier && (
                          <div className="mb-3 text-sm">
                            <span className="font-medium">Supplier:</span>
                            <p className="text-muted-foreground">{product.metadata.supplier}</p>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="flex-1">
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>{product.name}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div>
                                  <h4 className="font-medium mb-2">Description</h4>
                                  <p className="text-sm text-muted-foreground">
                                    {product.long_description || product.description}
                                  </p>
                                </div>
                                {product.properties && (
                                  <div>
                                    <h4 className="font-medium mb-2">Properties</h4>
                                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(product.properties, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                                {product.metadata && (
                                  <div>
                                    <h4 className="font-medium mb-2">Metadata</h4>
                                    <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                      <pre className="whitespace-pre-wrap">
                                        {JSON.stringify(product.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>


      </Tabs>
    </div>
  );
};
