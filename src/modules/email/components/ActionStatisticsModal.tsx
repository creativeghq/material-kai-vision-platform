/**
 * Action Statistics Modal
 * Display statistics for a specific email action
 */

import React, { useState, useEffect } from 'react';
import { X, Mail, CheckCircle, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EmailAction {
  id: string;
  action_key: string;
  action_name: string;
}

interface ActionStatisticsModalProps {
  action: EmailAction;
  onClose: () => void;
}

interface Statistics {
  totalSent: number;
  totalDelivered: number;
  totalBounced: number;
  totalComplained: number;
  totalOpened: number;
  totalClicked: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

export const ActionStatisticsModal: React.FC<ActionStatisticsModalProps> = ({
  action,
  onClose,
}) => {
  const [statistics, setStatistics] = useState<Statistics>({
    totalSent: 0,
    totalDelivered: 0,
    totalBounced: 0,
    totalComplained: 0,
    totalOpened: 0,
    totalClicked: 0,
    deliveryRate: 0,
    openRate: 0,
    clickRate: 0,
    bounceRate: 0,
    complaintRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadStatistics();
  }, [action.id]);

  const loadStatistics = async () => {
    try {
      setLoading(true);

      // Query email_logs for this action
      const { data, error } = await supabase
        .from('email_logs')
        .select('status, opened_at, clicked_at')
        .eq('metadata->>action_key', action.action_key);

      if (error) throw error;

      const logs = data || [];
      const totalSent = logs.length;
      const totalDelivered = logs.filter(log => log.status === 'delivered').length;
      const totalBounced = logs.filter(log => log.status === 'bounced').length;
      const totalComplained = logs.filter(log => log.status === 'complained').length;
      const totalOpened = logs.filter(log => log.opened_at).length;
      const totalClicked = logs.filter(log => log.clicked_at).length;

      const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
      const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered) * 100 : 0;
      const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
      const bounceRate = totalSent > 0 ? (totalBounced / totalSent) * 100 : 0;
      const complaintRate = totalSent > 0 ? (totalComplained / totalSent) * 100 : 0;

      setStatistics({
        totalSent,
        totalDelivered,
        totalBounced,
        totalComplained,
        totalOpened,
        totalClicked,
        deliveryRate,
        openRate,
        clickRate,
        bounceRate,
        complaintRate,
      });
    } catch (error) {
      console.error('Error loading statistics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load statistics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Statistics: {action.action_name}</span>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading statistics...
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overview Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Mail className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Total Sent</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalSent.toLocaleString()}</p>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Delivered</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalDelivered.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{statistics.deliveryRate.toFixed(1)}%</p>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Opened</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalOpened.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{statistics.openRate.toFixed(1)}%</p>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm font-medium">Bounced</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalBounced.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{statistics.bounceRate.toFixed(1)}%</p>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">Complaints</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalComplained.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{statistics.complaintRate.toFixed(1)}%</p>
              </div>

              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm font-medium">Clicked</span>
                </div>
                <p className="text-2xl font-bold">{statistics.totalClicked.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">{statistics.clickRate.toFixed(1)}%</p>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <h4 className="font-medium mb-2">Performance Summary</h4>
              <div className="space-y-2 text-sm">
                {statistics.deliveryRate >= 95 && (
                  <p className="text-green-600">✓ Excellent delivery rate</p>
                )}
                {statistics.bounceRate > 5 && (
                  <p className="text-red-600">⚠ High bounce rate - consider cleaning email list</p>
                )}
                {statistics.complaintRate > 0.1 && (
                  <p className="text-yellow-600">⚠ Elevated complaint rate - review email content</p>
                )}
                {statistics.openRate < 20 && statistics.totalSent > 10 && (
                  <p className="text-yellow-600">⚠ Low open rate - consider improving subject lines</p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ActionStatisticsModal;

