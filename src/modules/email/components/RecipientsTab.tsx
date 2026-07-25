/**
 * Recipients Tab Component
 * Displays and manages campaign recipients
 */

import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';

interface Recipient {
  id: string;
  email: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
  error_message?: string;
}

interface RecipientsTabProps {
  campaignId: string;
}

export const RecipientsTab: React.FC<RecipientsTabProps> = ({ campaignId }) => {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadRecipients();
  }, [campaignId]);

  const loadRecipients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('campaign_recipients')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecipients(data || []);
    } catch (error) {
      console.error('Error loading recipients:', error);
      toast({
        title: 'Error',
        description: 'Failed to load recipients',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveRecipient = async (recipientId: string) => {
    if (!confirm('Are you sure you want to remove this recipient?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('campaign_recipients')
        .delete()
        .eq('id', recipientId)
        .eq('status', 'pending');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Recipient removed successfully',
      });

      loadRecipients();
    } catch (error) {
      console.error('Error removing recipient:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove recipient. Only pending recipients can be removed.',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => (
    <span className={`text-sm capitalize ${statusTone(status)}`}>
      {humanizeLabel(status)}
    </span>
  );

  const filteredRecipients = recipients.filter(r =>
    r.email.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search recipients..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="sm" onClick={loadRecipients}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Recipients Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium">Email</th>
                <th className="text-left p-3 text-sm font-medium">Status</th>
                <th className="text-left p-3 text-sm font-medium">Sent</th>
                <th className="text-left p-3 text-sm font-medium">Opened</th>
                <th className="text-left p-3 text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredRecipients.map((recipient) => (
                <tr key={recipient.id} className="hover:bg-muted/50">
                  <td className="p-3 text-sm">{recipient.email}</td>
                  <td className="p-3">{getStatusBadge(recipient.status)}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {recipient.sent_at ? format(new Date(recipient.sent_at), 'MMM d, HH:mm') : '-'}
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {recipient.opened_at ? format(new Date(recipient.opened_at), 'MMM d, HH:mm') : '-'}
                  </td>
                  <td className="p-3">
                    {recipient.status === 'pending' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveRecipient(recipient.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredRecipients.length === 0 && (
        <div className="text-center p-8 text-muted-foreground">
          No recipients found
        </div>
      )}
    </div>
  );
};

