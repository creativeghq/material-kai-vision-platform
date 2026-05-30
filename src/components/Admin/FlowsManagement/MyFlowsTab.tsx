import React, { useState } from 'react';
import { format } from 'date-fns';
import {
  Plus,
  Copy,
  Trash2,
  Play,
  PlayCircle,
  Pause,
  Pencil,
  MoreHorizontal,
  Zap,
  Globe,
  Clock,
  UserPlus,
  FileText,
  Image,
  Hand,
  LogIn,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  FileCheck,
  Package,
  Search,
  Box,
  Orbit,
  SearchCheck,
  ScanEye,
  PackagePlus,
  LayoutGrid,
  ImagePlus,
  Share2,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { flowService } from '@/services/flows';
import type { Flow, FlowStatus, TriggerType } from '@/services/flows';
import { useToast } from '@/hooks/use-toast';

interface MyFlowsTabProps {
  flows: Flow[];
  loading: boolean;
  onRefresh: () => void;
  onOpenBuilder: (flowId: string) => void;
}

const triggerIcons: Record<TriggerType, React.ElementType> = {
  manual: Hand,
  scheduled: Clock,
  webhook: Globe,
  user_signup: UserPlus,
  user_login: LogIn,
  quote_requested: FileText,
  quote_approved: CheckCircle2,
  quote_rejected: XCircle,
  contract_created: ClipboardCheck,
  image_uploaded: Image,
  document_processed: FileCheck,
  product_added: Package,
  search_executed: Search,
  model_3d_created: Box,
  vr_world_created: Orbit,
  agent_search_completed: SearchCheck,
  agent_image_analyzed: ScanEye,
  product_added_to_quote: PackagePlus,
  moodboard_created: LayoutGrid,
  moodboard_item_added: ImagePlus,
  moodboard_shared: Share2,
  moodboard_commented: ImagePlus,
  hire_me_received: UserPlus,
  profile_followed: UserPlus,
  profile_published: UserPlus,
  material_reviewed: CheckCircle2,
  preferred_factory_added: Package,
  quote_pdf_generated: FileCheck,
  factory_approved: CheckCircle2,
  factory_rejected: XCircle,
  appointment_booked: Clock,
  appointment_confirmed: CheckCircle2,
  appointment_cancelled: XCircle,
  svbrdf_extraction_complete: ScanEye,
  virtual_staging_completed: Image,
  vr_world_failed: XCircle,
  video_generation_completed: CheckCircle2,
  video_generation_failed: XCircle,
  background_agent_failed: XCircle,
  role_upgrade_request_submitted: UserPlus,
  role_upgrade_approved: CheckCircle2,
  role_upgrade_rejected: XCircle,
  stripe_payment_succeeded: CheckCircle2,
  stripe_payment_failed: XCircle,
  project_invitation_sent: Share2,
  project_invitation_resent: Share2,
};

const triggerLabels: Record<TriggerType, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  webhook: 'Webhook',
  user_signup: 'User Signup',
  user_login: 'User Login',
  quote_requested: 'Quote Requested',
  quote_approved: 'Quote Approved',
  quote_rejected: 'Quote Rejected',
  contract_created: 'Contract Created',
  image_uploaded: 'Image Uploaded',
  document_processed: 'Doc Processed',
  product_added: 'Product Added',
  search_executed: 'Search Executed',
  model_3d_created: '3D Model Created',
  vr_world_created: 'VR World Created',
  agent_search_completed: 'Agent Search Done',
  agent_image_analyzed: 'Image Analyzed',
  product_added_to_quote: 'Product → Quote',
  moodboard_created: 'Moodboard Created',
  moodboard_item_added: 'Moodboard Item Added',
  moodboard_shared: 'Moodboard Shared',
  moodboard_commented: 'Moodboard Commented',
  hire_me_received: 'Hire Me Received',
  profile_followed: 'Profile Followed',
  profile_published: 'Profile Published',
  material_reviewed: 'Material Reviewed',
  preferred_factory_added: 'Preferred Factory Added',
  quote_pdf_generated: 'Quote PDF Ready',
  factory_approved: 'Factory Approved',
  factory_rejected: 'Factory Rejected',
  appointment_booked: 'Appointment Booked',
  appointment_confirmed: 'Appointment Confirmed',
  appointment_cancelled: 'Appointment Cancelled',
  svbrdf_extraction_complete: 'SVBRDF Extracted',
  virtual_staging_completed: 'Virtual Staging Done',
  vr_world_failed: 'VR World Failed',
  video_generation_completed: 'Video Generated',
  video_generation_failed: 'Video Failed',
  background_agent_failed: 'Agent Failed',
  role_upgrade_request_submitted: 'Role Upgrade Requested',
  role_upgrade_approved: 'Role Upgrade Approved',
  role_upgrade_rejected: 'Role Upgrade Rejected',
  stripe_payment_succeeded: 'Payment Succeeded',
  stripe_payment_failed: 'Payment Failed',
  project_invitation_sent: 'Project Invite Sent',
  project_invitation_resent: 'Project Invite Resent',
};

