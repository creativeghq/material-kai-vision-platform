import React, { useState } from 'react';
import { Search, Clock, Sparkles, Edit, ExternalLink } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { KBDocument } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';

interface SearchInterfaceProps {
  /** Open a document in the editor (from a search result click). */
  onOpen?: (docId: string) => void;
}

export const SearchInterface: React.FC<SearchInterfaceProps> = ({ onOpen }) => {
  const [query, setQuery] = useState('');
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
        .maybeSingle();

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
      const q = query.trim();

      // Hybrid search: run a tolerant keyword pass (DB) and the semantic/vector
      // pass (MIVAA → kb_match_docs) in parallel, then merge keyword-first so an
      // exact term match wins. Semantic alone is noisy for short/mashed queries
      // (e.g. "heatpump" buries the manual under a tile-cert cluster ~0.53);
      // keyword alone can't do concept matching. Together they cover both.
      const [keywordResults, semanticResults] = await Promise.all([
        // Tolerant keyword (collapses spaces/punctuation: "heatpump" ⇒ "Heat Pump …")
        (async (): Promise<KBDocument[]> => {
          // kb_keyword_search isn't in the generated types yet — cast the call.
          const { data, error } = await (supabase.rpc as any)('kb_keyword_search', {
            p_workspace_id: workspaceId,
            p_query: q,
            p_limit: 20,
          });
          if (error) {
            console.warn('keyword search failed:', error.message);
            return [];
          }
          return (data as KBDocument[]) || [];
        })(),
        // Semantic via MIVAA — must be 'semantic' (the endpoint only runs the
        // embedding path for that; anything else falls back to ILIKE substring).
        (async (): Promise<KBDocument[]> => {
          try {
            // MIVAA now enforces JWT on /api/kb — send the admin's
            // session token (this is an authenticated admin surface).
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch('https://v1api.materialshub.gr/api/kb/search', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
              },
              body: JSON.stringify({
                workspace_id: workspaceId,
                query: q,
                search_type: 'semantic',
                match_threshold: 0.3, // recall-oriented for an admin tool
                limit: 20,
              }),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return (data.results as KBDocument[]) || [];
          } catch (e) {
            console.warn('semantic search failed:', e);
            return [];
          }
        })(),
      ]);

      // Merge: exact keyword hits first, then semantic, deduped by id.
      const byId = new Map<string, KBDocument>();
      keywordResults.forEach((d) => byId.set(d.id, d));
      semanticResults.forEach((d) => { if (!byId.has(d.id)) byId.set(d.id, d); });
      const merged = Array.from(byId.values()).slice(0, 20);

      setResults(merged);
      setSearchTime(Date.now() - startTime);

      if (merged.length === 0) {
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
              className="flex-1 bg-sidebar"
            />
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          {results.map((doc) => (
            <Card
              key={doc.id}
              className={onOpen ? 'cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40' : undefined}
              onClick={onOpen ? () => onOpen(doc.id) : undefined}
              role={onOpen ? 'button' : undefined}
              tabIndex={onOpen ? 0 : undefined}
              onKeyDown={onOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(doc.id); } } : undefined}
            >
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-lg">{doc.title}</h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline">{doc.status}</Badge>
                      {doc.status === 'published' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Open on public KB"
                          onClick={(e) => { e.stopPropagation(); window.open(`/knowledge-base?doc=${doc.id}`, '_blank'); }}
                        >
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                        </Button>
                      )}
                      {onOpen && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Edit document"
                          onClick={(e) => { e.stopPropagation(); onOpen(doc.id); }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {doc.summary && (
                    <p className="text-sm text-muted-foreground">{doc.summary}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Views: {doc.view_count}</span>
                    <span>Created: {formatDate(doc.created_at)}</span>
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

