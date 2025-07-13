import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import EmbeddingGenerationPanel from './EmbeddingGenerationPanel';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  ExternalLink,
  Image,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  metadata?: any; // Use any for now to handle Json type from database
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
  const { toast } = useToast();

  useEffect(() => {
    fetchEntries();
  }, []);

  useEffect(() => {
    filterEntries();
  }, [entries, searchTerm, statusFilter, contentTypeFilter]);

  const fetchEntries = async () => {
    try {
      const { data, error } = await supabase
        .from('enhanced_knowledge_base')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error fetching knowledge entries:', error);
      toast({
        title: "Error",
        description: "Failed to fetch knowledge base entries",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const filterEntries = () => {
    let filtered = entries;

    if (searchTerm) {
      filtered = filtered.filter(entry => 
        entry.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.semantic_tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(entry => entry.status === statusFilter);
    }

    if (contentTypeFilter !== 'all') {
      filtered = filtered.filter(entry => entry.content_type === contentTypeFilter);
    }

    setFilteredEntries(filtered);
  };

  const handleDeleteEntry = async (id: string) => {
    try {
      const { error } = await supabase
        .from('enhanced_knowledge_base')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setEntries(entries.filter(entry => entry.id !== id));
      toast({
        title: "Success",
        description: "Knowledge entry deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting entry:', error);
      toast({
        title: "Error", 
        description: "Failed to delete knowledge entry",
        variant: "destructive"
      });
    }
  };

  const handleUpdateEntry = async (updatedEntry: Partial<KnowledgeEntry>) => {
    if (!selectedEntry) return;

    try {
      const { error } = await supabase
        .from('enhanced_knowledge_base')
        .update({
          title: updatedEntry.title,
          content: updatedEntry.content,
          status: updatedEntry.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedEntry.id);

      if (error) throw error;

      await fetchEntries();
      setIsEditDialogOpen(false);
      setSelectedEntry(null);
      
      toast({
        title: "Success",
        description: "Knowledge entry updated successfully"
      });
    } catch (error) {
      console.error('Error updating entry:', error);
      toast({
        title: "Error",
        description: "Failed to update knowledge entry",
        variant: "destructive"
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
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Search className="h-4 w-4" />
                Back to Main
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2"
              >
                <Filter className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Knowledge Base Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage knowledge base entries and data
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchEntries} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="default" size="sm">
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
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="embeddings">Embedding Generation</TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="space-y-4">

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
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card>
        <CardHeader>
          <CardTitle>Knowledge Entries ({filteredEntries.length})</CardTitle>
          <CardDescription>
            Manage and view all knowledge base entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PDF Link</TableHead>
                <TableHead>HTML Link</TableHead>
                <TableHead>Relevance</TableHead>
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
                          <Badge key={tag} variant="outline" className="mr-1 text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{entry.content_type}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(entry.status)}>
                      {entry.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {entry.metadata?.storage_info?.pdf_storage_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => window.open(entry.metadata.storage_info.pdf_storage_url, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View PDF
                      </Button>
                    ) : entry.source_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => window.open(entry.source_url, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Source
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">No link</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.metadata?.storage_info?.html_storage_url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1"
                        onClick={() => window.open(entry.metadata.storage_info.html_storage_url, '_blank')}
                      >
                        <ExternalLink className="h-3 w-3" />
                        View HTML
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">No HTML</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${(entry.relevance_score || 0) * 100}%` }}
                        />
                      </div>
                      <span className="ml-2 text-sm">
                        {((entry.relevance_score || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {new Date(entry.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedEntry(entry);
                          setIsEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
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
              <div>
                <Label htmlFor="status">Status</Label>
                <Select 
                  defaultValue={selectedEntry.status}
                  onValueChange={(value) => setSelectedEntry({...selectedEntry, status: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-end gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsEditDialogOpen(false)}
                >
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
          
          </TabsContent>

          <TabsContent value="images" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Image className="h-5 w-5" />
                  Extracted Images Library
                </CardTitle>
                <CardDescription>
                  Browse and manage images extracted from PDF documents for OCR and visual recognition
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Extract all images from entries with processed images
                  const allImages = entries.flatMap(entry => {
                    if (!entry.metadata?.processed_images) return [];
                    return entry.metadata.processed_images.map((img: any) => ({
                      ...img,
                      sourceTitle: entry.title,
                      sourceId: entry.id,
                      sourceType: entry.content_type,
                      createdAt: entry.created_at
                    }));
                  });

                  if (allImages.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-medium mb-2">No Images Found</h3>
                        <p className="text-muted-foreground mb-4">
                          Process some PDF documents first to see extracted images here.
                        </p>
                        <Button 
                          variant="outline"
                          onClick={() => navigate('/admin/pdf-processing')}
                        >
                          Go to PDF Processing
                        </Button>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-6">
                      {/* Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Image className="h-4 w-4 text-blue-600" />
                              <div>
                                <p className="text-sm text-muted-foreground">Total Images</p>
                                <p className="text-2xl font-bold">{allImages.length}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Zap className="h-4 w-4 text-green-600" />
                              <div>
                                <p className="text-sm text-muted-foreground">Ready for OCR</p>
                                <p className="text-2xl font-bold">{allImages.length}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4 text-purple-600" />
                              <div>
                                <p className="text-sm text-muted-foreground">Visual Analysis</p>
                                <p className="text-2xl font-bold">Available</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-2">
                              <Search className="h-4 w-4 text-orange-600" />
                              <div>
                                <p className="text-sm text-muted-foreground">Similarity Search</p>
                                <p className="text-2xl font-bold">Future</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Images Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {allImages.map((image: any, index: number) => (
                          <Card key={`${image.sourceId}-${index}`} className="overflow-hidden">
                            <div className="aspect-square bg-muted relative">
                              <img
                                src={image.supabase_url}
                                alt={image.filename}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.src = '/placeholder.svg';
                                }}
                              />
                              <div className="absolute top-2 right-2">
                                <Badge variant="secondary" className="text-xs">
                                  {image.size ? `${(image.size / 1024).toFixed(1)}KB` : 'Unknown'}
                                </Badge>
                              </div>
                            </div>
                            <CardContent className="p-3">
                              <div className="space-y-2">
                                <div>
                                  <p className="font-medium text-sm truncate" title={image.filename}>
                                    {image.filename}
                                  </p>
                                  <p className="text-xs text-muted-foreground truncate" title={image.sourceTitle}>
                                    From: {image.sourceTitle}
                                  </p>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs flex-1"
                                    onClick={() => window.open(image.supabase_url, '_blank')}
                                  >
                                    <ExternalLink className="h-3 w-3 mr-1" />
                                    View
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      navigator.clipboard.writeText(image.supabase_url);
                                      toast({
                                        title: "Copied!",
                                        description: "Image URL copied to clipboard"
                                      });
                                    }}
                                  >
                                    Copy URL
                                  </Button>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <div>Source Type: <Badge variant="outline" className="text-xs">{image.sourceType}</Badge></div>
                                  <div>Extracted: {new Date(image.createdAt).toLocaleDateString()}</div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Future Features Section */}
                      <Card className="border-dashed">
                        <CardContent className="p-6 text-center space-y-4">
                          <h3 className="text-lg font-medium">🚀 Coming Soon: Advanced Image Analysis</h3>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div className="space-y-2">
                              <div className="h-8 w-8 mx-auto bg-blue-100 rounded-full flex items-center justify-center">
                                <Eye className="h-4 w-4 text-blue-600" />
                              </div>
                              <h4 className="font-medium">OCR Text Extraction</h4>
                              <p className="text-muted-foreground">Extract text from images for searchable content</p>
                            </div>
                            <div className="space-y-2">
                              <div className="h-8 w-8 mx-auto bg-green-100 rounded-full flex items-center justify-center">
                                <Search className="h-4 w-4 text-green-600" />
                              </div>
                              <h4 className="font-medium">Visual Similarity</h4>
                              <p className="text-muted-foreground">Find similar tiles, textures, and materials</p>
                            </div>
                            <div className="space-y-2">
                              <div className="h-8 w-8 mx-auto bg-purple-100 rounded-full flex items-center justify-center">
                                <Zap className="h-4 w-4 text-purple-600" />
                              </div>
                              <h4 className="font-medium">AI Material Recognition</h4>
                              <p className="text-muted-foreground">Automatically identify materials and properties</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embeddings" className="space-y-4">
            <EmbeddingGenerationPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default KnowledgeBaseManagement;