import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ApiIntegrationService } from '@/services/apiGateway/apiIntegrationService';
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ScrapingPage {
  id: string;
  url: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  materials_found: number;
  error_message: string | null;
  processing_time_ms: number | null;
  retry_count: number;
  page_index: number;
  created_at: string;
  updated_at: string;
}

interface PageQueueViewerProps {
  sessionId: string;
}

export const PageQueueViewer: React.FC<PageQueueViewerProps> = ({ sessionId }) => {
  const { toast } = useToast();
  const [pages, setPages] = useState<ScrapingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadPages();
    
    // Set up real-time subscription for page updates
    const channel = supabase
      .channel(`pages_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_pages',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          loadPages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadPages = async () => {
    try {
      const { data, error } = await supabase
        .from('scraping_pages')
        .select('*')
        .eq('session_id', sessionId)
        .order('page_index', { ascending: true });

      if (error) throw error;
      setPages(data || []);
    } catch (error) {
      console.error('Error loading pages:', error);
      toast({
        title: "Error",
        description: "Failed to load pages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const retryPage = async (pageId: string) => {
    const apiService = ApiIntegrationService.getInstance();
    
    try {
      // Reset page status to pending
      await supabase
        .from('scraping_pages')
        .update({
          status: 'pending',
          error_message: null,
          started_at: null,
          completed_at: null
        })
        .eq('id', pageId);

      // Trigger single page processing
      const page = pages.find(p => p.id === pageId);
      if (page) {
        const result = await apiService.executeSupabaseFunction('scrape-single-page', {
          pageUrl: page.url,
          sessionId: sessionId,
          pageId: pageId,
          options: {
            service: 'firecrawl',
            retryAttempt: page.retry_count + 1
          }
        });

        if (!result.success) throw new Error(result.error?.message || 'Unknown error');
      }

      toast({
        title: "Success",
        description: "Page retry started",
      });
    } catch (error) {
      console.error('Error retrying page:', error);
      toast({
        title: "Error",
        description: "Failed to retry page",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const filteredPages = pages.filter(page => {
    const matchesSearch = page.url.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || page.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusCounts = pages.reduce((acc, page) => {
    acc[page.status] = (acc[page.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading pages...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Page Queue ({pages.length} total)</CardTitle>
          <Button variant="outline" size="sm" onClick={loadPages}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
        
        {/* Status Summary */}
        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">
            Pending: {statusCounts.pending || 0}
          </Badge>
          <Badge variant="outline">
            Processing: {statusCounts.processing || 0}
          </Badge>
          <Badge variant="outline">
            Completed: {statusCounts.completed || 0}
          </Badge>
          <Badge variant="outline">
            Failed: {statusCounts.failed || 0}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search URLs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {/* Pages List */}
        <div className="space-y-2">
          {filteredPages.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              No pages found matching your criteria.
            </div>
          ) : (
            filteredPages.map((page) => (
              <div
                key={page.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {getStatusIcon(page.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-gray-600">
                        #{page.page_index + 1}
                      </span>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline truncate flex items-center gap-1"
                      >
                        {page.url}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {page.error_message && (
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {page.error_message}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Badge className={getStatusColor(page.status)}>
                    {page.status}
                  </Badge>
                  
                  {page.materials_found > 0 && (
                    <Badge variant="outline">
                      {page.materials_found} materials
                    </Badge>
                  )}
                  
                  {page.processing_time_ms && (
                    <span className="text-xs text-gray-500">
                      {(page.processing_time_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                  
                  {page.retry_count > 0 && (
                    <Badge variant="outline" className="text-orange-600">
                      Retry {page.retry_count}
                    </Badge>
                  )}
                  
                  {page.status === 'failed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryPage(page.id)}
                    >
                      Retry
                    </Button>
                  )}
                  
                  {page.completed_at && (
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(page.completed_at), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};