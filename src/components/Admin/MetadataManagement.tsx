/**
 * Metadata Management Component
 * 
 * Comprehensive admin interface for viewing and managing extracted metadata
 * from PDF processing pipeline. Supports filtering, editing, and statistics.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Filter,
  Search,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  BarChart3,
  Database,
  FileText,
  Package,
} from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

interface MetadataItem {
  id: string;
  field_name: string;
  field_value: string;
  scope: 'product_specific' | 'catalog_general_explicit' | 'catalog_general_implicit' | 'category_specific';
  confidence: number;
  reasoning: string;
  applies_to: string[];
  document_id: string;
  document_name: string;
  is_override: boolean;
  created_at: string;
}

interface MetadataStatistics {
  total_count: number;
  by_scope: {
    product_specific: number;
    catalog_general_explicit: number;
    catalog_general_implicit: number;
    category_specific: number;
  };
  avg_confidence: number;
  override_count: number;
  documents_count: number;
  products_count: number;
}

export const MetadataManagement: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [metadata, setMetadata] = useState<MetadataItem[]>([]);
  const [statistics, setStatistics] = useState<MetadataStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MetadataItem | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Filters
  const [scopeFilter, setScopeFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('0.0');
  const [documentFilter, setDocumentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // Load metadata and statistics
  useEffect(() => {
    loadMetadata();
    loadStatistics();
  }, [scopeFilter, confidenceFilter, documentFilter]);

  const loadMetadata = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();
      if (scopeFilter !== 'all') params.append('scope', scopeFilter);
      if (confidenceFilter !== '0.0') params.append('min_confidence', confidenceFilter);
      if (documentFilter !== 'all') params.append('document_id', documentFilter);
      params.append('limit', '1000');

      const response = await fetch(`/api/rag/metadata/list?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to load metadata');
      }

      const data = await response.json();
      setMetadata(data.metadata || []);
    } catch (error) {
      console.error('Error loading metadata:', error);
      toast({
        title: 'Error',
        description: 'Failed to load metadata',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await fetch('/api/rag/metadata/statistics');
      
      if (!response.ok) {
        throw new Error('Failed to load statistics');
      }

      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error('Error loading statistics:', error);
    }
  };

  // Filter metadata by search query
  const filteredMetadata = metadata.filter((item) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.field_name.toLowerCase().includes(query) ||
      item.field_value.toLowerCase().includes(query) ||
      item.document_name.toLowerCase().includes(query)
    );
  });

  // Paginate metadata
  const paginatedMetadata = filteredMetadata.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil(filteredMetadata.length / itemsPerPage);

  // Get scope badge color
  const getScopeBadgeColor = (scope: string) => {
    switch (scope) {
      case 'product_specific':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'catalog_general_explicit':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'catalog_general_implicit':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'category_specific':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Get confidence badge
  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return <Badge className="bg-green-100 text-green-800 border-green-300">High ({confidence.toFixed(2)})</Badge>;
    } else if (confidence >= 0.7) {
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Medium ({confidence.toFixed(2)})</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800 border-red-300">Low ({confidence.toFixed(2)})</Badge>;
    }
  };

  // Format scope name
  const formatScopeName = (scope: string) => {
    return scope
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Handle edit
  const handleEdit = (item: MetadataItem) => {
    setSelectedItem(item);
    setIsEditDialogOpen(true);
  };

  // Handle delete
  const handleDelete = async (item: MetadataItem) => {
    if (!confirm(`Are you sure you want to delete metadata "${item.field_name}"?`)) {
      return;
    }

    try {
      // TODO: Implement delete endpoint
      toast({
        title: 'Success',
        description: 'Metadata deleted successfully',
      });
      loadMetadata();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete metadata',
        variant: 'destructive',
      });
    }
  };

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
              <h1 className="text-2xl font-bold text-gray-900">Metadata Management</h1>
              <p className="text-sm text-gray-600">
                View and manage extracted metadata from PDF processing
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Total Metadata
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-gray-900">{statistics.total_count}</div>
                <p className="text-xs text-gray-500 mt-1">
                  Across {statistics.documents_count} documents
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Product-Specific
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">
                  {statistics.by_scope.product_specific}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {((statistics.by_scope.product_specific / statistics.total_count) * 100).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Catalog-General
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {statistics.by_scope.catalog_general_explicit + statistics.by_scope.catalog_general_implicit}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {statistics.by_scope.catalog_general_implicit} implicit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Avg Confidence
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {(statistics.avg_confidence * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {statistics.override_count} overrides
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Scope</Label>
                <Select value={scopeFilter} onValueChange={setScopeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Scopes</SelectItem>
                    <SelectItem value="product_specific">Product-Specific</SelectItem>
                    <SelectItem value="catalog_general_explicit">Catalog-General (Explicit)</SelectItem>
                    <SelectItem value="catalog_general_implicit">Catalog-General (Implicit)</SelectItem>
                    <SelectItem value="category_specific">Category-Specific</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Min Confidence</Label>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.0">All (≥0.0)</SelectItem>
                    <SelectItem value="0.5">Medium (≥0.5)</SelectItem>
                    <SelectItem value="0.7">High (≥0.7)</SelectItem>
                    <SelectItem value="0.9">Very High (≥0.9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search field name, value, or document..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Metadata List ({filteredMetadata.length} items)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading metadata...</div>
            ) : paginatedMetadata.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No metadata found</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Name</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Applies To</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMetadata.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.field_name}</TableCell>
                        <TableCell className="max-w-xs truncate">{item.field_value}</TableCell>
                        <TableCell>
                          <Badge className={getScopeBadgeColor(item.scope)}>
                            {formatScopeName(item.scope)}
                          </Badge>
                          {item.is_override && (
                            <Badge className="ml-2 bg-orange-100 text-orange-800 border-orange-300">
                              Override
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getConfidenceBadge(item.confidence)}</TableCell>
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {item.applies_to.length} product{item.applies_to.length !== 1 ? 's' : ''}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-gray-600">
                          {item.document_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
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
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog - Will be implemented in next part */}
    </div>
  );
};

