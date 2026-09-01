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
  Tag,
  BellRing,
  FileText,
  Image,
  Hand,
  LogIn,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
  MessageSquarePlus,
  MessageSquareReply,
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
  Star,
  Boxes,
  DollarSign,
  BookOpen,
  FilePlus2,
  Megaphone,
  MailX,
  MailWarning,
  MailOpen,
  MousePointerClick,
  TrendingDown,
  AtSign,
  Briefcase,
  Building2,
  Ship,
  Truck,
  Home,
  Undo2,
  Landmark,
  CreditCard,
  ShieldAlert,
  BatteryLow,
  UserMinus,
  Timer,
  Wrench,
  AlarmClock,
  ShieldCheck,
  Coins, MessagesSquare, PhoneOff, Link2, Unlink,
  EyeOff, SlidersHorizontal, FolderKanban, FolderPlus, Flag, AlertTriangle, BadgeCheck, CalendarClock} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
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
  deal_stage_changed: CheckCircle2,
  deal_won: CheckCircle2,
  deal_lost: CheckCircle2,
  quote_rejected: XCircle,
  contract_signed: ClipboardCheck,
  search_executed: Search,
  model_3d_created: Box,
  vr_world_created: Orbit,
  agent_search_completed: SearchCheck,
  product_added_to_quote: PackagePlus,
  moodboard_created: LayoutGrid,
  moodboard_item_added: ImagePlus,
  moodboard_shared: Share2,
  moodboard_commented: ImagePlus,
  moodboard_quote_requested: FileText,
  moodboard_dormancy_warning: Clock,
  moodboard_dormancy_reminder: Clock,
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
  workspace_invitation_sent: UserPlus,
  inventory_low_stock: Package,
  freight_quote_requested: Ship,
  order_dispatched: Truck,
  'inbox.message_received': Inbox,
  'inbox.thread_assigned': UserPlus,
  'inbox.thread_labeled': Tag,
  'inbox.follow_up_due': BellRing,
  'inbox.order_intake_ready': ShoppingCart,
  review_received: Star,
  marketplace_want_match: Package,
  expense_card_submitted: ClipboardCheck,
  finance_document_requested: ClipboardCheck,
  invoice_issued: FileText,
  receipt_issued: FileCheck,
  payment_received: CheckCircle2,
  payment_reversed: Undo2,
  payment_sent: CheckCircle2,
  'purchase_order.sent': Send,
  'purchase_order.received': Package,
  material_alert: Bell,
  finance_follow_up: Bell,
  invoice_paid: CheckCircle2,
  fiscal_document_rejected: ShieldAlert,
  fiscal_credits_low: BatteryLow,
  bank_payment_unmatched: Landmark,
  card_spend_threshold: CreditCard,
  expense_card_reviewed: CheckCircle2,
  expense_card_requested: FileText,
  pricing_change_requested: ClipboardCheck,
  pricing_change_decided: CheckCircle2,
  module_access_requested: Package,
  self_hosting_requested: Package,
  hr_late_checkin: Clock,
  'hr.applicant_stage_changed': UserPlus,
  'hr.employee_added': UserPlus,
  'hr.absence_requested': CalendarOff,
  'hr.absence_reviewed': CalendarCheck,
  'hr.departure_recorded': UserMinus,
  'hr.overtime_recorded': Timer,
  'hr.ergani_filing_failed': Landmark,
  order_created: ShoppingCart,
  order_status_changed: Package,
  customer_credit_releasable: Coins,
  document_published: BookOpen,
  doc_suggestion_submitted: FilePlus2,
  campaign_sent: Megaphone,
  email_sender_not_configured: MailWarning,
  email_bounced: MailX,
  email_complained: MailWarning,
  social_post_published: Share2,
  social_comment_received: MessagesSquare,
  whatsapp_number_status_changed: PhoneOff,
  whatsapp_template_status_changed: FileCheck,
  social_account_connected: Link2,
  social_account_disconnected: Unlink,
  social_post_failed: XCircle,
  client_view_feedback_received: ClipboardCheck,
  project_task_overdue: CalendarClock,
  project_created: FolderPlus,
  project_task_completed: CheckCircle2,
  project_milestone_reached: Flag,
  project_snag_raised: AlertTriangle,
  project_expense_approved: BadgeCheck,
  project_delivery_issued: Truck,
  project_asset_registered: Wrench,
  project_status_changed: FolderKanban,
  project_request_raised: MessageSquarePlus,
  project_request_answered: MessageSquareReply,
  crm_contact_created: UserPlus,
  crm_company_created: Building2,
  email_opened: MailOpen,
  email_clicked: MousePointerClick,
  catalog_sent_to_customers: Send,
  quote_sent: Send,
  price_alert_triggered: TrendingDown,
  mention_alert_triggered: AtSign,
  job_alert_triggered: Briefcase,
  rfq_lines_requested: Send,
  rfq_lines_priced: CheckCircle2,
  upstream_order_created: ShoppingCart,
  supplier_po_received: ShoppingCart,
  catalog_master_updated: Boxes,
  supplier_price_changed: DollarSign,
  'realestate.buyer_matches_found': Home,
  'realestate.listing_published': Home,
  'realestate.new_listing_for_buyer': Home,
  'seo.ranking_movement': Search,
  'seo.backlink_movement': Search,
  'seo.site_health_changed': Search,
  'seo.report_ready': Search,
  'seo.article_refresh_due': Search,
  page_watch_changed: FileText,
  'asset.service_due': Wrench,
  'asset.service_overdue': AlarmClock,
  'asset.warranty_expiring': ShieldCheck,
};

