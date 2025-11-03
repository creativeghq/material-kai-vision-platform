/**
 * Relevancy Management Component
 * 
 * Comprehensive admin interface for viewing and managing entity relationships
 * (Chunk→Product, Product→Image, Chunk→Image) with relevance scoring details.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Filter,
  Search,
  Trash2,
  Link2,
  Image as ImageIcon,
  FileText,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ChunkProductRelationship {
  id: string;
  chunk_id: string;
  product_id: string;
  chunk_content: string;
  product_name: string;
  relationship_type: 'source' | 'related' | 'component' | 'alternative';
  relevance_score: number;
  created_at: string;
}

interface ProductImageRelationship {
  id: string;
  product_id: string;
  image_id: string;
  product_name: string;
  image_url: string;
  relationship_type: 'depicts' | 'illustrates' | 'variant' | 'related';
  relevance_score: number;
  created_at: string;
}

interface ChunkImageRelationship {
  id: string;
  chunk_id: string;
  image_id: string;
  chunk_content: string;
  image_url: string;
  relationship_type: 'illustrates' | 'depicts' | 'related' | 'example';
  relevance_score: number;
  created_at: string;
}

export const RelevancyManagement: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState<'chunk-product' | 'product-image' | 'chunk-image'>('chunk-product');
  const [chunkProductRels, setChunkProductRels] = useState<ChunkProductRelationship[]>([]);
  const [productImageRels, setProductImageRels] = useState<ProductImageRelationship[]>([]);
  const [chunkImageRels, setChunkImageRels] = useState<ChunkImageRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRel, setSelectedRel] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);

  // Filters
  const [minScore, setMinScore] = useState<string>('0.0');
  const [relationshipType, setRelationshipType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Statistics
  const [stats, setStats] = useState({
    chunkProduct: { total: 0, avgScore: 0 },
    productImage: { total: 0, avgScore: 0 },
    chunkImage: { total: 0, avgScore: 0 },
  });

  // Load relationships
  useEffect(() => {
    loadRelationships();
  }, [activeTab, minScore, relationshipType]);

  const loadRelationships = async () => {
    try {
      setLoading(true);

      if (activeTab === 'chunk-product') {
        await loadChunkProductRelationships();
      } else if (activeTab === 'product-image') {
        await loadProductImageRelationships();
      } else {
        await loadChunkImageRelationships();
      }
    } catch (error) {
      console.error('Error loading relationships:', error);
      toast({
        title: 'Error',
        description: 'Failed to load relationships',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadChunkProductRelationships = async () => {
    let query = supabase
      .from('chunk_product_relationships')
      .select(`
        id,
        chunk_id,
        product_id,
        relationship_type,
        relevance_score,
        created_at,
        document_chunks!inner(content),
        products!inner(name)
      `)
      .gte('relevance_score', parseFloat(minScore))
      .order('relevance_score', { ascending: false })
      .limit(1000);

    if (relationshipType !== 'all') {
      query = query.eq('relationship_type', relationshipType);
    }

    const { data, error } = await query;

    if (error) throw error;

    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      chunk_id: item.chunk_id,
      product_id: item.product_id,
      chunk_content: item.document_chunks?.content || '',
      product_name: item.products?.name || '',
      relationship_type: item.relationship_type,
      relevance_score: item.relevance_score,
      created_at: item.created_at,
    }));

    setChunkProductRels(formatted);

    // Calculate stats
    const avgScore = formatted.reduce((sum: number, r: ChunkProductRelationship) => sum + r.relevance_score, 0) / (formatted.length || 1);
    setStats((prev) => ({
      ...prev,
      chunkProduct: { total: formatted.length, avgScore },
    }));
  };

  const loadProductImageRelationships = async () => {
    let query = supabase
      .from('product_image_relationships')
      .select(`
        id,
        product_id,
        image_id,
        relationship_type,
        relevance_score,
        created_at,
        products!inner(name),
        document_images!inner(image_url)
      `)
      .gte('relevance_score', parseFloat(minScore))
      .order('relevance_score', { ascending: false })
      .limit(1000);

    if (relationshipType !== 'all') {
      query = query.eq('relationship_type', relationshipType);
    }

    const { data, error } = await query;

    if (error) throw error;

    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      image_id: item.image_id,
      product_name: item.products?.name || '',
      image_url: item.document_images?.image_url || '',
      relationship_type: item.relationship_type,
      relevance_score: item.relevance_score,
      created_at: item.created_at,
    }));

    setProductImageRels(formatted);

    // Calculate stats
    const avgScore = formatted.reduce((sum: number, r: ProductImageRelationship) => sum + r.relevance_score, 0) / (formatted.length || 1);
    setStats((prev) => ({
      ...prev,
      productImage: { total: formatted.length, avgScore },
    }));
  };

  const loadChunkImageRelationships = async () => {
    let query = supabase
      .from('chunk_image_relationships')
      .select(`
        id,
        chunk_id,
        image_id,
        relationship_type,
        relevance_score,
        created_at,
        document_chunks!inner(content),
        document_images!inner(image_url)
      `)
      .gte('relevance_score', parseFloat(minScore))
      .order('relevance_score', { ascending: false })
      .limit(1000);

    if (relationshipType !== 'all') {
      query = query.eq('relationship_type', relationshipType);
    }

    const { data, error } = await query;

    if (error) throw error;

    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      chunk_id: item.chunk_id,
      image_id: item.image_id,
      chunk_content: item.document_chunks?.content || '',
      image_url: item.document_images?.image_url || '',
      relationship_type: item.relationship_type,
      relevance_score: item.relevance_score,
      created_at: item.created_at,
    }));

    setChunkImageRels(formatted);

    // Calculate stats
    const avgScore = formatted.reduce((sum: number, r: ChunkImageRelationship) => sum + r.relevance_score, 0) / (formatted.length || 1);
    setStats((prev) => ({
      ...prev,
      chunkImage: { total: formatted.length, avgScore },
    }));
  };

  // Get relevance badge
  const getRelevanceBadge = (score: number) => {
    if (score >= 0.8) {
      return <Badge className="bg-green-100 text-green-800 border-green-300">High ({(score * 100).toFixed(0)}%)</Badge>;
    } else if (score >= 0.6) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Medium ({(score * 100).toFixed(0)}%)</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Low ({(score * 100).toFixed(0)}%)</Badge>;
    }
  };

  // Get relationship type badge
  const getRelTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      source: 'bg-blue-100 text-blue-800 border-blue-300',
      depicts: 'bg-purple-100 text-purple-800 border-purple-300',
      illustrates: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      related: 'bg-gray-100 text-gray-800 border-gray-300',
      component: 'bg-orange-100 text-orange-800 border-orange-300',
      alternative: 'bg-pink-100 text-pink-800 border-pink-300',
      variant: 'bg-teal-100 text-teal-800 border-teal-300',
      example: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    };

    return (
      <Badge className={colors[type] || colors.related}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  // Handle view details
  const handleViewDetails = (rel: any) => {
    setSelectedRel(rel);
    setIsDetailDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async (id: string, table: string) => {
    if (!confirm('Are you sure you want to delete this relationship?')) {
      return;
    }

    try {
      const { error } = await supabase.from(table).delete().eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Relationship deleted successfully',
      });
      loadRelationships();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete relationship',
        variant: 'destructive',
      });
    }
  };

  // Filter data by search
  const filterBySearch = (items: any[]) => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    
    return items.filter((item) => {
      if ('chunk_content' in item && item.chunk_content.toLowerCase().includes(query)) return true;
      if ('product_name' in item && item.product_name.toLowerCase().includes(query)) return true;
      if ('relationship_type' in item && item.relationship_type.toLowerCase().includes(query)) return true;
      return false;
    });
  };

  // Get current data based on active tab
  const getCurrentData = () => {
    switch (activeTab) {
      case 'chunk-product':
        return filterBySearch(chunkProductRels);
      case 'product-image':
        return filterBySearch(productImageRels);
      case 'chunk-image':
        return filterBySearch(chunkImageRels);
      default:
        return [];
    }
  };

  const currentData = getCurrentData();
  const paginatedData = currentData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  const totalPages = Math.ceil(currentData.length / itemsPerPage);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/admin')}
              className="border border-gray-300 bg-white text-gray-700"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div className="h-6 w-px bg-gray-300" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Relevancy Management</h1>
              <p className="text-sm text-gray-600">
                View and manage entity relationships with relevance scoring
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Chunk → Product
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.chunkProduct.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.chunkProduct.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Product → Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.productImage.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.productImage.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Chunk → Image
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.chunkImage.total}</div>
              <p className="text-xs text-gray-500 mt-1">
                Avg Score: {(stats.chunkImage.avgScore * 100).toFixed(1)}%
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Min Relevance Score</Label>
                <Select value={minScore} onValueChange={setMinScore}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.0">All (≥0%)</SelectItem>
                    <SelectItem value="0.5">Medium (≥50%)</SelectItem>
                    <SelectItem value="0.7">High (≥70%)</SelectItem>
                    <SelectItem value="0.9">Very High (≥90%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Relationship Type</Label>
                <Select value={relationshipType} onValueChange={setRelationshipType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {activeTab === 'chunk-product' && (
                      <>
                        <SelectItem value="source">Source</SelectItem>
                        <SelectItem value="related">Related</SelectItem>
                        <SelectItem value="component">Component</SelectItem>
                        <SelectItem value="alternative">Alternative</SelectItem>
                      </>
                    )}
                    {activeTab === 'product-image' && (
                      <>
                        <SelectItem value="depicts">Depicts</SelectItem>
                        <SelectItem value="illustrates">Illustrates</SelectItem>
                        <SelectItem value="variant">Variant</SelectItem>
                        <SelectItem value="related">Related</SelectItem>
                      </>
                    )}
                    {activeTab === 'chunk-image' && (
                      <>
                        <SelectItem value="illustrates">Illustrates</SelectItem>
                        <SelectItem value="depicts">Depicts</SelectItem>
                        <SelectItem value="related">Related</SelectItem>
                        <SelectItem value="example">Example</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search content or names..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Relationship Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>Entity Relationships</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="chunk-product">
                  <FileText className="h-4 w-4 mr-2" />
                  Chunk → Product ({stats.chunkProduct.total})
                </TabsTrigger>
                <TabsTrigger value="product-image">
                  <ImageIcon className="h-4 w-4 mr-2" />
                  Product → Image ({stats.productImage.total})
                </TabsTrigger>
                <TabsTrigger value="chunk-image">
                  <Link2 className="h-4 w-4 mr-2" />
                  Chunk → Image ({stats.chunkImage.total})
                </TabsTrigger>
              </TabsList>

              {/* Chunk → Product Tab */}
              <TabsContent value="chunk-product" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : paginatedData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chunk Content</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Relevance</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.map((rel: ChunkProductRelationship) => (
                          <TableRow key={rel.id}>
                            <TableCell className="max-w-md">
                              <div className="truncate text-sm">{rel.chunk_content}</div>
                            </TableCell>
                            <TableCell className="font-medium">{rel.product_name}</TableCell>
                            <TableCell>{getRelTypeBadge(rel.relationship_type)}</TableCell>
                            <TableCell>{getRelevanceBadge(rel.relevance_score)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewDetails(rel)}
                                >
                                  <BarChart3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(rel.id, 'chunk_product_relationships')}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </TabsContent>

              {/* Product → Image Tab */}
              <TabsContent value="product-image" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : paginatedData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>Image</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Relevance</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.map((rel: ProductImageRelationship) => (
                          <TableRow key={rel.id}>
                            <TableCell className="font-medium">{rel.product_name}</TableCell>
                            <TableCell>
                              <img
                                src={rel.image_url}
                                alt="Product"
                                className="h-12 w-12 object-cover rounded"
                              />
                            </TableCell>
                            <TableCell>{getRelTypeBadge(rel.relationship_type)}</TableCell>
                            <TableCell>{getRelevanceBadge(rel.relevance_score)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewDetails(rel)}
                                >
                                  <BarChart3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(rel.id, 'product_image_relationships')}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </TabsContent>

              {/* Chunk → Image Tab */}
              <TabsContent value="chunk-image" className="space-y-4">
                {loading ? (
                  <div className="text-center py-8 text-gray-500">Loading relationships...</div>
                ) : paginatedData.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">No relationships found</div>
                ) : (
                  <>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Chunk Content</TableHead>
                          <TableHead>Image</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Relevance</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedData.map((rel: ChunkImageRelationship) => (
                          <TableRow key={rel.id}>
                            <TableCell className="max-w-md">
                              <div className="truncate text-sm">{rel.chunk_content}</div>
                            </TableCell>
                            <TableCell>
                              <img
                                src={rel.image_url}
                                alt="Chunk"
                                className="h-12 w-12 object-cover rounded"
                              />
                            </TableCell>
                            <TableCell>{getRelTypeBadge(rel.relationship_type)}</TableCell>
                            <TableCell>{getRelevanceBadge(rel.relevance_score)}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewDetails(rel)}
                                >
                                  <BarChart3 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDelete(rel.id, 'chunk_image_relationships')}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-600">
                  Page {currentPage} of {totalPages} ({currentData.length} total)
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Details Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Relevance Score Breakdown</DialogTitle>
          </DialogHeader>
          {selectedRel && (
            <div className="space-y-4">
              <div>
                <Label>Overall Relevance Score</Label>
                <div className="flex items-center gap-4 mt-2">
                  <Progress value={selectedRel.relevance_score * 100} className="flex-1" />
                  <span className="text-lg font-bold">
                    {(selectedRel.relevance_score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Relationship Type</Label>
                  <div className="mt-2">{getRelTypeBadge(selectedRel.relationship_type)}</div>
                </div>
                <div>
                  <Label>Created</Label>
                  <div className="mt-2 text-sm text-gray-600">
                    {new Date(selectedRel.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {activeTab === 'chunk-product' && (
                <div className="space-y-2">
                  <Label>Scoring Algorithm Components</Label>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Page Proximity (40%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.4 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Embedding Similarity (30%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.3 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mention Score (30%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.3 * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'product-image' && (
                <div className="space-y-2">
                  <Label>Scoring Algorithm Components</Label>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Page Overlap (40%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.4 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Visual Similarity (40%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.4 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Detection Score (20%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.2 * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'chunk-image' && (
                <div className="space-y-2">
                  <Label>Scoring Algorithm Components</Label>
                  <div className="bg-gray-50 p-4 rounded-lg space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Same Page (50%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.5 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Visual-Text Similarity (30%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.3 * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Spatial Proximity (20%)</span>
                      <span className="font-medium">~{(selectedRel.relevance_score * 0.2 * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

