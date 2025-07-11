import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  Search, 
  Brain, 
  BookOpen, 
  Package, 
  Zap, 
  TrendingUp, 
  Clock, 
  Eye,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  ExternalLink,
  BarChart3,
  Settings,
  History
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  EnhancedRAGService, 
  type EnhancedRAGRequest, 
  type EnhancedRAGResponse,
  type KnowledgeResult,
  type MaterialKnowledgeResult,
  type RecommendationResult
} from '@/services/enhancedRAGService';

interface EnhancedRAGInterfaceProps {
  onResultsFound?: (results: any[]) => void;
}

export const EnhancedRAGInterface: React.FC<EnhancedRAGInterfaceProps> = ({ onResultsFound }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<EnhancedRAGResponse | null>(null);
  const [searchType, setSearchType] = useState<'comprehensive' | 'semantic' | 'hybrid' | 'perplexity'>('comprehensive');
  const [includeRealTime, setIncludeRealTime] = useState(true);
  const [maxResults, setMaxResults] = useState(10);
  const [context, setContext] = useState({
    roomType: '',
    stylePreferences: [] as string[],
    materialCategories: [] as string[]
  });
  const [analytics, setAnalytics] = useState<any>(null);
  const [queryHistory, setQueryHistory] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
    loadQueryHistory();
  }, []);

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
      setQueryHistory(history);
    } catch (error) {
      console.error('Error loading query history:', error);
    }
  };

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Search Query Required",
        description: "Please enter a search query",
        variant: "destructive"
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
          materialCategories: context.materialCategories.length > 0 ? context.materialCategories : undefined
        },
        searchType,
        maxResults,
        includeRealTime
      };

      const results = await EnhancedRAGService.search(request);
      setSearchResults(results);
      
      // Combine all results for callback
      const allResults = [
        ...results.results.knowledgeBase,
        ...results.results.materialKnowledge,
        ...results.results.recommendations
      ];
      onResultsFound?.(allResults);

      toast({
        title: "Enhanced Search Completed",
        description: `Found ${allResults.length} results with ${results.semanticAnalysis.queryComplexity.toFixed(2)} complexity score`
      });

      // Refresh analytics and history
      loadAnalytics();
      loadQueryHistory();
    } catch (error) {
      console.error('Enhanced search error:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
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
        clickedResults
      });
      
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback!"
      });
    } catch (error) {
      console.error('Error submitting feedback:', error);
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
    <div className="space-y-6">
      {/* Enhanced Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Enhanced RAG Knowledge Search
            <Badge variant="outline" className="ml-auto">AI-Powered</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Ask about materials, styles, properties, or design concepts..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching}>
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
              <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
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
              <Select value={maxResults.toString()} onValueChange={(value) => setMaxResults(parseInt(value))}>
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
                        stylePreferences: [...prev.stylePreferences, value]
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
                    variant="secondary" 
                    className="cursor-pointer"
                    onClick={() => setContext(prev => ({
                      ...prev,
                      stylePreferences: prev.stylePreferences.filter((_, idx) => idx !== i)
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
                        materialCategories: [...prev.materialCategories, value]
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
                    variant="secondary"
                    className="cursor-pointer"
                    onClick={() => setContext(prev => ({
                      ...prev,
                      materialCategories: prev.materialCategories.filter((_, idx) => idx !== i)
                    }))}
                  >
                    {category} ×
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getIntentIcon(searchResults.queryIntent)}
                Search Results
                <Badge variant="outline">{searchResults.queryIntent}</Badge>
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
                  <Badge variant="secondary">Cached</Badge>
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
                      <Badge key={`${key}-${i}`} variant="outline" className="text-xs">
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
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
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
                          <Badge variant="secondary">{result.source}</Badge>
                          {result.metadata?.tags && (
                            result.metadata.tags.slice(0, 3).map((tag: string, i: number) => (
                              <Badge key={i} variant="outline">{tag}</Badge>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Material Knowledge Results */}
              <TabsContent value="materials" className="space-y-4">
                {searchResults.results.materialKnowledge.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No material knowledge found.
                  </p>
                ) : (
                  searchResults.results.materialKnowledge.map((result, index) => (
                    <Card key={index} className="border-l-4 border-l-green-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            <h3 className="font-semibold">{result.materialName}</h3>
                            <Badge variant="outline">{result.extractionType}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getConfidenceColor(result.confidence)}`} />
                            <span className="text-sm text-muted-foreground">
                              {(result.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground">
                          {result.extractedKnowledge}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Recommendations */}
              <TabsContent value="recommendations" className="space-y-4">
                {searchResults.results.recommendations.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No recommendations available.
                  </p>
                ) : (
                  searchResults.results.recommendations.map((rec, index) => (
                    <Card key={index} className="border-l-4 border-l-purple-500">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Lightbulb className="h-4 w-4" />
                            <h3 className="font-semibold">{rec.title}</h3>
                            <Badge variant="outline">{rec.type}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${getConfidenceColor(rec.score)}`} />
                            <span className="text-sm text-muted-foreground">
                              {(rec.score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-2">
                          {rec.description}
                        </p>
                        
                        <p className="text-xs text-muted-foreground">
                          Reasoning: {rec.reasoning}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {/* Real-time Information */}
              {searchResults.results.realTimeInfo && (
                <TabsContent value="realtime">
                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="h-5 w-5" />
                        <h3 className="font-semibold">Current Information</h3>
                        <Badge variant="outline">Live Data</Badge>
                      </div>
                      
                      <div className="prose prose-sm max-w-none">
                        <p className="whitespace-pre-wrap">
                          {searchResults.results.realTimeInfo.answer}
                        </p>
                      </div>

                      {searchResults.results.realTimeInfo.relatedQuestions.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium mb-2">Related Questions:</h4>
                          <div className="space-y-1">
                            {searchResults.results.realTimeInfo.relatedQuestions.map((question, i) => (
                              <Button
                                key={i}
                                variant="ghost"
                                size="sm"
                                className="h-auto p-2 text-left justify-start"
                                onClick={() => setQuery(question)}
                              >
                                {question}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>

            {/* Feedback Section */}
            <Separator className="my-6" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">How helpful were these results?</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback(5)}
                  className="text-green-600 hover:text-green-700"
                >
                  <ThumbsUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFeedback(2)}
                  className="text-red-600 hover:text-red-700"
                >
                  <ThumbsDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics Dashboard */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Searches</p>
                  <p className="text-2xl font-bold">{analytics.totalSearches}</p>
                </div>
                <Search className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Satisfaction</p>
                  <p className="text-2xl font-bold">{analytics.avgSatisfaction}/5</p>
                </div>
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Response</p>
                  <p className="text-2xl font-bold">{analytics.avgResponseTime}ms</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};