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
  Sparkles,
  EyeOff,
  Link,
  FileText,
  Tag,
  GitCompare,
  Loader2,
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
import { Progress } from '@/components/ui/progress';
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

  // MIVAA API Integration State
  const [relatedDocs, setRelatedDocs] = useState<any[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [documentSummary, setDocumentSummary] = useState('');
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [extractedEntities, setExtractedEntities] = useState<any[]>([]);
  const [extractingEntities, setExtractingEntities] = useState(false);
  const [selectedDocsForComparison, setSelectedDocsForComparison] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<any>(null);
  const [comparingDocs, setComparingDocs] = useState(false);

  const { toast } = useToast();

  // MIVAA API Integration Functions
  const fetchRelatedDocuments = async (documentId: string) => {
    setLoadingRelated(true);
    try {
      const response = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'get_related_documents',
          payload: {
            document_id: documentId,
            limit: 10,
            similarity_threshold: 0.7
          }
        }
      });

      if (response.data?.related_documents) {
        setRelatedDocs(response.data.related_documents);
      }
    } catch (error) {
      console.error('Error fetching related documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch related documents',
        variant: 'destructive',
      });
    } finally {
      setLoadingRelated(false);
    }
  };

  const generateDocumentSummary = async (documentId: string) => {
    setGeneratingSummary(true);
    try {
      const response = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'summarize_document',
          payload: {
            document_id: documentId,
            summary_type: 'comprehensive',
            max_length: 500,
            include_key_points: true
          }
        }
      });

      if (response.data?.summary) {
        setDocumentSummary(response.data.summary);

        // Save summary to database
        await supabase
          .from('enhanced_knowledge_base')
          .update({
            metadata: { summary: response.data.summary },
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        toast({
          title: 'Success',
          description: 'Document summary generated and saved',
        });
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate document summary',
        variant: 'destructive',
      });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const extractDocumentEntities = async (documentId: string) => {
    setExtractingEntities(true);
    try {
      const response = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'extract_entities',
          payload: {
            document_id: documentId,
            entity_types: ['PERSON', 'ORG', 'MATERIAL', 'LOCATION', 'DATE'],
            confidence_threshold: 0.8
          }
        }
      });

      if (response.data?.entities) {
        setExtractedEntities(response.data.entities);

        // Auto-populate metadata fields based on extracted entities
        const materialEntities = response.data.entities.filter((e: any) => e.type === 'MATERIAL');
        const tags = materialEntities.map((e: any) => e.text);

        await supabase
          .from('enhanced_knowledge_base')
          .update({
            semantic_tags: tags,
            metadata: { extracted_entities: response.data.entities },
            updated_at: new Date().toISOString()
          })
          .eq('id', documentId);

        toast({
          title: 'Success',
          description: 'Entities extracted and metadata updated',
        });
      }
    } catch (error) {
      console.error('Error extracting entities:', error);
      toast({
        title: 'Error',
        description: 'Failed to extract document entities',
        variant: 'destructive',
      });
    } finally {
      setExtractingEntities(false);
    }
  };

  const compareDocuments = async () => {
    if (selectedDocsForComparison.length < 2) return;

    setComparingDocs(true);
    try {
      const response = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'compare_documents',
          payload: {
            document_ids: selectedDocsForComparison,
            comparison_type: 'comprehensive',
            include_similarities: true,
            include_differences: true
          }
        }
      });

      if (response.data) {
        setComparisonResult(response.data);
        toast({
          title: 'Success',
          description: 'Document comparison completed',
        });
      }
    } catch (error) {
      console.error('Error comparing documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to compare documents',
        variant: 'destructive',
      });
    } finally {
      setComparingDocs(false);
    }
  };

  const fetchEntries = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      // Handle potential null values from database and map fields to KnowledgeEntry interface
      const processedData = (data || []).map((entry: any) => ({
        id: entry.id,
        title: entry.title || '',
        content: entry.content || '',
        content_type: entry.content_type || 'article',
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
        .from('enhanced_knowledge_base')
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
        .from('enhanced_knowledge_base')
        .update({
          title: updatedEntry.title || '',
          content: updatedEntry.content || '',
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
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="entries">📚 Documents</TabsTrigger>
            <TabsTrigger value="analysis">🔍 Analysis</TabsTrigger>
            <TabsTrigger value="comparison">⚖️ Comparison</TabsTrigger>
            <TabsTrigger value="entities">🏷️ Entities</TabsTrigger>
            <TabsTrigger value="viewer">📖 PDF Viewer</TabsTrigger>
            <TabsTrigger value="images">🖼️ Images</TabsTrigger>
            <TabsTrigger value="embeddings">🧠 Embeddings</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="space-y-4">
            {/* Metadata Toggle Control */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500" />
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
                  functionalMetadata: (entry.metadata as any)?.functional_metadata
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
                              <Sparkles className="h-3 w-3 mr-1" />
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
                              onClick={() => {
                                setSelectedEntry(entry);
                                // Fetch related documents and entities when selecting
                                fetchRelatedDocuments(entry.id);
                                extractDocumentEntities(entry.id);
                              }}
                              title="Analyze with MIVAA"
                            >
                              <Sparkles className="h-4 w-4" />
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

          <TabsContent value="analysis" className="space-y-4">
            {selectedEntry ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Related Documents Panel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Related Documents
                    </CardTitle>
                    <CardDescription>
                      Documents similar to "{selectedEntry.title}"
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loadingRelated ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Finding related documents...
                      </div>
                    ) : relatedDocs.length > 0 ? (
                      <div className="space-y-2">
                        {relatedDocs.map((doc: any) => (
                          <div key={doc.document_id} className="flex items-center justify-between p-2 border rounded">
                            <div>
                              <p className="font-medium">{doc.document_name || `Document ${doc.document_id}`}</p>
                              <p className="text-sm text-muted-foreground">
                                Similarity: {(doc.similarity_score * 100).toFixed(1)}%
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const relatedEntry = entries.find(e => e.id === doc.document_id);
                                if (relatedEntry) {
                                  setSelectedEntry(relatedEntry);
                                  fetchRelatedDocuments(relatedEntry.id);
                                }
                              }}
                            >
                              View
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground">No related documents found.</p>
                    )}
                  </CardContent>
                </Card>

                {/* Document Summary Panel */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Document Summary
                    </CardTitle>
                    <CardDescription>
                      AI-generated summary of document content
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <Button
                        onClick={() => generateDocumentSummary(selectedEntry.id)}
                        disabled={generatingSummary}
                        className="w-full"
                      >
                        {generatingSummary ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            Generating Summary...
                          </>
                        ) : (
                          'Generate Summary'
                        )}
                      </Button>
                      {documentSummary && (
                        <div className="p-4 bg-muted rounded-lg">
                          <p className="text-sm">{documentSummary}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Select a document from the Documents tab to analyze it with MIVAA
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const firstEntry = filteredEntries[0];
                      if (firstEntry) {
                        setSelectedEntry(firstEntry);
                        fetchRelatedDocuments(firstEntry.id);
                      }
                    }}
                  >
                    Analyze First Document
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <GitCompare className="h-4 w-4" />
                  Document Comparison
                </CardTitle>
                <CardDescription>
                  Compare multiple documents to identify similarities and differences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Select documents to compare:</Label>
                    <div className="mt-2 space-y-2">
                      {entries.slice(0, 10).map((entry) => (
                        <div key={entry.id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={`compare-${entry.id}`}
                            checked={selectedDocsForComparison.includes(entry.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedDocsForComparison([...selectedDocsForComparison, entry.id]);
                              } else {
                                setSelectedDocsForComparison(selectedDocsForComparison.filter(id => id !== entry.id));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor={`compare-${entry.id}`} className="text-sm">
                            {entry.title}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={compareDocuments}
                    disabled={comparingDocs || selectedDocsForComparison.length < 2}
                    className="w-full"
                  >
                    {comparingDocs ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Comparing Documents...
                      </>
                    ) : (
                      `Compare ${selectedDocsForComparison.length} Documents`
                    )}
                  </Button>

                  {comparisonResult && (
                    <div className="space-y-4 mt-6">
                      <div>
                        <h5 className="font-medium mb-2">Overall Similarity:</h5>
                        <Progress value={(comparisonResult.overall_similarity || 0) * 100} className="w-full" />
                        <p className="text-sm text-muted-foreground mt-1">
                          {((comparisonResult.overall_similarity || 0) * 100).toFixed(1)}% similar
                        </p>
                      </div>

                      {comparisonResult.similarities && (
                        <div>
                          <h5 className="font-medium mb-2">Key Similarities:</h5>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {comparisonResult.similarities.slice(0, 5).map((sim: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-green-500 mt-1">•</span>
                                {sim}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {comparisonResult.differences && (
                        <div>
                          <h5 className="font-medium mb-2">Key Differences:</h5>
                          <ul className="text-sm text-muted-foreground space-y-1">
                            {comparisonResult.differences.slice(0, 5).map((diff: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="text-red-500 mt-1">•</span>
                                {diff}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entities" className="space-y-4">
            {selectedEntry ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Extracted Entities
                  </CardTitle>
                  <CardDescription>
                    Named entities extracted from "{selectedEntry.title}"
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button
                      onClick={() => extractDocumentEntities(selectedEntry.id)}
                      disabled={extractingEntities}
                      className="w-full"
                    >
                      {extractingEntities ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Extracting Entities...
                        </>
                      ) : (
                        'Extract Entities'
                      )}
                    </Button>

                    {extractedEntities.length > 0 && (
                      <div className="space-y-4">
                        {['MATERIAL', 'PERSON', 'ORG', 'LOCATION', 'DATE'].map(type => {
                          const typeEntities = extractedEntities.filter((e: any) => e.type === type);
                          if (typeEntities.length === 0) return null;

                          return (
                            <div key={type}>
                              <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                                <Badge variant="outline">{type}S</Badge>
                                <span className="text-muted-foreground">({typeEntities.length})</span>
                              </h5>
                              <div className="flex flex-wrap gap-2">
                                {typeEntities.map((entity: any) => (
                                  <Badge
                                    key={entity.id || `${entity.text}-${entity.start}`}
                                    variant="secondary"
                                    className="cursor-pointer hover:bg-secondary/80"
                                    title={`Confidence: ${(entity.confidence * 100).toFixed(0)}%`}
                                  >
                                    {entity.text}
                                    <span className="ml-1 text-xs opacity-70">
                                      {(entity.confidence * 100).toFixed(0)}%
                                    </span>
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        <div className="mt-6 p-4 bg-muted rounded-lg">
                          <h5 className="font-medium text-sm mb-2">Auto-Generated Tags:</h5>
                          <p className="text-sm text-muted-foreground">
                            Material entities have been automatically added to the document's semantic tags.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <Tag className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">
                    Select a document from the Documents tab to extract entities
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const firstEntry = filteredEntries[0];
                      if (firstEntry) {
                        setSelectedEntry(firstEntry);
                        extractDocumentEntities(firstEntry.id);
                      }
                    }}
                  >
                    Extract from First Document
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="viewer" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-500" />
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
                <Sparkles className="h-5 w-5 text-amber-500" />
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