const statusColors: Record<FlowStatus, string> = {
  draft: 'bg-gray-500/10 text-gray-500',
  active: 'bg-green-500/10 text-green-500',
  paused: 'bg-amber-500/10 text-amber-500',
  archived: 'bg-red-500/10 text-red-500',
};

export const MyFlowsTab: React.FC<MyFlowsTabProps> = ({
  flows,
  loading,
  onRefresh,
  onOpenBuilder,
}) => {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [newFlow, setNewFlow] = useState({ name: '', description: '' });
  const { toast } = useToast();

  const handleRunNow = async (flow: Flow) => {
    try {
      setRunningId(flow.id);
      const run = await flowService.executeFlow(flow.id, {});
      toast({
        title: run.status === 'failed' ? 'Flow run failed' : 'Flow ran',
        description: `"${flow.name}" — ${run.status}`,
        variant: run.status === 'failed' ? 'destructive' : undefined,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to run flow',
        variant: 'destructive',
      });
    } finally {
      setRunningId(null);
    }
  };

  const handleCreate = async () => {
    if (!newFlow.name.trim()) {
      toast({ title: 'Error', description: 'Flow name is required', variant: 'destructive' });
      return;
    }

    try {
      setCreating(true);
      await flowService.createFlow({
        name: newFlow.name.trim(),
        description: newFlow.description.trim() || undefined,
      });
      toast({ title: 'Success', description: 'Flow created successfully' });
      setShowCreateDialog(false);
      setNewFlow({ name: '', description: '' });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create flow',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (flow: Flow) => {
    try {
      await flowService.deleteFlow(flow.id);
      toast({ title: 'Deleted', description: `"${flow.name}" has been deleted` });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete flow',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicate = async (flow: Flow) => {
    try {
      await flowService.duplicateFlow(flow.id, `${flow.name} (Copy)`);
      toast({ title: 'Duplicated', description: `"${flow.name}" has been duplicated` });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to duplicate flow',
        variant: 'destructive',
      });
    }
  };

  const handleToggleStatus = async (flow: Flow) => {
    try {
      if (flow.status === 'active') {
        await flowService.pauseFlow(flow.id);
        toast({ title: 'Paused', description: `"${flow.name}" has been paused` });
      } else {
        await flowService.activateFlow(flow.id);
        toast({ title: 'Activated', description: `"${flow.name}" is now active` });
      }
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update flow status',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {flows.length} flow{flows.length !== 1 ? 's' : ''} total
        </p>
        <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Flow
        </Button>
      </div>

      {/* Empty state */}
      {flows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Zap className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">No flows yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first automation flow to get started
            </p>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Flow
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flows list */}
      <div className="grid gap-3">
        {flows.map((flow) => {
          const TriggerIcon = triggerIcons[flow.trigger_type] || Zap;
          return (
            <Card key={flow.id} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <TriggerIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium truncate">{flow.name}</h4>
                        <Badge variant="outline" className={statusColors[flow.status]}>
                          {flow.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Trigger: {triggerLabels[flow.trigger_type] || flow.trigger_type}</span>
                        <span>{flow.graph_definition.nodes.length} nodes</span>
                        <span>{flow.run_count} runs</span>
                        {flow.last_run_at && (
                          <span>Last run: {format(new Date(flow.last_run_at), 'MMM d, HH:mm')}</span>
                        )}
                      </div>
                      {flow.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {flow.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      onClick={() => handleRunNow(flow)}
                      disabled={runningId === flow.id}
                      className="gap-1"
                    >
                      {runningId === flow.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <PlayCircle className="h-3.5 w-3.5" />
                      )}
                      Run Now
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenBuilder(flow.id)}
                      className="gap-1"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleStatus(flow)}>
                          {flow.status === 'active' ? (
                            <>
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-2" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(flow)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(flow)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Flow Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Flow</DialogTitle>
            <DialogDescription>
              Give your flow a name, then use the builder to add triggers, conditions, and actions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Name</Label>
              <Input
                id="flow-name"
                placeholder="e.g., Welcome Email on Signup"
                value={newFlow.name}
                onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="flow-description">Description (optional)</Label>
              <Textarea
                id="flow-description"
                placeholder="What does this flow do?"
                value={newFlow.description}
                onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Flow'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
