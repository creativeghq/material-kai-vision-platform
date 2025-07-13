import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Database, 
  Search, 
  ExternalLink,
  CheckCircle,
  Info
} from 'lucide-react';
import { AddKnowledgeEntry } from '@/components/RAG/AddKnowledgeEntry';
import { EnhancedRAGInterface } from '@/components/RAG/EnhancedRAGInterface';
import { useToast } from '@/hooks/use-toast';

export const PDFKnowledgeDemo: React.FC = () => {
  const { toast } = useToast();
  const [demoResults, setDemoResults] = useState<any[]>([]);

  // Sample PDF URL from your public folder for demonstration
  const samplePdfUrl = `${window.location.origin}/test-materials.pdf`;

  const addSampleEntry = async () => {
    try {
      // This would normally be done through the AddKnowledgeEntry component
      // but we're showing how it would work with a sample PDF
      const sampleEntry = {
        title: "Advanced Material Properties Guide",
        content: "This comprehensive guide covers the fundamental properties of construction materials including ceramics, metals, composites, and polymers. It includes detailed specifications, performance characteristics, and application guidelines for various building and design projects.",
        contentType: "material_guide",
        pdfUrl: samplePdfUrl,
        materialCategories: ["ceramics", "metals", "composites"],
        semanticTags: ["material-properties", "construction", "specifications"],
        language: "en",
        readingLevel: 4,
        technicalComplexity: 4
      };

      toast({
        title: "Sample Entry Added",
        description: "Added sample knowledge entry with PDF link for demonstration",
      });

      // Simulate the entry being added to results
      setDemoResults([{
        id: "demo-1",
        title: sampleEntry.title,
        content: sampleEntry.content,
        relevanceScore: 0.95,
        source: "PDF Knowledge Base",
        pdfUrl: sampleEntry.pdfUrl,
        metadata: {
          tags: sampleEntry.semanticTags,
          contentType: sampleEntry.contentType,
          materialCategories: sampleEntry.materialCategories
        }
      }]);
    } catch (error) {
      console.error('Error adding sample entry:', error);
      toast({
        title: "Error",
        description: "Failed to add sample entry",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">PDF Knowledge Base Integration</h1>
        <p className="text-muted-foreground">
          Enhanced RAG system with PDF links for additional details
        </p>
      </div>

      {/* Feature Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            New PDF Link Feature
          </CardTitle>
          <CardDescription>
            Your knowledge base now supports linking to PDFs stored on Supabase for additional details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <FileText className="h-5 w-5 text-blue-500 mt-1" />
              <div>
                <h3 className="font-semibold">PDF Links</h3>
                <p className="text-sm text-muted-foreground">
                  Link to original PDFs on Supabase for full document access
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-green-500 mt-1" />
              <div>
                <h3 className="font-semibold">Knowledge Base</h3>
                <p className="text-sm text-muted-foreground">
                  Extracted content with embeddings for semantic search
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Search className="h-5 w-5 text-purple-500 mt-1" />
              <div>
                <h3 className="font-semibold">Enhanced Search</h3>
                <p className="text-sm text-muted-foreground">
                  Search extracted content, then access full PDF when needed
                </p>
              </div>
            </div>
          </div>

          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>How it works:</strong> Add content to the knowledge base with a PDF URL. 
              When users search and find relevant content, they can click "View PDF Details" 
              to access the original document for comprehensive information.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Tabs defaultValue="demo" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="demo">Demo Results</TabsTrigger>
          <TabsTrigger value="add">Add Knowledge</TabsTrigger>
          <TabsTrigger value="search">Search Interface</TabsTrigger>
        </TabsList>

        {/* Demo Results Tab */}
        <TabsContent value="demo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Demo: Knowledge Entry with PDF Link</CardTitle>
              <CardDescription>
                See how search results display with PDF links for additional details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button onClick={addSampleEntry} className="w-full">
                Add Sample Knowledge Entry with PDF Link
              </Button>

              {demoResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold">Sample Search Results:</h3>
                  {demoResults.map((result, index) => (
                    <Card key={index} className="border-l-4 border-l-blue-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            <h3 className="font-semibold">{result.title}</h3>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-sm text-muted-foreground">
                              {(result.relevanceScore * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {result.content.length > 300 
                            ? `${result.content.substring(0, 300)}...` 
                            : result.content
                          }
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{result.source}</Badge>
                            {result.metadata?.tags && (
                              result.metadata.tags.slice(0, 3).map((tag: string, i: number) => (
                                <Badge key={i} variant="outline">{tag}</Badge>
                              ))
                            )}
                          </div>
                          
                          {/* PDF Link for additional details */}
                          {result.pdfUrl && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-1"
                              onClick={() => window.open(result.pdfUrl, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View PDF Details
                            </Button>
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

        {/* Add Knowledge Tab */}
        <TabsContent value="add">
          <AddKnowledgeEntry 
            onEntryAdded={(entry) => {
              toast({
                title: "Knowledge Entry Added",
                description: "Successfully added to the knowledge base with PDF link support",
              });
            }}
          />
        </TabsContent>

        {/* Search Interface Tab */}
        <TabsContent value="search">
          <EnhancedRAGInterface 
            onResultsFound={(results) => {
              console.log('Search results with PDF links:', results);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center font-semibold">1</div>
              <div>
                <h4 className="font-semibold">Upload PDF to Supabase</h4>
                <p className="text-sm text-muted-foreground">
                  Store your PDF in Supabase storage and get the public URL
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center font-semibold">2</div>
              <div>
                <h4 className="font-semibold">Add Knowledge Entry</h4>
                <p className="text-sm text-muted-foreground">
                  Extract key content and add it to the knowledge base with the PDF URL
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-500 text-white text-sm flex items-center justify-center font-semibold">3</div>
              <div>
                <h4 className="font-semibold">Search & Access</h4>
                <p className="text-sm text-muted-foreground">
                  Users can search the extracted content and click "View PDF Details" for the full document
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};