import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, Brain, BookOpen, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ragService, RAGSearchResult, RAGResponse } from '@/services/ragService';

interface RAGSearchInterfaceProps {
  onResultsFound?: (results: RAGSearchResult[]) => void;
}

export const RAGSearchInterface: React.FC<RAGSearchInterfaceProps> = ({ onResultsFound }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<RAGResponse | null>(null);
  const [searchType, setSearchType] = useState<'hybrid' | 'material' | 'knowledge'>('hybrid');
  const [includeContext, setIncludeContext] = useState(true);
  const { toast } = useToast();

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
      const results = await ragService.searchKnowledge({
        query: query.trim(),
        search_type: searchType,
        match_count: 10,
        include_context: includeContext,
        match_threshold: 0.6
      });

      setSearchResults(results);
      onResultsFound?.(results.results);

      toast({
        title: "Search Completed",
        description: `Found ${results.results.length} results in ${results.processing_time_ms}ms`
      });
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const results = await ragService.quickSearch(query.trim(), true);
      setSearchResults(results);
      onResultsFound?.(results.results);
    } catch (error) {
      console.error('Quick search error:', error);
      toast({
        title: "Quick Search Failed",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getResultIcon = (resultType: string) => {
    switch (resultType) {
      case 'material':
        return <Package className="h-4 w-4" />;
      case 'knowledge':
        return <BookOpen className="h-4 w-4" />;
      default:
        return <Brain className="h-4 w-4" />;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Search Interface */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            RAG Knowledge Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search materials, properties, or technical knowledge..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleQuickSearch} disabled={isSearching} className="border border-gray-300 bg-white text-gray-700 hover:bg-gray-50">
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Quick
            </Button>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>

          {/* Search Options */}
          <div className="flex gap-4 items-center">
            <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Search Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hybrid">Hybrid (Materials + Knowledge)</SelectItem>
                <SelectItem value="material">Materials Only</SelectItem>
                <SelectItem value="knowledge">Knowledge Base Only</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="includeContext"
                checked={includeContext}
                onChange={(e) => setIncludeContext(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="includeContext" className="text-sm">
                Generate AI Context
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults && (
        <Card>
          <CardHeader>
            <CardTitle>
              Search Results ({searchResults.results.length} found)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Processed in {searchResults.processing_time_ms}ms
            </p>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="results" className="w-full">
              <TabsList>
                <TabsTrigger value="results">Results</TabsTrigger>
                {searchResults.context && <TabsTrigger value="context">AI Context</TabsTrigger>}
              </TabsList>

              <TabsContent value="results" className="space-y-4">
                {searchResults.results.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No results found for your query.
                  </p>
                ) : (
                  searchResults.results.map((result, index) => (
                    <Card key={index} className="border-l-4 border-l-primary">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getResultIcon(result.result_type)}
                            <h3 className="font-semibold">{result.title}</h3>
                            <span className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-900 bg-gray-50">{result.result_type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div 
                              className={`w-2 h-2 rounded-full ${getConfidenceColor(result.similarity_score)}`}
                            />
                            <span className="text-sm text-muted-foreground">
                              {(result.similarity_score * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mb-3">
                          {result.content.length > 200 
                            ? `${result.content.substring(0, 200)}...` 
                            : result.content
                          }
                        </p>

                        {/* Metadata */}
                        <div className="flex flex-wrap gap-2">
                          {result.metadata?.category && (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                              Category: {result.metadata.category}
                            </span>
                          )}
                          {result.metadata?.content_type && (
                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                              Type: {result.metadata.content_type}
                            </span>
                          )}
                          {result.metadata?.tags && Array.isArray(result.metadata.tags) && 
                            result.metadata.tags.slice(0, 3).map((tag: string, i: number) => (
                              <span key={i} className="inline-flex items-center rounded-md border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-900 bg-gray-50">{tag}</span>
                            ))
                          }
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>

              {searchResults.context && (
                <TabsContent value="context">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="prose prose-sm max-w-none">
                        <h4 className="flex items-center gap-2 mb-3">
                          <Brain className="h-5 w-5" />
                          AI-Generated Context
                        </h4>
                        <div className="whitespace-pre-wrap text-sm">
                          {searchResults.context}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
};