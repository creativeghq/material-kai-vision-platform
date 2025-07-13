import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Globe, Loader2, Plus, ArrowRight } from 'lucide-react';
import { ScrapingSessionsList } from './ScrapingSessionsList';
import { SessionDetailView } from './SessionDetailView';

interface NewScraperPageProps {}

type ViewMode = 'sessions' | 'detail' | 'create';

export const NewScraperPage: React.FC<NewScraperPageProps> = () => {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('sessions');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  
  // New session form
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [maxPages, setMaxPages] = useState(100);
  const [extractionPrompt, setExtractionPrompt] = useState(`Extract material information from this page. Look for:
- Material name
- Price (if available)
- Description
- Images  
- Properties like dimensions, color, finish
- Category (tiles, stone, wood, etc.)
Return a list of materials found on the page.`);

  const parseSitemap = async (url: string): Promise<string[]> => {
    try {
      console.log('Parsing sitemap:', url);
      
      // Use CORS proxy for sitemap parsing
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch sitemap: ${response.status}`);
      }
      
      const data = await response.json();
      const sitemapContent = data.contents;
      
      // Parse XML to extract URLs
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(sitemapContent, 'text/xml');
      
      // Handle different sitemap formats
      let urls: string[] = [];
      
      // Standard sitemap format
      const urlElements = xmlDoc.getElementsByTagName('url');
      for (let i = 0; i < urlElements.length; i++) {
        const locElement = urlElements[i].getElementsByTagName('loc')[0];
        if (locElement) {
          urls.push(locElement.textContent || '');
        }
      }
      
      // If no URLs found, try alternate format
      if (urls.length === 0) {
        const locElements = xmlDoc.getElementsByTagName('loc');
        for (let i = 0; i < locElements.length; i++) {
          urls.push(locElements[i].textContent || '');
        }
      }
      
      // Filter out empty URLs and limit
      urls = urls.filter(url => url.trim().length > 0).slice(0, maxPages);
      
      console.log(`Found ${urls.length} URLs in sitemap`);
      return urls;
      
    } catch (error) {
      console.error('Error parsing sitemap:', error);
      throw new Error('Failed to parse sitemap. Please check the URL and try again.');
    }
  };

  const createNewSession = async () => {
    if (!sitemapUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a sitemap URL",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      // Parse sitemap to get URLs
      const urls = await parseSitemap(sitemapUrl);
      
      if (urls.length === 0) {
        throw new Error('No URLs found in sitemap');
      }

      // Create session
      const sessionId = crypto.randomUUID();
      const { data: sessionData, error: sessionError } = await supabase
        .from('scraping_sessions')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          session_id: sessionId,
          source_url: sitemapUrl,
          status: 'pending',
          total_pages: urls.length,
          completed_pages: 0,
          failed_pages: 0,
          pending_pages: urls.length,
          session_type: 'sitemap',
          scraping_config: {
            service: 'firecrawl',
            extractionPrompt,
            maxPages
          }
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      // Create page entries
      const pageEntries = urls.map((url, index) => ({
        session_id: sessionData.id,
        url,
        status: 'pending',
        page_index: index
      }));

      const { error: pagesError } = await supabase
        .from('scraping_pages')
        .insert(pageEntries);

      if (pagesError) throw pagesError;

      toast({
        title: "Success",
        description: `Session created with ${urls.length} pages`,
      });

      // Navigate to session detail
      setSelectedSessionId(sessionData.id);
      setViewMode('detail');
      
    } catch (error) {
      console.error('Error creating session:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create session",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const renderCreateForm = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" onClick={() => setViewMode('sessions')}>
          ← Back to Sessions
        </Button>
        <h1 className="text-2xl font-bold">Create New Scraping Session</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Sitemap Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="sitemap-url">Sitemap URL</Label>
            <Input
              id="sitemap-url"
              type="url"
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder="https://example.com/sitemap.xml"
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Enter the XML sitemap URL to scrape pages from
            </p>
          </div>

          <div>
            <Label htmlFor="max-pages">Maximum Pages</Label>
            <Input
              id="max-pages"
              type="number"
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 100)}
              min="1"
              max="1000"
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Limit the number of pages to process (1-1000)
            </p>
          </div>

          <div>
            <Label htmlFor="extraction-prompt">Extraction Prompt</Label>
            <Textarea
              id="extraction-prompt"
              value={extractionPrompt}
              onChange={(e) => setExtractionPrompt(e.target.value)}
              rows={6}
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Instructions for what material information to extract from each page
            </p>
          </div>

          <Button 
            onClick={createNewSession} 
            disabled={creating || !sitemapUrl.trim()}
            className="w-full"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Session...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Session
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  // Main render logic
  switch (viewMode) {
    case 'create':
      return renderCreateForm();
    
    case 'detail':
      return (
        <SessionDetailView 
          sessionId={selectedSessionId}
          onBack={() => setViewMode('sessions')}
        />
      );
    
    default:
      return (
        <ScrapingSessionsList
          onSelectSession={(sessionId) => {
            setSelectedSessionId(sessionId);
            setViewMode('detail');
          }}
          onCreateNew={() => setViewMode('create')}
        />
      );
  }
};