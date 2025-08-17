import React, { useState, useEffect } from 'react';
import { Clock, Globe, CheckCircle, XCircle, AlertCircle, Play, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

interface ScrapingSession {
  id: string;
  session_id: string;
  user_id: string | null;
  source_url: string;
  status: string;
  scraping_config: Json | null;
  progress_percentage: number | null;
  total_pages: number | null;
  completed_pages: number | null;
  failed_pages: number | null;
  materials_processed: number | null;
  created_at: string;
  updated_at: string;
}

interface ScrapingSessionsListProps {
  onSelectSession: (sessionId: string) => void;
  onCreateNew: () => void;
}

export const ScrapingSessionsList: React.FC<ScrapingSessionsListProps> = ({
  onSelectSession,
  onCreateNew,
}) => {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<ScrapingSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSessions();

    // Set up real-time subscription for session updates
    const channel = supabase
      .channel('scraping_sessions_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scraping_sessions',
        },
        () => {
          loadSessions();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSessions = async () => {
    try {
      const { data, error } = await supabase
        .from('scraping_sessions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load scraping sessions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteSession = async (sessionId: string) => {
    try {
      // Delete materials first
      await supabase
        .from('scraped_materials_temp')
        .delete()
        .eq('scraping_session_id', sessionId);

      // Delete pages
      await supabase
        .from('scraping_pages')
        .delete()
        .eq('session_id', sessionId);

      // Delete session
      await supabase
        .from('scraping_sessions')
        .delete()
        .eq('id', sessionId);

      toast({
        title: 'Success',
        description: 'Session deleted successfully',
      });

      loadSessions();
    } catch (error) {
      console.error('Error deleting session:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete session',
        variant: 'destructive',
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
        return <AlertCircle className="h-4 w-4 text-blue-500 animate-pulse" />;
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

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading sessions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Scraping Sessions</h2>
        <Button onClick={onCreateNew} className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          New Session
        </Button>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No scraping sessions yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first scraping session to start extracting materials from websites.
            </p>
            <Button onClick={onCreateNew}>
              Create New Session
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <Card key={session.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {getStatusIcon(session.status)}
                      <span className="truncate">{session.source_url}</span>
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={getStatusColor(session.status)}>
                        {session.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(session.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => onSelectSession(session.id)}
                      className="h-9 rounded-md px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    >
                      View Details
                    </Button>
                    <Button
                      onClick={() => deleteSession(session.id)}
                      className="h-9 rounded-md px-3 border border-input bg-background hover:bg-accent hover:text-accent-foreground text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Progress</span>
                      <span>{Math.round(session.progress_percentage || 0)}%</span>
                    </div>
                    <Progress value={session.progress_percentage || 0} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Pages</p>
                      <p className="font-semibold">{session.total_pages}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Completed</p>
                      <p className="font-semibold text-green-600">{session.completed_pages}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Failed</p>
                      <p className="font-semibold text-red-600">{session.failed_pages}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Materials Found</p>
                      <p className="font-semibold text-blue-600">{session.materials_processed || 0}</p>
                    </div>
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
