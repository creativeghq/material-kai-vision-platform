/**
 * Webhook History Component
 *
 * Displays webhook call history for jobs including:
 * - Webhook URL and endpoint
 * - Request/response details
 * - Status codes and error messages
 * - Retry attempts
 * - Timing information
 */

import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle, Clock, AlertCircle, Eye, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';

export interface WebhookCall {
  id: string;
  job_id: string;
  job_type: 'pdf' | 'xml_import' | 'web_scraping';
  webhook_url: string;
  request_payload: Record<string, any>;
  response_status?: number;
  response_body?: Record<string, any>;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  created_at: string;
  completed_at?: string;
  next_retry_at?: string;
}

interface WebhookHistoryProps {
  jobId?: string;
  jobType?: 'pdf' | 'xml_import' | 'web_scraping';
  limit?: number;
}

export const WebhookHistory: React.FC<WebhookHistoryProps> = ({
  jobId,
  jobType,
  limit = 50,
}) => {
  const [webhooks, setWebhooks] = useState<WebhookCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWebhook, setSelectedWebhook] = useState<WebhookCall | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadWebhookHistory();

    // Set up real-time subscription for webhook_calls
    const channel = supabase
      .channel(`webhook_calls_${jobId || 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'webhook_calls',
          filter: jobId ? `job_id=eq.${jobId}` : undefined,
        },
        () => {
          console.log('webhook_calls changed - refreshing data');
          loadWebhookHistory();
        },
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, [jobId, jobType]);

  const loadWebhookHistory = async () => {
    try {
      setLoading(true);

      let query = supabase
        .from('webhook_calls')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (jobId) {
        query = query.eq('job_id', jobId);
      }

      if (jobType) {
        query = query.eq('job_type', jobType);
      }

      const { data, error } = await query;

      if (error) throw error;

      setWebhooks(data || []);
    } catch (error) {
      console.error('Error loading webhook history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load webhook history',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (webhookId: string) => {
    try {
      setRetrying(webhookId);

      // Call Edge Function to retry webhook
      const { data, error } = await supabase.functions.invoke('retry-webhook', {
        body: { webhook_id: webhookId },
      });

      if (error) throw error;

      if (!data.success) {
        throw new Error(data.error || 'Retry failed');
      }

      toast({
        title: 'Webhook Retried',
        description: 'Webhook call has been queued for retry',
      });

      await loadWebhookHistory();
    } catch (error: any) {
      console.error('Error retrying webhook:', error);
      toast({
        title: 'Retry Failed',
        description: error.message || 'Failed to retry webhook',
        variant: 'destructive',
      });
    } finally {
      setRetrying(null);
    }
  };

  const getStatusBadge = (webhook: WebhookCall) => {
    if (!webhook.response_status) {
      if (webhook.error_message) {
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      }
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Pending
        </Badge>
      );
    }

    if (webhook.response_status >= 200 && webhook.response_status < 300) {
      return (
        <Badge className="bg-green-600">
          <CheckCircle className="h-3 w-3 mr-1" />
          Success
        </Badge>
      );
    }

    return (
      <Badge variant="destructive">
        <XCircle className="h-3 w-3 mr-1" />
        HTTP {webhook.response_status}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getDuration = (webhook: WebhookCall) => {
    if (!webhook.completed_at) return 'In progress...';
    const start = new Date(webhook.created_at).getTime();
    const end = new Date(webhook.completed_at).getTime();
    return `${end - start}ms`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (webhooks.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <AlertCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
        <p>No webhook calls found</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {webhooks.map((webhook) => (
          <Card key={webhook.id} className="bg-gray-700/30 border-gray-600">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ExternalLink className="h-4 w-4 text-blue-400" />
                    <span className="text-sm text-white font-mono truncate">
                      {webhook.webhook_url}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>Job: {webhook.job_id.slice(0, 8)}</span>
                    <span>•</span>
                    <span>{formatDate(webhook.created_at)}</span>
                    <span>•</span>
                    <span>Duration: {getDuration(webhook)}</span>
                  </div>
                </div>
                {getStatusBadge(webhook)}
              </div>

              {/* Retry Information */}
              {webhook.retry_count > 0 && (
                <div className="mb-2 text-xs text-yellow-400">
                  Retry {webhook.retry_count}/{webhook.max_retries}
                </div>
              )}

              {/* Error Message */}
              {webhook.error_message && (
                <div className="mb-3 p-2 bg-red-900/20 border border-red-700/30 rounded text-xs text-red-300">
                  {webhook.error_message}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedWebhook(webhook)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  View Details
                </Button>

                {webhook.error_message && webhook.retry_count < webhook.max_retries && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRetry(webhook.id)}
                    disabled={retrying === webhook.id}
                  >
                    {retrying === webhook.id ? (
                      <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3 mr-1" />
                    )}
                    Retry
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Webhook Details Modal */}
      {selectedWebhook && (
        <Dialog open={!!selectedWebhook} onOpenChange={() => setSelectedWebhook(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Webhook Call Details</DialogTitle>
              <DialogDescription>
                {selectedWebhook.webhook_url}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Request Payload */}
              <div>
                <h4 className="font-semibold mb-2">Request Payload</h4>
                <pre className="bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                  {JSON.stringify(selectedWebhook.request_payload, null, 2)}
                </pre>
              </div>

              {/* Response */}
              {selectedWebhook.response_body && (
                <div>
                  <h4 className="font-semibold mb-2">Response Body</h4>
                  <pre className="bg-gray-900 p-3 rounded text-xs overflow-x-auto">
                    {JSON.stringify(selectedWebhook.response_body, null, 2)}
                  </pre>
                </div>
              )}

              {/* Error */}
              {selectedWebhook.error_message && (
                <div>
                  <h4 className="font-semibold mb-2 text-red-400">Error Message</h4>
                  <p className="bg-red-900/20 border border-red-700/30 p-3 rounded text-sm text-red-300">
                    {selectedWebhook.error_message}
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

