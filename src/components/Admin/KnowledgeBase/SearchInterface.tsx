import React, { useState } from 'react';
import { Search, Sparkles, FileText, Clock } from 'lucide-react';

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
import { useToast } from '@/hooks/use-toast';
import { KBDocument } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

export const SearchInterface: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'semantic' | 'full_text' | 'hybrid'>('semantic');
  const [results, setResults] = useState<KBDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTime, setSearchTime] = useState<number>(0);
  const [workspaceId, setWorkspaceId] = useState<string>('');

  const { toast } = useToast();

  React.useEffect(() => {
    loadWorkspace();
  }, []);

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (workspaces) {
        setWorkspaceId(workspaces.id);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || !workspaceId) return;

    try {
      setIsSearching(true);
      const startTime = Date.now();

      // Simple text search in Supabase (semantic search requires MIVAA API backend)
      const { data, error } = await supabase
        .from('kb_docs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .or(`title.ilike.%${query.trim()}%,content.ilike.%${query.trim()}%`)
        .limit(20);

      if (error) throw error;

      const endTime = Date.now();
      setResults(data || []);
      setSearchTime(endTime - startTime);

      if (!data || data.length === 0) {
        toast({
          title: 'No Results',
          description: 'No documents found matching your query',
        });
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast({
        title: 'Error',
        description: 'Search failed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const getSearchTypeBadge = (type: string) => {
    const labels = {
      semantic: 'Semantic (AI)',
      full_text: 'Full-Text',
      hybrid: 'Hybrid',
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Search Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for documents..."
              className="flex-1"
            />
            <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="semantic">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Semantic (AI)
                  </div>
                </SelectItem>
                <SelectItem value="full_text">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Full-Text
                  </div>
                </SelectItem>
                <SelectItem value="hybrid">
                  <div className="flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Hybrid
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? (
                <>Searching...</>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {searchTime > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Found {results.length} results in {searchTime}ms
              <Badge variant="outline">{getSearchTypeBadge(searchType)}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-lg">{doc.title}</h3>
                    <Badge variant="outline">{doc.status}</Badge>
                  </div>
                  {doc.summary && (
                    <p className="text-sm text-muted-foreground">{doc.summary}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Views: {doc.view_count}</span>
                    <span>Created: {new Date(doc.created_at).toLocaleDateString()}</span>
                    {doc.embedding_status === 'success' && (
                      <Badge variant="outline" className="text-green-600">
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI Indexed
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

