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
  Send,
  Bell,
  Search,
  Box,
  Orbit,
  SearchCheck,
  ScanEye,
  PackagePlus,
  LayoutGrid,
  ImagePlus,
  Share2,
  Lock,
  Unlock,
  Inbox,
  CalendarOff,
  CalendarCheck,
  ShoppingCart,
  BookOpen,
  FilePlus2,
  Megaphone,
  MailX,
  MailWarning,
  Building2,
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
  moodboard_quote_requested: FileText,
  hire_me_received: UserPlus,
  profile_followed: UserPlus,
  profile_published: UserPlus,
  material_reviewed: CheckCircle2,
  review_submitted: CheckCircle2,
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
  inventory_low_stock: Package,
  'inbox.message_received': Inbox,
  'inbox.thread_assigned': UserPlus,
  marketplace_want_match: Package,
  expense_card_submitted: ClipboardCheck,
  finance_document_requested: ClipboardCheck,
  invoice_issued: FileText,
  receipt_issued: FileCheck,
  payment_received: CheckCircle2,
  'purchase_order.sent': Send,
  'purchase_order.received': Package,
  material_alert: Bell,
  finance_follow_up: Bell,
  invoice_paid: CheckCircle2,
  expense_card_reviewed: CheckCircle2,
  expense_card_requested: FileText,
  pricing_change_requested: ClipboardCheck,
  pricing_change_decided: CheckCircle2,
  module_access_requested: Package,
  hr_late_checkin: Clock,
  'hr.applicant_stage_changed': UserPlus,
  'hr.employee_added': UserPlus,
  'hr.absence_requested': CalendarOff,
  'hr.absence_reviewed': CalendarCheck,
  order_created: ShoppingCart,
  order_status_changed: Package,
  document_published: BookOpen,
  doc_suggestion_submitted: FilePlus2,
  campaign_sent: Megaphone,
  email_bounced: MailX,
  email_complained: MailWarning,
  social_post_published: Share2,
  social_post_failed: XCircle,
  client_view_feedback_received: ClipboardCheck,
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
  moodboard_quote_requested: 'Moodboard Quote Requested',
  hire_me_received: 'Hire Me Received',
  profile_followed: 'Profile Followed',
  profile_published: 'Profile Published',
  material_reviewed: 'Material Reviewed',
  review_submitted: 'Profile Review Received',
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
  inventory_low_stock: 'Low Stock',
  'inbox.message_received': 'Inbox Message Received',
  'inbox.thread_assigned': 'Inbox Thread Assigned',
  marketplace_want_match: 'Surplus Match',
  expense_card_submitted: 'Expense Card Submitted',
  finance_document_requested: 'Finance Document Requested',
  invoice_issued: 'Invoice Issued',
  receipt_issued: 'Receipt Issued',
  payment_received: 'Payment Received',
  'purchase_order.sent': 'Purchase Order Sent',
  'purchase_order.received': 'Purchase Order Received',
  material_alert: 'Saved-Search Material Alert',
  finance_follow_up: 'Finance Follow-up Due',
  invoice_paid: 'Invoice Paid (card)',
  expense_card_reviewed: 'Expense Card Reviewed',
  expense_card_requested: 'Expense Card Requested',
  pricing_change_requested: 'Discount Approval Requested',
  module_access_requested: 'Module Activation Requested',
  pricing_change_decided: 'Discount Approval Decided',
  hr_late_checkin: 'HR — Late Check-in',
  'hr.applicant_stage_changed': 'HR — Applicant Stage Changed',
  'hr.employee_added': 'HR — Employee Added',
  'hr.absence_requested': 'HR — Absence Requested',
  'hr.absence_reviewed': 'HR — Absence Reviewed',
  order_created: 'Order Created',
  order_status_changed: 'Order Status Changed',
  document_published: 'Document Published',
  doc_suggestion_submitted: 'Doc Edit Proposed',
  campaign_sent: 'Campaign Sent',
  email_bounced: 'Email Bounced',
  email_complained: 'Spam Complaint',
  social_post_published: 'Social Post Published',
  social_post_failed: 'Social Post Failed',
  client_view_feedback_received: 'Client View Feedback',
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

  const handleToggleLock = async (flow: Flow) => {
    try {
      await flowService.setFlowLocked(flow.id, !flow.is_locked);
      toast({
        title: flow.is_locked ? 'Unlocked' : 'Locked',
        description: flow.is_locked
          ? `"${flow.name}" can now be deleted.`
          : `"${flow.name}" is protected from deletion.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update lock',
        variant: 'destructive',
      });
    }
  };

  // #256 — operator "Global action" toggle. Global flows fire for ALL workspaces; turning it
  // off scopes a flow to its own workspace_id (tenant flows are created off, via the agent).
  const handleToggleGlobal = async (flow: Flow) => {
    const nextGlobal = !flow.is_global;
    if (!nextGlobal && !flow.workspace_id) {
      toast({
        title: 'Cannot scope this flow',
        description: 'This flow has no workspace, so turning off "Global action" would stop it from ever firing. Leave it global.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await flowService.updateFlow(flow.id, { is_global: nextGlobal });
      toast({
        title: nextGlobal ? 'Now a global action' : 'Now workspace-scoped',
        description: nextGlobal
          ? `"${flow.name}" will run for all workspaces.`
          : `"${flow.name}" will run only for its own workspace.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update scope',
        variant: 'destructive',
      });
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
                        {flow.is_locked && (
                          <Badge variant="outline" className="gap-1 bg-amber-500/10 text-amber-500">
                            <Lock className="h-3 w-3" />
                            Locked
                          </Badge>
                        )}
                        {flow.is_global ? (
                          <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-500">
                            <Globe className="h-3 w-3" />
                            Global
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-violet-500/10 text-violet-500">
                            <Building2 className="h-3 w-3" />
                            Workspace
                          </Badge>
                        )}
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
                        <DropdownMenuItem onClick={() => handleToggleGlobal(flow)}>
                          {flow.is_global ? (
                            <>
                              <Building2 className="h-4 w-4 mr-2" />
                              Make workspace-only
                            </>
                          ) : (
                            <>
                              <Globe className="h-4 w-4 mr-2" />
                              Make global action
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleLock(flow)}>
                          {flow.is_locked ? (
                            <>
                              <Unlock className="h-4 w-4 mr-2" />
                              Unlock (allow delete)
                            </>
                          ) : (
                            <>
                              <Lock className="h-4 w-4 mr-2" />
                              Lock (prevent delete)
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDelete(flow)}
                          disabled={flow.is_locked}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {flow.is_locked ? 'Delete (locked)' : 'Delete'}
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
