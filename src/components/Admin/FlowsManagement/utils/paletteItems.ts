import type { NodePaletteItem, TriggerNodeData, ConditionNodeData, ActionNodeData } from '@/services/flows/types';

export const paletteItems: NodePaletteItem[] = [
  // ════════════════════════════════════════════════════
  //  TRIGGERS
  // ════════════════════════════════════════════════════

  // ── Manual ──
  { type: 'triggerNode', category: 'trigger', subType: 'manual', group: 'Manual',
    label: 'Manual Trigger', description: 'Run this flow manually', icon: 'Hand', color: 'emerald',
    defaultData: { label: 'Manual Trigger', category: 'trigger', triggerType: 'manual', config: {} } as TriggerNodeData },

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
  { type: 'triggerNode', category: 'trigger', subType: 'contract_created', group: 'Quotes',
    label: 'Contract Created', description: 'New contract is created', icon: 'ClipboardCheck', color: 'emerald',
    defaultData: { label: 'Contract Created', category: 'trigger', triggerType: 'contract_created', config: {} } as TriggerNodeData },

  // ── Materials ──
  { type: 'triggerNode', category: 'trigger', subType: 'image_uploaded', group: 'Materials',
    label: 'Image Uploaded', description: 'New image is processed', icon: 'Image', color: 'emerald',
    defaultData: { label: 'Image Uploaded', category: 'trigger', triggerType: 'image_uploaded', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'document_processed', group: 'Materials',
    label: 'Doc Processed', description: 'PDF/document extraction done', icon: 'FileCheck', color: 'emerald',
    defaultData: { label: 'Doc Processed', category: 'trigger', triggerType: 'document_processed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'product_added', group: 'Materials',
    label: 'Product Added', description: 'New product is added', icon: 'Package', color: 'emerald',
    defaultData: { label: 'Product Added', category: 'trigger', triggerType: 'product_added', config: {} } as TriggerNodeData },

  // ── AI & 3D ──
  { type: 'triggerNode', category: 'trigger', subType: 'search_executed', group: 'AI & 3D',
    label: 'Search Executed', description: 'Agent search performed', icon: 'Search', color: 'emerald',
    defaultData: { label: 'Search Executed', category: 'trigger', triggerType: 'search_executed', config: {} } as TriggerNodeData },
  { type: 'triggerNode', category: 'trigger', subType: 'model_3d_created', group: 'AI & 3D',
    label: '3D Model Created', description: '3D model generated', icon: 'Box', color: 'emerald',
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
    label: 'Log Event', description: 'Record analytics event', icon: 'ScrollText', color: 'blue',
    defaultData: { label: 'Log Event', category: 'action', actionType: 'log_event', config: { event_name: '', event_data: '' } } as ActionNodeData },

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
  { type: 'actionNode', category: 'action', subType: 'perplexity_search', group: 'B2B Research',
    label: 'Manufacturer Search', description: 'AI-powered B2B manufacturer search', icon: 'Compass', color: 'blue',
    defaultData: { label: 'Manufacturer Search', category: 'action', actionType: 'perplexity_search', config: { country: '', category: '', limit: 10 } } as ActionNodeData },
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
