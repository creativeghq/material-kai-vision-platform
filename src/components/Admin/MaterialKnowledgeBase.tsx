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
  X,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Link } from 'react-router-dom';

interface DocumentChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  metadata: any;
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
  bbox?: any;
  page_number?: number;
  proximity_score?: number;
  confidence?: number;
  metadata?: any;
  created_at: string;
  ocr_extracted_text?: string;
  ocr_confidence_score?: number;
  image_analysis_results?: any;
  visual_features?: any;
  processing_status?: string;
  multimodal_metadata?: any;
  contextual_name?: string;
  nearest_heading?: string;
  heading_level?: number;
  heading_distance?: number;
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
  metadata?: any;
}

interface MaterialMetadataField {
  id: string;
  field_name: string;
  display_name: string;
  field_type: string;
  is_required?: boolean;
  description?: string;
  extraction_hints?: string;
  dropdown_options?: string[];
  applies_to_categories?: string[];
  is_global?: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

interface KnowledgeBaseStats {
  totalChunks: number;
  totalImages: number;
  totalEmbeddings: number;
  totalDocuments: number;
  totalMetadataFields: number;
  avgChunkSize: number;
  avgConfidence: number;
}

export const MaterialKnowledgeBase: React.FC = () => {
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [images, setImages] = useState<DocumentImage[]>([]);
  const [embeddings, setEmbeddings] = useState<Embedding[]>([]);
  const [metadataFields, setMetadataFields] = useState<MaterialMetadataField[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);
  const [selectedChunk, setSelectedChunk] = useState<DocumentChunk | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  useEffect(() => {
    loadKnowledgeBaseData();
  }, []);

  const loadKnowledgeBaseData = async () => {
    setLoading(true);
    try {
      // Load chunks with document information
      const { data: chunksData, error: chunksError } = await supabase
        .from('document_chunks')
        .select(`
          *,
          documents!inner(
            id,
            filename,
            metadata,
            processing_status,
            created_at,
            file_size,
            page_count
          )
        `)
        .order('created_at', { ascending: false });

      if (chunksError) throw chunksError;
      setChunks(chunksData || []);

      // Load images
      const { data: imagesData, error: imagesError } = await supabase
        .from('document_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (imagesError) throw imagesError;
      setImages(imagesData || []);

      // Load embeddings with chunk information - FIX: Get actual embedding metadata
      const { data: embeddingsData, error: embeddingsError } = await supabase
        .from('document_vectors')
        .select(`
          *,
          document_chunks!inner(
            id,
            document_id,
            content,
            chunk_index
          )
        `)
        .order('created_at', { ascending: false });

      if (embeddingsError) throw embeddingsError;
      setEmbeddings(embeddingsData || []);

      // Load metadata fields
      const { data: metadataData, error: metadataError } = await supabase
        .from('material_metadata_fields')
        .select('*')
        .order('sort_order', { ascending: true });

      if (metadataError) throw metadataError;
      setMetadataFields(metadataData || []);

      // Load products created from PDF chunks
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .eq('created_from_type', 'pdf_processing')
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;
      setProducts(productsData || []);

      // Calculate stats
      const uniqueDocuments = new Set(chunksData?.map(c => c.document_id) || []).size;
      const avgChunkSize = chunksData?.length ? 
        chunksData.reduce((sum, chunk) => sum + chunk.content.length, 0) / chunksData.length : 0;
      const avgConfidence = imagesData?.length ? 
        imagesData.reduce((sum, img) => sum + (img.confidence || 0), 0) / imagesData.length : 0;

      setStats({
        totalChunks: chunksData?.length || 0,
        totalImages: imagesData?.length || 0,
        totalEmbeddings: embeddingsData?.length || 0,
        totalDocuments: uniqueDocuments,
        totalMetadataFields: metadataData?.length || 0,
        avgChunkSize: Math.round(avgChunkSize),
        avgConfidence: Math.round(avgConfidence * 100) / 100,
      });

    } catch (error) {
      console.error('Error loading knowledge base data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load knowledge base data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredChunks = chunks.filter(chunk =>
    chunk.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chunk.metadata?.filename?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    chunk.metadata?.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredImages = images.filter(image =>
    image.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.alt_text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.contextual_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    image.nearest_heading?.toLowerCase().includes(searchQuery.toLowerCase())
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

  const getDocumentDisplayName = (chunk: DocumentChunk) => {
    if (!chunk) return 'Unknown Document';

    // First, check chunk metadata for document_name (newly added field)
    if (chunk.metadata?.document_name) {
      return chunk.metadata.document_name;
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
    if (chunk.metadata?.filename) {
      // Remove extension from filename
      return chunk.metadata.filename.replace(/\.[^/.]+$/, '');
    }
    if (chunk.metadata?.title) return chunk.metadata.title;
    if (chunk.metadata?.source) return `${chunk.metadata.source} Document`;

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
        <Button onClick={loadKnowledgeBaseData} variant="outline">
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
                <Layers className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{stats.totalMetadataFields}</p>
                  <p className="text-xs text-muted-foreground">Meta Fields</p>
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
          </Card>

          <Card>
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
          <TabsTrigger value="products">📦 Products</TabsTrigger>
          <TabsTrigger value="metadata">Metadata ({stats?.totalMetadataFields || 0})</TabsTrigger>
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
                              <span className="text-muted-foreground">Size:</span>
                              <span className="ml-1 font-medium">
                                {doc?.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Pages:</span>
                              <span className="ml-1 font-medium">
                                {doc?.page_count || 'N/A'}
                              </span>
                            </div>
                          </div>

                          <div className="flex gap-2 text-xs text-muted-foreground mb-3">
                            <Badge variant="outline">{docChunks.length} chunks</Badge>
                            <Badge variant="outline">{docImages.length} images</Badge>
                            <Badge variant="outline">
                              {new Date(doc?.created_at).toLocaleDateString()}
                            </Badge>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedDocument(docId)}
                            className="w-full"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </Button>
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
                  <div className="flex justify-between items-center">
                    <span>Metadata Fields</span>
                    <Badge variant="secondary">{stats?.totalMetadataFields || 0} configured</Badge>
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
                  {filteredChunks.map((chunk) => {
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
                                    <span className="font-medium">Quality:</span> {chunk.metadata?.quality_score ? `${Math.round(chunk.metadata.quality_score * 100)}%` : 'N/A'}
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedChunk(chunk)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </Button>
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
                      <div className="aspect-video bg-muted flex items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground" />
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
                            {image.contextual_name || image.caption || 'Untitled Image'}
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
                              <DialogContent className="max-w-4xl">
                                <DialogHeader>
                                  <DialogTitle>Image Details</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                                    <ImageIcon className="h-16 w-16 text-muted-foreground" />
                                  </div>

                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="font-medium mb-2">Basic Information</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><strong>Type:</strong> {image.image_type || 'Unknown'}</p>
                                        <p><strong>Page:</strong> {image.page_number || 'N/A'}</p>
                                        <p><strong>Confidence:</strong> {Math.round((image.confidence || 0) * 100)}%</p>
                                        <p><strong>Status:</strong> {image.processing_status || 'N/A'}</p>
                                      </div>
                                    </div>

                                    <div>
                                      <h4 className="font-medium mb-2">Context Information</h4>
                                      <div className="space-y-1 text-sm">
                                        <p><strong>Contextual Name:</strong> {image.contextual_name || 'N/A'}</p>
                                        <p><strong>Nearest Heading:</strong> {image.nearest_heading || 'N/A'}</p>
                                        <p><strong>Heading Level:</strong> {image.heading_level || 'N/A'}</p>
                                        <p><strong>Distance:</strong> {image.heading_distance || 'N/A'}</p>
                                      </div>
                                    </div>
                                  </div>

                                  {image.ocr_extracted_text && (
                                    <div>
                                      <h4 className="font-medium mb-2">OCR Extracted Text</h4>
                                      <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                        {image.ocr_extracted_text}
                                      </div>
                                    </div>
                                  )}

                                  {image.visual_features && (
                                    <div>
                                      <h4 className="font-medium mb-2">Visual Features</h4>
                                      <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                        <pre className="whitespace-pre-wrap">
                                          {JSON.stringify(image.visual_features, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {image.metadata && (
                                    <div>
                                      <h4 className="font-medium mb-2">Metadata</h4>
                                      <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                        <pre className="whitespace-pre-wrap">
                                          {JSON.stringify(image.metadata, null, 2)}
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
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

        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Metadata Fields Configuration</CardTitle>
              <CardDescription>
                Configured metadata fields for material categorization and properties extraction
              </CardDescription>
            </CardHeader>
            <CardContent>
              {metadataFields.length === 0 ? (
                <div className="text-center py-8">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No metadata fields configured. Set up fields to enhance material categorization.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Field Name</TableHead>
                        <TableHead>Display Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Categories</TableHead>
                        <TableHead>Global</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metadataFields.map((field) => (
                        <TableRow key={field.id}>
                          <TableCell className="font-medium">{field.field_name}</TableCell>
                          <TableCell>{field.display_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{field.field_type}</Badge>
                          </TableCell>
                          <TableCell>
                            {field.is_required ? (
                              <Badge variant="destructive">Required</Badge>
                            ) : (
                              <Badge variant="secondary">Optional</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {field.applies_to_categories?.length ? (
                              <div className="flex flex-wrap gap-1">
                                {field.applies_to_categories.slice(0, 2).map((cat) => (
                                  <Badge key={cat} variant="outline" className="text-xs">
                                    {cat}
                                  </Badge>
                                ))}
                                {field.applies_to_categories.length > 2 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{field.applies_to_categories.length - 2}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">All</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {field.is_global ? (
                              <Badge variant="default">Global</Badge>
                            ) : (
                              <Badge variant="outline">Local</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
