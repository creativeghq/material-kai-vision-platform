import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { Activity, Clock, Globe, CheckCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface LiveProcessingMonitorProps {
  sessionId: string;
}

interface ProcessingStats {
  currentPageUrl: string | null;
  pagesPerMinute: number;
  avgProcessingTime: number;
  estimatedTimeRemaining: string;
  recentActivity: Array<{
    url: string;
    status: string;
    materialsFound: number;
    processingTime: number;
    timestamp: string;
  }>;
}

export const LiveProcessingMonitor: React.FC<LiveProcessingMonitorProps> = ({ sessionId }) => {
  const [stats, setStats] = useState<ProcessingStats>({
    currentPageUrl: null,
    pagesPerMinute: 0,
    avgProcessingTime: 0,
    estimatedTimeRemaining: 'Calculating...',
    recentActivity: []
  });
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    // Update elapsed time every second
    const timer = setInterval(() => {
      setElapsedTime(Date.now() - startTime);
    }, 1000);

    // Load processing stats
    loadProcessingStats();
    
    // Set up real-time subscription for page updates
    const channel = supabase
      .channel(`live_processing_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_pages',
          filter: `session_id=eq.${sessionId}`
        },
        () => {
          loadProcessingStats();
        }
      )
      .subscribe();

    // Refresh stats every 30 seconds
    const statsRefresh = setInterval(loadProcessingStats, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(statsRefresh);
      supabase.removeChannel(channel);
    };
  }, [sessionId, startTime]);

  const loadProcessingStats = async () => {
    try {
      // Get session info
      const { data: session } = await supabase
        .from('scraping_sessions')
        .select('current_page_url, completed_pages, total_pages')
        .eq('id', sessionId)
        .single();

      // Get recent page completions (last 10)
      const { data: recentPages } = await supabase
        .from('scraping_pages')
        .select('url, status, materials_found, processing_time_ms, completed_at')
        .eq('session_id', sessionId)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(10);

      // Calculate stats
      const completedPages = recentPages || [];
      const now = new Date();
      const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
      
      const recentCompletions = completedPages.filter(page => 
        page.completed_at && new Date(page.completed_at) > last5Minutes
      );

      const pagesPerMinute = recentCompletions.length;
      const avgProcessingTime = completedPages.length > 0
        ? completedPages.reduce((sum, page) => sum + (page.processing_time_ms || 0), 0) / completedPages.length
        : 0;

      // Estimate time remaining
      const remainingPages = (session?.total_pages || 0) - (session?.completed_pages || 0);
      const estimatedMinutes = pagesPerMinute > 0 
        ? Math.ceil(remainingPages / pagesPerMinute)
        : 0;
      
      const estimatedTimeRemaining = estimatedMinutes > 0
        ? `~${estimatedMinutes} minutes`
        : 'Calculating...';

      // Format recent activity
      const recentActivity = completedPages.slice(0, 5).map(page => ({
        url: page.url,
        status: page.status,
        materialsFound: page.materials_found,
        processingTime: page.processing_time_ms || 0,
        timestamp: page.completed_at || ''
      }));

      setStats({
        currentPageUrl: session?.current_page_url || null,
        pagesPerMinute,
        avgProcessingTime,
        estimatedTimeRemaining,
        recentActivity
      });

    } catch (error) {
      console.error('Error loading processing stats:', error);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-800">
          <Activity className="h-5 w-5 animate-pulse" />
          Live Processing Monitor
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="text-center p-3 bg-white rounded-lg border">
            <Clock className="h-6 w-6 text-blue-600 mx-auto mb-2" />
            <p className="text-lg font-bold text-blue-600">
              {formatTime(elapsedTime)}
            </p>
            <p className="text-sm text-gray-600">Elapsed Time</p>
          </div>
          
          <div className="text-center p-3 bg-white rounded-lg border">
            <Globe className="h-6 w-6 text-green-600 mx-auto mb-2" />
            <p className="text-lg font-bold text-green-600">
              {stats.pagesPerMinute}
            </p>
            <p className="text-sm text-gray-600">Pages/5min</p>
          </div>
          
          <div className="text-center p-3 bg-white rounded-lg border">
            <Activity className="h-6 w-6 text-orange-600 mx-auto mb-2" />
            <p className="text-lg font-bold text-orange-600">
              {(stats.avgProcessingTime / 1000).toFixed(1)}s
            </p>
            <p className="text-sm text-gray-600">Avg Time/Page</p>
          </div>
          
          <div className="text-center p-3 bg-white rounded-lg border">
            <Clock className="h-6 w-6 text-purple-600 mx-auto mb-2" />
            <p className="text-lg font-bold text-purple-600">
              {stats.estimatedTimeRemaining}
            </p>
            <p className="text-sm text-gray-600">Est. Remaining</p>
          </div>
        </div>

        {/* Current Page */}
        {stats.currentPageUrl && (
          <div className="mb-6 p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
              <span className="font-semibold">Currently Processing:</span>
            </div>
            <p className="text-sm text-blue-600 truncate">{stats.currentPageUrl}</p>
          </div>
        )}

        {/* Recent Activity */}
        <div>
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            Recent Activity
          </h4>
          
          {stats.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No recent activity yet...
            </p>
          ) : (
            <div className="space-y-2">
              {stats.recentActivity.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-white rounded border">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{activity.url}</p>
                    <p className="text-xs text-gray-500">
                      {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activity.materialsFound > 0 && (
                      <Badge variant="outline" className="text-green-600">
                        {activity.materialsFound} materials
                      </Badge>
                    )}
                    <Badge className="bg-green-100 text-green-800">
                      {activity.status}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {(activity.processingTime / 1000).toFixed(1)}s
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};