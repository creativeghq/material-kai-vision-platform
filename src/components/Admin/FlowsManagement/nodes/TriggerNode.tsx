import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Zap, Globe, UserPlus, Clock, FileText, Hand,
  LogIn, CheckCircle2, XCircle, ClipboardCheck, Image, FileCheck, Package,
  Search, Box, Orbit,
  SearchCheck, ScanEye, PackagePlus,
  LayoutGrid, ImagePlus, Share2, Inbox, Send,
  CalendarOff, CalendarCheck, ShoppingCart, BookOpen, FilePlus2,
  Megaphone, MailX, MailWarning,
  Building2, MailOpen, MousePointerClick, TrendingDown, AtSign, Briefcase,
  Ship, Truck,
  Home,
} from 'lucide-react';
import type { TriggerNodeData, TriggerType } from '@/services/flows/types';

const triggerIcons: Record<TriggerType, React.ElementType> = {
  manual: Hand,
  scheduled: Clock,
  webhook: Globe,
  user_signup: UserPlus,
  user_login: LogIn,
  quote_requested: FileText,
  quote_approved: CheckCircle2,
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
  inventory_low_stock: Package,
  freight_quote_requested: Ship,
  order_dispatched: Truck,
  'inbox.message_received': Inbox,
  'inbox.thread_assigned': UserPlus,
  marketplace_want_match: Package,
  expense_card_submitted: ClipboardCheck,
  finance_document_requested: ClipboardCheck,
  invoice_issued: FileText,
  receipt_issued: FileCheck,
  payment_received: CheckCircle2,
  payment_sent: CheckCircle2,
  'purchase_order.sent': Send,
  'purchase_order.received': Package,
  material_alert: Zap,
  finance_follow_up: Zap,
  invoice_paid: CheckCircle2,
  module_access_requested: LayoutGrid,
  expense_card_reviewed: CheckCircle2,
  expense_card_requested: FileText,
  pricing_change_requested: ClipboardCheck,
  pricing_change_decided: CheckCircle2,
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
  email_sender_not_configured: MailWarning,
  email_bounced: MailX,
  email_complained: MailWarning,
  social_post_published: Share2,
  social_post_failed: XCircle,
  client_view_feedback_received: ClipboardCheck,
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
  'realestate.buyer_matches_found': Home,
  'realestate.new_listing_for_buyer': Home,
};

function TriggerNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;
  const Icon = triggerIcons[nodeData.triggerType] || Zap;

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-background shadow-sm transition-colors ${
        selected ? 'border-emerald-500 shadow-emerald-500/20' : 'border-emerald-500/30'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-t-lg border-b border-emerald-500/20">
        <Icon className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {nodeData.description || `Trigger: ${nodeData.triggerType}`}
        </p>
      </div>

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-background"
      />
    </div>
  );
}

export const TriggerNode = memo(TriggerNodeComponent);
