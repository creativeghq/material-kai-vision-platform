/**
 * Email Actions Tab
 * Manage email actions (triggers) and assign templates to them
 */

import React, { useState, useEffect } from 'react';
import { Settings, BarChart3 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ActionStatisticsModal } from './ActionStatisticsModal';
import { AssignTemplateModal } from './AssignTemplateModal';

interface EmailAction {
  id: string;
  action_key: string;
  action_name: string;
  description?: string;
  template_id?: string;
  is_active: boolean;
  template?: {
    id: string;
    name: string;
    slug: string;
  };
}

export const EmailActionsTab: React.FC = () => {
  const [actions, setActions] = useState<EmailAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAction, setSelectedAction] = useState<EmailAction | null>(null);
  const [showStatistics, setShowStatistics] = useState(false);
  const [showAssignTemplate, setShowAssignTemplate] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadActions();
  }, []);

  const loadActions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('email_actions')
        .select(`
          *,
          template:email_templates(id, name, slug)
        `)
        .order('action_name', { ascending: true });

      if (error) throw error;
      setActions(data || []);
    } catch (error) {
      console.error('Error loading actions:', error);
      toast({
        title: 'Error',
        description: 'Failed to load email actions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleActionStatus = async (actionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('email_actions')
        .update({ is_active: !currentStatus })
        .eq('id', actionId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Action ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
      });

      loadActions();
    } catch (error) {
      console.error('Error toggling action status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update action status',
        variant: 'destructive',
      });
    }
  };

  const handleAssignTemplate = (action: EmailAction) => {
    setSelectedAction(action);
    setShowAssignTemplate(true);
  };

  const handleViewStatistics = (action: EmailAction) => {
    setSelectedAction(action);
    setShowStatistics(true);
  };

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading actions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        title="Email Actions"
        subtitle="Manage trigger-based emails and assign templates to each action"
      />

      {/* Actions Table */}
      <div className="dashboard-card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Action</th>
                <th className="text-left py-3 px-4 font-medium">Description</th>
                <th className="text-left py-3 px-4 font-medium">Template</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((action) => (
                <tr key={action.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-3 px-4">
                    <div className="font-medium">{action.action_name}</div>
                    <div className="text-xs text-muted-foreground">{action.action_key}</div>
                  </td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {action.description || '-'}
                  </td>
                  <td className="py-3 px-4">
                    {action.template ? (
                      <Badge variant="outline">{action.template.name}</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">No template assigned</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={action.is_active}
                        onCheckedChange={() => toggleActionStatus(action.id, action.is_active)}
                      />
                      <span className="text-sm">
                        {action.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAssignTemplate(action)}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Assign template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewStatistics(action)}
                      >
                        <BarChart3 className="h-4 w-4 mr-1" />
                        Statistics
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {selectedAction && showStatistics && (
        <ActionStatisticsModal
          action={selectedAction}
          onClose={() => {
            setShowStatistics(false);
            setSelectedAction(null);
          }}
        />
      )}

      {selectedAction && showAssignTemplate && (
        <AssignTemplateModal
          action={selectedAction}
          onClose={() => {
            setShowAssignTemplate(false);
            setSelectedAction(null);
          }}
          onSuccess={() => {
            loadActions();
            setShowAssignTemplate(false);
            setSelectedAction(null);
          }}
        />
      )}
    </div>
  );
};

export default EmailActionsTab;

