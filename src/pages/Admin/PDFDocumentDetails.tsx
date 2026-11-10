import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  FileText,
  Package,
  Image as ImageIcon,
  Grid3X3,
  Database,
  Sparkles,
  FileCheck,
  Loader2,
  Download,
  Building2,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, TABLE_PAGE_SIZE, paginate } from '@/components/core/ui/table-pagination';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubRecordPage } from '@/components/core/hub/HubRecordPage';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DocumentFactoriesCrmLinker } from '@/components/Admin/DocumentFactoriesCrmLinker';
import { MIVAA_API_URL } from '@/config/mivaa';
import { formatDate } from '@/utils/datetime';

const LIST_CAP = 1000;
const BREADCRUMBS_BASE = [
  { label: 'Admin', to: '/admin' },
  { label: 'Materials Data', to: '/admin/materials-data' },
];

interface DocumentRow {
  id: string;
  filename: string;
  processing_status: string;
  created_at: string;
  content_type: string | null;
  file_size: number | null;
  metadata: Record<string, unknown> | null;
}

interface Counted<T> {
  rows: T[];
  total: number;
}

const EMPTY: Counted<any> = { rows: [], total: 0 };

const statusVariant = (status: string) =>
  status === 'completed' ? 'success' : status === 'failed' ? 'error' : 'neutral';

