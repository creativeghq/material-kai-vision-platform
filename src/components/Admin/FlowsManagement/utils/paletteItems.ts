import type { NodePaletteItem, TriggerNodeData, ConditionNodeData, ActionNodeData } from '@/services/flows/types';

export const paletteItems: NodePaletteItem[] = [
  // ════════════════════════════════════════════════════
  //  TRIGGERS
  // ════════════════════════════════════════════════════

  // NOTE: There is no "Manual Trigger" node. Any flow can be run on demand via
  // the "Run Now" button on the Flows dashboard, regardless of its trigger.
  // A flow with no trigger node is treated as on-demand / manual-only.

  // ── Developer ──
  { type: 'triggerNode', category: 'trigger', subType: 'webhook', group: 'Developer',
    label: 'Webhook', description: 'Incoming HTTP request', icon: 'Globe', color: 'emerald',
    defaultData: { label: 'Webhook', category: 'trigger', triggerType: 'webhook', config: { method: 'POST' } } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'scheduled', group: 'Developer',
    label: 'Scheduled', description: 'Run on a cron schedule', icon: 'Clock', color: 'emerald',
    defaultData: { label: 'Scheduled', category: 'trigger', triggerType: 'scheduled', config: { cron: '0 9 * * *', timezone: 'UTC' } } as TriggerNodeData },

  // ── Users ──
  { type: 'triggerNode', category: 'trigger', subType: 'user_signup', group: 'Users',
    label: 'User Signup', description: 'New user registers', icon: 'UserPlus', color: 'emerald',
    defaultData: { label: 'User Signup', category: 'trigger', triggerType: 'user_signup', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'user_login', group: 'Users',
    label: 'User Login', description: 'User logs in', icon: 'LogIn', color: 'emerald',
    defaultData: { label: 'User Login', category: 'trigger', triggerType: 'user_login', config: {} } as TriggerNodeData },

  // ── Quotes ──
  { type: 'triggerNode', category: 'trigger', subType: 'quote_requested', group: 'Quotes',
    label: 'Quote Requested', description: 'Customer requests a quote', icon: 'FileText', color: 'emerald',
    defaultData: { label: 'Quote Requested', category: 'trigger', triggerType: 'quote_requested', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'quote_approved', group: 'Quotes',
    label: 'Quote Approved', description: 'Quote is approved', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Quote Approved', category: 'trigger', triggerType: 'quote_approved', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'quote_rejected', group: 'Quotes',
    label: 'Quote Rejected', description: 'Quote is rejected', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Quote Rejected', category: 'trigger', triggerType: 'quote_rejected', config: {} } as TriggerNodeData },
  // ── AI & 3D ──
  { type: 'triggerNode', category: 'trigger', subType: 'search_executed', group: 'AI & 3D',
    label: 'Search Executed', description: 'Agent search performed', icon: 'Search', color: 'emerald',
    defaultData: { label: 'Search Executed', category: 'trigger', triggerType: 'search_executed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'model_3d_created', group: 'AI & 3D',
    label: '3D Model Created', description: '3D model generated via agent', icon: 'Box', color: 'emerald',
    defaultData: { label: '3D Model Created', category: 'trigger', triggerType: 'model_3d_created', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'vr_world_created', group: 'AI & 3D',
    label: 'VR World Created', description: 'VR world generated', icon: 'Orbit', color: 'emerald',
    defaultData: { label: 'VR World Created', category: 'trigger', triggerType: 'vr_world_created', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'agent_search_completed', group: 'AI & 3D',
    label: 'Agent Search Done', description: 'Agent search returns results', icon: 'SearchCheck', color: 'emerald',
    defaultData: { label: 'Agent Search Done', category: 'trigger', triggerType: 'agent_search_completed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'agent_image_analyzed', group: 'AI & 3D',
    label: 'Image Analyzed', description: 'Agent image analysis completes', icon: 'ScanEye', color: 'emerald',
    defaultData: { label: 'Image Analyzed', category: 'trigger', triggerType: 'agent_image_analyzed', config: {} } as TriggerNodeData },

  // ── Quotes (product-to-quote) ──
  { type: 'triggerNode', category: 'trigger', subType: 'product_added_to_quote', group: 'Quotes',
    label: 'Product Added to Quote', description: 'Product added to a quote', icon: 'PackagePlus', color: 'emerald',
    defaultData: { label: 'Product Added to Quote', category: 'trigger', triggerType: 'product_added_to_quote', config: {} } as TriggerNodeData },

  // ── Moodboards ──
  { type: 'triggerNode', category: 'trigger', subType: 'moodboard_created', group: 'Moodboards',
    label: 'Moodboard Created', description: 'New moodboard created', icon: 'LayoutGrid', color: 'emerald',
    defaultData: { label: 'Moodboard Created', category: 'trigger', triggerType: 'moodboard_created', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'moodboard_item_added', group: 'Moodboards',
    label: 'Item Added', description: 'Material added to moodboard', icon: 'ImagePlus', color: 'emerald',
    defaultData: { label: 'Item Added to Moodboard', category: 'trigger', triggerType: 'moodboard_item_added', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'moodboard_shared', group: 'Moodboards',
    label: 'Moodboard Shared', description: 'Moodboard made public', icon: 'Share2', color: 'emerald',
    defaultData: { label: 'Moodboard Shared', category: 'trigger', triggerType: 'moodboard_shared', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'moodboard_commented', group: 'Moodboards',
    label: 'Moodboard Commented', description: 'Someone comments on a moodboard', icon: 'MessageCircle', color: 'emerald',
    defaultData: { label: 'Moodboard Commented', category: 'trigger', triggerType: 'moodboard_commented', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'moodboard_quote_requested', group: 'Moodboards',
    label: 'Quote Requested', description: 'Someone requests a quote from a moodboard', icon: 'FileText', color: 'emerald',
    defaultData: { label: 'Moodboard Quote Requested', category: 'trigger', triggerType: 'moodboard_quote_requested', config: {} } as TriggerNodeData },

  // ── Profiles ──
  { type: 'triggerNode', category: 'trigger', subType: 'hire_me_received', group: 'Profiles',
    label: 'Hire Me Received', description: 'Someone submits a Hire Me request', icon: 'Mail', color: 'emerald',
    defaultData: { label: 'Hire Me Received', category: 'trigger', triggerType: 'hire_me_received', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'profile_followed', group: 'Profiles',
    label: 'Profile Followed', description: 'A user follows a public profile', icon: 'UserPlus', color: 'emerald',
    defaultData: { label: 'Profile Followed', category: 'trigger', triggerType: 'profile_followed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'profile_published', group: 'Profiles',
    label: 'Profile Published', description: 'User makes their profile public', icon: 'Eye', color: 'emerald',
    defaultData: { label: 'Profile Published', category: 'trigger', triggerType: 'profile_published', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'material_reviewed', group: 'Profiles',
    label: 'Material Reviewed', description: 'User submits a material review', icon: 'Star', color: 'emerald',
    defaultData: { label: 'Material Reviewed', category: 'trigger', triggerType: 'material_reviewed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'review_submitted', group: 'Profiles',
    label: 'Profile Review Received', description: 'A professional received a profile review', icon: 'Star', color: 'emerald',
    defaultData: { label: 'Profile Review Received', category: 'trigger', triggerType: 'review_submitted', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'preferred_factory_added', group: 'Profiles',
    label: 'Factory Added to Profile', description: 'User adds a preferred factory to their profile', icon: 'Building2', color: 'emerald',
    defaultData: { label: 'Factory Added to Profile', category: 'trigger', triggerType: 'preferred_factory_added', config: {} } as TriggerNodeData },

  // ── Quotes (PDF) ──
  { type: 'triggerNode', category: 'trigger', subType: 'quote_pdf_generated', group: 'Quotes',
    label: 'Quote PDF Ready', description: 'A quote PDF finished generating', icon: 'FileText', color: 'emerald',
    defaultData: { label: 'Quote PDF Ready', category: 'trigger', triggerType: 'quote_pdf_generated', config: {} } as TriggerNodeData },

  // ── Suppliers ──
  { type: 'triggerNode', category: 'trigger', subType: 'factory_approved', group: 'Suppliers',
    label: 'Factory Approved', description: 'Admin approves a factory registration', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Factory Approved', category: 'trigger', triggerType: 'factory_approved', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'factory_rejected', group: 'Suppliers',
    label: 'Factory Rejected', description: 'Admin rejects a factory registration', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Factory Rejected', category: 'trigger', triggerType: 'factory_rejected', config: {} } as TriggerNodeData },

  // ── Appointments ──
  { type: 'triggerNode', category: 'trigger', subType: 'appointment_booked', group: 'Appointments',
    label: 'Appointment Booked', description: 'A booking is created', icon: 'Clock', color: 'emerald',
    defaultData: { label: 'Appointment Booked', category: 'trigger', triggerType: 'appointment_booked', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'appointment_confirmed', group: 'Appointments',
    label: 'Appointment Confirmed', description: 'A booking is confirmed', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Appointment Confirmed', category: 'trigger', triggerType: 'appointment_confirmed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'appointment_cancelled', group: 'Appointments',
    label: 'Appointment Cancelled', description: 'A booking is cancelled', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Appointment Cancelled', category: 'trigger', triggerType: 'appointment_cancelled', config: {} } as TriggerNodeData },

  // ── AI & 3D (completion / failure) ──
  { type: 'triggerNode', category: 'trigger', subType: 'svbrdf_extraction_complete', group: 'AI & 3D',
    label: 'SVBRDF Extracted', description: 'Material map extraction finished', icon: 'ScanEye', color: 'emerald',
    defaultData: { label: 'SVBRDF Extracted', category: 'trigger', triggerType: 'svbrdf_extraction_complete', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'virtual_staging_completed', group: 'AI & 3D',
    label: 'Virtual Staging Done', description: 'A virtual staging render finished', icon: 'ImagePlus', color: 'emerald',
    defaultData: { label: 'Virtual Staging Done', category: 'trigger', triggerType: 'virtual_staging_completed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'vr_world_failed', group: 'AI & 3D',
    label: 'VR World Failed', description: 'A VR world generation failed', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'VR World Failed', category: 'trigger', triggerType: 'vr_world_failed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'video_generation_completed', group: 'AI & 3D',
    label: 'Video Generated', description: 'An interior video finished', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Video Generated', category: 'trigger', triggerType: 'video_generation_completed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'video_generation_failed', group: 'AI & 3D',
    label: 'Video Failed', description: 'An interior video generation failed', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Video Failed', category: 'trigger', triggerType: 'video_generation_failed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'background_agent_failed', group: 'AI & 3D',
    label: 'Agent Failed', description: 'A background agent run failed', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Agent Failed', category: 'trigger', triggerType: 'background_agent_failed', config: {} } as TriggerNodeData },

  // ── Account & Billing ──
  { type: 'triggerNode', category: 'trigger', subType: 'role_upgrade_request_submitted', group: 'Account & Billing',
    label: 'Role Upgrade Requested', description: 'A user requests a role upgrade', icon: 'UserPlus', color: 'emerald',
    defaultData: { label: 'Role Upgrade Requested', category: 'trigger', triggerType: 'role_upgrade_request_submitted', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'role_upgrade_approved', group: 'Account & Billing',
    label: 'Role Upgrade Approved', description: 'A role upgrade is approved', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Role Upgrade Approved', category: 'trigger', triggerType: 'role_upgrade_approved', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'role_upgrade_rejected', group: 'Account & Billing',
    label: 'Role Upgrade Rejected', description: 'A role upgrade is rejected', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Role Upgrade Rejected', category: 'trigger', triggerType: 'role_upgrade_rejected', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'stripe_payment_succeeded', group: 'Account & Billing',
    label: 'Payment Succeeded', description: 'A Stripe payment succeeded', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Payment Succeeded', category: 'trigger', triggerType: 'stripe_payment_succeeded', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'stripe_payment_failed', group: 'Account & Billing',
    label: 'Payment Failed', description: 'A Stripe payment failed', icon: 'XCircle', color: 'emerald',
    defaultData: { label: 'Payment Failed', category: 'trigger', triggerType: 'stripe_payment_failed', config: {} } as TriggerNodeData },

  // ── Projects ──
  { type: 'triggerNode', category: 'trigger', subType: 'project_invitation_sent', group: 'Projects',
    label: 'Project Invite Sent', description: 'A project collaboration invite is sent', icon: 'Send', color: 'emerald',
    defaultData: { label: 'Project Invite Sent', category: 'trigger', triggerType: 'project_invitation_sent', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'project_invitation_resent', group: 'Projects',
    label: 'Project Invite Resent', description: 'A project collaboration invite is resent', icon: 'Send', color: 'emerald',
    defaultData: { label: 'Project Invite Resent', category: 'trigger', triggerType: 'project_invitation_resent', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'inventory_low_stock', group: 'Finance',
    label: 'Low Stock', description: 'A warehouse item drops to/below its reorder point', icon: 'Package', color: 'amber',
    defaultData: { label: 'Low Stock', category: 'trigger', triggerType: 'inventory_low_stock', config: {} } as TriggerNodeData },
  // #209 — multi-tenant inbox
  { type: 'triggerNode', category: 'trigger', subType: 'inbox.message_received', group: 'Inbox',
    label: 'Inbox Message Received', description: 'A new message lands in an inbox thread', icon: 'Inbox', color: 'emerald',
    defaultData: { label: 'Inbox Message Received', category: 'trigger', triggerType: 'inbox.message_received', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'inbox.thread_assigned', group: 'Inbox',
    label: 'Inbox Thread Assigned', description: 'A thread is assigned/handed to a member', icon: 'UserPlus', color: 'emerald',
    defaultData: { label: 'Inbox Thread Assigned', category: 'trigger', triggerType: 'inbox.thread_assigned', config: {} } as TriggerNodeData },

  // #225 — surplus marketplace
  { type: 'triggerNode', category: 'trigger', subType: 'marketplace_want_match', group: 'Marketplace',
    label: 'Surplus Match', description: 'A new surplus listing matched a buyer\'s saved alert', icon: 'Package', color: 'emerald',
    defaultData: { label: 'Surplus Match', category: 'trigger', triggerType: 'marketplace_want_match', config: {} } as TriggerNodeData },

  // Account receivable/payable → finance asked to issue a receipt/invoice
  { type: 'triggerNode', category: 'trigger', subType: 'finance_document_requested', group: 'Finance',
    label: 'Finance Document Requested', description: 'A receivable/payable was recorded asking finance to issue a receipt or invoice', icon: 'ClipboardCheck', color: 'blue',
    defaultData: { label: 'Finance Document Requested', category: 'trigger', triggerType: 'finance_document_requested', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'invoice_issued', group: 'Finance',
    label: 'Invoice Issued', description: 'A tax invoice was issued to a business customer', icon: 'FileText', color: 'emerald',
    defaultData: { label: 'Invoice Issued', category: 'trigger', triggerType: 'invoice_issued', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'receipt_issued', group: 'Finance',
    label: 'Receipt Issued', description: 'A retail receipt was issued to a private individual', icon: 'FileCheck', color: 'emerald',
    defaultData: { label: 'Receipt Issued', category: 'trigger', triggerType: 'receipt_issued', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'payment_received', group: 'Finance',
    label: 'Payment Received', description: 'A payment was received against an invoice or receivable', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Payment Received', category: 'trigger', triggerType: 'payment_received', config: {} } as TriggerNodeData },
  // Expense cards (trip / monthly / …)
  { type: 'triggerNode', category: 'trigger', subType: 'expense_card_submitted', group: 'Finance',
    label: 'Expense Card Submitted', description: 'A team member submitted an expense card for review', icon: 'ClipboardCheck', color: 'blue',
    defaultData: { label: 'Expense Card Submitted', category: 'trigger', triggerType: 'expense_card_submitted', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'expense_card_reviewed', group: 'Finance',
    label: 'Expense Card Reviewed', description: 'Finance finished reviewing an expense card', icon: 'CheckCircle2', color: 'emerald',
    defaultData: { label: 'Expense Card Reviewed', category: 'trigger', triggerType: 'expense_card_reviewed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'expense_card_requested', group: 'Finance',
    label: 'Expense Card Requested', description: 'Finance asked a team member to fill an expense card', icon: 'FileText', color: 'blue',
    defaultData: { label: 'Expense Card Requested', category: 'trigger', triggerType: 'expense_card_requested', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'pricing_change_requested', group: 'Finance',
    label: 'Discount Approval Requested', description: 'A customer discount change needs finance approval', icon: 'ClipboardCheck', color: 'blue',
    defaultData: { label: 'Discount Approval Requested', category: 'trigger', triggerType: 'pricing_change_requested', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'pricing_change_decided', group: 'Finance',
    label: 'Discount Approval Decided', description: 'A finance approver approved or declined a discount change', icon: 'CheckCircle2', color: 'blue',
    defaultData: { label: 'Discount Approval Decided', category: 'trigger', triggerType: 'pricing_change_decided', config: {} } as TriggerNodeData },

  // ════════════════════════════════════════════════════
  //  CONDITIONS / LOGIC
  // ════════════════════════════════════════════════════

  // ── Branching ──
  { type: 'conditionNode', category: 'condition', subType: 'if_else', group: 'Branching',
    label: 'Yes / No', description: 'Branch on a condition', icon: 'GitBranch', color: 'amber',
    defaultData: { label: 'Yes / No', category: 'condition', conditionType: 'if_else', config: { field: '', operator: 'equals', value: '' } } as ConditionNodeData },
  { type: 'conditionNode', category: 'condition', subType: 'switch', group: 'Branching',
    label: 'Multi Branch', description: 'Route to multiple paths', icon: 'ArrowLeftRight', color: 'amber',
    defaultData: { label: 'Multi Branch', category: 'condition', conditionType: 'switch', config: { field: '', cases: [{ value: '', label: 'Case 1' }], default_label: 'Default' } } as ConditionNodeData },
  { type: 'conditionNode', category: 'condition', subType: 'ab_split', group: 'Branching',
    label: 'A/B Split', description: 'Random split by percentage', icon: 'FlaskConical', color: 'amber',
    defaultData: { label: 'A/B Split', category: 'condition', conditionType: 'ab_split', config: { split_percentage: 50 } } as ConditionNodeData },
  { type: 'conditionNode', category: 'condition', subType: 'filter', group: 'Branching',
    label: 'Filter', description: 'Continue only if met', icon: 'Filter', color: 'amber',
    defaultData: { label: 'Filter', category: 'condition', conditionType: 'filter', config: { conditions: [{ field: '', operator: 'equals', value: '' }], logic: 'and' } } as ConditionNodeData },

  // ── Logic ──
  { type: 'conditionNode', category: 'condition', subType: 'loop', group: 'Logic',
    label: 'Loop', description: 'Iterate over a collection', icon: 'Repeat', color: 'amber',
    defaultData: { label: 'Loop', category: 'condition', conditionType: 'loop', config: { collection_field: '', item_variable: 'item', max_iterations: 100 } } as ConditionNodeData },
  { type: 'conditionNode', category: 'condition', subType: 'stop', group: 'Logic',
    label: 'Stop', description: 'End execution path', icon: 'CircleStop', color: 'amber',
    defaultData: { label: 'Stop', category: 'condition', conditionType: 'stop', config: {} } as ConditionNodeData },

  // ── Delay ──
  { type: 'conditionNode', category: 'condition', subType: 'delay', group: 'Delay',
    label: 'Delay Timer', description: 'Wait before continuing', icon: 'Timer', color: 'amber',
    defaultData: { label: 'Delay Timer', category: 'condition', conditionType: 'delay', config: { duration: 5, unit: 'minutes' } } as ConditionNodeData },

  // ════════════════════════════════════════════════════
  //  ACTIONS
  // ════════════════════════════════════════════════════

  // ── Communications ──
  { type: 'actionNode', category: 'action', subType: 'send_sms', group: 'Communications',
    label: 'Send SMS', description: 'Send an SMS message', icon: 'MessageSquare', color: 'blue',
    defaultData: { label: 'Send SMS', category: 'action', actionType: 'send_sms', config: { to: '', message: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'send_email', group: 'Communications',
    label: 'Send Email', description: 'Send an email message', icon: 'Mail', color: 'blue',
    defaultData: { label: 'Send Email', category: 'action', actionType: 'send_email', config: { to: '', subject: '', body: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'send_push', group: 'Communications',
    label: 'Push Notification', description: 'Send a push notification', icon: 'Smartphone', color: 'blue',
    defaultData: { label: 'Push Notification', category: 'action', actionType: 'send_push', config: { user_id: '', title: '', body: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'create_notification', group: 'Communications',
    label: 'In-App Notification', description: 'In-app notification', icon: 'Bell', color: 'blue',
    defaultData: { label: 'In-App Notification', category: 'action', actionType: 'create_notification', config: { user_id: '', title: '', body: '', type: 'info' } } as ActionNodeData },

  // ── Quotes ──
  { type: 'actionNode', category: 'action', subType: 'send_quote', group: 'Quotes',
    label: 'Send Quote', description: 'Send a quote to customer', icon: 'Send', color: 'blue',
    defaultData: { label: 'Send Quote', category: 'action', actionType: 'send_quote', config: { quote_id: '', send_email: true, send_sms: false } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'build_quote', group: 'Quotes',
    label: 'Build Quote', description: 'Create a new quote', icon: 'PlusCircle', color: 'blue',
    defaultData: { label: 'Build Quote', category: 'action', actionType: 'build_quote', config: { user_id: '', items: '', name: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'approve_quote', group: 'Quotes',
    label: 'Approve Quote', description: 'Mark quote as approved', icon: 'CheckCircle2', color: 'blue',
    defaultData: { label: 'Approve Quote', category: 'action', actionType: 'approve_quote', config: { quote_id: '' } } as ActionNodeData },

  // ── CRM ──
  { type: 'actionNode', category: 'action', subType: 'assign_user', group: 'CRM',
    label: 'Assign Owner', description: 'Assign a team member as owner of a contact, quote, or product', icon: 'UserCog', color: 'blue',
    defaultData: { label: 'Assign Owner', category: 'action', actionType: 'assign_user', config: { user_id: '', assign_to: '', entity_type: 'contact', entity_id: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'add_tag', group: 'CRM',
    label: 'Add Tag', description: 'Tag an entity', icon: 'Tag', color: 'blue',
    defaultData: { label: 'Add Tag', category: 'action', actionType: 'add_tag', config: { entity_type: 'contact', entity_id: '', tag: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'add_note', group: 'CRM',
    label: 'Add Note', description: 'Add a note to entity', icon: 'StickyNote', color: 'blue',
    defaultData: { label: 'Add Note', category: 'action', actionType: 'add_note', config: { entity_type: 'contact', entity_id: '', note: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'update_contact', group: 'CRM',
    label: 'Update Contact', description: 'Edit contact fields', icon: 'UserPen', color: 'blue',
    defaultData: { label: 'Update Contact', category: 'action', actionType: 'update_contact', config: { contact_id: '', fields: {} } } as ActionNodeData },

  // ── Data ──
  { type: 'actionNode', category: 'action', subType: 'update_product', group: 'Data',
    label: 'Update Product', description: 'Edit product fields', icon: 'PackageCheck', color: 'blue',
    defaultData: { label: 'Update Product', category: 'action', actionType: 'update_product', config: { product_id: '', fields: {} } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'log_event', group: 'Data',
    label: 'Log Event', description: 'Write an audit / dedup-marker row', icon: 'ScrollText', color: 'blue',
    defaultData: { label: 'Log Event', category: 'action', actionType: 'log_event', config: { table: '', row: '{}' } } as ActionNodeData },

  // ── Developer ──
  { type: 'actionNode', category: 'action', subType: 'http_request', group: 'Developer',
    label: 'HTTP Request', description: 'Call an external API', icon: 'Globe', color: 'blue',
    defaultData: { label: 'HTTP Request', category: 'action', actionType: 'http_request', config: { url: '', method: 'POST', headers: {}, body: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'run_edge_function', group: 'Developer',
    label: 'Run Edge Function', description: 'Invoke Supabase function', icon: 'Zap', color: 'blue',
    defaultData: { label: 'Run Edge Function', category: 'action', actionType: 'run_edge_function', config: { function_name: '', payload: '{}' } } as ActionNodeData },

  // ── AI Agent ──
  { type: 'actionNode', category: 'action', subType: 'send_agent_message', group: 'AI Agent',
    label: 'Send Agent Message', description: 'Inject message into agent conversation', icon: 'BotMessageSquare', color: 'blue',
    defaultData: { label: 'Send Agent Message', category: 'action', actionType: 'send_agent_message', config: { conversation_id: '', message: '', role: 'user', trigger_agent_response: false } } as ActionNodeData },

  // ── B2B Research ──
  { type: 'actionNode', category: 'action', subType: 'web_search', group: 'B2B Research',
    label: 'Manufacturer Search', description: 'Search for B2B manufacturers using Claude web search', icon: 'Compass', color: 'blue',
    defaultData: { label: 'Manufacturer Search', category: 'action', actionType: 'web_search', config: { category: '', limit: 30 } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'firecrawl_scrape', group: 'B2B Research',
    label: 'Scrape Website', description: 'Extract company info from website', icon: 'FileSearch', color: 'blue',
    defaultData: { label: 'Scrape Website', category: 'action', actionType: 'firecrawl_scrape', config: { url: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'apollo_enrich', group: 'B2B Research',
    label: 'Enrich Company', description: 'Get B2B company data from Apollo', icon: 'Building2', color: 'blue',
    defaultData: { label: 'Enrich Company', category: 'action', actionType: 'apollo_enrich', config: { company_name: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'hunter_find_contacts', group: 'B2B Research',
    label: 'Find Contacts', description: 'Discover emails via Hunter.io', icon: 'UserSearch', color: 'blue',
    defaultData: { label: 'Find Contacts', category: 'action', actionType: 'hunter_find_contacts', config: { domain: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'zerobounce_validate', group: 'B2B Research',
    label: 'Validate Email', description: 'Verify email with ZeroBounce', icon: 'MailCheck', color: 'blue',
    defaultData: { label: 'Validate Email', category: 'action', actionType: 'zerobounce_validate', config: { email: '' } } as ActionNodeData },

  // ── Moodboards ──
  { type: 'actionNode', category: 'action', subType: 'create_moodboard', group: 'Moodboards',
    label: 'Create Moodboard', description: 'Create a new moodboard', icon: 'LayoutGrid', color: 'blue',
    defaultData: { label: 'Create Moodboard', category: 'action', actionType: 'create_moodboard', config: { title: '', is_public: false, user_id: '' } } as ActionNodeData },
  { type: 'actionNode', category: 'action', subType: 'add_to_moodboard', group: 'Moodboards',
    label: 'Add to Moodboard', description: 'Add a material to a moodboard', icon: 'ImagePlus', color: 'blue',
    defaultData: { label: 'Add to Moodboard', category: 'action', actionType: 'add_to_moodboard', config: { moodboard_id: '', product_id: '' } } as ActionNodeData },
];

export const triggerPaletteItems = paletteItems.filter(i => i.category === 'trigger');
export const conditionPaletteItems = paletteItems.filter(i => i.category === 'condition');
export const actionPaletteItems = paletteItems.filter(i => i.category === 'action');

/** Group palette items by their `group` field */
export function groupBySubcategory(items: NodePaletteItem[]): Array<{ group: string; items: NodePaletteItem[] }> {
  const map = new Map<string, NodePaletteItem[]>();
  for (const item of items) {
    const existing = map.get(item.group) || [];
    existing.push(item);
    map.set(item.group, existing);
  }
  return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
}
