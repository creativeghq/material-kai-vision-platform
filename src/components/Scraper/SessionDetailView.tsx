import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ApiIntegrationService } from '@/services/apiGateway/apiIntegrationService';
import { ArrowLeft, Play, Pause, RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { PageQueueViewer } from './PageQueueViewer';
import { LiveProcessingMonitor } from './LiveProcessingMonitor';

interface SessionDetailViewProps {
  sessionId: string;
  onBack: () => void;
}

interface ScrapingSession {
  id: string;
  session_id: string;
  source_url: string;
  status: string;
  total_pages: number;
  completed_pages: number;
  failed_pages: number;
  pending_pages: number;
  total_materials_found: number;
  progress_percentage: number;
  created_at: string;
  updated_at: string;
  session_type: string;
  current_page_url: string;
  scraping_config: any;
}

export const SessionDetailView: React.FC<SessionDetailViewProps> = ({
  sessionId,
  onBack
}) => {
  const { toast } = useToast();
  const [session, setSession] = useState<ScrapingSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadSession();
    
    // Set up real-time subscription
    const channel = supabase
      .channel(`session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_sessions',
          filter: `id=eq.${sessionId}`
        },
        () => {
          loadSession();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadSession = async () => {
    try {
      const { data, error } = await supabase
        .from('scraping_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      setSession(data);
    } catch (error) {
      console.error('Error loading session:', error);
      toast({
        title: "Error",
        description: "Failed to load session details",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const startProcessing = async () => {
    if (!session) return;
    
    setProcessing(true);
    try {
      // Update session status to processing
      await supabase
        .from('scraping_sessions')
        .update({ status: 'processing' })
        .eq('id', sessionId);

      // Start processing by calling our new processing logic
      const apiService = ApiIntegrationService.getInstance();
      const result = await apiService.executeSupabaseFunction('scrape-session-manager', {
        sessionId: sessionId,
        action: 'start'
      });

      if (!result.success) {
        throw new Error(result.error?.message || 'Failed to start scraping');
      }

      toast({
        title: "Success",
        description: "Scraping started successfully",
      });
    } catch (error) {
      console.error('Error starting processing:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start scraping",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const pauseProcessing = async () => {
    setProcessing(true);
    try {
      await supabase
        .from('scraping_sessions')
        .update({ status: 'paused' })
        .eq('id', sessionId);

      toast({
        title: "Success",
        description: "Scraping paused",
      });
    } catch (error) {
      console.error('Error pausing processing:', error);
      toast({
        title: "Error",
        description: "Failed to pause scraping",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading session details...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="text-center p-8">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Session not found</h3>
        <Button onClick={onBack} variant="outline">
          Go Back
        </Button>
      </div>
    );
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'processing':
        return <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'paused':
        return <Pause className="h-5 w-5 text-yellow-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  const canStart = ['pending', 'paused', 'failed'].includes(session.status);
  const canPause = session.status === 'processing';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sessions
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            {getStatusIcon(session.status)}
            Session Details
          </h1>
          <p className="text-muted-foreground">{session.source_url}</p>
        </div>
        <div className="flex gap-2">
          {canStart && (
            <Button onClick={startProcessing} disabled={processing}>
              <Play className="h-4 w-4 mr-2" />
              {session.status === 'paused' ? 'Resume' : 'Start'}
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={pauseProcessing} disabled={processing}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
        </div>
      </div>

      {/* Session Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Session Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className="mt-1">{session.status}</Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="font-semibold">
                {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Session Type</p>
              <p className="font-semibold capitalize">{session.session_type}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Current Page</p>
              <p className="font-semibold text-sm truncate">
                {session.current_page_url || 'None'}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Overall Progress</span>
              <span>{Math.round(session.progress_percentage || 0)}%</span>
            </div>
            <Progress value={session.progress_percentage || 0} className="h-3" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-600">{session.total_pages}</p>
              <p className="text-sm text-blue-600">Total Pages</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-600">{session.completed_pages}</p>
              <p className="text-sm text-green-600">Completed</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <p className="text-2xl font-bold text-red-600">{session.failed_pages}</p>
              <p className="text-sm text-red-600">Failed</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-600">{session.total_materials_found}</p>
              <p className="text-sm text-purple-600">Materials Found</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Processing Monitor */}
      {session.status === 'processing' && (
        <LiveProcessingMonitor sessionId={sessionId} />
      )}

      {/* Page Queue */}
      <PageQueueViewer sessionId={sessionId} />
    </div>
  );
};