const triggerLabels: Record<TriggerType, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
  webhook: 'Webhook',
  user_signup: 'User Signup',
  user_login: 'User Login',
  quote_requested: 'Quote Requested',
  quote_approved: 'Quote Approved',
  deal_stage_changed: 'Deal Stage Changed',
  deal_won: 'Deal Won',
  deal_lost: 'Deal Lost',
  quote_rejected: 'Quote Rejected',
  contract_signed: 'Contract Signed',
  search_executed: 'Search Executed',
  model_3d_created: '3D Model Created',
  vr_world_created: 'VR World Created',
  agent_search_completed: 'Agent Search Done',
  product_added_to_quote: 'Product → Quote',
  moodboard_created: 'Moodboard Created',
  moodboard_item_added: 'Moodboard Item Added',
  moodboard_shared: 'Moodboard Shared',
  moodboard_commented: 'Moodboard Commented',
  moodboard_quote_requested: 'Moodboard Quote Requested',
  moodboard_dormancy_warning: 'Moodboard Dormancy Warning',
  moodboard_dormancy_reminder: 'Moodboard Dormancy Reminder',
  hire_me_received: 'Hire Me Received',
  profile_followed: 'Profile Followed',
  profile_published: 'Profile Published',
  material_reviewed: 'Material Reviewed',
  review_submitted: 'Profile Review Received',
  preferred_factory_added: 'Preferred Brand Added',
  quote_pdf_generated: 'Quote PDF Ready',
  factory_approved: 'Brand Approved',
  factory_rejected: 'Brand Rejected',
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
  workspace_invitation_sent: 'Team Invite Sent',
  inventory_low_stock: 'Low Stock',
  freight_quote_requested: 'Freight Quote Requested',
  order_dispatched: 'Order Dispatched',
  'inbox.message_received': 'Inbox Message Received',
  'inbox.thread_assigned': 'Inbox Thread Assigned',
  'inbox.thread_labeled': 'Inbox Thread Labeled',
  'inbox.follow_up_due': 'Inbox Follow-up Due',
  'inbox.order_intake_ready': 'Inbox Order Ready to Approve',
  review_received: 'Review Received',
  marketplace_want_match: 'Surplus Match',
  expense_card_submitted: 'Expense Card Submitted',
  finance_document_requested: 'Finance Document Requested',
  invoice_issued: 'Invoice Issued',
  receipt_issued: 'Receipt Issued',
  payment_received: 'Payment Received',
  payment_reversed: 'Payment Reversed',
  payment_sent: 'Payment Sent',
  'purchase_order.sent': 'Purchase Order Sent',
  'purchase_order.received': 'Purchase Order Received',
  material_alert: 'Saved-Search Material Alert',
  finance_follow_up: 'Finance Follow-up Due',
  invoice_paid: 'Invoice Paid (card)',
  fiscal_document_rejected: 'myDATA Document Rejected',
  fiscal_credits_low: 'Provider Credits Low',
  bank_payment_unmatched: 'Unmatched Bank Payment',
  card_spend_threshold: 'Large Card Spend',
  expense_card_reviewed: 'Expense Card Reviewed',
  expense_card_requested: 'Expense Card Requested',
  pricing_change_requested: 'Discount Approval Requested',
  module_access_requested: 'Module Activation Requested',
  self_hosting_requested: 'Self-Hosting Requested',
  pricing_change_decided: 'Discount Approval Decided',
  hr_late_checkin: 'HR — Late Check-in',
  'hr.applicant_stage_changed': 'HR — Applicant Stage Changed',
  'hr.employee_added': 'HR — Employee Added',
  'hr.absence_requested': 'HR — Absence Requested',
  'hr.absence_reviewed': 'HR — Absence Reviewed',
  'hr.departure_recorded': 'HR — Departure Recorded',
  'hr.overtime_recorded': 'HR — Overtime Recorded',
  'hr.ergani_filing_failed': 'HR — Ergani Filing Failed',
  order_created: 'Order Created',
  order_status_changed: 'Order Status Changed',
  customer_credit_releasable: 'Customer Credit Can Be Released',
  document_published: 'Document Published',
  doc_suggestion_submitted: 'Doc Edit Proposed',
  campaign_sent: 'Campaign Sent',
  email_sender_not_configured: 'Email Sender Not Configured',
  email_bounced: 'Email Bounced',
  email_complained: 'Spam Complaint',
  social_post_published: 'Social Post Published',
  social_comment_received: 'Social Comment Received',
  whatsapp_number_status_changed: 'WhatsApp Number Status Changed',
  whatsapp_template_status_changed: 'WhatsApp Template Status Changed',
  social_account_connected: 'Social Account Connected',
  social_account_disconnected: 'Social Account Disconnected',
  social_post_failed: 'Social Post Failed',
  client_view_feedback_received: 'Client View Feedback',
  project_task_overdue: 'Task Overdue',
  project_created: 'Project Created',
  project_task_completed: 'Task Completed',
  project_milestone_reached: 'Milestone Reached',
  project_snag_raised: 'Snag Raised',
  project_expense_approved: 'Expense Approved',
  project_delivery_issued: 'Delivery Issued',
  project_asset_registered: 'Equipment Registered',
  project_status_changed: 'Project Status Changed',
  project_request_raised: 'Project Request Raised',
  project_request_answered: 'Project Request Answered',
  crm_contact_created: 'Contact Created',
  crm_company_created: 'Company Created',
  email_opened: 'Email Opened',
  email_clicked: 'Email Link Clicked',
  catalog_sent_to_customers: 'Catalog Sent',
  quote_sent: 'Quote Sent',
  price_alert_triggered: 'Price Alert',
  mention_alert_triggered: 'Mention Alert',
  job_alert_triggered: 'Job Alert',
  rfq_lines_requested: 'RFQ Lines Requested (upstream)',
  rfq_lines_priced: 'RFQ Lines Priced (supplier)',
  upstream_order_created: 'Reseller Order Created (supplier)',
  supplier_po_received: 'Supplier PO Received (in-app)',
  catalog_master_updated: 'Manufacturer Updated Product Data',
  supplier_price_changed: 'Manufacturer Changed a Price',
  'realestate.buyer_matches_found': 'Buyer Matches Found',
  'realestate.listing_published': 'Listing Published',
  'realestate.new_listing_for_buyer': 'New Listing for Buyer',
  'seo.ranking_movement': 'SEO Rankings Moved',
  'seo.backlink_movement': 'SEO Backlinks Moved',
  'seo.site_health_changed': 'SEO Site Health Changed',
  'seo.report_ready': 'SEO Report Ready',
  'seo.article_refresh_due': 'SEO Article Due for Refresh',
  page_watch_changed: 'Watched Page Changed',
  'asset.service_due': 'Service Due',
  'asset.service_overdue': 'Service Overdue',
  'asset.warranty_expiring': 'Warranty Expiring',
};

