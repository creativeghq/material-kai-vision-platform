import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  Download,
  Upload,
  Filter,
  RefreshCw,
  Image as ImageIcon,
  Zap,
  EyeOff,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FunctionalPropertySearch, type FunctionalPropertyFilters } from '../Search/FunctionalPropertySearch';

import EmbeddingGenerationPanel from './EmbeddingGenerationPanel';
import { KnowledgeBasePDFViewer } from '@/components/PDF/KnowledgeBasePDFViewer';

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  content_type: string;
  status: string;
  created_at: string;
  created_by: string;
  semantic_tags: string[];
  material_ids: string[];
  relevance_score: number;
  source_url?: string;
  pdf_url?: string; // PDF link for additional details
  metadata?: Record<string, unknown>; // Use Record for generic object type from database
}

const KnowledgeBaseManagement: React.FC = () => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [filteredEntries, setFilteredEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [contentTypeFilter, setContentTypeFilter] = useState('all');
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewerDialogOpen, setIsViewerDialogOpen] = useState(false);
  const [showFunctionalMetadata, setShowFunctionalMetadata] = useState(true);
  const [functionalPropertyFilters, setFunctionalPropertyFilters] = useState<FunctionalPropertyFilters>({
    searchQuery: '',
    activeCategories: [],
    propertyFilters: {},
  });
  const [showFunctionalSearch, setShowFunctionalSearch] = useState(false);
  const { toast } = useToast();

  const fetchEntries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Handle potential null values from database and map fields to KnowledgeEntry interface
      const processedData = (data || []).map(entry => ({
        id: entry.id,
        title: entry.name || '',
        content: entry.description || '',
        content_type: entry.category || 'material',
        status: 'active', // materials_catalog doesn't have status field
        created_at: entry.created_at || '',
        created_by: entry.created_by || '',
        semantic_tags: [], // materials_catalog doesn't have tags field
        material_ids: [entry.id],
        relevance_score: 0, // materials_catalog doesn't have confidence_score field
        source_url: '', // materials_catalog doesn't have source_url field
        pdf_url: '', // materials_catalog doesn't have pdf_url field
        metadata: entry.properties || {}, // Use properties as metadata
      }));
      setEntries(processedData as KnowledgeEntry[]);
    } catch (error) {
      console.error('Error fetching knowledge entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch knowledge base entries',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const filterEntries = useCallback(() => {
    let filtered = [...entries];

    // Standard text search
    if (searchTerm) {
      filtered = filtered.filter(entry =>
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.semantic_tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase())),
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.status === statusFilter);
    }

    // Content type filter
    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter(entry => entry.content_type === contentTypeFilter);
    }

    // Functional property filters
    if (functionalPropertyFilters.searchQuery) {
      const query = functionalPropertyFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(entry => {
        const functionalMetadata = (entry.metadata as Record<string, unknown>)?.functional_metadata;
        if (!functionalMetadata) return false;
        
        // Search in functional metadata content
        const metadataString = JSON.stringify(functionalMetadata).toLowerCase();
        return metadataString.includes(query);
      });
    }

    // Filter by active functional categories
  if (functionalPropertyFilters.activeCategories.length > 0) {
    filtered = filtered.filter(entry => {
      const functionalMetadata = (entry.metadata as Record<string, unknown>)?.functional_metadata;
      if (!functionalMetadata) return false;
      
      // Check if entry has data in any of the selected categories
      return functionalPropertyFilters.activeCategories.some(category => {
        const categoryData = (functionalMetadata as Record<string, unknown>)[category];
        return categoryData && typeof categoryData === 'object' && categoryData !== null && Object.keys(categoryData).length > 0;
      });
    });
  }

    setFilteredEntries(filtered);
  }, [entries, searchTerm, statusFilter, contentTypeFilter, functionalPropertyFilters]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    filterEntries();
  }, [filterEntries]);

  const handleDeleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('materials_catalog')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEntries(entries.filter(entry => entry.id !== id));
      toast({
        title: 'Success',
        description: 'Knowledge entry deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete knowledge entry',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateEntry = async (updatedEntry: Partial<KnowledgeEntry>) => {
    if (!selectedEntry) return;

    try {
      const { error } = await supabase
        .from('materials_catalog')
        .update({
          name: updatedEntry.title || '',
          description: updatedEntry.content || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedEntry.id);

      if (error) throw error;

      await fetchEntries();
      setIsEditDialogOpen(false);
      setSelectedEntry(null);

      toast({
        title: 'Success',
        description: 'Knowledge entry updated successfully',
      });
    } catch (error) {
      console.error('Error updating entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to update knowledge entry',
        variant: 'destructive',
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'published': return 'bg-green-500/20 text-green-600';
      case 'draft': return 'bg-yellow-500/20 text-yellow-600';
      case 'archived': return 'bg-gray-500/20 text-gray-600';
      default: return 'bg-blue-500/20 text-blue-600';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-2"
                onClick={() => navigate('/')}
              >
                <Search className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-2"
                onClick={() => navigate('/admin')}
              >
                <Filter className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Knowledge Base Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage knowledge base entries and data with functional metadata integration
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchEntries} className="border border-border bg-background text-foreground h-8 px-3 text-sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button className="bg-primary text-primary-foreground h-8 px-3 text-sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        <Tabs defaultValue="entries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="entries">Knowledge Entries</TabsTrigger>
            <TabsTrigger value="viewer">Enhanced PDF Viewer</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="embeddings">Embedding Generation</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="space-y-4">
            {/* Metadata Toggle Control */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Functional Metadata Display</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFunctionalMetadata(!showFunctionalMetadata)}
                    className="flex items-center gap-2"
                  >
                    {showFunctionalMetadata ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showFunctionalMetadata ? 'Hide' : 'Show'} Metadata
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Toggle functional metadata display in PDF viewer and entry details
                </p>
              </CardContent>
            </Card>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Search & Filters</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search entries..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="article">Article</SelectItem>
                      <SelectItem value="research">Research</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="specification">Specification</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="flex gap-2">
                    <Button className="border border-border bg-background text-foreground h-8 px-3 text-sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button className="border border-border bg-background text-foreground h-8 px-3 text-sm">
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Functional Property Search Integration */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">Functional Property Search</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFunctionalSearch(!showFunctionalSearch)}
                    className="flex items-center gap-2"
                  >
                    {showFunctionalSearch ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {showFunctionalSearch ? 'Hide' : 'Show'} Functional Search
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Search materials by functional properties (slip resistance, thermal properties, etc.)
                </p>
              </CardContent>
            </Card>

            {/* Functional Property Search Component */}
            {showFunctionalSearch && (
              <FunctionalPropertySearch
                filters={functionalPropertyFilters}
                onFiltersChange={setFunctionalPropertyFilters}
                availableMaterials={entries.map(entry => ({
                  id: entry.id,
                  functionalMetadata: (entry.metadata as Record<string, unknown>)?.functional_metadata
                }))}
                displayMode="compact"
                isLoading={loading}
              />
            )}

            {/* Entries Table */}
            <Card>
              <CardHeader>
                <CardTitle>Knowledge Entries ({filteredEntries.length})</CardTitle>
                <CardDescription>
                  Manage and view all knowledge base entries with functional metadata integration
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Functional Metadata</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{entry.title}</div>
                            <div className="text-sm text-muted-foreground">
                              {entry.semantic_tags?.slice(0, 3).map(tag => (
                                <Badge key={tag} className="border border-border bg-background text-foreground mr-1 text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="border border-border bg-background text-foreground">{entry.content_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(entry.status)}>
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(entry.metadata as Record<string, unknown>)?.functional_metadata ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              <Zap className="h-3 w-3 mr-1" />
                              Available
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not available</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(entry.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              className="border border-border bg-background text-foreground h-8 px-3 text-sm"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setIsViewerDialogOpen(true);
                              }}
                              title="View with Functional Metadata"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              className="border border-border bg-background text-foreground h-8 px-3 text-sm"
                              onClick={() => {
                                setSelectedEntry(entry);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              className="border border-border bg-background text-foreground h-8 px-3 text-sm"
                              onClick={() => handleDeleteEntry(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="viewer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Enhanced PDF Viewer with Functional Metadata
                </CardTitle>
                <CardDescription>
                  Select an entry below to view it with integrated functional metadata display
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedEntry ? (
                  <KnowledgeBasePDFViewer
                    entry={selectedEntry}
                    showMetadata={showFunctionalMetadata}
                    onChunkClick={(chunk) => {
                      toast({
                        title: 'Chunk Selected',
                        description: `Selected ${chunk.chunkType} from page ${chunk.pageNumber}`,
                      });
                    }}
                    onPropertyClick={(category, property, value) => {
                      toast({
                        title: 'Property Clicked',
                        description: `${category}.${property}: ${String(value)}`,
                      });
                    }}
                  />
                ) : (
                  <div className="text-center py-12">
                    <Eye className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-4">
                      Click &quot;View&quot; on any entry above to see the enhanced PDF viewer with functional metadata
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const firstEntry = filteredEntries[0];
                        if (firstEntry) {
                          setSelectedEntry(firstEntry);
                        }
                      }}
                    >
                      Select First Entry
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="images" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  Extracted Images
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Process some PDF documents first to see extracted images here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embeddings" className="space-y-4">
            <EmbeddingGenerationPanel />
          </TabsContent>
        </Tabs>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Knowledge Entry</DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    defaultValue={selectedEntry.title}
                    onChange={(e) => setSelectedEntry({...selectedEntry, title: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="content">Content</Label>
                  <Textarea
                    id="content"
                    defaultValue={selectedEntry.content}
                    rows={8}
                    onChange={(e) => setSelectedEntry({...selectedEntry, content: e.target.value})}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => handleUpdateEntry(selectedEntry)}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* PDF Viewer Dialog */}
        <Dialog open={isViewerDialogOpen} onOpenChange={setIsViewerDialogOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Enhanced PDF Viewer with Functional Metadata
              </DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <KnowledgeBasePDFViewer
                entry={selectedEntry}
                showMetadata={showFunctionalMetadata}
                onChunkClick={(chunk) => {
                  toast({
                    title: 'Chunk Selected',
                    description: `Selected ${chunk.chunkType} from page ${chunk.pageNumber}`,
                  });
                }}
                onPropertyClick={(category, property, value) => {
                  toast({
                    title: 'Property Clicked',
                    description: `${category}.${property}: ${String(value)}`,
                  });
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default KnowledgeBaseManagement;
