import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Package,
  Image as ImageIcon,
  Grid3X3,
  Database,
  Sparkles,
  FileCheck,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DocumentDetails {
  id: string;
  filename: string;
  processing_status: string;
  created_at: string;
  metadata: any;
  products: any[];
  chunks: any[];
  images: any[];
  document_entities: any[];
  embeddings_count: number;
}

export const PDFDocumentDetails: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<DocumentDetails | null>(null);

  useEffect(() => {
    if (documentId) {
      fetchDocumentDetails();
    }
  }, [documentId]);

  const fetchDocumentDetails = async () => {
    try {
      setLoading(true);

      // Fetch document info
      const { data: docData, error: docError } = await supabase
        .from('source_documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      // Fetch products
      const { data: productsData } = await supabase
        .from('products')
        .select('*')
        .eq('source_document_id', documentId);

      // Fetch chunks
      const { data: chunksData } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('document_id', documentId);

      // Fetch images
      const { data: imagesData } = await supabase
        .from('document_images')
        .select('*')
        .eq('document_id', documentId);

      // Fetch document entities
      const { data: entitiesData } = await supabase
        .from('document_entities')
        .select('*')
        .eq('source_document_id', documentId);

      // Count embeddings
      const { count: embeddingsCount } = await supabase
        .from('embeddings')
        .select('*', { count: 'exact', head: true })
        .eq('source_document_id', documentId);

      setDocument({
        ...docData,
        products: productsData || [],
        chunks: chunksData || [],
        images: imagesData || [],
        document_entities: entitiesData || [],
        embeddings_count: embeddingsCount || 0,
      });
    } catch (error) {
      console.error('Error fetching document details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load document details',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="p-6">
        <div className="text-center">
          <p className="text-muted-foreground">Document not found</p>
          <Button onClick={() => navigate('/admin/knowledge-base')} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Knowledge Base
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/admin/knowledge-base')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{document.filename}</h1>
            <p className="text-sm text-muted-foreground">
              Uploaded {new Date(document.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <Badge variant={document.processing_status === 'completed' ? 'default' : 'secondary'}>
          {document.processing_status}
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{document.products.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Chunks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{document.chunks.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Images
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{document.images.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Entities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{document.document_entities.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Embeddings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{document.embeddings_count}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4" />
              Metadata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {document.metadata ? Object.keys(document.metadata).length : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Tabs */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products ({document.products.length})
          </TabsTrigger>
          <TabsTrigger value="chunks">
            <Grid3X3 className="h-4 w-4 mr-2" />
            Chunks ({document.chunks.length})
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="h-4 w-4 mr-2" />
            Images ({document.images.length})
          </TabsTrigger>
          <TabsTrigger value="entities">
            <FileCheck className="h-4 w-4 mr-2" />
            Entities ({document.document_entities.length})
          </TabsTrigger>
          <TabsTrigger value="metadata">
            <FileText className="h-4 w-4 mr-2" />
            Metadata
          </TabsTrigger>
        </TabsList>

        {/* Products Tab - Will be implemented in next chunk */}
        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Products</CardTitle>
              <CardDescription>
                Products identified and extracted from this document
              </CardDescription>
            </CardHeader>
            <CardContent>
              {document.products.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No products extracted from this document
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Metadata</TableHead>
                        <TableHead>Page Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {document.products.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell className="max-w-md truncate">
                            {product.description || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {product.metadata && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(product.metadata).slice(0, 3).map(([key, value]) => (
                                  <Badge key={key} variant="outline" className="text-xs">
                                    {key}: {String(value).substring(0, 20)}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {product.page_range || 'N/A'}
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

        {/* Chunks Tab */}
        <TabsContent value="chunks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Chunks</CardTitle>
              <CardDescription>
                Text chunks created from this document for RAG processing
              </CardDescription>
            </CardHeader>
            <CardContent>
              {document.chunks.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No chunks created from this document
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Content Preview</TableHead>
                        <TableHead>Page</TableHead>
                        <TableHead>Metadata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {document.chunks.map((chunk) => (
                        <TableRow key={chunk.id}>
                          <TableCell>
                            <Badge variant="outline">{chunk.category || 'general'}</Badge>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{chunk.content?.substring(0, 100)}...</p>
                          </TableCell>
                          <TableCell>{chunk.page_number || 'N/A'}</TableCell>
                          <TableCell>
                            {chunk.metadata && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(chunk.metadata).slice(0, 2).map(([key, value]) => (
                                  <Badge key={key} variant="secondary" className="text-xs">
                                    {key}
                                  </Badge>
                                ))}
                              </div>
                            )}
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

        {/* Images Tab */}
        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Images</CardTitle>
              <CardDescription>
                Images extracted from this document with metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              {document.images.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No images extracted from this document
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {document.images.map((image) => (
                    <Card key={image.id}>
                      <CardContent className="p-4">
                        {image.image_url && (
                          <img
                            src={image.image_url}
                            alt={image.description || 'Document image'}
                            className="w-full h-48 object-cover rounded-md mb-3"
                          />
                        )}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline">{image.category || 'general'}</Badge>
                            <span className="text-xs text-muted-foreground">
                              Page {image.page_number || 'N/A'}
                            </span>
                          </div>
                          {image.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {image.description}
                            </p>
                          )}
                          {image.metadata && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(image.metadata).slice(0, 3).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {String(value).substring(0, 15)}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Document Entities Tab */}
        <TabsContent value="entities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Entities</CardTitle>
              <CardDescription>
                Certificates, logos, specifications, and other entities extracted
              </CardDescription>
            </CardHeader>
            <CardContent>
              {document.document_entities.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No document entities extracted
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Factory/Group</TableHead>
                        <TableHead>Page Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {document.document_entities.map((entity) => (
                        <TableRow key={entity.id}>
                          <TableCell>
                            <Badge>{entity.entity_type}</Badge>
                          </TableCell>
                          <TableCell className="font-medium">{entity.name}</TableCell>
                          <TableCell className="max-w-md truncate">
                            {entity.description || 'N/A'}
                          </TableCell>
                          <TableCell>
                            {entity.factory_name && (
                              <div className="space-y-1">
                                <Badge variant="outline">{entity.factory_name}</Badge>
                                {entity.factory_group && (
                                  <Badge variant="secondary" className="ml-1">
                                    {entity.factory_group}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{entity.page_range || 'N/A'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metadata Tab */}
        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Metadata</CardTitle>
              <CardDescription>
                Complete metadata and processing information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Document ID</p>
                    <p className="text-sm font-mono">{document.id}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Filename</p>
                    <p className="text-sm">{document.filename}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <Badge variant={document.processing_status === 'completed' ? 'default' : 'secondary'}>
                      {document.processing_status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Created At</p>
                    <p className="text-sm">{new Date(document.created_at).toLocaleString()}</p>
                  </div>
                </div>

                {document.metadata && Object.keys(document.metadata).length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-medium text-muted-foreground mb-3">
                      Additional Metadata
                    </p>
                    <div className="bg-muted rounded-lg p-4">
                      <pre className="text-xs overflow-x-auto">
                        {JSON.stringify(document.metadata, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{document.products.length}</p>
                    <p className="text-sm text-muted-foreground">Products</p>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{document.chunks.length}</p>
                    <p className="text-sm text-muted-foreground">Chunks</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{document.images.length}</p>
                    <p className="text-sm text-muted-foreground">Images</p>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <p className="text-2xl font-bold text-purple-600">{document.embeddings_count}</p>
                    <p className="text-sm text-muted-foreground">Embeddings</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PDFDocumentDetails;