const statusColors: Record<FlowStatus, string> = {
  draft: 'text-gray-500',
  active: 'text-emerald-500',
  paused: 'text-amber-500',
  archived: 'text-red-500',
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

  // Operator "Global action" toggle. Global flows fire for ALL workspaces; turning it
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

  // Operator "Workspace-configurable" toggle. A global flow runs inside every workspace, so it
  // raises THEIR bells and sends THEIR members email — but is invisible on every tenant surface,
  // which left an owner no way to stop it. Turning this on lists the flow under Automations →
  // Platform defaults for every workspace, where an owner may switch it off or silence one of its
  // channels. It never exposes the graph and never lets a tenant edit it.
  // Leave it OFF for the operator's own business, for an alarm about the platform failing a legal
  // or delivery obligation, and for delivery of a document to a CUSTOMER — silencing one of those
  // hides breakage rather than noise.
  const handleToggleTenantConfigurable = async (flow: Flow) => {
    const next = !flow.tenant_configurable;
    if (next && !flow.is_global) {
      toast({
        title: 'Not a platform default',
        description: 'Only a global flow runs inside other workspaces, so only a global flow has anything for an owner to switch off.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await flowService.updateFlow(flow.id, { tenant_configurable: next });
      toast({
        title: next ? 'Workspace-configurable' : 'Operator-only',
        description: next
          ? `Workspace owners can now switch "${flow.name}" off or mute one of its channels.`
          : `"${flow.name}" is hidden from tenants again. Existing per-workspace settings are kept but stop applying.`,
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update tenant visibility',
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
          Create flow
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
              Create flow
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
                        <span className={`text-xs capitalize ${statusColors[flow.status]}`}>
                          {flow.status}
                        </span>
                        {flow.is_locked && (
                          <span className="text-xs inline-flex items-center gap-1 text-amber-500">
                            <Lock className="h-3 w-3" />
                            Locked
                          </span>
                        )}
                        {flow.is_global && flow.tenant_configurable && (
                          <span className="text-xs inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
                            <SlidersHorizontal className="h-3 w-3" />
                            Tenant-configurable
                          </span>
                        )}
                        {flow.is_global ? (
                          <span className="text-xs inline-flex items-center gap-1 text-blue-500">
                            <Globe className="h-3 w-3" />
                            Global
                          </span>
                        ) : (
                          <span className="text-xs inline-flex items-center gap-1 text-violet-500">
                            <Building2 className="h-3 w-3" />
                            Workspace
                          </span>
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
                        {flow.is_global && (
                          <DropdownMenuItem onClick={() => handleToggleTenantConfigurable(flow)}>
                            {flow.tenant_configurable ? (
                              <>
                                <EyeOff className="h-4 w-4 mr-2" />
                                Hide from workspace owners
                              </>
                            ) : (
                              <>
                                <SlidersHorizontal className="h-4 w-4 mr-2" />
                                Let workspaces switch this off
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
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
