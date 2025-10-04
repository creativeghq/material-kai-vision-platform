import React, { useState, useEffect } from 'react';
import {
  Loader2,
  Database,
  Brain,
  Zap,
  Upload,
  Settings,
  Rocket,
  Search,
  BookOpen,
  Package,
  Lightbulb,

  BarChart3,
  History,
  Clock,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,

} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { ragKnowledgeService as ragService } from '@/services/ragKnowledgeService';
import {
  EnhancedRAGService,
  type EnhancedRAGRequest,
  type EnhancedRAGResponse,
} from '@/services/enhancedRAGService';

import { GlobalAdminHeader } from './GlobalAdminHeader';

export const IntegratedRAGManagement: React.FC = () => {
  // RAG Management Panel State
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<Record<string, unknown>[]>([]);
  const [newKnowledgeEntry, setNewKnowledgeEntry] = useState({
    title: '',
    content: '',
    content_type: 'expert_knowledge' as const,
    tags: '',
    source_url: '',
  });

  // Enhanced RAG Interface State
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EnhancedRAGResponse | null>(null);
  const [searchType, setSearchType] = useState<'comprehensive' | 'semantic' | 'hybrid' | 'perplexity'>('comprehensive');
  const [includeRealTime, setIncludeRealTime] = useState(true);
  const [maxResults, setMaxResults] = useState(10);
  const [context, setContext] = useState({
    roomType: '',
    stylePreferences: [] as string[],
    materialCategories: [] as string[],
  });
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [queryHistory, setQueryHistory] = useState<Array<{
    query: string;
    timestamp: string;
    searchType: string;
    resultCount: number;
  }>>([]);

  const { toast } = useToast();

  useEffect(() => {
    loadTrainingStatus();
    loadAnalytics();
    loadQueryHistory();
  }, []);

  // RAG Management Methods
  const loadTrainingStatus = async () => {
    try {
      const status = await ragService.getTrainingStatus();
      setTrainingStatus(status as Record<string, unknown>[]);
    } catch (error) {
      console.error('Failed to load training status:', error);
    }
  };

  const handleStartCLIPTraining = async () => {
    setIsTraining(true);
    try {
      const result = await ragService.startCLIPFineTuning(
        `kai-clip-${Date.now()}`,
        undefined,
        3,
      );

      toast({
        title: 'CLIP Training Started',
        description: `Training job created: ${result.estimated_training_time}`,
      });

      await loadTrainingStatus();
    } catch (error) {
      console.error('Training error:', error);
      toast({
        title: 'Training Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsTraining(false);
    }
  };

  const handleStartMaterialClassification = async () => {
    setIsTraining(true);
    try {
      const result = await ragService.startMaterialClassification(
        `kai-materialnet-${Date.now()}`,
        undefined,
        5,
      );

      toast({
        title: 'Material Classification Training Started',
        description: `Training job created: ${result.estimated_training_time}`,
      });

      await loadTrainingStatus();
    } catch (error) {
      console.error('Training error:', error);
      toast({
        title: 'Training Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsTraining(false);
    }
  };

  const handleAddKnowledgeEntry = async () => {
    if (!newKnowledgeEntry.title || !newKnowledgeEntry.content) {
      toast({
        title: 'Missing Information',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      await ragService.addKnowledgeEntry({
        title: newKnowledgeEntry.title,
        content: newKnowledgeEntry.content,
        content_type: newKnowledgeEntry.content_type,
        tags: newKnowledgeEntry.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        source_url: newKnowledgeEntry.source_url || undefined,
      });

      toast({
        title: 'Knowledge Entry Added',
        description: 'Successfully added to knowledge base',
      });

      setNewKnowledgeEntry({
        title: '',
        content: '',
        content_type: 'expert_knowledge',
        tags: '',
        source_url: '',
      });
    } catch (error) {
      console.error('Add knowledge error:', error);
      toast({
        title: 'Failed to Add Knowledge',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    }
  };

  // Enhanced RAG Methods
  const loadAnalytics = async () => {
    try {
      const data = await EnhancedRAGService.getSearchAnalytics('30 days');
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
    }
  };

  const loadQueryHistory = async () => {
    try {
      const history = await EnhancedRAGService.getQueryHistory(10);
      setQueryHistory(history as unknown as Array<{
        query: string;
        timestamp: string;
        searchType: string;
        resultCount: number;
      }>);
    } catch (error) {
      console.error('Error loading query history:', error);
    }
  };

  const handleEnhancedSearch = async () => {
    if (!query.trim()) {
      toast({
        title: 'Search Query Required',
        description: 'Please enter a search query',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    try {
      const request: EnhancedRAGRequest = {
        query: query.trim(),
        context: {
          roomType: context.roomType || undefined,
          stylePreferences: context.stylePreferences.length > 0 ? context.stylePreferences : undefined,
          materialCategories: context.materialCategories.length > 0 ? context.materialCategories : undefined,
        },
        searchType,
        maxResults,
        includeRealTime,
      };

      const results = await EnhancedRAGService.search(request);
      setSearchResults(results);

      const allResults = [
        ...results.results.knowledgeBase,
        ...results.results.materialKnowledge,
        ...results.results.recommendations,
      ];

      toast({
        title: 'Enhanced Search Completed',
        description: `Found ${allResults.length} results with ${results.semanticAnalysis.queryComplexity.toFixed(2)} complexity score`,
      });

      loadAnalytics();
      loadQueryHistory();
    } catch (error) {
      console.error('Enhanced search error:', error);
      toast({
        title: 'Search Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFeedback = async (satisfaction: number, clickedResults: string[] = []) => {
    if (!searchResults) return;

    try {
      await EnhancedRAGService.provideFeedback(searchResults.analytics.sessionId, {
        satisfaction,
        clickedResults,
      });

      toast({
        title: 'Feedback Submitted',
        description: 'Thank you for your feedback!',
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
    }
  };

  // Helper Methods
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'processing': return 'bg-blue-500';
      case 'failed': return 'bg-red-500';
      case 'pending': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getIntentIcon = (intent: string) => {
    switch (intent) {
      case 'search': return <Search className="h-4 w-4" />;
      case 'compare': return <BarChart3 className="h-4 w-4" />;
      case 'recommend': return <Lightbulb className="h-4 w-4" />;
      case 'explain': return <BookOpen className="h-4 w-4" />;
      default: return <Brain className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="Integrated RAG System Management"
        description="Enhanced knowledge search, management, and model training"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'RAG Management' },
        ]}
      />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="search" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="search">🔍 Enhanced Search</TabsTrigger>
            <TabsTrigger value="knowledge">📚 Knowledge Base</TabsTrigger>
            <TabsTrigger value="training">🚀 Model Training</TabsTrigger>
            <TabsTrigger value="analytics">📊 Analytics</TabsTrigger>
            <TabsTrigger value="settings">⚙️ System Config</TabsTrigger>
          </TabsList>

          {/* Enhanced Search Tab */}
          <TabsContent value="search" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  Enhanced RAG Knowledge Search
                  <Badge className="ml-auto border border-gray-300 bg-gray-50 text-gray-700">AI-Powered</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Search Input */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask about materials, styles, properties, or design concepts..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleEnhancedSearch()}
                    className="flex-1"
                  />
                  <Button onClick={handleEnhancedSearch} disabled={isSearching}>
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    Enhanced Search
                  </Button>
                </div>

                {/* Search Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="searchType">Search Type</Label>
                    <Select value={searchType} onValueChange={(value: 'comprehensive' | 'semantic' | 'hybrid' | 'perplexity') => setSearchType(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="comprehensive">🧠 Comprehensive (All Sources)</SelectItem>
                        <SelectItem value="semantic">🔍 Semantic (Vector Search)</SelectItem>
                        <SelectItem value="hybrid">⚡ Hybrid (Mixed Approach)</SelectItem>
                        <SelectItem value="perplexity">🌐 Real-time (Perplexity)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxResults">Max Results</Label>
                    <Select value={maxResults.toString()} onValueChange={(value: string) => setMaxResults(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 Results</SelectItem>
                        <SelectItem value="10">10 Results</SelectItem>
                        <SelectItem value="20">20 Results</SelectItem>
                        <SelectItem value="50">50 Results</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="realTime">Real-time Info</Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="realTime"
                        checked={includeRealTime}
                        onCheckedChange={setIncludeRealTime}
                      />
                      <Label htmlFor="realTime" className="text-sm">
                        Include current trends & data
                      </Label>
                    </div>
                  </div>
                </div>

                {/* Context Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="space-y-2">
                    <Label htmlFor="roomType">Room Context</Label>
                    <Input
                      id="roomType"
                      placeholder="e.g., kitchen, bathroom"
                      value={context.roomType}
                      onChange={(e) => setContext(prev => ({ ...prev, roomType: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Style Preferences</Label>
                    <Input
                      placeholder="e.g., modern, rustic"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const value = (e.target as HTMLInputElement).value.trim();
                          if (value && !context.stylePreferences.includes(value)) {
                            setContext(prev => ({
                              ...prev,
                              stylePreferences: [...prev.stylePreferences, value],
                            }));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-1">
                      {context.stylePreferences.map((style, i) => (
                        <Badge
                          key={i}
                          className="cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          onClick={() => setContext(prev => ({
                            ...prev,
                            stylePreferences: prev.stylePreferences.filter((_, idx) => idx !== i),
                          }))}
                        >
                          {style} ×
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Material Categories</Label>
                    <Input
                      placeholder="e.g., flooring, countertops"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          const value = (e.target as HTMLInputElement).value.trim();
                          if (value && !context.materialCategories.includes(value)) {
                            setContext(prev => ({
                              ...prev,
                              materialCategories: [...prev.materialCategories, value],
                            }));
                            (e.target as HTMLInputElement).value = '';
                          }
                        }
                      }}
                    />
                    <div className="flex flex-wrap gap-1">
                      {context.materialCategories.map((category, i) => (
                        <Badge
                          key={i}
                          className="cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80"
                          onClick={() => setContext(prev => ({
                            ...prev,
                            materialCategories: prev.materialCategories.filter((_, idx) => idx !== i),
                          }))}
                        >
                          {category} ×
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                          {getIntentIcon(searchResults.queryIntent)}
                          Search Results
                          <Badge className="border border-border bg-background text-foreground">{searchResults.queryIntent}</Badge>
                        </CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {searchResults.performance.totalTime}ms
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            Complexity: {(searchResults.semanticAnalysis.queryComplexity * 100).toFixed(0)}%
                          </span>
                          {searchResults.analytics.cacheHit && (
                            <Badge className="bg-secondary text-secondary-foreground">Cached</Badge>
                          )}
                        </div>
                      </div>

                      {/* Query Analysis */}
                      <div className="space-y-2">
                        <p className="text-sm">
                          <span className="font-medium">Processed Query:</span> {searchResults.processedQuery}
                        </p>

                        {/* Detected Entities */}
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(searchResults.semanticAnalysis.detectedEntities).map(([key, values]) => {
                            if (Array.isArray(values) && values.length > 0) {
                              return values.map((value, i) => (
                                <Badge key={`${key}-${i}`} className="text-xs border border-border bg-background text-foreground">
                                  {key}: {value}
                                </Badge>
                              ));
                            }
                            return null;
                          })}
                        </div>

                        {/* Suggested Refinements */}
                        {searchResults.semanticAnalysis.suggestedRefinements.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            <span className="text-sm text-muted-foreground">Suggestions:</span>
                            {searchResults.semanticAnalysis.suggestedRefinements.map((suggestion, i) => (
                              <Button
                                key={i}
                                className="bg-transparent hover:bg-accent hover:text-accent-foreground h-6 px-2 text-xs"
                                onClick={() => setQuery(suggestion)}
                              >
                                {suggestion}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent>
                      <Tabs defaultValue="knowledge" className="w-full">
                        <TabsList className="grid grid-cols-4 w-full">
                          <TabsTrigger value="knowledge" className="flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            Knowledge ({searchResults.results.knowledgeBase.length})
                          </TabsTrigger>
                          <TabsTrigger value="materials" className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Materials ({searchResults.results.materialKnowledge.length})
                          </TabsTrigger>
                          <TabsTrigger value="recommendations" className="flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
                            Recommendations ({searchResults.results.recommendations.length})
                          </TabsTrigger>
                          {searchResults.results.realTimeInfo && (
                            <TabsTrigger value="realtime" className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4" />
                              Real-time
                            </TabsTrigger>
                          )}
                        </TabsList>

                        {/* Knowledge Base Results */}
                        <TabsContent value="knowledge" className="space-y-4">
                          {searchResults.results.knowledgeBase.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                              No knowledge base results found.
                            </p>
                          ) : (
                            searchResults.results.knowledgeBase.map((result, index) => (
                              <Card key={index} className="border-l-4 border-l-blue-500">
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <BookOpen className="h-4 w-4" />
                                      <h3 className="font-semibold">{result.title}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${getConfidenceColor(result.relevanceScore)}`} />
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

                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-secondary text-secondary-foreground">{result.source}</Badge>
                                    {(result.metadata?.tags && Array.isArray(result.metadata.tags)) ?
                                      (result.metadata.tags as string[]).slice(0, 3).map((tag: string, i: number) => (
                                        <Badge key={i} className="border border-border bg-background text-foreground">{tag}</Badge>
                                      )) : null
                                    }
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </TabsContent>

                        {/* Similar tabs for materials and recommendations */}
                        <TabsContent value="materials" className="space-y-4">
                          {searchResults.results.materialKnowledge.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                              No material knowledge results found.
                            </p>
                          ) : (
                            searchResults.results.materialKnowledge.map((result, index) => (
                              <Card key={index} className="border-l-4 border-l-green-500">
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Package className="h-4 w-4" />
                                      <h3 className="font-semibold">{result.materialName || 'Material Knowledge'}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${getConfidenceColor(result.relevanceScore)}`} />
                                      <span className="text-sm text-muted-foreground">
                                        {(result.relevanceScore * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>

                                  <p className="text-sm text-muted-foreground mb-3">
                                    {result.extractedKnowledge ?
                                      (result.extractedKnowledge.length > 300 ? result.extractedKnowledge.substring(0, 300) + '...' : result.extractedKnowledge) :
                                      'Material knowledge entry'
                                    }
                                  </p>

                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-secondary text-secondary-foreground">{result.extractionType}</Badge>
                                    <Badge className="border border-border bg-background text-foreground">Material</Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </TabsContent>

                        <TabsContent value="recommendations" className="space-y-4">
                          {searchResults.results.recommendations.length === 0 ? (
                            <p className="text-center text-muted-foreground py-8">
                              No recommendations found.
                            </p>
                          ) : (
                            searchResults.results.recommendations.map((result, index) => (
                              <Card key={index} className="border-l-4 border-l-yellow-500">
                                <CardContent className="pt-4">
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Lightbulb className="h-4 w-4" />
                                      <h3 className="font-semibold">{result.title}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full ${getConfidenceColor(result.score || 0.5)}`} />
                                      <span className="text-sm text-muted-foreground">
                                        {((result.score || 0.5) * 100).toFixed(1)}%
                                      </span>
                                    </div>
                                  </div>

                                  <p className="text-sm text-muted-foreground mb-3">
                                    {result.type || 'AI-generated recommendation'}
                                  </p>

                                  <div className="flex items-center gap-2">
                                    <Badge className="bg-secondary text-secondary-foreground">{result.type}</Badge>
                                    <Badge className="border border-border bg-background text-foreground">
                                      Recommendation
                                    </Badge>
                                  </div>
                                </CardContent>
                              </Card>
                            ))
                          )}
                        </TabsContent>
                      </Tabs>

                      {/* Feedback */}
                      <Separator className="my-4" />
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Was this search helpful?</span>
                        <div className="flex gap-2">
                          <Button
                            className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm"
                            onClick={() => handleFeedback(1)}
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm"
                            onClick={() => handleFeedback(0)}
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Knowledge Base Tab */}
          <TabsContent value="knowledge" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Add Knowledge Entry
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      placeholder="Knowledge entry title"
                      value={newKnowledgeEntry.title}
                      onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content Type</label>
                    <Select
                      value={newKnowledgeEntry.content_type}
                      onValueChange={(value: string) => setNewKnowledgeEntry(prev => ({ ...prev, content_type: value as any }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="material_spec">Material Specification</SelectItem>
                        <SelectItem value="technical_doc">Technical Document</SelectItem>
                        <SelectItem value="expert_knowledge">Expert Knowledge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Content</label>
                  <Textarea
                    placeholder="Detailed content for the knowledge base..."
                    value={newKnowledgeEntry.content}
                    onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, content: e.target.value }))}
                    rows={6}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tags (comma-separated)</label>
                    <Input
                      placeholder="material, ceramic, properties, etc."
                      value={newKnowledgeEntry.tags}
                      onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, tags: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source URL (optional)</label>
                    <Input
                      placeholder="https://example.com/source"
                      value={newKnowledgeEntry.source_url}
                      onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, source_url: e.target.value }))}
                    />
                  </div>
                </div>

                <Button onClick={handleAddKnowledgeEntry} className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  Add to Knowledge Base
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Model Training Tab */}
          <TabsContent value="training" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Rocket className="h-5 w-5" />
                  Hugging Face Model Training
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* CLIP Fine-tuning */}
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2">CLIP Fine-tuning</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Fine-tune CLIP for better material-text embeddings
                      </p>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>• Base Model: openai/clip-vit-base-patch32</p>
                        <p>• Training Data: Materials + Knowledge Base</p>
                        <p>• Estimated Time: 2-4 hours</p>
                      </div>
                      <Button
                        onClick={handleStartCLIPTraining}
                        disabled={isTraining}
                        className="w-full mt-4"
                      >
                        {isTraining ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Training...</>
                        ) : (
                          <><Zap className="h-4 w-4 mr-2" /> Start CLIP Training</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Material Classification */}
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-2">Material Classification</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Train EfficientNet for material category classification
                      </p>
                      <div className="space-y-2 text-xs text-muted-foreground">
                        <p>• Base Model: google/efficientnet-b0</p>
                        <p>• Training Data: Material Images + Categories</p>
                        <p>• Estimated Time: 1-3 hours</p>
                      </div>
                      <Button
                        onClick={handleStartMaterialClassification}
                        disabled={isTraining}
                        className="w-full mt-4"
                      >
                        {isTraining ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Training...</>
                        ) : (
                          <><Zap className="h-4 w-4 mr-2" /> Start Classification Training</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Training Status */}
                <Card>
                  <CardHeader>
                    <CardTitle>Recent Training Jobs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {trainingStatus.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        No training jobs found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {trainingStatus.slice(0, 5).map((job, index) => (
                          <div key={index} className="flex items-center justify-between p-3 border rounded">
                            <div>
                              <p className="font-medium">{job.job_type as string}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(job.created_at as string).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${getStatusColor(job.status as string)}`} />
                              <Badge className="border border-border bg-background text-foreground">{job.status as string}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Search Analytics & Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analytics ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">Total Searches</h3>
                        <p className="text-2xl font-bold text-primary">{analytics && typeof analytics === 'object' && 'totalSearches' in analytics ? (analytics as Record<string, unknown>).totalSearches as number || 0 : 0}</p>
                        <p className="text-sm text-muted-foreground">Last 30 days</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">Avg Response Time</h3>
                        <p className="text-2xl font-bold text-primary">{analytics && typeof analytics === 'object' && 'avgResponseTime' in analytics ? (analytics as Record<string, unknown>).avgResponseTime as number || 0 : 0}ms</p>
                        <p className="text-sm text-muted-foreground">Enhanced search</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">Satisfaction</h3>
                        <p className="text-2xl font-bold text-primary">{analytics && typeof analytics === 'object' && 'satisfaction' in analytics ? (analytics as Record<string, unknown>).satisfaction as number || 0 : 0}%</p>
                        <p className="text-sm text-muted-foreground">User feedback</p>
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Loading analytics...
                  </p>
                )}

                {/* Query History */}
                <Card className="mt-6">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Recent Query History
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {queryHistory.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        No query history found
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {queryHistory.slice(0, 10).map((query, index) => (
                          <div key={index} className="flex items-center justify-between p-3 border rounded">
                            <div>
                              <p className="font-medium">{query.query}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(query.timestamp).toLocaleString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="border border-border bg-background text-foreground">{query.searchType}</Badge>
                              <span className="text-sm text-muted-foreground">
                                {query.resultCount} results
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>

          {/* System Settings Tab */}
          <TabsContent value="settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  System Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">CLIP Embeddings</h3>
                        <p className="text-2xl font-bold text-primary">512D</p>
                        <p className="text-sm text-muted-foreground">Multi-modal text+image</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">EfficientNet</h3>
                        <p className="text-2xl font-bold text-primary">1000D</p>
                        <p className="text-sm text-muted-foreground">Visual features</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4 text-center">
                        <h3 className="font-semibold">MaterialNet</h3>
                        <p className="text-2xl font-bold text-primary">256D</p>
                        <p className="text-sm text-muted-foreground">Material-specific</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="text-center space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Embedding generation is handled automatically during material processing.
                      Custom models will be deployed here after training completion.
                    </p>
                    <Button className="border border-border bg-background text-foreground" disabled>
                      <Settings className="h-4 w-4 mr-2" />
                      Configure Custom Models (Coming Soon)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