export const PDFDocumentDetails: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [document, setDocument] = useState<DocumentRow | null>(null);
  const [products, setProducts] = useState<Counted<any>>(EMPTY);
  const [entities, setEntities] = useState<Counted<any>>(EMPTY);
  const [chunks, setChunks] = useState<Counted<any>>(EMPTY);
  const [images, setImages] = useState<Counted<any>>(EMPTY);
  const [embeddingsCount, setEmbeddingsCount] = useState(0);
  const [productsPage, setProductsPage] = useState(1);
  const [chunksPage, setChunksPage] = useState(1);
  const [imagesPage, setImagesPage] = useState(1);
  const [entitiesPage, setEntitiesPage] = useState(1);

  useEffect(() => {
    setProductsPage(1); setChunksPage(1); setImagesPage(1); setEntitiesPage(1);
  }, [documentId]);

  const fetchDocumentDetails = useCallback(async (id: string) => {
    try {
      setLoading(true);
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('id, filename, processing_status, created_at, content_type, file_size, metadata')
        .eq('id', id)
        .maybeSingle();
      if (docError) throw docError;

      const [productsRes, entitiesRes, embeddingsRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, metadata', { count: 'exact' })
          .eq('source_document_id', id)
          .order('name')
          .limit(LIST_CAP),
        supabase
          .from('document_entities')
          .select('id, entity_type, name, description, factory_name, factory_group, manufacturer, page_range', { count: 'exact' })
          .eq('source_document_id', id)
          .order('name')
          .limit(LIST_CAP),
        supabase
          .from('document_images')
          .select('id', { count: 'exact', head: true })
          .eq('document_id', id)
          .eq('has_slig_embedding', true),
      ]);

      setDocument(docData as DocumentRow | null);
      setProducts({ rows: productsRes.data ?? [], total: productsRes.count ?? 0 });
      setEntities({ rows: entitiesRes.data ?? [], total: entitiesRes.count ?? 0 });
      setEmbeddingsCount(embeddingsRes.count ?? 0);
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
  }, [toast]);

  useEffect(() => {
    if (documentId) void fetchDocumentDetails(documentId);
  }, [documentId, fetchDocumentDetails]);

  useEffect(() => {
    if (!documentId) return;
    const from = (chunksPage - 1) * TABLE_PAGE_SIZE;
    void supabase
      .from('document_chunks')
      .select('id, category, content, chunk_index, metadata', { count: 'exact' })
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true, nullsFirst: false })
      .range(from, from + TABLE_PAGE_SIZE - 1)
      .then(({ data, count }) => setChunks({ rows: data ?? [], total: count ?? 0 }));
  }, [documentId, chunksPage]);

  useEffect(() => {
    if (!documentId) return;
    const from = (imagesPage - 1) * TABLE_PAGE_SIZE;
    void supabase
      .from('document_images')
      .select('id, image_url, caption, category, page_number, metadata', { count: 'exact' })
      .eq('document_id', documentId)
      .order('page_number', { ascending: true, nullsFirst: false })
      .range(from, from + TABLE_PAGE_SIZE - 1)
      .then(({ data, count }) => setImages({ rows: data ?? [], total: count ?? 0 }));
  }, [documentId, imagesPage]);

  const handleExportImages = async () => {
    if (!documentId) return;

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
        `${MIVAA_API_URL}/api/images/export/${documentId}?format=PNG&quality=95&include_metadata=true`,
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

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `images_${documentId}.zip`;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!document) {
    return (
      <HubRecordPage
        icon={FileText}
        title="Document Not Found"
        breadcrumbs={[...BREADCRUMBS_BASE, { label: 'Not Found' }]}
        left={null}
      >
        <HubEmptyState
          icon={FileText}
          title="Document not found"
          description="It may have been deleted, or it belongs to another workspace."
          action={<Button asChild variant="outline"><Link to="/admin/materials-data">Back to Materials Data</Link></Button>}
        />
      </HubRecordPage>
    );
  }

  const metadataKeys = document.metadata ? Object.keys(document.metadata).length : 0;
  const truncatedNote = (c: Counted<unknown>, label: string) =>
    c.total > c.rows.length ? (
      <p className="px-4 pt-2 text-xs text-muted-foreground">
        Showing the first {c.rows.length} of {c.total} {label}.
      </p>
    ) : null;

  const summary: Array<{ label: string; value: number; icon: React.ComponentType<{ className?: string }> }> = [
    { label: 'Products', value: products.total, icon: Package },
    { label: 'Chunks', value: chunks.total, icon: Grid3X3 },
    { label: 'Images', value: images.total, icon: ImageIcon },
    { label: 'Entities', value: entities.total, icon: FileCheck },
    { label: 'Embedded Images', value: embeddingsCount, icon: Sparkles },
    { label: 'Metadata Keys', value: metadataKeys, icon: Database },
  ];

  const left = (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Document</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={statusVariant(document.processing_status)}>{document.processing_status}</Badge>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Uploaded</span>
            <span>{formatDate(document.created_at, { withTime: true })}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Type</span>
            <span>{document.content_type || '—'}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Size</span>
            <span className="tabular-nums">
              {document.file_size ? `${(document.file_size / 1024 / 1024).toFixed(1)} MB` : '—'}
            </span>
          </div>
          <div className="space-y-1 pt-1">
            <span className="text-muted-foreground">Document ID</span>
            <p className="break-all font-mono text-xs">{document.id}</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Extracted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {summary.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                {label}
              </span>
              <span className="font-semibold tabular-nums">{value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );

  return (
    <HubRecordPage
      icon={FileText}
      title={document.filename}
      subtitle={`Uploaded ${formatDate(document.created_at, { withTime: true })}`}
      breadcrumbs={[...BREADCRUMBS_BASE, { label: document.filename }]}
      left={left}
    >
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
          <TabsTrigger value="products">
            <Package className="h-4 w-4 mr-2" />
            Products ({products.total})
          </TabsTrigger>
          <TabsTrigger value="chunks">
            <Grid3X3 className="h-4 w-4 mr-2" />
            Chunks ({chunks.total})
          </TabsTrigger>
          <TabsTrigger value="images">
            <ImageIcon className="h-4 w-4 mr-2" />
            Images ({images.total})
          </TabsTrigger>
          <TabsTrigger value="entities">
            <FileCheck className="h-4 w-4 mr-2" />
            Entities ({entities.total})
          </TabsTrigger>
          <TabsTrigger value="businesses">
            <Building2 className="h-4 w-4 mr-2" />
            Businesses
          </TabsTrigger>
          <TabsTrigger value="metadata">
            <FileText className="h-4 w-4 mr-2" />
            Metadata
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Extracted Products</CardTitle>
              <CardDescription>
                Products identified and extracted from this document
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {products.rows.length === 0 ? (
                <HubEmptyState
                  icon={Package}
                  title="No products extracted from this document"
                  action={<Button asChild variant="outline"><Link to="/admin/data-import">Open Data Import</Link></Button>}
                />
              ) : (
                <>
                  {truncatedNote(products, 'products')}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Metadata</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginate(products.rows, productsPage).map((product) => (
                        <TableRow key={product.id}>
                          <TableCell className="font-medium">
                            <Link to={`/admin/materials-data?productId=${product.id}`} className="hover:underline">
                              {product.name}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-md truncate">
                            {product.description || '—'}
                          </TableCell>
                          <TableCell>
                            {product.metadata && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(product.metadata as Record<string, unknown>)
                                  .slice(0, 3)
                                  .map(([key, value]) => (
                                    <Badge key={key} variant="outline" className="text-xs">
                                      {key}: {String(value).substring(0, 20)}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination page={productsPage} total={products.rows.length} onPageChange={setProductsPage} label="products" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chunks" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Chunks</CardTitle>
              <CardDescription>
                Text chunks created from this document for RAG processing
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {chunks.total === 0 ? (
                <HubEmptyState
                  icon={Grid3X3}
                  title="No chunks created from this document"
                  action={<Button asChild variant="outline"><Link to="/admin/async-queue-monitor">Open Job Queue</Link></Button>}
                />
              ) : (
                <>
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
                      {chunks.rows.map((chunk) => (
                        <TableRow key={chunk.id}>
                          <TableCell>
                            <span className="text-xs text-muted-foreground capitalize">
                              {chunk.category || 'general'}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-md">
                            <p className="truncate">{chunk.content?.substring(0, 100)}</p>
                          </TableCell>
                          <TableCell className="tabular-nums">{chunk.metadata?.page_number ?? '—'}</TableCell>
                          <TableCell>
                            {chunk.metadata && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(chunk.metadata as Record<string, unknown>)
                                  .slice(0, 2)
                                  .map(([key, value]) => (
                                    <Badge key={key} variant="neutral" className="text-xs">
                                      {key}: {String(value).substring(0, 30)}
                                    </Badge>
                                  ))}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination page={chunksPage} total={chunks.total} onPageChange={setChunksPage} label="chunks" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Extracted Images</CardTitle>
                  <CardDescription>
                    Images extracted from this document with metadata
                  </CardDescription>
                </div>
                {images.total > 0 && (
                  <Button variant="outline" size="sm" onClick={() => { void handleExportImages(); }}>
                    <Download className="h-4 w-4 mr-2" />
                    Export All ({images.total})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {images.total === 0 ? (
                <HubEmptyState
                  icon={ImageIcon}
                  title="No images extracted from this document"
                  action={<Button asChild variant="outline"><Link to="/admin/async-queue-monitor">Open Job Queue</Link></Button>}
                />
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {images.rows.map((image) => (
                      <Card key={image.id}>
                        <CardContent className="p-4">
                          {image.image_url && (
                            <img
                              src={image.image_url}
                              alt={image.caption || 'Document image'}
                              loading="lazy"
                              className="w-full h-48 object-cover rounded-md mb-3"
                            />
                          )}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline">{image.category || 'general'}</Badge>
                              <span className="text-xs text-muted-foreground">
                                Page {image.page_number ?? '—'}
                              </span>
                            </div>
                            {image.caption && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{image.caption}</p>
                            )}
                            {image.metadata && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(image.metadata as Record<string, unknown>)
                                  .slice(0, 3)
                                  .map(([key, value]) => (
                                    <Badge key={key} variant="neutral" className="text-xs">
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
                  <TablePagination page={imagesPage} total={images.total} onPageChange={setImagesPage} label="images" className="mt-4" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="entities" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Entities</CardTitle>
              <CardDescription>
                Certificates, logos, specifications, and other entities extracted
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {entities.rows.length === 0 ? (
                <HubEmptyState
                  icon={FileCheck}
                  title="No document entities extracted"
                  action={<Button asChild variant="outline"><Link to="/admin/async-queue-monitor">Open Job Queue</Link></Button>}
                />
              ) : (
                <>
                  {truncatedNote(entities, 'entities')}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Brand/Group</TableHead>
                        <TableHead>Page Range</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginate(entities.rows, entitiesPage).map((entity) => (
                        <TableRow key={entity.id}>
                          <TableCell>
                            <span className="text-xs text-muted-foreground capitalize">{entity.entity_type}</span>
                          </TableCell>
                          <TableCell className="font-medium">{entity.name}</TableCell>
                          <TableCell className="max-w-md truncate">{entity.description || '—'}</TableCell>
                          <TableCell>
                            {entity.factory_name && (
                              <div className="space-y-1">
                                <Badge variant="outline">{entity.factory_name}</Badge>
                                {entity.factory_group && (
                                  <Badge variant="neutral" className="ml-1">{entity.factory_group}</Badge>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{entity.page_range || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination page={entitiesPage} total={entities.rows.length} onPageChange={setEntitiesPage} label="entities" />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="businesses" className="space-y-4">
          <DocumentFactoriesCrmLinker entities={entities.rows} products={products.rows} />
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Metadata</CardTitle>
              <CardDescription>Complete metadata and processing information</CardDescription>
            </CardHeader>
            <CardContent>
              {metadataKeys > 0 ? (
                <div className="bg-muted rounded-lg p-4">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(document.metadata, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">This document has no stored metadata.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </HubRecordPage>
  );
};

export default PDFDocumentDetails;
