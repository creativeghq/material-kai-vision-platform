/**
 * AgentHub - Multi-Agent AI Interface
 * Replaces SearchHub with comprehensive agent orchestration
 */

import React, { useState, useCallback, useRef, useEffect, useMemo, memo } from 'react';
import { getErrorMessage } from '@/core/errors/utils';
import {
  Bot,
  Palette,
  Package,
  Send,
  Mic,
  Paperclip,
  MessageSquare,
  User,
  Download,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Pin,
  X,
  LayoutTemplate,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Globe,
  GripVertical,
  Pencil,
  FileText,
  Loader2,
  TrendingUp,
  Share2,
  Boxes,
  ChevronDown,
  Check,
  Code2,
  ShieldCheck,
  Building2,
} from 'lucide-react';
import { logger } from '@/config';

import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { resolveUploadPath } from '@/utils/storagePaths';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { agentChatHistoryService, ChatConversation } from '@/services/agents/agentChatHistoryService';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useToast } from '@/hooks/use-toast';
import { DemoAgentResults } from './DemoAgentResults';
import { AgentResultCard } from './AgentResultCard';
import { ConversationManagerModal } from './ConversationManagerModal';
import { CanvasPanel, ArtifactChip, type CanvasArtifact } from './CanvasPanel';
import {
  SheetInspector, StagingInspector, ProductsInspector, WorldInspector, BoardInspector, RenderInspector,
  JobFindingsInspector, SourcingInspector, OrderInspector, MentionSummaryInspector, MentionFeedInspector,
  LlmVisibilityInspector, CatalogInspector, QuoteInspector,
} from './ArtifactInspector';
import { MaterialMatchingModal } from './MaterialMatchingModal';
import { JobSitesFormModal, type JobSitesFormState } from './JobSitesFormModal';
import { TechRadarFindingsCard, type TechRadarFindingsData } from './TechRadarFindingsCard';
import { TechRadarReviewModal, type TechRadarFormState } from './TechRadarReviewModal';
import { ToolkitFormModal, type ToolkitFormModalState } from './ToolkitFormModal';
// PromptLibrary merged into PromptBuilderModal — its 35 design templates,
// 10 room-filter chips, image-aware mode, and virtual-staging wizard hook
// now live inside the "Prompt Library" tab when the active agent is
// interior-designer. Templates extracted to interiorPromptTemplates.ts.
import { VirtualStagingModal, VirtualStagingParams } from './VirtualStagingModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ProductStrip } from './ProductStrip';
import { ProgressiveImageGrid } from './ProgressiveImageGrid';
import SEOArticleViewer from './SEOArticleViewer';
import { InspirationUrlModal } from './InspirationUrlModal';
// StarterPromptsModal removed — DB-curated starters now live inside
// PromptBuilderModal as the "Prompt Library" tab.
import { ToolkitPickerModal } from './ToolkitPickerModal';
import { ActionConfirmationCard } from './ActionConfirmationCard';
import {
  TOOLKITS, ALWAYS_ON_TOOLKIT_IDS, getToolkitOwnerAgents, buildToolInput,
  type ToolkitDefinition, type ToolkitQuickStart,
} from './agentToolsCatalog';
import { ToolkitOnboardingCard } from './workflows/ToolkitOnboardingCard';
import { WorkflowWizardCard } from './workflows/WorkflowWizardCard';
// PromptBuilderModal removed (2026-06-21) — Interior processes + discovery now
// live entirely under the toolkit picker. The separate ✨ "prompts" surface is gone.
import { useEnabledModules } from '@/modules/_core';
import { WorkflowTracker } from './workflows/WorkflowTracker';
import { WorkflowInlineForm } from './workflows/WorkflowInlineForm';
import { CommandPalette } from './workflows/CommandPalette';
import { getWorkflow as getWorkflowDefinition } from './workflows/workflowRegistry';
import type { WorkflowRuntimeState } from './workflows/types';
import { InspirationCard } from './InspirationCard';
import { HeatPumpResultCard } from './HeatPumpResultCard';
import { HeatingCostResultCard } from './HeatingCostResultCard';
import { SearchSpecCard } from './SearchSpecCard';
import { catalogsService } from '@/services/catalogsService';
import { CatalogExtractionCandidatesCard, type ExtractionCandidate } from './CatalogExtractionCandidatesCard';
import { CatalogImageCandidatesCard, type ImageCandidate } from './CatalogImageCandidatesCard';
import { SEOResearchCard, type SEOResearchCardData } from './SEOResearchCard';
import { SEOGenericCard, type SEOGenericCardData } from './SEOGenericCard';
import { VirtualStagingViewer } from './VirtualStagingViewer';
import { SheetCanvasCard } from '@/components/features/sheets/SheetCanvasCard';
import { SheetPreviewCard } from '@/components/features/sheets/SheetPreviewCard';
import { QuoteCanvasCard, type QuoteCanvasData } from '@/components/features/ai/QuoteCanvasCard';
import { SheetWizardModal, type SheetWizardResult } from '@/components/features/sheets/SheetWizardModal';
import type { SheetType } from '@/services/moodboardSheetsService';
// Agent response caching removed 2026-07-06 (see the send handler) — it replayed stale
// full-text answers and short-circuited the live agent. Do not reintroduce for KAI.
import { SEO_ARTICLE_DEMO_DATA } from '@/data/demo/seo-article';
import { WorldViewer } from './WorldViewer';
import { vrWorldService } from '@/services/vrWorldService';
import { MoodboardSavePopover } from '@/components/business/moodboard/MoodboardSavePopover';
import { moodboardAPI } from '@/services/moodboardAPI';
import { ActiveMoodboardProvider, type ActiveMoodboard } from '@/contexts/ActiveMoodboardContext';
import { GeminiEditModal } from './GeminiEditModal';
import { RegionEditCanvas, type RegionEditResult } from './RegionEditCanvas';

// Agent definitions with RBAC and default models
interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  requiredRole: 'viewer' | 'member' | 'admin' | 'owner';
  available: boolean;
  /** Registered in agent_definitions but not yet runnable (sandbox execution
   *  tier unbuilt). Shown in the picker as a disabled "Coming soon" teaser. */
  comingSoon?: boolean;
  defaultModel: string; // Default AI model for this agent
}

// The agent roster mirrors the `agent_definitions` table (Agent Fabric #132).
// JARVIS (orchestrator) is the default — it auto-routes each message to the right
// specialist. Users can also pick a specialist directly. Sandbox agents
// (Stark/Veritas) require a container execution tier that isn't built yet, so they
// are registered in agent_definitions but not offered in the chat picker.
const AGENTS: AgentDefinition[] = [
  {
    id: 'orchestrator',
    name: 'JARVIS',
    description: 'Orchestrator — routes you to the right specialist automatically',
    icon: Bot,
    color: 'text-blue-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'interior-designer',
    name: 'Vision',
    description: 'Interior design, image & 3D generation, staging, moodboards',
    icon: Sparkles,
    color: 'text-violet-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'product-business',
    name: 'Pepper',
    description: 'Catalogs, B2B research, product knowledge-graph, tech radar, jobs',
    icon: Package,
    color: 'text-amber-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'marketing',
    name: 'Edith',
    description: 'SEO research & audits, content, brand-mention & LLM visibility',
    icon: TrendingUp,
    color: 'text-emerald-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'property-advisor',
    name: 'Estate',
    description: 'Real estate — listings, valuations, viewings, offers, leads, lettings',
    icon: Building2,
    color: 'text-teal-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'erp',
    name: 'Trinity',
    description: 'Finance & quotes — build quotes + branded PDFs, account overviews',
    icon: FileText,
    color: 'text-rose-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'social-media',
    name: 'Hermes',
    description: 'Publish & schedule social posts, read social analytics',
    icon: Share2,
    color: 'text-sky-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'demo',
    name: 'Demo',
    description: 'Platform showcase demos',
    icon: Boxes,
    color: 'text-cyan-500',
    requiredRole: 'admin',
    available: true,
    defaultModel: 'anthropic/claude-haiku-4-5',
  },
  // Registered in agent_definitions but not runnable yet — execution_kind
  // 'sandbox' with no edge function. Shown disabled so the full roster is
  // visible; become selectable (available:true) once the sandbox tier ships.
  {
    id: 'developer',
    name: 'Stark',
    description: 'Autonomous code & build agent — writes, runs, and ships changes in a sandbox',
    icon: Code2,
    color: 'text-orange-500',
    requiredRole: 'member',
    available: false,
    comingSoon: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  {
    id: 'qa-reviewer',
    name: 'Veritas',
    description: 'QA & code-review agent — verifies, tests, and audits work in a sandbox',
    icon: ShieldCheck,
    color: 'text-teal-500',
    requiredRole: 'member',
    available: false,
    comingSoon: true,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
  // Hidden: the generalist that JARVIS falls back to, and the target of legacy
  // `?agent=kai` deep-links. Not shown in the picker (available:false) — users
  // pick JARVIS (orchestrator), which routes to it when no specialist fits.
  {
    id: 'kai',
    name: 'JARVIS',
    description: 'Generalist — material intelligence & everything not owned by a specialist',
    icon: Bot,
    color: 'text-blue-500',
    requiredRole: 'member',
    available: false,
    defaultModel: 'anthropic/claude-opus-4-8',
  },
];

// #245 E — chunk types that were emitted but rendered as plain text. Routed
// through one generic AgentResultCard (title + structured payload).
const AGENT_RESULT_TITLES: Record<string, string> = {
  // My HR (employee self-service). These MUST be registered: a quick-start with `run` is a
  // deterministic direct tool call that skips the LLM, so there is no narration fallback — an
  // unregistered chunk is dropped and the user just sees "Done — ran manage_my_hr" with no data.
  my_hr_profile: 'My HR profile',
  my_hr_timeoff: 'My time off',
  my_hr_timeoff_requested: 'Time-off request submitted',
  my_hr_documents: 'My HR documents',
  my_hr_punches: 'My clock-ins',
  // Price monitoring
  price_tracking_started: 'Price tracking started',
  price_summary: 'Competitor prices',
  // Email marketing
  email_campaigns_list: 'Email campaigns',
  email_templates_list: 'Email templates',
  email_campaign_created: 'Draft campaign created',
  email_campaign_sent: 'Campaign sending',
  // CRM
  crm_company_created: 'Company added to CRM',
  crm_kad_results: 'Business activity codes (KAD)',
  // Messaging / WhatsApp
  messaging_channels_list: 'WhatsApp channels',
  messaging_sent: 'WhatsApp sent',
  // Contracts
  contracts_list: 'Contracts',
  contract_sent: 'Contract sent for signature',
  // Customer Inbox
  inbox_threads_list: 'Customer conversations',
  inbox_reply_sent: 'Reply sent',
  // Reviews
  reviews_list: 'Reviews about you',
  review_reply_posted: 'Reply posted',
  // Real Estate (#249)
  real_estate_properties: 'Property listings',
  real_estate_property: 'Property',
  real_estate_leads: 'Property leads',
  real_estate_listing_created: 'Draft listing created',
  real_estate_listing_published: 'Listing published',
  real_estate_viewing_scheduled: 'Viewing scheduled',
  real_estate_description_draft: 'AI listing copy',
  // Appointments
  appointments_list: 'Upcoming appointments',
  appointment_scheduled: 'Appointment scheduled',
  // Finance (read)
  finance_invoices_list: 'Invoices',
  finance_orders_list: 'Orders',
  finance_payments_list: 'Payments',
  customer_balance_result: 'Customer balance',
  finance_invoice_issued: 'Invoice issued',
  // Finance expenses
  expense_recorded: 'Expense recorded',
  expenses_list: 'Recent expenses',
  // Knowledge-graph tools
  customer_overview_result: 'Customer overview',
  supplier_overview_result: 'Supplier overview',
  product_provenance_result: 'Product provenance',
  product_price_history_result: 'Price history',
  projects_using_product_result: 'Projects using this product',
  products_in_project_result: 'Products in project',
  products_by_brand_result: 'Products by brand',
  brand_overview_result: 'Brand overview',
  related_products_result: 'Related products',
  find_products_by_spec_result: 'Products by spec',
  // Purchase sheet
  purchase_sheet_ready: 'Purchase sheet ready',
  // Trip / expense cards
  trip_card_created: 'Trip card created',
  trip_expense_added: 'Expense added',
  trip_cards_list: 'Trip cards',
  trip_card_submitted: 'Trip card submitted',
  expense_card_submitted: 'Expense card submitted',
  // Job research
  job_search_created: 'Job search created',
  job_search_updated: 'Job search updated',
  job_searches_list: 'Job searches',
  job_listings_feed: 'Job listings',
  job_digest_preview: 'Job digest preview',
  // Stock management
  stock_overview: 'Stock overview',
  stock_items: 'Stock items',
  stock_low: 'Low stock',
  stock_movements: 'Stock movements',
  stock_adjusted: 'Stock updated',
  stock_reordered: 'Reorder drafted',
  stock_forecast: 'Resupply forecast',
  // HR management
  hr_employees: 'Employees',
  hr_overview: 'HR overview',
  hr_on_leave: 'On leave',
  hr_absence_recorded: 'Absence recorded',
  hr_employee_added: 'Employee added',
  // Social management
  social_accounts: 'Social accounts',
  social_post: 'Social post',
  social_best_time: 'Best time to post',
  social_insights: 'Social insights',
  social_post_analytics: 'Post analytics',
  // Quotes
  quotes_list: 'Quotes',
  // Misc
  price_lookup_matches: 'Price lookup matches',
  project_created: 'Project created',
  // video_generated is intentionally NOT here — it has a dedicated handler that maps it into the
  // rich <video> player card (videoData). Registering it would make the generic card shadow that.
};

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentId?: string;
  model?: string;
  images?: string[]; // uploaded images attached to user messages
  insufficientCredits?: boolean; // true when generation failed due to credit exhaustion
  demoData?: any; // Structured demo data for DemoAgent responses
  materialData?: {
    products: any[];
    images?: Record<string, any[]>;
    title?: string;
  }; // Real material/product data from database
  generation_job?: {
    job_id: string;
    model_count: number;
    models: Array<{
      id: string;
      name: string;
      provider: string;
    }>;
    prompt: string;
    room_type?: string;
    style?: string;
  }; // Async 3D generation job info for progressive loading
  worldData?: {
    vrWorldId: string;
    status: 'pending' | 'uploading' | 'generating' | 'completed' | 'failed';
    splatUrl100k?: string;
    splatUrl500k?: string;
    splatUrlFull?: string;
    colliderGlbUrl?: string;
    panoramaUrl?: string;
    thumbnailUrl?: string;
    caption?: string;
    sourceImageUrl?: string;
    prompt?: string;
  }; // VR world data from WorldLabs Marble
  articleData?: {
    article_id: string;
    topic: string;
    target_keyword: string;
  }; // SEO article pipeline data for SEOArticleViewer
  geminiImageData?: {
    image_url: string;
    mode: string;
    model: string;
    job_id: string;
    credits_used: number;
  }; // Gemini image generation result
  videoData?: {
    video_url: string;
    job_id: string;
    status: 'processing' | 'completed' | 'failed';
  }; // Veo video walkthrough
  virtualStagingData?: {
    image_url: string;
    source_image_url?: string;
    job_id: string;
    room: string;
    furniture_style: string;
    credits_used: number;
  }; // Virtual staging result
  inspirationData?: {
    source_url: string;
    page_title?: string;
    hero_image?: string | null;
    colors: string[];
    color_hex: string[];
    materials: string[];
    textures: string[];
    styles: string[];
    room_type?: string | null;
    focus?: string;
    products?: Array<{ id?: string | null; name?: string; image_url?: string | null; score?: number | null }>;
    search_query_used?: string;
    total_results?: number;
  }; // Design inspiration URL analysis
  heatPumpData?: {
    input: Record<string, unknown>;
    result: import('@/lib/calculators/heatPumpSizing').HeatPumpSizingResult;
  }; // Heat-pump sizing estimate
  heatingCostData?: {
    input: Record<string, unknown>;
    result: import('@/lib/calculators/heatingCostComparison').HeatingCostResult;
  }; // Heating-method cost comparison
  searchSpec?: {
    intent: string;
    color_keywords?: string[];
    color_hex?: string[];
    material_types?: string[];
    style_keywords?: string[];
    texture_finish?: string;
    specifications?: string;
    query: string;
  }; // Explainable search spec
  materialsBoardData?: {
    image_url: string;
    job_id: string;
    board_mode: 'presentation-board' | 'selection-board' | 'photorealistic-render';
    credits_used: number;
  }; // Materials Selection Board result
  sheetCanvasData?: {
    sheet_id: string;
    sheet_type: SheetType;
    moodboard_id: string;
    initial_data: Record<string, any>;
    title?: string;
  }; // Interactive presentation sheet awaiting canvas input
  // Human-in-the-loop approval for a sensitive agent action (#275). The tool previewed instead
  // of mutating; Approve re-invokes it with confirm:true via the direct_tool path.
  actionConfirmationData?: {
    tool: string;
    input: Record<string, unknown>;
    title: string;
    summary: string;
    danger?: boolean;
    toolkitId?: string;
    status?: 'pending' | 'approved' | 'declined';
  };
  sheetPdfData?: {
    sheet_id: string;
    sheet_type: SheetType;
    title: string;
    pdf_url: string;
    page_count?: number;
    credits_used?: number;
  }; // Rendered presentation sheet PDF ready for download
  quoteData?: QuoteCanvasData; // Agent-created quote (real quotes row) + branded PDF, shown on canvas
  mentionSummaryData?: {
    product_id: string;
    days: number;
    summary: {
      total_count: number;
      by_sentiment: { positive: number; neutral: number; negative: number };
      sentiment_avg: number | null;
      top_outlets: Array<{ domain: string; count: number }>;
      latest_at: string | null;
    };
  };
  // #237 A6 — sourcing
  sourcingOptionsData?: {
    product_id: string;
    quantity: number;
    counts: { warehouse: number; inbound_po: number; supplier: number; marketplace: number };
    result: any;
  };
  purchaseOrderCreatedData?: {
    allocations_created: number;
    purchase_orders_created: number;
    orders: Array<{ order_id: string; supplier_company_id: string; subtotal_net: number }>;
  };
  purchaseOrderSentData?: {
    order_id: string;
    order_number: string;
    recipient: string | null;
    pdf_url: string | null;
  };
  // #245 E — generic structured result card for previously-unrendered chunks
  agentResultData?: { title: string; data: Record<string, any>; resultType?: string };
  llmVisibilityData?: {
    product_id: string;
    snapshot: {
      present: boolean;
      total_probes?: number;
      share_of_voice?: number;
      avg_position?: number | null;
      per_model?: Record<string, {
        probes: number;
        mentioned: number;
        positions: number[];
        samples?: Array<{ template?: string; response?: string; mentioned?: boolean; position?: number | null; sentiment?: string | null; context_snippet?: string | null }>;
      }>;
      top_competitors?: Array<[string, number]>;
    };
    forced?: boolean;
    credits_used?: number;
  };
  mentionFeedData?: {
    product_id: string;
    days: number;
    sentiment_filter?: string;
    rows: Array<Record<string, any>>;
  };
  mentionTrackingStartedData?: {
    product_id: string;
    product_name: string;
    tracked: Record<string, any> | null;
  };
  jobFindingsData?: {
    tracked_job_id: string;
    tracked_job_label: string;
    discovered_at_window: string;
    listings: Array<{
      id?: string;
      url: string;
      title?: string | null;
      company?: string | null;
      location?: string | null;
      is_remote?: boolean | null;
      salary_min?: number | null;
      salary_max?: number | null;
      salary_currency?: string | null;
      employment_type?: string | null;
      posted_at?: string | null;
      source?: string;
      seniority?: string | null;
      description_excerpt?: string | null;
      relevance_score?: number | null;
      match_note?: string | null;
    }>;
  };
  /** Tech Radar review results (Pepper) — rendered as a ring-grouped findings card. */
  techRadarData?: TechRadarFindingsData;
  /** When the agent emits this, AgentHub mounts a modal form so the user can fill
   *  job-site details (URL, type, country, etc.) instead of typing everything as prose.
   *  On submit, the modal sends a follow-up user message ("add kariera.gr to perplexity
   *  filter, country GR, category general") which re-invokes the manage_job_sites tool. */
  jobSitesFormOpen?: {
    mode: 'add' | 'edit';
    default_site_type: 'perplexity_domain' | 'rss_feed_default' | 'careers_page_default';
    prefill?: {
      url_or_domain?: string;
      display_name?: string;
      country_code?: string;
      category?: string;
      notes?: string;
    };
  };
  seoResearchData?: SEOResearchCardData;
  seoGenericData?: SEOGenericCardData;
  catalogData?: {
    event:
      | 'created'
      | 'pdfs_attached'
      | 'extraction_candidates'
      | 'translation_ready'
      | 'material_added'
      | 'image_candidates'
      | 'pdf_ready'
      | 'published'
      | 'unpublished';
    catalog_id: string;
    payload: Record<string, any>;
  };
  catalogExtractionData?: {
    catalog_id: string;
    query: string;
    candidates: ExtractionCandidate[];
  };
  catalogImageCandidatesData?: {
    catalog_id: string;
    section_id: string | null;
    material_id: string | null;
    material_name: string;
    candidates: ImageCandidate[];
  };
}

interface AgentHubProps {
  userRole?: 'viewer' | 'member' | 'admin' | 'owner';
  initialPrompt?: string;
  initialConversationId?: string;
  /** When arriving from a moodboard, products added from the agent go here. */
  initialMoodboardId?: string;
  /** Deep-link: pre-select an agent (e.g. 'interior-designer' from a product's "Test on a room"). */
  initialAgent?: string;
  /** Deep-link: pre-pin a catalog material (e.g. from a product page) so the
   *  interior flow already knows which material to apply. */
  initialPinnedMaterial?: { id: string; name: string; imageUrl?: string };
  /** Deep-link: preload image attachment(s) (public URLs) into the composer so a
   *  flow / prompt acts on them — e.g. "edit this room photo" from another page. */
  initialImages?: string[];
  /** Deep-link: force the generation pipeline (e.g. 'image-edit', 'redesign'). */
  initialGenerationMode?: string;
  /** Deep-link: deterministically launch a guided flow on open, by toolkit + label
   *  (e.g. {toolkitId:'generation', label:'Test on a room'}). Runs the same
   *  handleQuickStart dispatcher the in-app UI uses, so ANY flow is reachable. */
  initialQuickStart?: { toolkitId: string; label: string };
  /** Deep-link: open with this toolkit enabled + its quick-starts shown (onboarding), so a
   *  capability arrival lands on "here's what you can do" instead of a blank chat. */
  initialToolkitId?: string;
  onConversationChange?: (conversationId: string | null) => void;
}



// Normalize Claude content — can be string, {type,text} object, or [{type,text}] array
const normalizeContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text ?? '')
      .join('');
  }
  if (content && typeof content === 'object' && (content as any).type === 'text') {
    return (content as any).text ?? '';
  }
  return String(content ?? '');
};

/**
 * Isolated timer component — manages its own 100ms interval so the parent
 * AgentHub doesn't re-render 10x/sec just for the elapsed-time display.
 */
const ThinkingTimer = memo(({ isActive, onElapsedCapture }: {
  isActive: boolean;
  onElapsedCapture?: React.MutableRefObject<number>;
}) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const ms = Date.now() - start;
      setElapsed(ms);
      if (onElapsedCapture) onElapsedCapture.current = ms;
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, onElapsedCapture]);

  return (
    <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
      {(elapsed / 1000).toFixed(1) + 's'}
    </span>
  );
});
ThinkingTimer.displayName = 'ThinkingTimer';

export const AgentHub: React.FC<AgentHubProps> = ({
  userRole = 'member',
  initialPrompt,
  initialConversationId,
  initialMoodboardId,
  initialAgent,
  initialPinnedMaterial,
  initialImages,
  initialGenerationMode,
  initialQuickStart,
  initialToolkitId,
  onConversationChange,
}) => {
  const { toast } = useToast();
  const [activeMoodboard, setActiveMoodboard] = useState<ActiveMoodboard | null>(null);

  // Resolve the moodboard passed via `?moodboard=<id>` so products added from the
  // agent land back in that moodboard (and we can show a context banner).
  useEffect(() => {
    let cancelled = false;
    if (!initialMoodboardId) {
      setActiveMoodboard(null);
      return;
    }
    moodboardAPI.getMoodBoard(initialMoodboardId).then((mb) => {
      if (!cancelled && mb) setActiveMoodboard({ id: mb.id, title: mb.title });
    }).catch(() => { /* non-fatal — fall back to no context */ });
    return () => { cancelled = true; };
  }, [initialMoodboardId]);
  const [convManagerOpen, setConvManagerOpen] = useState(false);
  // Studio canvas (issue #253 P2): artifacts (moodboard sheet / products /
  // virtual staging) render full-width in a left-docked panel; the chat sits on
  // the right. Off by default — opening it collapses the matching chat cards to
  // chips so each artifact lives in exactly one place.
  // Canvas is shown automatically whenever the conversation has an artifact, so
  // the chat auto-docks to a right rail while you work. `canvasHidden` lets the
  // user reclaim a full-width chat; `chatCollapsed` hides the chat to focus the canvas.
  const [canvasHidden, setCanvasHidden] = useState(false);
  // On a phone the canvas and the chat can NEVER share the viewport — a 390px
  // screen split between a flex-1 canvas and a 400px chat rail collapsed the
  // canvas to a sliver. Below `md` the studio is single-pane: `chatCollapsed`
  // doubles as "the canvas is the active pane", and exactly one is mounted.
  const isMobile = useIsMobile();
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>(initialAgent || 'orchestrator');
  // Initialize with JARVIS (orchestrator) default model
  const [selectedModel, setSelectedModel] = useState<string>(
    AGENTS.find(a => a.id === 'orchestrator')?.defaultModel || 'anthropic/claude-opus-4-8',
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setActiveGenerationJobs] = useState<Map<string, any>>(new Map());
  // v0.3.2 — modal form triggered by manage_job_sites agent tool when user is vague
  const [jobSitesFormState, setJobSitesFormState] = useState<JobSitesFormState>(null);
  const [techRadarFormState, setTechRadarFormState] = useState<TechRadarFormState>(null);
  // Generic collect-then-send form for toolkit quick-starts that declare a `form`.
  const [toolkitFormState, setToolkitFormState] = useState<ToolkitFormModalState>(null);
  // Pending deterministic tool run (mode:'direct_tool'). Set by a quick-start
  // with a `run` descriptor, consumed once by handleSendMessage on the next tick.
  const pendingDirectRunRef = useRef<{
    toolName: string;
    toolInput: Record<string, unknown>;
    label: string;
    toolkitId: string;
  } | null>(null);
  // Toolkit IDs to force-include in the NEXT send's selected_toolkits, regardless
  // of whether the activeToolkits state update has committed yet. Set by quick-start
  // launchers (via ensureAgentAndToolkit) so a seeded prompt always sends with its
  // toolkit bound — closes the setState-vs-setTimeout race. Consumed once by
  // handleSendMessage. (The server-side in-run loader is the backstop if missed.)
  const pendingToolkitsRef = useRef<string[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  // Catalog source PDFs attached via the paperclip. Held as chips (id + filename)
  // instead of dumping a machine instruction into the composer; the agent
  // instruction (with the source_pdf_id it needs for attach_catalog_pdfs) is
  // assembled at send-time in handleSendMessage.
  const [attachedCatalogPdfs, setAttachedCatalogPdfs] = useState<{ id: string; filename: string }[]>([]);
  // Readable PDFs (quotes / invoices / specs) attached via the paperclip. Held as
  // { name, dataUrl } chips and sent to agent-chat as base64 `documents` so Opus reads
  // them natively — the "rebuild this quote / summarize this invoice" path. Distinct
  // from attachedCatalogPdfs (which upload a catalog_source_pdfs row for extraction).
  const [attachedDocuments, setAttachedDocuments] = useState<{ name: string; dataUrl: string }[]>([]);
  const [selectedGenerationMode, setSelectedGenerationMode] = useState<string | null>(null);
  const [imageDragOverIndex, setImageDragOverIndex] = useState<number | null>(null);
  const imageDragIndexRef = useRef<number | null>(null);
  const [geminiModalImage, setGeminiModalImage] = useState<string | null>(null);
  const [showGeminiEditModal, setShowGeminiEditModal] = useState(false);
  const [geminiEditRoomType, setGeminiEditRoomType] = useState<string | null>(null);
  const [geminiEditStyle, setGeminiEditStyle] = useState<string | null>(null);
  const [regionEditImageUrl, setRegionEditImageUrl] = useState<string | null>(null);
  // Guided presentation-sheet wizard (launched from the Sheets toolkit quick-starts).
  const [sheetWizardOpen, setSheetWizardOpen] = useState(false);
  const [sheetWizardType, setSheetWizardType] = useState<string | undefined>(undefined);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  // showPromptLibrary removed — Interior-only legacy duplicate. Prompts now in PromptBuilderModal "Prompt Library" tab.
  const [showInspirationModal, setShowInspirationModal] = useState(false);
  const [showNewDesignModal, setShowNewDesignModal] = useState(false);
  // showStarterPrompts removed — merged into showPromptBuilder modal
  const [showToolkitPicker, setShowToolkitPicker] = useState(false);
  // Active toolkits — per-conversation when one is loaded, otherwise the
  // localStorage default for the next new chat. Always force-includes Core.
  // Hydration order:
  //   1. Conversation loaded → use convo.toolkits (DB source of truth)
  //   2. New chat → use localStorage `mk_active_toolkits` (browser default)
  //   3. Neither → just Core
  const [activeToolkits, setActiveToolkits] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [...ALWAYS_ON_TOOLKIT_IDS];
    try {
      const raw = window.localStorage.getItem('mk_active_toolkits');
      if (!raw) return [...ALWAYS_ON_TOOLKIT_IDS];
      const parsed = JSON.parse(raw) as string[];
      const merged = new Set<string>([...parsed, ...ALWAYS_ON_TOOLKIT_IDS]);
      return [...merged];
    } catch { return [...ALWAYS_ON_TOOLKIT_IDS]; }
  });
  // The toolkit that was JUST enabled — drives the ToolkitOnboardingCard.
  // Cleared when the user clicks a quick-start, dismisses the card, or sends
  // any message.
  const [justEnabledToolkitId, setJustEnabledToolkitId] = useState<string | null>(null);
  // Workflow runtime — keyed by run_id. Mutated by workflow_* chunks. The
  // WorkflowTracker renders one card per active run at the top of the chat.
  const [workflows, setWorkflows] = useState<Record<string, WorkflowRuntimeState>>({});

  /**
   * Universal pre-launch check used by EVERY quick-start click (whether it
   * boots a wizard or fires a prompt). Guarantees the agent has the tools by:
   *   1. Auto-switching the active agent to one that owns the toolkit's tools
   *      (computed dynamically from agentToolsCatalog).
   *   2. Auto-enabling the toolkit in activeToolkits so the agent-chat backend
   *      binds the tools on the next message.
   * Without this, clicking any quick-start while on the wrong agent or with
   * the toolkit disabled gave the dreaded "I don't have those tools" reply.
   */
  const ensureAgentAndToolkit = useCallback((toolkit: ToolkitDefinition) => {
    const owners = getToolkitOwnerAgents(toolkit);
    if (!owners.includes(selectedAgent)) {
      setSelectedAgent(owners[0]);
    }
    // Force-include this toolkit in the next send regardless of whether the
    // activeToolkits state update below has committed by send time.
    if (!toolkit.alwaysOn && !pendingToolkitsRef.current.includes(toolkit.id)) {
      pendingToolkitsRef.current.push(toolkit.id);
    }
    if (!toolkit.alwaysOn && !activeToolkits.includes(toolkit.id)) {
      // setActiveToolkits inline (avoids the not-yet-declared dep on updateActiveToolkits)
      const merged = new Set<string>([...activeToolkits, toolkit.id, ...ALWAYS_ON_TOOLKIT_IDS]);
      const arr = [...merged];
      setActiveToolkits(arr);
      try { window.localStorage.setItem('mk_active_toolkits', JSON.stringify(arr)); } catch { /* private */ }
      if (currentConversationId) {
        agentChatHistoryService.updateConversationToolkits(currentConversationId, arr).catch(() => {});
      }
    }
  }, [selectedAgent, activeToolkits, currentConversationId]);

  // Fire a deterministic tool run for a quick-start that carries a `run`
  // descriptor. Used by the formless run quick-starts (e.g. "List my projects")
  // where there's nothing to collect — stash the payload + trigger the same
  // send pipeline in mode:'direct_tool'. Returns true if a run was fired.
  // (Form-bearing run quick-starts go through ToolkitFormModal → onRunTool.)
  const fireDirectRun = useCallback((qs: ToolkitQuickStart, tk: ToolkitDefinition): boolean => {
    if (!qs.run) return false;
    pendingDirectRunRef.current = {
      toolName: qs.run.tool,
      toolInput: buildToolInput(qs.run, {}),
      label: qs.label,
      toolkitId: tk.id,
    };
    setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
    return true;
  }, []);

  // The best room photo currently in play: a composer attachment first, else the
  // most recent generated/attached image in the conversation. Used to pre-fill the
  // capture form when an interior flow is launched from a composer chip.
  const latestAvailableImage = useCallback((): string | null => {
    if (attachedImages[0]) return attachedImages[0];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.geminiImageData?.image_url) return m.geminiImageData.image_url;
      if (m.virtualStagingData?.image_url) return m.virtualStagingData.image_url;
      if (m.images?.[0]) return m.images[0];
    }
    return null;
  }, [attachedImages, messages]);

  // Human-in-the-loop confirmation (#275): Approve re-invokes the sensitive tool with confirm:true
  // through the deterministic direct_tool path; Decline just marks the card and runs nothing.
  const handleActionApprove = useCallback((messageId: string, data: NonNullable<Message['actionConfirmationData']>) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.actionConfirmationData
        ? { ...m, actionConfirmationData: { ...m.actionConfirmationData, status: 'approved' } }
        : m));
    pendingDirectRunRef.current = {
      toolName: data.tool,
      toolInput: { ...data.input, confirm: true },
      label: data.title,
      toolkitId: data.toolkitId || '',
    };
    setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
  }, []);

  const handleActionDecline = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m =>
      m.id === messageId && m.actionConfirmationData
        ? { ...m, actionConfirmationData: { ...m.actionConfirmationData, status: 'declined' } }
        : m));
  }, []);

  /**
   * Single dispatcher for a toolkit quick-start. This is THE launch path now
   * that the separate ✨ prompts surface is gone — the toolkit picker calls it.
   * Order of resolution:
   *   1. switch agent if the quick-start belongs to a different one
   *   2. `form`         → open ToolkitFormModal to collect fields, then auto-send
   *   3. `run`          → fire the target tool deterministically (no prompt)
   *   4. `opensModal`   → open the guided design canvas (new-design / staging)
   *   5. fallback       → inject `prompt` + auto-send (also the graceful path
   *                       when a modal can't open yet, e.g. no image attached)
   */
  const handleQuickStart = useCallback((qs: ToolkitQuickStart, tk: ToolkitDefinition, agentId?: string) => {
    const target = agentId || (getToolkitOwnerAgents(tk)[0] ?? selectedAgent);
    if (target && target !== selectedAgent) setSelectedAgent(target);

    // Guarantee the toolkit is bound on the seeded send (switch agent + queue
    // the toolkit into the next request) — closes the "tools not loaded" race.
    ensureAgentAndToolkit(tk);

    if (qs.form?.length) {
      // Pre-fill the image field with a photo already in play (composer
      // attachment or the latest generated image) so launching from a chip
      // doesn't re-ask for the photo the user already provided.
      let prefill: Record<string, string> | undefined;
      const imgKey = qs.generation?.imageKeys?.[0];
      if (imgKey) {
        const img = latestAvailableImage();
        if (img) prefill = { [imgKey]: img };
      }
      setToolkitFormState({ quickStart: qs, toolkit: tk, prefill });
      return;
    }
    if (qs.run && fireDirectRun(qs, tk)) return;

    // Presentation-sheet quick-starts open the guided wizard (the moodboard is
    // picked inside it). '' = open at the type picker; a slug pre-selects the type.
    if (qs.opensSheetWizard !== undefined) {
      setSheetWizardType(qs.opensSheetWizard || undefined);
      setSheetWizardOpen(true);
      return;
    }

    if (qs.opensModal === 'new-design') {
      setShowNewDesignModal(true);
      return;
    }
    if (qs.opensModal === 'gemini-edit') {
      // Apply-material / redesign work on a ROOM photo. Open the guided edit
      // canvas in-place when an image is available (attached or just generated);
      // otherwise fall through to the prompt, which asks the user to attach one.
      const hasImage = attachedImages.length > 0
        || messages.some((m) => m.geminiImageData?.image_url || m.virtualStagingData?.image_url || m.images?.[0]);
      if (hasImage) {
        setGeminiEditRoomType(null);
        setGeminiEditStyle(null);
        setShowGeminiEditModal(true);
        return;
      }
      // else fall through to the seeded prompt
    }
    if (qs.opensModal === 'virtual-staging') {
      // Staging needs an image — resolve the latest one; fall back to the
      // prompt (which asks the user to attach a photo) when none is present.
      let imageUrl: string | null = attachedImages[0] || null;
      if (!imageUrl) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i];
          if (m.geminiImageData?.image_url) { imageUrl = m.geminiImageData.image_url; break; }
          if (m.virtualStagingData?.image_url) { imageUrl = m.virtualStagingData.image_url; break; }
          if (m.images?.[0]) { imageUrl = m.images[0]; break; }
        }
      }
      if (imageUrl) { setVirtualStagingImageUrl(imageUrl); return; }
      // else fall through to the prompt
    }

    // Fallback (also covers 'gemini-edit' + image-required prompts): seed +
    // auto-send. The interior agent applies pinned materials / edits the
    // attached photo via the verified generate-interior-gemini image-edit path.
    setInput(qs.prompt);
    setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
  }, [selectedAgent, fireDirectRun, attachedImages, messages, ensureAgentAndToolkit, latestAvailableImage]);

  // Launch an Interior Design quick-start by label from the composer chip row, so
  // those chips run the SAME guided capture-then-send flow as the toolkit picker
  // (photo-first → inputs → generate) instead of setting a mode + canned prompt.
  const launchInteriorQuickStart = useCallback((label: string) => {
    const tk = TOOLKITS.find((t) => t.id === 'generation');
    const qs = tk?.quick_starts?.find((q) => q.label === label);
    if (tk && qs) handleQuickStart(qs, tk);
  }, [handleQuickStart]);

  // Toolkit setter — writes to local state, persists to localStorage (browser
  // default for new chats), and saves to the current conversation's row when
  // one is loaded. Detects "just enabled" toolkits to surface the onboarding
  // card. Declared here so bootWorkflowLocally can reference it.
  const updateActiveToolkits = useCallback((next: string[]) => {
    const merged = new Set<string>([...next, ...ALWAYS_ON_TOOLKIT_IDS]);
    const arr = [...merged];
    setActiveToolkits((prev) => {
      const added = arr.find((id) => !prev.includes(id) && !ALWAYS_ON_TOOLKIT_IDS.includes(id));
      if (added) setJustEnabledToolkitId(added);
      return arr;
    });
    try { window.localStorage.setItem('mk_active_toolkits', JSON.stringify(arr)); } catch { /* private mode */ }
    if (currentConversationId) {
      agentChatHistoryService.updateConversationToolkits(currentConversationId, arr).catch((err) => {
        console.warn('[AgentHub] Failed to persist toolkits to conversation:', err);
      });
    }
  }, [currentConversationId]);

  const conversationIdRef = useRef(currentConversationId);
  conversationIdRef.current = currentConversationId;

  useEffect(() => {
    setActiveToolkits((prev) => {
      const filtered = prev.filter((id) => {
        const tk = TOOLKITS.find((t) => t.id === id);
        if (!tk) return false;
        if (tk.alwaysOn) return true;
        // JARVIS (orchestrator) auto-routes to whichever specialist owns a
        // tool, so it can carry EVERY toolkit — don't prune on agent switch.
        if (selectedAgent === 'orchestrator') return true;
        return getToolkitOwnerAgents(tk).includes(selectedAgent);
      });
      if (filtered.length === prev.length) return prev;
      try { window.localStorage.setItem('mk_active_toolkits', JSON.stringify(filtered)); } catch { /* private mode */ }
      const convId = conversationIdRef.current;
      if (convId) {
        agentChatHistoryService.updateConversationToolkits(convId, filtered).catch(() => {});
      }
      return filtered;
    });
  }, [selectedAgent]);

  /**
   * Boot a workflow LOCALLY without round-tripping through the agent. Used by
   * the toolkit quick-starts that carry a `workflow_id` — the user clicks
   * "Build my first catalog" and the wizard renders immediately with the
   * first step's form, no agent latency. Subsequent step advances DO call
   * the agent (the agent runs the step's tool + emits step_progress chunks),
   * but the user sees the wizard the moment they click.
   *
   * Side effects to make the wizard always work:
   *   1. Auto-switch the active agent to def.agent_id (defaults to 'kai') so
   *      the agent that owns the workflow's tools is the one receiving the
   *      Next-click messages. Without this, clicking a Catalogs wizard while
   *      on Interior Designer would send messages to an agent that doesn't
   *      have catalog tools.
   *   2. Auto-enable the workflow's moduleSlug toolkit (catalogs / mentions /
   *      etc.) so the tools are bound on the next message. Persists to the
   *      current conversation if loaded.
   */
  const bootWorkflowLocally = useCallback((workflowId: string): string | null => {
    const def = getWorkflowDefinition(workflowId);
    if (!def) return null;

    // 1. Switch agent if needed
    const targetAgent = def.agent_id || 'kai';
    if (targetAgent !== selectedAgent) {
      setSelectedAgent(targetAgent);
    }

    // 2. Auto-enable the toolkit that owns this workflow's tools. We map
    // workflow → toolkit by definition_id (catalog-* → catalogs, seo-* →
    // seo-article, b2b-* → b2b, etc.) so the user doesn't get a "tools not
    // available" reply when the agent runs the first step.
    const toolkitForWorkflow: Record<string, string> = {
      'catalog-build': 'catalogs',
      'catalog-translate': 'catalogs',
      'catalog-resume': 'catalogs',
      'catalog-send': 'catalogs',
      'seo-article': 'seo-article',
      'mention-monitor': 'mentions',
      'presentation-sheet': 'presentation-sheets',
      'b2b-research': 'b2b',
    };
    const requiredToolkit = toolkitForWorkflow[workflowId];
    if (requiredToolkit && !activeToolkits.includes(requiredToolkit)) {
      updateActiveToolkits([...activeToolkits, requiredToolkit]);
    }

    const runId = crypto.randomUUID();
    const stepOrder = def.steps.map((s) => s.id);
    const stepsRt: Record<string, any> = {};
    for (const id of stepOrder) stepsRt[id] = { step_id: id, status: 'pending' };
    // Preempt the first step into awaiting_input so the wizard renders its
    // form immediately. The agent will catch up when the user clicks Next.
    const firstStep = def.steps[0];
    if (firstStep && firstStep.input_schema && firstStep.input_schema.length > 0) {
      stepsRt[firstStep.id] = {
        step_id: firstStep.id,
        status: 'awaiting_input',
      };
    }
    setWorkflows((prev) => ({
      ...prev,
      [runId]: {
        definition_id: workflowId,
        run_id: runId,
        title: def.name,
        subtitle: undefined,
        steps: stepsRt,
        step_order: stepOrder,
        status: 'planning',
        metadata: { booted_locally: true },
        collapsed: false,
        awaiting_input_step_id: firstStep?.input_schema?.length ? firstStep.id : null,
        awaiting_input_schema: firstStep?.input_schema,
        awaiting_input_prompt: firstStep ? `Step 1 of ${def.steps.length} — ${firstStep.title}` : undefined,
      },
    }));
    return runId;
  }, [selectedAgent, activeToolkits, updateActiveToolkits]);

  /**
   * Advance a wizard step. Composes a structured continuation message the
   * agent picks up (parsed deterministically by the prompt addendum) OR
   * a free-form custom prompt when the user opted into the override. Sets
   * the step to `running` locally; the real progress comes from the agent
   * via `workflow_step_progress` chunks.
   */
  const handleWizardAdvance = useCallback((args: {
    runId: string;
    stepId: string;
    formValues?: Record<string, any>;
    customPrompt?: string;
  }) => {
    setWorkflows((prev) => {
      const wf = prev[args.runId];
      if (!wf) return prev;
      return {
        ...prev,
        [args.runId]: {
          ...wf,
          awaiting_input_step_id: null,
          awaiting_input_schema: undefined,
          awaiting_input_prompt: undefined,
          status: 'running',
          steps: {
            ...wf.steps,
            [args.stepId]: {
              ...(wf.steps[args.stepId] || { step_id: args.stepId, status: 'pending' }),
              input: args.formValues,
              status: 'running',
            },
          },
        },
      };
    });

    // Compose the message the agent will see. Two shapes:
    //   • Structured continuation — parsed via the prompt addendum to resume
    //     the step with form values, no LLM ambiguity.
    //   • Free-form prose — when the user used the "in your own words" override,
    //     the agent reads it normally and runs the step using its own judgment.
    //
    // The prefix includes the run_id so the agent can preserve it across the
    // remaining steps. Agent prompt addendum instructs: extract run_id from
    // the prefix, pass it to every tool as `_workflow_run_id`, and emit all
    // workflow_step_progress chunks with that exact run_id.
    const wf = workflows[args.runId];
    const prefix = `[workflow:${wf?.definition_id || 'unknown'}/${args.stepId}:${args.runId}] `;
    const message = args.customPrompt
      ? `${prefix}continue with: ${args.customPrompt}`
      : `${prefix}continue with input: ${JSON.stringify(args.formValues || {})}`;
    setInput(message);
    setTimeout(() => handleSendMessage(), 0);
  }, [workflows]);

  const handleWizardSkip = useCallback((runId: string, stepId: string) => {
    setWorkflows((prev) => {
      const wf = prev[runId];
      if (!wf) return prev;
      // Mark current step skipped, advance awaiting_input to the next step
      // that needs input (if any), so the wizard renders the next form.
      const nextSteps = { ...wf.steps };
      nextSteps[stepId] = {
        ...(nextSteps[stepId] || { step_id: stepId, status: 'pending' }),
        status: 'skipped',
      };
      const def = getWorkflowDefinition(wf.definition_id);
      const currentIdx = wf.step_order.indexOf(stepId);
      let nextAwaiting: string | null = null;
      let nextSchema: any | undefined = undefined;
      if (def && currentIdx >= 0 && currentIdx + 1 < wf.step_order.length) {
        for (let i = currentIdx + 1; i < wf.step_order.length; i++) {
          const candidateId = wf.step_order[i];
          const candidateDef = def.steps.find((s) => s.id === candidateId);
          if (candidateDef?.input_schema?.length) {
            nextAwaiting = candidateId;
            nextSchema = candidateDef.input_schema;
            nextSteps[candidateId] = {
              ...(nextSteps[candidateId] || { step_id: candidateId, status: 'pending' }),
              status: 'awaiting_input',
            };
            break;
          }
        }
      }
      return {
        ...prev,
        [runId]: {
          ...wf,
          steps: nextSteps,
          awaiting_input_step_id: nextAwaiting,
          awaiting_input_schema: nextSchema,
          awaiting_input_prompt: nextAwaiting ? 'Continuing after skip' : undefined,
        },
      };
    });
  }, []);

  const handleWizardDismiss = useCallback((runId: string) => {
    setWorkflows((prev) => {
      const next = { ...prev };
      delete next[runId];
      return next;
    });
  }, []);
  // Command palette — opens when the user types `/` at the start of an empty input
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  // Enabled modules from public.modules — drives module-gated toolkit visibility
  // (Catalogs needs `presentation-catalogs`, Mentions needs `mention-monitoring`, etc.)
  const { enabledSlugs: enabledModuleSlugs } = useEnabledModules();
  const enabledModulesArray = useMemo(() => Array.from(enabledModuleSlugs), [enabledModuleSlugs]);

  const [virtualStagingImageUrl, setVirtualStagingImageUrl] = useState<string | null>(null);
  const [, setThinkingStartTime] = useState<number | null>(null);
  // Elapsed time tracked by ThinkingTimer component; ref avoids re-renders in parent
  const elapsedTimeRef = useRef(0);
  const [messageRatings, setMessageRatings] = useState<Record<string, 'up' | 'down' | null>>({});

  // Real reasoning steps from agent (Jarvis-style)
  const [reasoningSteps, setReasoningSteps] = useState<{
    type: 'thinking' | 'tool_call' | 'tool_result' | 'iteration';
    message: string;
    timestamp: number;
    tool?: string;
  }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingCatalogPdf, setUploadingCatalogPdf] = useState(false);

  // Track previous agent to detect actual agent switches
  const previousAgentRef = useRef<string | null>(null);
  // Ref to latest handleSendMessage for use in effects (avoids stale closures)
  const handleSendMessageRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const initialPromptSent = useRef(false);

  // Pending material replacement — set by "Replace in Image" on ProductStrip cards
  const [pendingReplacement, setPendingReplacement] = useState<{ id: string; name: string; imageUrl?: string } | null>(null);

  // Pinned materials tray — catalog products pinned for Gemini multi-reference generation
  const [pinnedMaterials, setPinnedMaterials] = useState<{ id: string; name: string; imageUrl?: string }[]>(
    initialPinnedMaterial ? [initialPinnedMaterial] : [],
  );

  const handlePinMaterial = useCallback((material: { id: string; name: string; imageUrl?: string }) => {
    setPinnedMaterials(prev => {
      if (prev.some(m => m.id === material.id)) return prev; // avoid duplicates
      if (prev.length >= 14) return prev; // Gemini supports max 14 reference images
      return [...prev, material];
    });
    toast({ title: 'Pinned to design tray', description: material.name });
  }, [toast]);

  const handleUnpinMaterial = useCallback((materialId: string) => {
    setPinnedMaterials(prev => prev.filter(m => m.id !== materialId));
  }, []);

  // Material Modal State
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedMaterialsData, setSelectedMaterialsData] = useState<{
    materials: any[];
    spatialAnalysis?: any;
    roomType?: string;
    style?: string;
  } | null>(null);

  // Image Lightbox State (full-size view of a generated image)
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name?: string } | null>(null);

  // Voice input hook
  const {
    isRecording,
    interimTranscript,
    isSupported: isVoiceSupported,
    toggleRecording,
  } = useVoiceInput({
    onTranscript: (text) => {
      setInput((prev) => prev + ' ' + text);
    },
    onError: (error) => {
      toast({
        title: 'Voice Input Error',
        description: error,
        variant: 'destructive',
      });
    },
  });

  // Get current user ID and workspace
  useEffect(() => {
    const fetchUserId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        // workspace_id lives in workspace_members, not user_metadata
        const { data: memberRow } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('joined_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        setWorkspaceId(memberRow?.workspace_id ?? user.user_metadata?.workspace_id);
      }
    };
    fetchUserId();
  }, []);

  // Load conversations when user ID or agent changes
  useEffect(() => {
    if (!userId) return;

    // Check if this is an actual agent switch (not initial load)
    const isAgentSwitch = previousAgentRef.current !== null && previousAgentRef.current !== selectedAgent;
    previousAgentRef.current = selectedAgent;

    // Track if this effect is still active (for cleanup)
    let isActive = true;

    const loadConversations = async () => {
      const convos = await agentChatHistoryService.getUserConversations(userId, selectedAgent);

      // Clean up empty conversations (0 messages) - but only if they're old (>30 seconds)
      // This prevents deleting a just-created conversation before messages are saved
      const now = Date.now();
      const emptyConvos = convos.filter(c => {
        if (c.messageCount > 0) return false;
        const createdAt = new Date(c.createdAt || c.lastMessageAt).getTime();
        const ageMs = now - createdAt;
        return ageMs > 30000; // Only delete if older than 30 seconds
      });
      for (const emptyConvo of emptyConvos) {
        await agentChatHistoryService.deleteConversation(emptyConvo.id);
      }

      // Only update state if effect is still active
      if (!isActive) return;

      // Filter out empty conversations and deduplicate by ID
      const nonEmptyConvos = convos.filter(c => c.messageCount > 0);
      const uniqueConvos = nonEmptyConvos.reduce((acc, conv) => {
        if (!acc.some(c => c.id === conv.id)) {
          acc.push(conv);
        }
        return acc;
      }, [] as typeof nonEmptyConvos);

      setConversations(uniqueConvos);

      // ONLY reset conversation when actually switching agents, not on initial load
      // This prevents race condition where user starts chatting before effect completes
      if (isAgentSwitch) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    };

    loadConversations();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isActive = false;
    };
  }, [userId, selectedAgent]);

  // Update model when agent changes to use agent's default model
  useEffect(() => {
    const agent = AGENTS.find(a => a.id === selectedAgent);
    if (agent?.defaultModel) {
      setSelectedModel(agent.defaultModel);
    }
  }, [selectedAgent]);

  // Auto-scroll to bottom when new messages or reasoning steps arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoningSteps]);

  // Track thinking start/end (timer rendering is in ThinkingTimer component)
  useEffect(() => {
    if (isLoading) {
      setThinkingStartTime(Date.now());
      elapsedTimeRef.current = 0;
    } else {
      setThinkingStartTime(null);
    }
  }, [isLoading]);

  // Subscribe to background task results — when a task dispatched from this chat
  // completes, the runner inserts an assistant message into agent_chat_messages
  // and we push it into local state so it appears in the conversation.
  useEffect(() => {
    if (!currentConversationId) return;

    const channel = supabase
      .channel(`background-results:${currentConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_chat_messages',
          filter: `conversation_id=eq.${currentConversationId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          // Only inject assistant messages flagged as background task results
          if (msg.role !== 'assistant' || !msg.metadata?.background_task) return;
          setMessages(prev => {
            // Avoid duplicates if the message was already added locally
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, {
              id:        msg.id,
              role:      'assistant' as const,
              content:   msg.content,
              timestamp: new Date(msg.created_at),
              agentId:   'kai',
              // Structured completion (emitBackgroundResult resultData) → renders as an
              // AgentResultCard with the rail-3 "Open in {Hub}" handoff instead of plain text.
              agentResultData: msg.metadata?.agentResultData || undefined,
            }];
          });
        },
      )
      .subscribe();

    return () => { channel.unsubscribe(); supabase.removeChannel(channel); };
  }, [currentConversationId]);

  /**
   * Transform raw reasoning data into Jarvis-style witty messages
   * Personality: Dry wit, subtle humor, calm, measured, professional
   */
  const toJarvisStyle = (
    type: 'thinking' | 'tool_call' | 'tool_result' | 'iteration',
    data: { tool?: string; content?: string; result?: any; iteration?: number },
  ): string => {
    // Tool-specific Jarvis commentary
    const toolMessages: Record<string, string[]> = {
      material_search: [
        'Scouring the material database. One moment while I work my magic.',
        'Searching through rather a lot of materials for you.',
        'Running analysis. The things I do for you!',
      ],
      vector_search: [
        'Consulting the semantic archives. Fascinating stuff, really.',
        'Performing vector analysis. It\'s more exciting than it sounds.',
        'Semantic search initiated. Mathematics meets materials.',
      ],
      get_product_details: [
        'Fetching product specifications. Every detail matters.',
        'Pulling up the particulars. I do love a thorough dossier.',
        'Gathering product intelligence. Consider it done.',
      ],
      analyze_image: [
        'Examining the visual data. I see what you\'re going for.',
        'Processing imagery. My visual acuity is rather exceptional.',
        'Analyzing your reference. Excellent taste, if I may say.',
      ],
      generate_3d: [
        'Generating 3D visualization. This is the fun part.',
        'Rendering your vision. Stand by for something rather nice.',
        'Creating dimensional imagery. Art and algorithms in harmony.',
      ],
      spatial_analysis: [
        'Analyzing spatial configuration. Architecture is poetry, really.',
        'Calculating dimensional relationships. Geometry at its finest.',
        'Evaluating the spatial dynamics. Every room tells a story.',
      ],
      knowledge_base_search: [
        'Executing internal search also. One moment.',
        'Searching the knowledge base for you.',
        'Looking through our documentation. Bear with me.',
      ],
    };

    // Generic thinking messages
    const thinkingMessages = [
      'Running calculations. The elegant kind.',
      'Thinking this through. Properly, of course.',
      'Considering the possibilities. There are several good ones.',
      'Processing your request. This shouldn\'t take long.',
      'Analyzing the parameters. Bear with me.',
    ];

    // Iteration messages
    const iterationMessages = [
      'Making progress. Steady as it goes.',
      'Refining the approach. Precision matters.',
      'Working through the details. Almost there.',
      'Iterating thoughtfully. Quality takes time.',
    ];

    // Tool result messages
    const resultMessages = [
      'Results acquired. Rather satisfying, actually.',
      'Data retrieved successfully. As expected.',
      'Information secured. Shall we proceed?',
      'Analysis complete. The numbers look promising.',
    ];

    const pickRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    switch (type) {
      case 'tool_call':
        if (data.tool && toolMessages[data.tool]) {
          return pickRandom(toolMessages[data.tool]);
        }
        return 'Executing AI tools. One moment.';

      case 'tool_result':
        return pickRandom(resultMessages);

      case 'iteration':
        return pickRandom(iterationMessages);

      case 'thinking':
      default:
        // Guard: content must be a string (edge function could send a raw Claude content block)
        if (typeof data.content === 'string' && data.content) return data.content;
        return pickRandom(thinkingMessages);
    }
  };

  // Handle message rating
  const handleMessageRating = async (messageId: string, rating: 'up' | 'down') => {
    const currentRating = messageRatings[messageId];
    const newRating = currentRating === rating ? null : rating;

    setMessageRatings((prev) => ({
      ...prev,
      [messageId]: newRating,
    }));

    // Find the message to get conversation context
    const message = messages.find((m) => m.id === messageId);
    if (!message || !currentConversationId) return;

    try {
      // Find the actual DB row by conversation + timestamp proximity
      // (local message IDs are not DB UUIDs, so we can't match by id directly)
      const { data: dbMessages } = await supabase
        .from('agent_chat_messages')
        .select('id, metadata, created_at')
        .eq('conversation_id', currentConversationId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(50);

      const targetMs = message.timestamp.getTime();
      const match = dbMessages?.reduce((best: any, row: any) => {
        const diff = Math.abs(new Date(row.created_at).getTime() - targetMs);
        const bestDiff = best ? Math.abs(new Date(best.created_at).getTime() - targetMs) : Infinity;
        return diff < bestDiff ? row : best;
      }, null);

      if (!match) {
        console.error('Rating: could not find matching DB message');
        return;
      }

      await supabase
        .from('agent_chat_messages')
        .update({
          metadata: {
            ...(match.metadata || {}),
            rating: newRating,
            ratedAt: new Date().toISOString(),
          },
        })
        .eq('id', match.id);

      toast({
        title: newRating ? (newRating === 'up' ? '👍 Thanks!' : '👎 Thanks for the feedback') : 'Rating removed',
        description: newRating ? 'Your feedback helps improve our AI responses.' : '',
      });
    } catch (error) {
      console.error('Error saving rating:', error);
    }
  };

  // Filter agents based on user role
  const roleHierarchy = { viewer: 0, member: 1, admin: 2, owner: 3 };
  const availableAgents = AGENTS.filter(
    (agent) => agent.available && roleHierarchy[userRole] >= roleHierarchy[agent.requiredRole],
  );
  // Registered-but-not-runnable agents (sandbox tier unbuilt) — rendered
  // disabled in the picker so the full roster is visible.
  const comingSoonAgents = AGENTS.filter(
    (agent) => agent.comingSoon && roleHierarchy[userRole] >= roleHierarchy[agent.requiredRole],
  );

  // Handle VR world generation from a generated room image (ProgressiveImageGrid actions).
  const handleGenerateVR = useCallback(async (
    imageUrl: string,
    context: { prompt?: string; roomType?: string; style?: string },
    _sourceMessage: Message,
  ) => {
    try {
      // Trigger VR generation via edge function (synchronous — awaits full WorldLabs generation)
      const vrResult = await vrWorldService.generateVRWorld({
        sourceImageUrl: imageUrl,
        prompt: context.prompt || `Interior design: ${context.roomType || 'room'} in ${context.style || 'modern'} style`,
        roomType: context.roomType,
        style: context.style,
      });

      // World is already completed — pass all splat URLs directly to WorldViewer (no polling needed)
      const vrMessage: Message = {
        id: `vr-${Date.now()}`,
        role: 'assistant',
        content: 'Your explorable VR world is ready! Use orbit controls to look around, or switch to first-person (WASD) to walk through.',
        timestamp: new Date(),
        agentId: 'interior-designer',
        worldData: {
          vrWorldId: vrResult.vrWorldId,
          status: (vrResult.status as 'pending' | 'uploading' | 'generating' | 'completed' | 'failed') || 'completed',
          splatUrl100k: vrResult.splatUrl100k,
          splatUrl500k: vrResult.splatUrl500k,
          splatUrlFull: vrResult.splatUrlFull,
          colliderGlbUrl: vrResult.colliderGlbUrl,
          caption: vrResult.caption,
          sourceImageUrl: imageUrl,
          prompt: context.prompt,
        },
      };

      setMessages((prev) => [...prev, vrMessage]);

      // Save to DB
      if (currentConversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId: currentConversationId,
          role: 'assistant',
          content: vrMessage.content,
          metadata: { worldData: vrMessage.worldData },
        });
      }

      toast({
        title: 'VR World Ready',
        description: 'Your 3D world has been generated successfully.',
      });
    } catch (error: any) {
      console.error('VR generation error:', error);
      toast({
        title: 'VR Generation Failed',
        description: error.message || 'Failed to start VR world generation',
        variant: 'destructive',
      });
    }
  }, [currentConversationId, toast]);

  // Generate video from a Gemini-generated image
  const handleGenerateVideo = useCallback(async (
    imageUrl: string,
    sourceMessage: Message,
    videoType: string = 'walkthrough',
    videoModel: string = 'auto',
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

      const resolvedVideoType = videoType || 'walkthrough';
      const resolvedModel = videoModel === 'auto' ? undefined : videoModel;
      const isAsyncModel = resolvedModel && ['wan2.1-i2v-720p', 'runway-gen4-turbo'].includes(resolvedModel);

      const modelLabels: Record<string, string> = {
        'veo-2': 'Veo 2.0', 'kling-v3.0': 'Kling v3.0 Pro',
        'wan2.1-i2v-720p': 'Wan2.1 720p', 'runway-gen4-turbo': 'Runway Gen-4',
      };
      const modelLabel = resolvedModel ? modelLabels[resolvedModel] : 'auto-selected model';
      toast({
        title: `Generating ${resolvedVideoType.replace('_', ' ')} video…`,
        description: `Using ${modelLabel}. ${isAsyncModel ? 'This may take 2-5 minutes.' : 'This may take 30-60 seconds.'}`,
      });

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-interior-video-v2`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_image_url: imageUrl,
          workspace_id: workspaceId,
          conversation_id: conversationIdRef.current ?? undefined,
          video_type: resolvedVideoType,
          model: resolvedModel,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Video generation failed');

      // Add a new chat message with the video (same pattern as VR world)
      const videoMessage: Message = {
        id: `video-${Date.now()}`,
        role: 'assistant',
        content: result.async_job
          ? `Your ${resolvedVideoType.replace('_', ' ')} video is being generated with ${modelLabel}. I'll notify you when it's ready. Job ID: ${result.job_id}`
          : `Your ${resolvedVideoType.replace('_', ' ')} video is ready! ${result.credits_used} credits used (${modelLabel}).`,
        timestamp: new Date(),
        agentId: 'interior-designer',
        videoData: {
          video_url: result.video_url,
          job_id: result.job_id,
          status: 'completed' as const,
        },
      };

      setMessages(prev => [...prev, videoMessage]);

      if (currentConversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId: currentConversationId,
          role: 'assistant',
          content: videoMessage.content,
          metadata: { videoData: videoMessage.videoData },
        });
      }

      toast({ title: 'Video ready!', description: `${result.credits_used} credits used.` });
    } catch (error: any) {
      console.error('Video generation error:', error);
      toast({ title: 'Video generation failed', description: error.message, variant: 'destructive' });
    }
  }, [workspaceId, currentConversationId, toast]);

  const [videoModel] = useState<string>('auto');

  // Generate a Materials Selection Board from a Gemini-generated image
  const handleGenerateMaterialsBoard = useCallback(async (
    imageUrl: string,
    boardMode: 'presentation-board' | 'selection-board' | 'photorealistic-render',
    _sourceMessage: Message,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

      const boardLabels = {
        'presentation-board': 'Presentation Board',
        'selection-board': 'Selection Board',
        'photorealistic-render': 'Photorealistic Render',
      };

      toast({
        title: `Generating ${boardLabels[boardMode]}…`,
        description: 'This may take 20–40 seconds.',
      });

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-interior-gemini`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'materials-selection-board',
          board_mode: boardMode,
          reference_image_url: imageUrl,
          model_tier: 'pro',
          aspect_ratio: boardMode === 'photorealistic-render' ? '16:9' : '1:1',
          workspace_id: workspaceId,
          conversation_id: conversationIdRef.current ?? undefined,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Board generation failed');

      const boardMessage: Message = {
        id: `board-${Date.now()}`,
        role: 'assistant',
        content: `Your ${boardLabels[boardMode]} is ready! ${result.credits_used} credits used.`,
        timestamp: new Date(),
        agentId: 'interior-designer',
        materialsBoardData: {
          image_url: result.image_url,
          job_id: result.job_id,
          board_mode: boardMode,
          credits_used: result.credits_used,
        },
      };

      setMessages(prev => [...prev, boardMessage]);

      if (currentConversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId: currentConversationId,
          role: 'assistant',
          content: boardMessage.content,
          metadata: { materialsBoardData: boardMessage.materialsBoardData },
        });
      }

      toast({ title: `${boardLabels[boardMode]} ready!`, description: `${result.credits_used} credits used.` });
    } catch (error: any) {
      console.error('Materials board generation error:', error);
      toast({ title: 'Board generation failed', description: error.message, variant: 'destructive' });
    }
  }, [workspaceId, currentConversationId, toast]);

  // Generate virtual staging directly (bypasses AI chat — calls edge function with structured params)
  const handleGenerateVirtualStaging = useCallback(async (
    imageUrl: string,
    params: VirtualStagingParams,
  ) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

      toast({
        title: 'Generating virtual staging…',
        description: `${params.room} — ${params.style} style. This may take 30–60 seconds.`,
      });

      const res = await fetch(`${supabaseUrl}/functions/v1/generate-virtual-staging`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_image_url: imageUrl,
          room: params.room,
          furniture_style: params.style,
          furniture_items: params.furnitureItems,
          workspace_id: workspaceId,
          conversation_id: conversationIdRef.current ?? undefined,
        }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Virtual staging failed');

      const stagingMessage: Message = {
        id: `staging-${Date.now()}`,
        role: 'assistant',
        content: `Virtual Staging complete — ${result.room} in ${result.furniture_style} style. ${result.credits_used} credits used.`,
        timestamp: new Date(),
        agentId: 'interior-designer',
        virtualStagingData: {
          image_url: result.image_url,
          source_image_url: imageUrl,
          job_id: result.job_id,
          room: result.room,
          furniture_style: result.furniture_style,
          credits_used: result.credits_used,
        },
      };

      setMessages(prev => [...prev, stagingMessage]);

      if (currentConversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId: currentConversationId,
          role: 'assistant',
          content: stagingMessage.content,
          metadata: { virtualStagingData: stagingMessage.virtualStagingData },
        });
      }

      toast({ title: 'Virtual Staging ready!', description: `${result.credits_used} credits used.` });
    } catch (error: any) {
      console.error('Virtual staging error:', error);
      toast({ title: 'Virtual staging failed', description: error.message, variant: 'destructive' });
    }
  }, [workspaceId, currentConversationId, toast]);

  // Use a product image as input for a 3D interior design scene
  const handleUseProductIn3DScene = useCallback((imageUrl: string, productName: string) => {
    setAttachedImages([imageUrl]);
    setInput(`Design a 3D interior scene featuring this product: ${productName}`);
    // Switch to interior-designer agent for best 3D generation results
    setSelectedAgent('interior-designer');
  }, []);

  const handleSendMessage = useCallback(async () => {
    // Consume any pending deterministic tool run (set by a quick-start carrying a
    // `run` descriptor). When present we fire mode:'direct_tool' instead of an
    // LLM turn — the same stream pipeline below renders the same result cards.
    const directRun = pendingDirectRunRef.current;
    pendingDirectRunRef.current = null;
    // Toolkits queued by a quick-start launcher for this send (race-proof).
    const pendingToolkits = pendingToolkitsRef.current;
    pendingToolkitsRef.current = [];

    if (!directRun && !input.trim() && attachedImages.length === 0 && attachedCatalogPdfs.length === 0 && attachedDocuments.length === 0) {
      return;
    }
    if (!userId) {
      return;
    }

    // For a direct run the chat shows a compact "▶ <label>" chip instead of typed text.
    const userAttachedImages = directRun ? [] : [...attachedImages];
    const userAttachedCatalogPdfs = directRun ? [] : [...attachedCatalogPdfs];
    // Readable PDFs (quotes/invoices/specs) — sent as base64 data URLs so Opus reads them natively.
    const userAttachedDocuments = directRun ? [] : attachedDocuments.map((d) => d.dataUrl);

    // What the user sees in their chat bubble — their own text, or a friendly
    // default when they attached a catalog PDF and typed nothing.
    const userInput = directRun
      ? `▶ ${directRun.label}`
      : (input.trim()
          || (userAttachedCatalogPdfs.length > 0 ? 'Extract the products from this catalog.' : '')
          || (userAttachedDocuments.length > 0 ? 'Read the attached document.' : input));

    // What the agent actually receives — same text plus the machine context it
    // needs to attach the uploaded source PDF(s). Kept out of the visible bubble
    // so the composer/chat stay clean.
    const plural = userAttachedCatalogPdfs.length > 1;
    const apiUserInput = userAttachedCatalogPdfs.length > 0
      ? `${userInput}\n\n[Attached catalog source PDF${plural ? 's' : ''}: ${userAttachedCatalogPdfs.map((p) => p.filename).join(', ')}. `
        + `If we don't have a catalog yet, create one, then attach ${plural ? 'them' : 'it'} with attach_catalog_pdfs `
        + `(source_pdf_id${plural ? 's' : ''}: ${userAttachedCatalogPdfs.map((p) => p.id).join(', ')}) and extract the products.]`
      : userInput;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput,
      timestamp: new Date(),
      images: userAttachedImages.length > 0 ? userAttachedImages : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setAttachedImages([]);
    setAttachedCatalogPdfs([]);
    setAttachedDocuments([]);
    setSelectedGenerationMode(null);
    setIsLoading(true);
    setReasoningSteps([]); // Clear reasoning steps for new message

    try {
      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      // Create or get the conversation FIRST so any attached images upload under
      // the per-session folder (u/{user_id}/sessions/{conversation_id}/uploads/...).
      // If we uploaded before the conversation existed, first-message attachments
      // would leak into the legacy flat prefix and never be tied to this chat.
      let conversationId = currentConversationId;
      let newConversation: ChatConversation | null = null;
      if (!conversationId) {
        const conversation = await agentChatHistoryService.createConversation({
          title: userInput.slice(0, 50) + (userInput.length > 50 ? '...' : ''),
          agentId: selectedAgent,
          userId: userId,
          // Capture current toolkit selection so the convo persists what was
          // active at creation time. Reloading the convo restores the same set.
          toolkits: activeToolkits,
        });
        if (conversation) {
          conversationId = conversation.id;
          // Mark the URL-driven load as already handled BEFORE updating the URL.
          // Otherwise `onConversationChange` below flips `initialConversationId`,
          // which triggers the load effect → fetches messages from DB while we're
          // still saving the user message → races with saveMessage → wipes the
          // freshly-added user bubble from local state. Result: user's message
          // appears to "disappear" until the page is refreshed.
          initialConvLoaded.current = true;
          setCurrentConversationId(conversationId);
          onConversationChange?.(conversationId);
          newConversation = conversation;
        }
      }

      // Upload attached images under the session folder so URLs are available for
      // both the API call and DB persistence.
      let resolvedImageUrls: string[] = [];
      if (userAttachedImages.length > 0) {
        resolvedImageUrls = await Promise.all(
          userAttachedImages.map(async (img, idx) => {
            if (!img.startsWith('data:')) return img;
            try {
              const commaIdx = img.indexOf(',');
              const mimeType = img.slice(5, img.indexOf(';'));
              const ext = mimeType.split('/')[1] || 'jpg';
              const base64Data = img.slice(commaIdx + 1);
              const binaryStr = atob(base64Data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              const fileName = resolveUploadPath(
                { userId, conversationId: conversationId ?? undefined },
                'user-uploads',
                `${Date.now()}-${idx}.${ext}`,
              );
              const { data: up, error } = await supabase.storage
                .from('generation-images')
                .upload(fileName, bytes, { contentType: mimeType, upsert: true });
              if (error || !up) return img;
              return supabase.storage.from('generation-images').getPublicUrl(up.path).data.publicUrl;
            } catch {
              return img;
            }
          }),
        );
      }

      // Save user message to database, including image URLs so they survive page refresh
      if (conversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'user',
          content: userInput,
          metadata: resolvedImageUrls.length > 0 ? { attachedImages: resolvedImageUrls } : undefined,
        });
        // Add to sidebar only after message is saved (messageCount > 0 in DB)
        // This prevents empty conversations from appearing in history on page load
        if (newConversation) {
          setConversations((prev) => {
            if (prev.some(c => c.id === newConversation!.id)) return prev;
            return [newConversation!, ...prev];
          });
        }
      }

      // The client-side agent response cache was REMOVED 2026-07-06. It replayed a 30-min-old
      // full-text answer for a repeated question (keyed on query+agent+workspace, NOT the
      // conversation) WITHOUT ever calling agent-chat — so it served stale answers, ignored
      // fresh KB / live data, and short-circuited the agent entirely (even in a new
      // conversation). A live-data agent MUST run every time. This directly caused the
      // repeated "the KB has no Materials Hub content" replies that persisted after the KB
      // was actually fixed. Do not reintroduce full-response caching for KAI.
      let data: any = null;
      let pendingGeminiData: Message['geminiImageData'] | null = null;
      let pendingSearchSpec: Message['searchSpec'] | null = null;

      // Always call the agent (no response cache).
      if (!data) {
        // Prepare request body
        const requestBody: any = {
          messages: messages.concat({
            id: `msg-${Date.now()}`,
            role: 'user',
            // apiUserInput carries the catalog source_pdf_id context (if any);
            // the visible bubble/persisted message use the clean userInput.
            content: apiUserInput,
            timestamp: new Date(),
          }),
          agentId: selectedAgent,
          model: selectedModel,
          images: resolvedImageUrls,
          ...(userAttachedDocuments.length > 0 ? { documents: userAttachedDocuments } : {}),
          // Use the local `conversationId` (already includes a freshly-created id),
          // not the React state `currentConversationId` — state updates from
          // setCurrentConversationId above haven't committed yet on the first
          // message, so reading state would send null and tool-call logs would
          // land with conversation_id=null ("no conversation id" in the admin).
          conversation_id: conversationId,
          ...(selectedGenerationMode ? { generation_mode: selectedGenerationMode } : {}),
          ...(pinnedMaterials.length > 0 && selectedAgent === 'interior-designer'
            ? { pinned_material_images: pinnedMaterials.filter(m => m.imageUrl).map(m => m.imageUrl!) }
            : {}),
          // Toolkit-level enablement — agent-chat resolves these to tool IDs server-side.
          // Always includes the always-on Core toolkit. Single source of truth for
          // tool gating; the per-tool restriction picker was removed 2026-05-09 in
          // favor of the visual toolkit picker + load_toolkit meta-tool.
          // For a direct run we also force-include the owning toolkit so the server
          // binds the target tool even if the user hasn't pre-enabled that cluster.
          // `pendingToolkits` does the same for seeded-prompt quick-starts (race-proof).
          selected_toolkits: Array.from(new Set([
            ...(activeToolkits || []),
            ...pendingToolkits,
            ...(directRun ? [directRun.toolkitId] : []),
          ])),
          // Deterministic single-tool run — skips the LLM. RBAC still enforced
          // server-side (admin-only tools never bind for non-admins).
          ...(directRun
            ? { mode: 'direct_tool', direct_tool: { name: directRun.toolName, input: directRun.toolInput } }
            : {}),
        };

        // Call Supabase Edge Function for agent execution with STREAMING
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated');
        }

        // Tell the agent which workspace to act in — the switcher-active one — so a
        // multi-workspace user's chat writes land in the workspace they're viewing.
        // The server validates this against membership before trusting it (#275 per-workspace).
        requestBody.workspace_id = getActiveWorkspaceId(session.user?.id)
          ?? workspaceId
          ?? session.user?.user_metadata?.workspace_id;

        // Get Supabase URL from the client
        const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

        // Create AbortController to prevent premature cancellation
        const abortController = new AbortController();

        const fetchPromise = fetch(
          `${supabaseUrl}/functions/v1/agent-chat`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: abortController.signal,
          },
        );

        const response = await fetchPromise;

        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`Agent request failed: ${response.status}`, {
            service: 'AgentHub',
            metadata: { status: response.status, error: errorText },
          });
          throw new Error(`Agent execution failed: ${response.status} - ${errorText}`);
        }

        if (!response.body) {
          logger.error('No response body from agent', { service: 'AgentHub' });
          throw new Error('No response body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: any = null;

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const decoded = decoder.decode(value, { stream: true });
          buffer += decoded;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk = JSON.parse(line);

              // Capture reasoning steps for Jarvis-style display
              if (chunk.type === 'agent_routed') {
                // JARVIS auto-routed this turn to a specialist.
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'iteration',
                    message: `Routing to ${chunk.name || chunk.to}.`,
                    timestamp: Date.now(),
                  },
                ]);
              } else if (chunk.type === 'status') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'iteration',
                    message: 'Systems online. Beginning analysis.',
                    timestamp: Date.now(),
                  },
                ]);
              } else if (chunk.type === 'iteration') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'iteration',
                    message: toJarvisStyle('iteration', { iteration: chunk.iteration }),
                    timestamp: Date.now(),
                  },
                ]);
              } else if (chunk.type === 'assistant_thinking') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'thinking',
                    message: toJarvisStyle('thinking', { content: chunk.content }),
                    timestamp: Date.now(),
                  },
                ]);
              } else if (chunk.type === 'tool_call') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'tool_call',
                    message: toJarvisStyle('tool_call', { tool: chunk.tool }),
                    timestamp: Date.now(),
                    tool: chunk.tool,
                  },
                ]);
              } else if (chunk.type === 'tool_result') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'tool_result',
                    message: toJarvisStyle('tool_result', { tool: chunk.tool, result: chunk.result }),
                    timestamp: Date.now(),
                    tool: chunk.tool,
                  },
                ]);
              } else if (chunk.type === 'tool_error') {
                setReasoningSteps((prev) => [
                  ...prev,
                  {
                    type: 'tool_result',
                    message: `Hmm, a minor setback with ${chunk.tool}. Adapting approach.`,
                    timestamp: Date.now(),
                    tool: chunk.tool,
                  },
                ]);
              } else if (chunk.type === 'tool_progress' && chunk.status) {
                // Mid-tool progress lines (~60 emit sites across job/mention/price/project/sourcing/seo
                // tools) were previously dropped on the floor in chat. Surface them as reasoning steps.
                setReasoningSteps((prev) => [
                  ...prev,
                  { type: 'tool_call', message: String(chunk.status), timestamp: Date.now() },
                ]);
              }

              // Handle generation_job_created - IMMEDIATE response
              if (chunk.type === 'generation_job_created') {
                logger.info(`Generation job created: ${chunk.job_id}`, {
                  service: 'AgentHub',
                  metadata: {
                    job_id: chunk.job_id,
                    model_count: chunk.model_count,
                    models: chunk.models,
                    agent: selectedAgent,
                  },
                });

                // IMMEDIATELY add a message with the generation grid
                const generationMessage: Message = {
                  id: `msg-gen-${Date.now()}`,
                  role: 'assistant',
                  content: `🎨 Generating ${chunk.model_count} interior design variations...`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  generation_job: {
                    job_id: chunk.job_id,
                    model_count: chunk.model_count,
                    models: chunk.models,
                    prompt: chunk.prompt || '',
                    room_type: chunk.room_type,
                    style: chunk.style,
                  },
                };

                setMessages((prev) => [...prev, generationMessage]);

                // Save generation message to database immediately
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: generationMessage.content,
                    metadata: {
                      agentId: selectedAgent,
                      model: selectedModel,
                      generation_job: generationMessage.generation_job,
                    },
                  });
                }

                finalResult = {
                  type: 'final_result',
                  text: `Started generating ${chunk.model_count} interior design variations.`,
                  agentId: selectedAgent,
                  model: selectedModel,
                  generation_job: {
                    job_id: chunk.job_id,
                    model_count: chunk.model_count,
                    models: chunk.models,
                    prompt: chunk.prompt || '',
                    room_type: chunk.room_type,
                    style: chunk.style,
                  },
                };
              // Handle gemini_image_ready — store data to merge into the final assistant message
              } else if (chunk.type === 'gemini_image_ready') {
                pendingGeminiData = {
                  image_url: chunk.image_url,
                  mode: chunk.mode,
                  model: chunk.model,
                  job_id: chunk.job_id,
                  credits_used: chunk.credits_used,
                };
                // Don't add a message here — it will be merged into the final assistant message
                // so the agent's explanation text and the image appear in a single bubble.
              // Handle vr_world_ready — agent-triggered VR world generation
              } else if (chunk.type === 'vr_world_ready') {
                const vrMsg: Message = {
                  id: `msg-vr-${Date.now()}`,
                  role: 'assistant',
                  content: 'Your explorable VR world is ready! Use orbit controls to look around, or switch to first-person (WASD) to walk through.',
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  worldData: {
                    vrWorldId: chunk.vr_world_id,
                    status: (chunk.status as 'pending' | 'uploading' | 'generating' | 'completed' | 'failed') || 'completed',
                    splatUrl100k: chunk.splat_url_100k,
                    splatUrl500k: chunk.splat_url_500k,
                    splatUrlFull: chunk.splat_url_full,
                    colliderGlbUrl: chunk.collider_glb_url,
                    caption: chunk.caption,
                    sourceImageUrl: chunk.source_image_url,
                    prompt: chunk.prompt,
                  },
                };
                setMessages(prev => [...prev, vrMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: vrMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, worldData: vrMsg.worldData },
                  });
                }
                finalResult = {
                  type: 'final_result',
                  text: vrMsg.content,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              // Handle video_generated — agent-produced video → the rich player card (was falling
              // through to the generic JSON card because video_generated was in AGENT_RESULT_TITLES).
              } else if (chunk.type === 'video_generated' && chunk.video_url) {
                const videoMsg: Message = {
                  id: `msg-video-${Date.now()}`,
                  role: 'assistant',
                  content: `Your video is ready!${chunk.credits_used ? ` ${chunk.credits_used} credits used.` : ''}`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  videoData: { video_url: chunk.video_url, job_id: chunk.job_id, status: 'completed' as const },
                };
                setMessages(prev => [...prev, videoMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: videoMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, videoData: videoMsg.videoData },
                  });
                }
                finalResult = { type: 'final_result', text: videoMsg.content, agentId: selectedAgent, model: selectedModel };
              // Handle virtual_staging_ready — virtual staging result
              } else if (chunk.type === 'virtual_staging_ready') {
                const stagingMsg: Message = {
                  id: `msg-staging-${Date.now()}`,
                  role: 'assistant',
                  content: `Virtual Staging complete — ${chunk.room} in ${chunk.furniture_style} style. ${chunk.credits_used} credits used.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  virtualStagingData: {
                    image_url: chunk.image_url,
                    source_image_url: chunk.source_image_url,
                    job_id: chunk.job_id,
                    room: chunk.room,
                    furniture_style: chunk.furniture_style,
                    credits_used: chunk.credits_used,
                  },
                };
                setMessages(prev => [...prev, stagingMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: stagingMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, virtualStagingData: stagingMsg.virtualStagingData },
                  });
                }
                finalResult = {
                  type: 'final_result',
                  text: stagingMsg.content,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              // Handle materials_board_ready — agent-triggered materials selection board
              } else if (chunk.type === 'materials_board_ready') {
                const boardMsg: Message = {
                  id: `msg-board-${Date.now()}`,
                  role: 'assistant',
                  content: `Materials ${(chunk.board_mode as string || 'selection-board').replace(/-/g, ' ')} ready — ${chunk.credits_used} credits used.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  materialsBoardData: {
                    image_url: chunk.image_url,
                    job_id: chunk.job_id,
                    board_mode: (chunk.board_mode || 'selection-board') as 'presentation-board' | 'selection-board' | 'photorealistic-render',
                    credits_used: chunk.credits_used,
                  },
                };
                setMessages(prev => [...prev, boardMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: boardMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, materialsBoardData: boardMsg.materialsBoardData },
                  });
                }
                finalResult = {
                  type: 'final_result',
                  text: boardMsg.content,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              // Handle article_generation_started - SEO pipeline async
              } else if (chunk.type === 'article_generation_started') {
                logger.info(`SEO article pipeline started: ${chunk.article_id}`, {
                  service: 'AgentHub',
                  metadata: { article_id: chunk.article_id, target_keyword: chunk.target_keyword },
                });

                const articleMessage: Message = {
                  id: `msg-article-${Date.now()}`,
                  role: 'assistant',
                  content: `Starting SEO article generation for "${chunk.target_keyword}"...`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  articleData: {
                    article_id: chunk.article_id,
                    topic: chunk.topic,
                    target_keyword: chunk.target_keyword,
                  },
                };

                setMessages((prev) => [...prev, articleMessage]);

                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: articleMessage.content,
                    metadata: {
                      agentId: selectedAgent,
                      model: selectedModel,
                      articleData: articleMessage.articleData,
                    },
                  });
                }

                finalResult = {
                  type: 'final_result',
                  text: `Started SEO article pipeline for "${chunk.target_keyword}".`,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              // Handle inspiration_analysis — design tokens extracted from URL
              } else if (chunk.type === 'inspiration_analysis') {
                const inspirationMsg: Message = {
                  id: `msg-inspiration-${Date.now()}`,
                  role: 'assistant',
                  content: `Analyzed design inspiration from ${chunk.page_title || chunk.source_url}. Found ${chunk.materials?.length || 0} materials, ${chunk.colors?.length || 0} colors, and ${chunk.styles?.length || 0} style keywords.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  inspirationData: {
                    source_url: chunk.source_url,
                    page_title: chunk.page_title,
                    hero_image: chunk.hero_image,
                    colors: chunk.colors || [],
                    color_hex: chunk.color_hex || [],
                    materials: chunk.materials || [],
                    textures: chunk.textures || [],
                    styles: chunk.styles || [],
                    room_type: chunk.room_type,
                    focus: chunk.focus,
                    products: chunk.products || [],
                    search_query_used: chunk.search_query_used,
                    total_results: chunk.total_results,
                  },
                };
                setMessages(prev => [...prev, inspirationMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: inspirationMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, inspirationData: inspirationMsg.inspirationData },
                  });
                }
              // Handle heat_pump_sizing — deterministic capacity estimate
              } else if (chunk.type === 'heat_pump_sizing') {
                const r = chunk.result;
                const heatPumpMsg: Message = {
                  id: `msg-heatpump-${Date.now()}`,
                  role: 'assistant',
                  content: `Estimated heat-pump capacity: ${r?.recommendedRange?.minKW}–${r?.recommendedRange?.maxKW} kW (design load ${r?.totalDesignKW} kW).`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  heatPumpData: { input: chunk.input, result: r },
                };
                setMessages(prev => [...prev, heatPumpMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: heatPumpMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, heatPumpData: heatPumpMsg.heatPumpData },
                  });
                }
              // Handle heating_cost_comparison — annual running-cost comparison
              } else if (chunk.type === 'heating_cost_comparison') {
                const r = chunk.result;
                const cheapest = r?.cheapest;
                const heatingMsg: Message = {
                  id: `msg-heatingcost-${Date.now()}`,
                  role: 'assistant',
                  content: `Cheapest heating method: ${cheapest?.label} at ~€${Math.round(cheapest?.annualCostEur)}/yr.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  heatingCostData: { input: chunk.input, result: r },
                };
                setMessages(prev => [...prev, heatingMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: heatingMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, heatingCostData: heatingMsg.heatingCostData },
                  });
                }
              // Handle search_spec — explainable search dimensions
              } else if (chunk.type === 'search_spec') {
                // Attach search spec to the NEXT materialData message (store in pending state)
                pendingSearchSpec = {
                  ...chunk.spec,
                  query: chunk.query,
                };
              } else if (chunk.type === 'sheet_created') {
                // Lightweight ack — passive sheets follow up with sheet_pdf_ready,
                // interactive sheets follow up with sheet_canvas_open. We only
                // need to surface a transient note; the dedicated cards below carry
                // the actual UI.
                logger.info(`Sheet created: ${chunk.sheet_type} (${chunk.sheet_id})`, {
                  service: 'AgentHub',
                  metadata: { sheet_id: chunk.sheet_id, sheet_type: chunk.sheet_type, credits_used: chunk.credits_used },
                });
              } else if (chunk.type === 'action_confirmation') {
                // Human-in-the-loop gate (#275): a sensitive tool previewed instead of mutating.
                // Render an inline Approve/Decline card; Approve re-invokes the tool with confirm:true.
                const confirmMsg: Message = {
                  id: `msg-confirm-${Date.now()}`,
                  role: 'assistant',
                  content: chunk.title || 'This action needs your approval.',
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  actionConfirmationData: {
                    tool: chunk.tool,
                    input: chunk.input || {},
                    title: chunk.title || 'Confirm action',
                    summary: chunk.summary || '',
                    danger: !!chunk.danger,
                    toolkitId: chunk.toolkit_id,
                    status: 'pending',
                  },
                };
                setMessages(prev => [...prev, confirmMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: confirmMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, actionConfirmationData: confirmMsg.actionConfirmationData },
                  }).catch(() => {});
                }
              } else if (chunk.type === 'sheet_canvas_open') {
                const canvasMsg: Message = {
                  id: `msg-sheet-canvas-${Date.now()}`,
                  role: 'assistant',
                  content: `Sheet ready for editing — use the canvas below to ${
                    chunk.sheet_type === 'lighting_plan' ? 'place fixture symbols'
                    : chunk.sheet_type === 'annotated_render' ? 'review and edit callouts'
                    : 'add dimensions and tile callouts'
                  }, then click Render PDF.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  sheetCanvasData: {
                    sheet_id: chunk.sheet_id,
                    sheet_type: chunk.sheet_type,
                    moodboard_id: chunk.moodboard_id,
                    initial_data: chunk.initial_data || {},
                    title: chunk.title,
                  },
                };
                setMessages(prev => [...prev, canvasMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: canvasMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, sheetCanvasData: canvasMsg.sheetCanvasData },
                  });
                }
              } else if (chunk.type === 'sheet_pdf_ready') {
                const pdfMsg: Message = {
                  id: `msg-sheet-pdf-${Date.now()}`,
                  role: 'assistant',
                  content: `${chunk.title || 'Tool output'} ready (${chunk.sheet_type.replace(/_/g, ' ')}). ${
                    chunk.page_count != null ? `${chunk.page_count} page${chunk.page_count === 1 ? '' : 's'}.` : ''
                  }`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  sheetPdfData: {
                    sheet_id: chunk.sheet_id,
                    sheet_type: chunk.sheet_type,
                    title: chunk.title || 'Tool output',
                    pdf_url: chunk.pdf_url,
                    page_count: chunk.page_count,
                    credits_used: chunk.credits_used,
                  },
                };
                setMessages(prev => [...prev, pdfMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: pdfMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, sheetPdfData: pdfMsg.sheetPdfData },
                  });
                }
                finalResult = {
                  type: 'final_result',
                  text: pdfMsg.content,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              } else if (chunk.type === 'quote_created') {
                const quoteData: QuoteCanvasData = {
                  quote_id: chunk.quote_id,
                  quote_number: chunk.quote_number ?? null,
                  name: chunk.name || 'Quote',
                  currency: chunk.currency || 'EUR',
                  subtotal: chunk.subtotal ?? null,
                  cash_discount_pct: chunk.cash_discount_pct ?? null,
                  vat_rate: chunk.vat_rate ?? null,
                  vat_amount: chunk.vat_amount ?? null,
                  grand_total: chunk.grand_total ?? null,
                  item_count: chunk.item_count ?? null,
                  items: chunk.items ?? null,
                  pdf_url: chunk.pdf_url ?? null,
                  pdf_error: chunk.pdf_error ?? null,
                };
                const qMsg: Message = {
                  id: `msg-quote-${Date.now()}`,
                  role: 'assistant',
                  content: `Quote${quoteData.quote_number ? ` ${quoteData.quote_number}` : ''} ready${
                    quoteData.grand_total != null ? ` — total ${quoteData.currency === 'USD' ? '$' : '€'}${Number(quoteData.grand_total).toFixed(2)}` : ''
                  }.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  quoteData,
                };
                setMessages(prev => [...prev, qMsg]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId,
                    role: 'assistant',
                    content: qMsg.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, quoteData },
                  });
                }
                finalResult = {
                  type: 'final_result',
                  text: qMsg.content,
                  agentId: selectedAgent,
                  model: selectedModel,
                };
              } else if (chunk.type === 'mention_summary') {
                const m: Message = {
                  id: `msg-mention-summary-${Date.now()}`,
                  role: 'assistant',
                  content: `Mention summary (${chunk.days}d): ${chunk.summary?.total_count ?? 0} mentions, ${chunk.summary?.by_sentiment?.negative ?? 0} negative.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  mentionSummaryData: { product_id: chunk.product_id, days: chunk.days, summary: chunk.summary },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, mentionSummaryData: m.mentionSummaryData },
                  });
                }
              } else if (chunk.type === 'sourcing_options') {
                const c = chunk.counts || {};
                const m: Message = {
                  id: `msg-sourcing-options-${Date.now()}`,
                  role: 'assistant',
                  content: `Supply options: ${c.warehouse ?? 0} warehouse · ${c.inbound_po ?? 0} inbound PO · ${c.supplier ?? 0} supplier.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  sourcingOptionsData: { product_id: chunk.product_id, quantity: chunk.quantity, counts: chunk.counts, result: chunk.result },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, sourcingOptionsData: m.sourcingOptionsData },
                  });
                }
              } else if (chunk.type === 'purchase_order_created') {
                const r = chunk.result || {};
                const m: Message = {
                  id: `msg-po-created-${Date.now()}`,
                  role: 'assistant',
                  content: `Committed sourcing: ${r.allocations_created ?? 0} allocation(s), ${r.purchase_orders_created ?? 0} draft purchase order(s).`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  purchaseOrderCreatedData: { allocations_created: r.allocations_created ?? 0, purchase_orders_created: r.purchase_orders_created ?? 0, orders: r.orders ?? [] },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, purchaseOrderCreatedData: m.purchaseOrderCreatedData },
                  });
                }
              } else if (chunk.type === 'purchase_order_sent') {
                const m: Message = {
                  id: `msg-po-sent-${Date.now()}`,
                  role: 'assistant',
                  content: chunk.recipient
                    ? `Purchase order ${chunk.order_number} emailed to ${chunk.recipient}.`
                    : `Purchase order ${chunk.order_number} generated.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  purchaseOrderSentData: { order_id: chunk.order_id, order_number: chunk.order_number, recipient: chunk.recipient, pdf_url: chunk.pdf_url },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, purchaseOrderSentData: m.purchaseOrderSentData },
                  });
                }
              } else if (AGENT_RESULT_TITLES[chunk.type]) {
                // #245 E — generic structured render for previously-plain-text result chunks
                const { type: _t, timestamp: _ts, ...payload } = chunk as Record<string, any>;
                const title = AGENT_RESULT_TITLES[chunk.type];
                const m: Message = {
                  id: `msg-result-${chunk.type}-${Date.now()}`,
                  role: 'assistant',
                  content: title,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  agentResultData: { title, data: payload, resultType: chunk.type },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, agentResultData: m.agentResultData },
                  });
                }
              } else if (chunk.type === 'llm_visibility_result') {
                const sov = chunk.snapshot?.share_of_voice ? Math.round(chunk.snapshot.share_of_voice * 100) : 0;
                const m: Message = {
                  id: `msg-llm-vis-${Date.now()}`,
                  role: 'assistant',
                  content: chunk.snapshot?.present
                    ? `LLM visibility: ${sov}% share-of-voice across ${chunk.snapshot.total_probes ?? 0} probes${chunk.snapshot.avg_position ? ` · avg rank #${chunk.snapshot.avg_position.toFixed(1)}` : ''}.`
                    : 'No LLM probes recorded yet.',
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  llmVisibilityData: {
                    product_id: chunk.product_id,
                    snapshot: chunk.snapshot,
                    forced: chunk.forced,
                    credits_used: chunk.credits_used,
                  },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, llmVisibilityData: m.llmVisibilityData },
                  });
                }
              } else if (chunk.type === 'mention_feed') {
                const m: Message = {
                  id: `msg-mention-feed-${Date.now()}`,
                  role: 'assistant',
                  content: `Loaded ${chunk.rows?.length ?? 0} mentions${chunk.sentiment_filter ? ` (${chunk.sentiment_filter})` : ''} from the last ${chunk.days}d.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  mentionFeedData: {
                    product_id: chunk.product_id,
                    days: chunk.days,
                    sentiment_filter: chunk.sentiment_filter,
                    rows: chunk.rows || [],
                  },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, mentionFeedData: m.mentionFeedData },
                  });
                }
              } else if (chunk.type === 'job_sites_form_open') {
                // Agent asked us to open the structured form. No new message in the thread —
                // just mount the modal. On submit, the modal posts a follow-up user message
                // that re-invokes manage_job_sites with concrete fields.
                setJobSitesFormState({
                  mode: chunk.mode || 'add',
                  default_site_type: chunk.default_site_type || 'perplexity_domain',
                  prefill: chunk.prefill || undefined,
                });
              } else if (chunk.type === 'job_sites_updated' || chunk.type === 'job_sites_list') {
                // Surface as a tool-progress log entry — the agent's text reply summarizes the change.
                // (No rich card needed; a list of domains is concise enough as prose.)
                console.debug('[agent-hub] job_sites chunk', chunk);
              } else if (chunk.type === 'flow_created' || chunk.type === 'flow_updated' || chunk.type === 'flows_list' || chunk.type === 'flow_removed') {
                // The agent's text reply summarizes the change; no rich card needed.
                console.debug('[agent-hub] flows chunk', chunk);
              } else if (chunk.type === 'tech_radar_findings') {
                // Pepper's Tech Radar review → render a ring-grouped findings card.
                const m: Message = {
                  id: `msg-techradar-${Date.now()}`,
                  role: 'assistant',
                  content: chunk.summary || 'Tech Radar review complete.',
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  techRadarData: {
                    subject: chunk.subject,
                    summary: chunk.summary,
                    findings: chunk.findings || [],
                    new_count: chunk.new_count,
                    saved: chunk.saved,
                  },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, techRadarData: m.techRadarData },
                  });
                }
              } else if (chunk.type === 'tech_radar_form_open') {
                // Vague request → mount the setup modal. No thread message; on submit
                // the modal posts a structured follow-up that re-invokes the radar tools.
                setTechRadarFormState({ prefill: chunk.prefill || undefined });
              } else if (chunk.type === 'tech_radar_monitor' || chunk.type === 'tech_radar_list') {
                // Concise enough as the agent's prose reply — just log.
                console.debug('[agent-hub] tech_radar chunk', chunk);
              } else if (chunk.type === 'mention_tracking_started') {
                const m: Message = {
                  id: `msg-mention-track-${Date.now()}`,
                  role: 'assistant',
                  content: `Mention tracking enabled for "${chunk.product_name}". First refresh in progress — open the product's Mentions tab to view results.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  mentionTrackingStartedData: {
                    product_id: chunk.product_id,
                    product_name: chunk.product_name,
                    tracked: chunk.tracked,
                  },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, mentionTrackingStartedData: m.mentionTrackingStartedData },
                  });
                }
              } else if (typeof chunk.type === 'string' && chunk.type.startsWith('seo_') && chunk.type.endsWith('_card') && chunk.type !== 'seo_research_card') {
                // Generic SEO toolkit card — one handler for all 22+ chunk types.
                // The card component picks the right inline mini-renderer based on data.type.
                const m: Message = {
                  id: `msg-seo-${chunk.type}-${Date.now()}`,
                  role: 'assistant',
                  content: `${chunk.type.replace(/_/g, ' ')}: result rendered above.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  seoGenericData: chunk as SEOGenericCardData,
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, seoGenericData: m.seoGenericData },
                  });
                }
              } else if (chunk.type === 'seo_research_card') {
                const sigCount = chunk.opportunity_count ?? chunk.opportunities?.length ?? 0;
                const m: Message = {
                  id: `msg-seo-research-${Date.now()}`,
                  role: 'assistant',
                  content: `SEO research for "${chunk.keyword}" (${chunk.country} · ${chunk.language}): ${sigCount} signals across ${Object.keys(chunk.summary?.types || {}).length} types.`,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  seoResearchData: {
                    keyword: chunk.keyword,
                    country: chunk.country,
                    language: chunk.language,
                    opportunity_count: sigCount,
                    summary: chunk.summary || {},
                    opportunities: chunk.opportunities || [],
                    errors: chunk.errors,
                    latency_ms: chunk.latency_ms,
                  },
                };
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: { agentId: selectedAgent, model: selectedModel, seoResearchData: m.seoResearchData },
                  });
                }
              } else if (chunk.type === 'toolkit_loaded') {
                // The agent called load_toolkit mid-conversation. The tools are
                // ALREADY live for this turn (loaded in-run server-side) — there
                // is no re-send. We only persist the toolkit onto the user's
                // active set so future turns bind it up-front without a reload.
                const newToolkitId = chunk.toolkit_id as string;
                if (newToolkitId && !activeToolkits.includes(newToolkitId)) {
                  updateActiveToolkits([...activeToolkits, newToolkitId]);
                }
              } else if (chunk.type === 'workflow_plan') {
                // Boot the tracker. Chunk shape: { run_id, definition_id, title?, subtitle?, metadata?, step_overrides? }
                //
                // run_id correlation: when bootWorkflowLocally was used (the
                // wizard kicked off without a server round-trip), the local
                // run_id is a UUID generated on the frontend. The server-side
                // tools emit chunks using their natural primary entity ID
                // (catalog_id, sheet_id, tracked_mention_id, etc.). When the
                // first workflow_plan chunk arrives with a NEW run_id but
                // matches a locally-booted run of the same definition_id, we
                // MIGRATE the state: transfer step_order + step states +
                // collapsed flag, then drop the local entry. From this point
                // forward the server's run_id is canonical.
                const def = getWorkflowDefinition(chunk.definition_id);
                if (def) {
                  const stepOrder = (chunk.step_overrides || def.steps).map((s: any) => s.id);
                  setWorkflows(prev => {
                    // Find a locally-booted run for this workflow_id that
                    // hasn't been migrated yet (still in 'planning' or
                    // 'running' status). If so, migrate it.
                    const localKey = Object.keys(prev).find((k) =>
                      prev[k].definition_id === chunk.definition_id
                      && k !== chunk.run_id
                      && prev[k].metadata?.booted_locally
                      && (prev[k].status === 'planning' || prev[k].status === 'running'),
                    );
                    if (localKey && localKey !== chunk.run_id) {
                      const next = { ...prev };
                      const local = next[localKey];
                      delete next[localKey];
                      next[chunk.run_id] = {
                        ...local,
                        run_id: chunk.run_id,
                        title: chunk.title || local.title,
                        subtitle: chunk.subtitle || local.subtitle,
                        metadata: { ...(local.metadata || {}), ...(chunk.metadata || {}), booted_locally: false, migrated_from: localKey },
                        // Keep local step state (the user already filled the first form)
                        // but reconcile step_order if the server reordered
                        step_order: stepOrder,
                      };
                      return next;
                    }
                    // Otherwise, normal boot — fresh entry
                    const stepsRt: Record<string, any> = {};
                    for (const id of stepOrder) stepsRt[id] = { step_id: id, status: 'pending' };
                    return {
                      ...prev,
                      [chunk.run_id]: {
                        definition_id: chunk.definition_id,
                        run_id: chunk.run_id,
                        title: chunk.title,
                        subtitle: chunk.subtitle,
                        steps: stepsRt,
                        step_order: stepOrder,
                        status: 'planning',
                        metadata: chunk.metadata || {},
                        collapsed: false,
                        awaiting_input_step_id: null,
                      },
                    };
                  });
                }
              } else if (chunk.type === 'workflow_step_progress') {
                setWorkflows(prev => {
                  const wf = prev[chunk.run_id];
                  if (!wf) return prev;
                  const nextSteps = {
                    ...wf.steps,
                    [chunk.step_id]: {
                      ...(wf.steps[chunk.step_id] || { step_id: chunk.step_id, status: 'pending' }),
                      status: chunk.status,
                      status_line: chunk.status_line,
                      input: chunk.input ?? wf.steps[chunk.step_id]?.input,
                      output: chunk.output ?? wf.steps[chunk.step_id]?.output,
                      error_message: chunk.error_message,
                      ...(chunk.status === 'running' && !wf.steps[chunk.step_id]?.started_at ? { started_at: new Date().toISOString() } : {}),
                      ...(chunk.status === 'done' || chunk.status === 'failed' || chunk.status === 'skipped' ? { completed_at: new Date().toISOString() } : {}),
                    },
                  };
                  // Derive overall status
                  const stepStatuses = Object.values(nextSteps).map((s: any) => s.status);
                  let overall: WorkflowRuntimeState['status'] = wf.status;
                  if (stepStatuses.some((s) => s === 'running' || s === 'awaiting_input')) overall = 'running';
                  else if (stepStatuses.every((s) => s === 'done' || s === 'skipped')) overall = 'done';
                  return { ...prev, [chunk.run_id]: { ...wf, steps: nextSteps, status: overall } };
                });
              } else if (chunk.type === 'workflow_step_input_request') {
                setWorkflows(prev => {
                  const wf = prev[chunk.run_id];
                  if (!wf) return prev;
                  return {
                    ...prev,
                    [chunk.run_id]: {
                      ...wf,
                      awaiting_input_step_id: chunk.step_id,
                      awaiting_input_schema: chunk.schema,
                      awaiting_input_prompt: chunk.prompt,
                      steps: { ...wf.steps, [chunk.step_id]: { ...(wf.steps[chunk.step_id] || { step_id: chunk.step_id, status: 'pending' }), status: 'awaiting_input' } },
                      status: 'running',
                    },
                  };
                });
              } else if (chunk.type === 'workflow_finished') {
                setWorkflows(prev => {
                  const wf = prev[chunk.run_id];
                  if (!wf) return prev;
                  return {
                    ...prev,
                    [chunk.run_id]: {
                      ...wf,
                      status: chunk.status,
                      collapsed: chunk.status === 'done',
                      awaiting_input_step_id: null,
                      awaiting_input_schema: undefined,
                    },
                  };
                });
              } else if (typeof chunk.type === 'string' && chunk.type.startsWith('catalog_')) {
                const event = chunk.type.replace(/^catalog_/, '') as
                  | 'created' | 'pdfs_attached' | 'extraction_candidates' | 'translation_ready'
                  | 'material_added' | 'image_candidates' | 'pdf_ready' | 'published' | 'unpublished';
                let line = '';
                if (event === 'created') {
                  line = `Catalog created — "${chunk.title}" (id: ${chunk.catalog_id}). Open it at /admin/catalogs/${chunk.catalog_id} or keep building from chat.`;
                } else if (event === 'pdfs_attached') {
                  line = `Attached ${chunk.pdf_ids?.length ?? 0} source PDF${chunk.pdf_ids?.length === 1 ? '' : 's'} to the catalog.`;
                } else if (event === 'extraction_candidates') {
                  line = `Found ${chunk.candidates?.length ?? 0} material candidate${chunk.candidates?.length === 1 ? '' : 's'} for "${chunk.query}". Open the catalog to review and approve.`;
                } else if (event === 'translation_ready') {
                  line = `Translated source PDF into ${chunk.sections_count ?? 0} sections / ${chunk.materials_count ?? 0} materials.`;
                } else if (event === 'material_added') {
                  line = `Added "${chunk.name}" to "${chunk.section_title}"${chunk.has_image ? '' : ' — needs image'}.`;
                } else if (event === 'image_candidates') {
                  line = `Found ${chunk.candidates?.length ?? 0} image candidate${chunk.candidates?.length === 1 ? '' : 's'} for "${chunk.material_name}". Open the catalog to pick one.`;
                } else if (event === 'pdf_ready') {
                  line = `Catalog PDF ready — ${chunk.page_count ?? '?'} pages.`;
                } else if (event === 'published') {
                  line = `Published. Public URL: ${chunk.public_url}`;
                } else if (event === 'unpublished') {
                  line = 'Catalog archived (no longer publicly accessible).';
                }
                const m: Message = {
                  id: `msg-catalog-${event}-${Date.now()}`,
                  role: 'assistant',
                  content: line,
                  timestamp: new Date(),
                  agentId: selectedAgent,
                  model: selectedModel,
                  catalogData: { event, catalog_id: chunk.catalog_id, payload: chunk },
                };
                if (event === 'extraction_candidates' && Array.isArray(chunk.candidates)) {
                  m.catalogExtractionData = {
                    catalog_id: chunk.catalog_id,
                    query: chunk.query || '',
                    candidates: chunk.candidates,
                  };
                }
                if (event === 'image_candidates' && Array.isArray(chunk.candidates)) {
                  m.catalogImageCandidatesData = {
                    catalog_id: chunk.catalog_id,
                    section_id: chunk.section_id ?? null,
                    material_id: chunk.material_id ?? null,
                    material_name: chunk.material_name || '',
                    candidates: chunk.candidates,
                  };
                }
                setMessages(prev => [...prev, m]);
                if (conversationId) {
                  await agentChatHistoryService.saveMessage({
                    conversationId, role: 'assistant', content: m.content,
                    metadata: {
                      agentId: selectedAgent,
                      model: selectedModel,
                      catalogData: m.catalogData,
                      catalogExtractionData: m.catalogExtractionData,
                      catalogImageCandidatesData: m.catalogImageCandidatesData,
                    },
                  });
                }
              } else if (chunk.type === 'final_result') {
                finalResult = chunk;
              } else if (chunk.type === 'tool_error') {
                logger.error(`Tool ${chunk.tool} failed: ${chunk.error}`, {
                  service: 'AgentHub',
                  metadata: { tool: chunk.tool, error: chunk.error },
                });
              }
            } catch (parseError) {
              console.warn('Parse error:', parseError);
            }
          }
        }

        if (!finalResult) {
          logger.error('No final result received from agent', {
            service: 'AgentHub',
            metadata: { agent: selectedAgent },
          });
          throw new Error('No final result received from agent');
        }

        // Check if final result contains an error
        if (finalResult.error) {
          console.error('❌ Agent execution failed:', finalResult.errorMessage);
          throw new Error(finalResult.errorMessage || 'Agent execution failed');
        }

        data = finalResult;
        } // End of streaming response handling

      // Parse demo data if this is from DemoAgent
      let demoData = undefined;
      let cleanedText = data.text;

      if (selectedAgent === 'demo' && data.text) {
        try {
          // Look for DEMO_DATA: prefix in the response
          // The format is: DEMO_DATA: {"data":{"command":"cement_tiles"}}
          const demoDataMatch = data.text.match(/DEMO_DATA:\s*\{\"data\":\{\"command\":\"(\w+)\"\}\}/);

          if (demoDataMatch) {
            const command = demoDataMatch[1]; // Extract command directly from regex

            // Remove the DEMO_DATA marker from the text
            cleanedText = data.text.replace(/\n*DEMO_DATA:\s*\{\"data\":\{\"command\":\"\w+\"\}\}\s*/g, '').trim();

            // Load appropriate demo data based on command
            if (command === 'cement_tiles') {
              const cementTilesData = await import('@/data/demo/cement-tiles.json');
              demoData = {
                type: 'product_list',
                data: cementTilesData.default.results || cementTilesData.default,
                message: 'Showing 5 cement-based tiles in grey color',
              };
            } else if (command === 'green_wood') {
              const greenWoodData = await import('@/data/demo/green-wood.json');
              demoData = {
                type: 'product_list',
                data: greenWoodData.default.results || greenWoodData.default,
                message: 'Showing 5 Egger wood materials in green',
              };
            } else if (command === 'heat_pumps') {
              demoData = {
                type: 'heat_pump_table',
                data: {
                  models: [
                    { model: 'EcoHeat Pro 8kW', heating_capacity: '8 kW', cooling_capacity: '6 kW', energy_efficiency: 'A++', noise_level: '42 dB', price_retail: 3499.00, price_wholesale: 2799.00, stock: 45 },
                    { model: 'EcoHeat Pro 12kW', heating_capacity: '12 kW', cooling_capacity: '10 kW', energy_efficiency: 'A+++', noise_level: '45 dB', price_retail: 4299.00, price_wholesale: 3439.00, stock: 32 },
                    { model: 'EcoHeat Pro 16kW', heating_capacity: '16 kW', cooling_capacity: '14 kW', energy_efficiency: 'A+++', noise_level: '48 dB', price_retail: 5199.00, price_wholesale: 4159.00, stock: 18 },
                    { model: 'EcoHeat Pro 20kW', heating_capacity: '20 kW', cooling_capacity: '18 kW', energy_efficiency: 'A++', noise_level: '51 dB', price_retail: 6299.00, price_wholesale: 5039.00, stock: 12 },
                  ],
                  specifications: { refrigerant: 'R32', power_supply: '230V / 50Hz', warranty: '5 years', certifications: ['CE', 'ErP', 'EHPA'] },
                },
                message: 'Heat pump comparison table',
              };
            } else if (command === 'seo_article') {
              demoData = SEO_ARTICLE_DEMO_DATA;
            } else if (command === 'b2b_results') {
              demoData = {
                type: 'b2b_results',
                data: {
                  query: 'Tiles companies in Spain',
                  total_found: 8,
                  market_overview: 'Spain is the world\'s 3rd largest ceramic tile producer (700M m²/year), with the Castellón region housing 85% of production capacity. Key strengths: design innovation, sustainability leadership, and EU market access.',
                  companies: [
                    { name: 'Porcelanosa Group', location: 'Villarreal, Castellón', specialization: 'Premium Ceramic & Porcelain Tiles', annual_revenue: '€1.2B', employees: '4,500+', website: 'porcelanosa.com', contact: 'international@porcelanosa.com', certifications: ['ISO 9001', 'ISO 14001', 'CE Mark', 'LEED Compliant'], min_order: '500 m²', lead_time: '3–5 weeks' },
                    { name: 'Roca Tile', location: 'Alcora, Castellón', specialization: 'Glazed Ceramic Wall & Floor Tiles', annual_revenue: '€380M', employees: '2,100+', website: 'rocatile.com', contact: 'export@rocatile.com', certifications: ['ISO 9001', 'CE Mark', 'GreenGuard'], min_order: '300 m²', lead_time: '4–6 weeks' },
                    { name: 'Vives Cerámica', location: 'Castellón de la Plana', specialization: 'Designer Porcelain & Large Format Slabs', annual_revenue: '€210M', employees: '980+', website: 'vivesceramica.com', contact: 'export@vivesceramica.com', certifications: ['ISO 14001', 'CE Mark', 'Declare Label'], min_order: '200 m²', lead_time: '2–4 weeks' },
                    { name: 'Pamesa Cerámica', location: 'Vila-real, Castellón', specialization: 'Full Range Ceramic & Porcelain', annual_revenue: '€560M', employees: '3,200+', website: 'pamesa.com', contact: 'comercial@pamesa.com', certifications: ['ISO 9001', 'CE Mark', 'EMAS'], min_order: '400 m²', lead_time: '3–5 weeks' },
                    { name: 'STN Cerámica', location: 'Nules, Castellón', specialization: 'Technical Porcelain & Outdoor Tiles', annual_revenue: '€95M', employees: '420+', website: 'stnceramic.com', contact: 'export@stnceramica.com', certifications: ['ISO 9001', 'CE Mark'], min_order: '150 m²', lead_time: '2–3 weeks' },
                  ],
                },
                message: 'B2B manufacturer research: Tiles companies in Spain',
              };
            }
          }
        } catch (e) {
          console.error('Error parsing demo data:', e);
        }
      }

      // Parse material data from agent responses (for Search Agent, etc.)
      const materialData = data.materialResults ? {
        products: data.materialResults.products || [],
        images: data.materialResults.images || {},
        title: data.materialResults.title || 'Material Results',
      } : undefined;

      // Interior Designer: 3D generation is handled entirely by the agent-chat edge function
      // via the generate_3d tool → MIVAA /api/interior → async job → generation_job_created chunk.
      // The frontend receives data.generation_job when a job was created.

      // Add assistant response to messages
      // If gemini generated an image during this turn, merge it into this single message
      // so the agent's explanation text and the image appear together in one bubble.
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: cleanedText || 'No response from agent',
        timestamp: new Date(),
        agentId: data.agentId || selectedAgent,
        model: data.model || selectedModel,
        demoData,
        materialData,
        generation_job: data.generation_job, // Async 3D generation job info
        geminiImageData: pendingGeminiData ?? undefined,
        searchSpec: pendingSearchSpec ?? undefined, // Explainable search spec from material_search
      };

      // Track active generation job if present
      if (data.generation_job) {
        setActiveGenerationJobs((prev) => {
          const updated = new Map(prev);
          updated.set(data.generation_job.job_id, {
            ...data.generation_job,
            messageId: assistantMessage.id,
            startTime: Date.now(),
          });
          return updated;
        });
      }

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message to database with response metrics
      if (conversationId) {
        const responseTimeMs = elapsedTimeRef.current; // Capture elapsed time before state resets
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'assistant',
          content: cleanedText || 'No response from agent',
          metadata: {
            agentId: data.agentId || selectedAgent,
            model: data.model || selectedModel,
            responseTimeMs, // Time taken to respond
            productsCount: materialData?.products?.length || 0,
            cachedResponse: false,
            demoData, // Save demo data for DemoAgent
            materialData, // Save material data for Search Agent
            generation_job: data.generation_job, // Save generation job info for async 3D generation
            geminiImageData: pendingGeminiData ?? undefined, // Gemini single-image result merged into this message
            searchSpec: pendingSearchSpec ?? undefined, // Explainable search spec
          },
        });
      }
    } catch (error) {
      console.error('Error executing agent:', error);
      const errText = error instanceof Error ? error.message : 'Unknown error';
      const isCreditsError = /insufficient credits/i.test(errText);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: isCreditsError ? errText : `Error: ${errText}`,
        timestamp: new Date(),
        agentId: selectedAgent,
        insufficientCredits: isCreditsError,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [input, selectedAgent, selectedModel, attachedImages, attachedCatalogPdfs, userId, currentConversationId, messages]);

  // Keep ref in sync so effects can call the latest handleSendMessage without stale closures
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Auto-send initialPrompt once userId is available. Skipped when an explicit
  // quickstart deep-link is present (the flow drives the interaction instead).
  useEffect(() => {
    if (initialPrompt && userId && !initialPromptSent.current && !initialQuickStart) {
      initialPromptSent.current = true;
      setInput(initialPrompt);
      setTimeout(() => { handleSendMessageRef.current(); }, 300);
    }
  }, [userId, initialPrompt, initialQuickStart]);

  // Deep-link: preload image attachment(s) + generation mode once, so a flow or
  // prompt from another page acts on them (e.g. "edit this room photo").
  const deepLinkSeeded = useRef(false);
  useEffect(() => {
    if (deepLinkSeeded.current || !userId) return;
    if (initialImages?.length) setAttachedImages(initialImages);
    if (initialGenerationMode) setSelectedGenerationMode(initialGenerationMode);
    deepLinkSeeded.current = true;
  }, [userId, initialImages, initialGenerationMode]);

  // Deep-link: deterministically launch a guided flow by toolkit + label, using
  // the SAME handleQuickStart dispatcher as the in-app UI — so any flow (interior
  // capture, sheet wizard, SEO run, …) is reachable from another page, fully
  // preloaded. Waits for any requested image to land first so a generation
  // form's image field pre-fills from it.
  const deepLinkLaunched = useRef(false);
  useEffect(() => {
    if (deepLinkLaunched.current || !userId || !initialQuickStart) return;
    if (initialImages?.length && attachedImages.length === 0) return; // wait for the seed
    deepLinkLaunched.current = true;
    const tk = TOOLKITS.find((t) => t.id === initialQuickStart.toolkitId);
    const qs = tk?.quick_starts?.find((q) => q.label === initialQuickStart.label);
    if (tk && qs) handleQuickStart(qs, tk);
    else console.warn('[AgentHub] Unknown quickstart deep-link:', initialQuickStart);
  }, [userId, initialQuickStart, initialImages, attachedImages, handleQuickStart]);

  // Deep-link: arrived via `?capability=` with no specific action → enable that capability's
  // toolkit + surface its quick-starts (onboarding card) so the user sees what they can do
  // instead of a blank chat (#275 onboarding). Skipped when a quick-start is firing.
  const toolkitOnboardLaunched = useRef(false);
  useEffect(() => {
    if (toolkitOnboardLaunched.current || !userId || !initialToolkitId || initialQuickStart) return;
    const tk = TOOLKITS.find((t) => t.id === initialToolkitId);
    if (!tk) return;
    toolkitOnboardLaunched.current = true;
    ensureAgentAndToolkit(tk);       // switch to the owning agent + enable the toolkit
    setJustEnabledToolkitId(tk.id);  // drives the ToolkitOnboardingCard (its quick-starts)
  }, [userId, initialToolkitId, initialQuickStart, ensureAgentAndToolkit]);

  // Shared image-attach path: read a set of image File objects to data URLs and
  // append them to the composer. Used by the file picker AND clipboard paste.
  const attachImageFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    Promise.all(
      imageFiles.map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) resolve(ev.target.result as string);
              else reject(new Error('Failed to read file'));
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(file);
          }),
      ),
    ).then((urls) => {
      setAttachedImages((prev) => [...prev, ...urls]);
    }).catch((err) => {
      console.error('[AgentHub] Failed to read image(s):', err);
      toast({
        title: 'Image Attach Failed',
        description: 'One or more images could not be read. Please try again.',
        variant: 'destructive',
      });
    });
  }, []);

  // Core catalog-PDF ingest — uploads the source PDF, binds the catalog toolkit, and
  // prefills the ask so the agent extracts products. Shared by the dedicated PDF button
  // AND the general paperclip (which now also accepts PDFs), so a user can attach a
  // catalog either way instead of hunting for the right icon.
  const processCatalogPdfFile = useCallback(async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: 'PDF only', description: 'Attach a PDF file for catalog extraction.', variant: 'destructive' });
      return;
    }
    setUploadingCatalogPdf(true);
    try {
      const source = await catalogsService.uploadSourcePdf(file);
      // Make sure the agent actually has the catalog tools bound (switches to the
      // owning agent + enables the 'catalogs' toolkit) so the prefilled ask works.
      const catalogToolkit = TOOLKITS.find((t) => t.id === 'catalogs');
      if (catalogToolkit) ensureAgentAndToolkit(catalogToolkit);
      // Show it as an attachment chip rather than pasting an instruction into the
      // composer. The user can just hit send (or add their own note first); the
      // agent instruction is built from these chips at send-time.
      setAttachedCatalogPdfs((prev) => [...prev, { id: source.id, filename: source.original_filename }]);
      toast({ title: 'Catalog PDF attached', description: file.name });
    } catch (err) {
      toast({ title: 'Upload failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setUploadingCatalogPdf(false);
    }
  }, [toast, ensureAgentAndToolkit]);

  // Attach a PDF as a *readable document* — base64 data URL sent to agent-chat as a
  // `document` block so Opus reads it natively (quotes, invoices, specs). This is the
  // "read this and rebuild/summarize it" path, distinct from catalog product-extraction.
  const attachDocumentFiles = useCallback((files: File[]) => {
    Promise.all(
      files.map(
        (file) =>
          new Promise<{ name: string; dataUrl: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              if (ev.target?.result) resolve({ name: file.name, dataUrl: ev.target.result as string });
              else reject(new Error('Failed to read file'));
            };
            reader.onerror = () => reject(new Error('FileReader error'));
            reader.readAsDataURL(file);
          }),
      ),
    ).then((docs) => {
      setAttachedDocuments((prev) => [...prev, ...docs]);
      toast({ title: docs.length > 1 ? `${docs.length} documents attached` : 'Document attached', description: docs.map((d) => d.name).join(', ') });
    }).catch(() => {
      toast({ title: 'Attach failed', description: 'The PDF could not be read. Please try again.', variant: 'destructive' });
    });
  }, [toast]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    e.target.value = ''; // Reset now so the same file can be re-selected later
    // The paperclip accepts images AND PDFs. Images → vision attachment path. A PDF's
    // intent depends on context: while the Catalogs toolkit is active the user is
    // building a catalog, so the PDF is a catalog *source* for product-extraction;
    // otherwise it's a document to READ (quote/invoice/spec) — Claude reads it directly.
    const pdfs = fileArray.filter((f) => f.type === 'application/pdf');
    const images = fileArray.filter((f) => f.type.startsWith('image/'));
    if (images.length > 0) attachImageFiles(images);
    if (pdfs.length > 0) {
      const catalogContext = (activeToolkits || []).includes('catalogs');
      if (catalogContext) {
        if (pdfs.length > 1) {
          toast({ title: 'One catalog PDF at a time', description: 'Attaching the first PDF for extraction.' });
        }
        void processCatalogPdfFile(pdfs[0]);
      } else {
        attachDocumentFiles(pdfs);
      }
    }
  }, [attachImageFiles, processCatalogPdfFile, attachDocumentFiles, activeToolkits, toast]);

  // Paste an image straight from the clipboard into the composer. Fires on the
  // textarea's onPaste; when the clipboard carries image bytes we consume them
  // (and suppress the default paste so a stray filename doesn't land in the text).
  const handleComposerPaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return; // plain text paste — leave default behavior
    e.preventDefault();
    attachImageFiles(imageFiles);
  }, [attachImageFiles]);

  const handleVoiceInput = useCallback(() => {
    if (!isVoiceSupported) {
      toast({
        title: 'Voice Input Not Supported',
        description: 'Your browser does not support voice input. Please use Chrome, Edge, or Safari.',
        variant: 'destructive',
      });
      return;
    }
    toggleRecording();
  }, [isVoiceSupported, toggleRecording, toast]);

  const handleLoadConversation = useCallback(
    async (conversationId: string) => {
      setCurrentConversationId(conversationId);
      onConversationChange?.(conversationId);
      // Hydrate the conversation's saved toolkit set so resuming a chat
      // restores its toolset. Always merges in the always-on Core. Suppress
      // the onboarding card on hydration (the user isn't enabling anything
      // new — they're loading an existing conversation).
      const convoMeta = conversations.find((c) => c.id === conversationId);
      if (convoMeta?.toolkits && convoMeta.toolkits.length > 0) {
        const merged = new Set<string>([...convoMeta.toolkits, ...ALWAYS_ON_TOOLKIT_IDS]);
        setActiveToolkits([...merged]);
      } else {
        // Fallback: fetch the conversation row directly
        const fetched = await agentChatHistoryService.getConversation(conversationId);
        if (fetched?.toolkits) {
          const merged = new Set<string>([...fetched.toolkits, ...ALWAYS_ON_TOOLKIT_IDS]);
          setActiveToolkits([...merged]);
        }
      }
      setJustEnabledToolkitId(null);
      const msgs = await agentChatHistoryService.getConversationMessages(conversationId);
      setMessages(
        msgs.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          agentId: msg.metadata?.agentId as string,
          model: msg.metadata?.model as string,
          images: msg.metadata?.attachedImages as string[] | undefined,
          demoData: msg.metadata?.demoData as any | undefined,
          materialData: msg.metadata?.materialData as any | undefined,
          generation_job: msg.metadata?.generation_job as any | undefined,
          geminiImageData: msg.metadata?.geminiImageData as any | undefined,
          worldData: msg.metadata?.worldData as any | undefined,
          videoData: msg.metadata?.videoData as any | undefined,
          articleData: msg.metadata?.articleData as any | undefined,
          virtualStagingData: msg.metadata?.virtualStagingData as any | undefined,
          materialsBoardData: msg.metadata?.materialsBoardData as any | undefined,
          inspirationData: msg.metadata?.inspirationData as any | undefined,
          heatPumpData: msg.metadata?.heatPumpData as any | undefined,
          heatingCostData: msg.metadata?.heatingCostData as any | undefined,
          searchSpec: msg.metadata?.searchSpec as any | undefined,
          mentionSummaryData: msg.metadata?.mentionSummaryData as any | undefined,
          sourcingOptionsData: msg.metadata?.sourcingOptionsData as any | undefined,
          purchaseOrderCreatedData: msg.metadata?.purchaseOrderCreatedData as any | undefined,
          purchaseOrderSentData: msg.metadata?.purchaseOrderSentData as any | undefined,
          agentResultData: msg.metadata?.agentResultData as any | undefined,
          llmVisibilityData: msg.metadata?.llmVisibilityData as any | undefined,
          mentionFeedData: msg.metadata?.mentionFeedData as any | undefined,
          mentionTrackingStartedData: msg.metadata?.mentionTrackingStartedData as any | undefined,
          techRadarData: msg.metadata?.techRadarData as any | undefined,
          // Job-research daily digest cards (cron-posted directly into the convo by the dispatcher,
          // so the chunk arrives as `metadata.chunk_type === 'job_findings'` rather than via a streaming chunk)
          jobFindingsData: (msg.metadata?.chunk_type === 'job_findings'
            ? {
                tracked_job_id: msg.metadata.tracked_job_id,
                tracked_job_label: msg.metadata.tracked_job_label,
                discovered_at_window: msg.metadata.discovered_at_window,
                listings: msg.metadata.listings || [],
              }
            : (msg.metadata?.jobFindingsData as any | undefined)),
          seoResearchData: msg.metadata?.seoResearchData as any | undefined,
          seoGenericData: msg.metadata?.seoGenericData as any | undefined,
          // Agent-streamed sheet/catalog cards are saved to metadata but were omitted
          // from this restore map, so they vanished on conversation reload (audit #217 H13).
          sheetCanvasData: msg.metadata?.sheetCanvasData as any | undefined,
          actionConfirmationData: msg.metadata?.actionConfirmationData as any | undefined,
          sheetPdfData: msg.metadata?.sheetPdfData as any | undefined,
          quoteData: msg.metadata?.quoteData as any | undefined,
          catalogData: msg.metadata?.catalogData as any | undefined,
          catalogExtractionData: msg.metadata?.catalogExtractionData as any | undefined,
          catalogImageCandidatesData: msg.metadata?.catalogImageCandidatesData as any | undefined,
        })),
      );
    },
    [],
  );

  // Load a specific conversation when navigated with ?conversation=
  const initialConvLoaded = useRef(false);
  useEffect(() => {
    if (initialConversationId && !initialConvLoaded.current) {
      initialConvLoaded.current = true;
      handleLoadConversation(initialConversationId);
    }
  }, [initialConversationId, handleLoadConversation]);

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
    onConversationChange?.(null);
    setJustEnabledToolkitId(null);
    // Clear transient per-turn state so a new conversation starts truly blank — no
    // leftover attached image, pinned materials, generation mode, or reasoning steps
    // bleeding in from the previous chat. (There is no response cache; every send calls
    // the agent fresh regardless — this is just UI hygiene.)
    setAttachedImages([]);
    setPinnedMaterials([]);
    setSelectedGenerationMode(null);
    setReasoningSteps([]);
    // Reset to the localStorage default toolkit set (Core + whatever the user
    // last picked in the picker). Doesn't trigger the onboarding card —
    // there's nothing "just enabled".
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('mk_active_toolkits');
        if (raw) {
          const parsed = JSON.parse(raw) as string[];
          const merged = new Set<string>([...parsed, ...ALWAYS_ON_TOOLKIT_IDS]);
          setActiveToolkits([...merged]);
        } else {
          setActiveToolkits([...ALWAYS_ON_TOOLKIT_IDS]);
        }
      } catch { setActiveToolkits([...ALWAYS_ON_TOOLKIT_IDS]); }
    }
  }, [onConversationChange]);

  const handleDeleteConversation = useCallback(async (conversationId: string) => {
    const confirmed = window.confirm('Are you sure you want to delete this conversation? This cannot be undone.');
    if (!confirmed) return;

    try {
      const success = await agentChatHistoryService.deleteConversation(conversationId);
      if (success) {
        // Remove from local state
        setConversations((prev) => prev.filter((c) => c.id !== conversationId));

        // If we deleted the current conversation, clear the chat
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
          setMessages([]);
        }

        toast({
          title: 'Conversation Deleted',
          description: 'The conversation has been permanently deleted.',
        });
      } else {
        throw new Error('Failed to delete');
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Delete Failed',
        description: 'Could not delete the conversation. Please try again.',
        variant: 'destructive',
      });
    }
  }, [currentConversationId, toast]);

  const handleRenameConversation = useCallback(async (conversationId: string, title: string) => {
    const next = title.trim();
    if (!next) return;
    const success = await agentChatHistoryService.renameConversation(conversationId, next);
    if (success) {
      setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, title: next } : c));
    }
  }, []);

  const handleTogglePin = useCallback(async (conversationId: string, pinned: boolean) => {
    const success = await agentChatHistoryService.togglePin(conversationId, pinned);
    if (success) {
      const stamp = pinned ? new Date().toISOString() : null;
      setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, pinnedAt: stamp } : c));
    }
  }, []);

  // ⌘K / Ctrl-K toggles the conversation manager from anywhere in the Studio.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setConvManagerOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Which messages carry a canvas-eligible artifact (the P2 pilot set).
  const getCanvasArtifact = useCallback((m: Message): CanvasArtifact | null => {
    if (m.role !== 'assistant') return null;
    if (m.demoData) return { id: m.id, kind: 'demo', title: 'Demo results' };
    if (m.heatPumpData) return { id: m.id, kind: 'calc', title: 'Heat-pump sizing' };
    if (m.heatingCostData) return { id: m.id, kind: 'calc', title: 'Heating cost comparison' };
    if (m.sheetPdfData) return { id: m.id, kind: 'sheet', title: m.sheetPdfData.title || 'Presentation sheet' };
    if (m.sheetCanvasData) return { id: m.id, kind: 'sheet', title: m.sheetCanvasData.title || 'Presentation sheet' };
    if (m.quoteData) return { id: m.id, kind: 'quote', title: m.quoteData.quote_number ? `Quote ${m.quoteData.quote_number}` : (m.quoteData.name || 'Quote') };
    if (m.virtualStagingData) return { id: m.id, kind: 'staging', title: 'Virtual staging' };
    if (m.materialData?.products && m.materialData.products.length > 0) {
      return { id: m.id, kind: 'products', title: m.materialData.title || `${m.materialData.products.length} products` };
    }
    if (m.generation_job) return { id: m.id, kind: 'render', title: m.generation_job.room_type ? `Room · ${m.generation_job.room_type}` : 'Room generation' };
    if (m.worldData) return { id: m.id, kind: 'world', title: m.worldData.caption || m.worldData.prompt || 'VR world' };
    if (m.materialsBoardData) return { id: m.id, kind: 'board', title: 'Materials board' };
    if (m.geminiImageData) return { id: m.id, kind: 'image', title: 'Generated image' };
    if (m.videoData) return { id: m.id, kind: 'video', title: 'Generated video' };
    if (m.inspirationData) return { id: m.id, kind: 'inspiration', title: m.inspirationData.page_title || 'Inspiration board' };
    if (m.techRadarData) return { id: m.id, kind: 'radar', title: 'Tech radar' };
    if (m.agentResultData) return { id: m.id, kind: 'result', title: m.agentResultData.title || 'Result' };
    if (m.jobFindingsData) return { id: m.id, kind: 'jobs', title: m.jobFindingsData.tracked_job_label ? `Jobs · ${m.jobFindingsData.tracked_job_label}` : 'Job findings' };
    if (m.sourcingOptionsData) return { id: m.id, kind: 'sourcing', title: 'Supply options' };
    if (m.purchaseOrderCreatedData) return { id: m.id, kind: 'order', title: 'Purchase orders created' };
    if (m.purchaseOrderSentData) return { id: m.id, kind: 'order', title: m.purchaseOrderSentData.order_number ? `PO ${m.purchaseOrderSentData.order_number}` : 'Purchase order sent' };
    if (m.mentionSummaryData) return { id: m.id, kind: 'mentions', title: 'Mention summary' };
    if (m.llmVisibilityData) return { id: m.id, kind: 'llm', title: 'LLM visibility' };
    if (m.mentionFeedData) return { id: m.id, kind: 'mentions', title: 'Mention feed' };
    if (m.seoResearchData) return { id: m.id, kind: 'seo', title: 'SEO research' };
    if (m.seoGenericData) return { id: m.id, kind: 'seo', title: 'SEO' };
    if (m.articleData) return { id: m.id, kind: 'seo', title: 'SEO article' };
    if (m.catalogExtractionData) return { id: m.id, kind: 'catalog', title: 'Catalog candidates' };
    if (m.catalogImageCandidatesData) return { id: m.id, kind: 'catalog', title: m.catalogImageCandidatesData.material_name ? `Images · ${m.catalogImageCandidatesData.material_name}` : 'Catalog images' };
    return null;
  }, []);

  const canvasArtifacts = useMemo(
    () => messages.map(getCanvasArtifact).filter(Boolean) as CanvasArtifact[],
    [messages, getCanvasArtifact],
  );

  // Reset the canvas when switching conversations.
  useEffect(() => {
    setCanvasHidden(false);
    setChatCollapsed(false);
    setActiveCanvasId(null);
  }, [currentConversationId]);

  // Keep the active tab valid; default to the newest artifact.
  useEffect(() => {
    if (canvasArtifacts.length === 0) {
      setActiveCanvasId(null);
      return;
    }
    setActiveCanvasId((prev) =>
      prev && canvasArtifacts.some((a) => a.id === prev)
        ? prev
        : canvasArtifacts[canvasArtifacts.length - 1].id,
    );
  }, [canvasArtifacts]);

  // Bring a specific artifact into focus in the canvas (from a chat chip).
  const focusCanvas = useCallback((id: string) => {
    setActiveCanvasId(id);
    setCanvasHidden(false);
    // Desktop: dock the chat back open beside the canvas. Mobile: the canvas
    // takes over the single pane (the chat is one tap away via the back arrow).
    setChatCollapsed(isMobile);
  }, [isMobile]);

  // Attach a temporary catalog source PDF straight from chat. Reuses the exact
  // same upload path as the admin builder (catalogsService.uploadSourcePdf →
  // catalog_source_pdfs row), then prefills an instruction so the agent attaches
  // it (attach_catalog_pdfs) and extracts — keeping the admin and agent flows
  // identical. The PDF is NOT digested into the product DB.

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent);
  const AgentIcon = currentAgent?.icon || Bot;
  const currentConversationTitle = conversations.find((c) => c.id === currentConversationId)?.title;

  // Async multi-model room-generation grid (ProgressiveImageGrid, self-polling).
  // Shared verbatim by the inline chat branch and the canvas so the full grid +
  // all its per-image actions (VR / video / staging / lighting / materials board /
  // save to moodboard / find materials / edit) render identically in both places.
  const renderGenerationGrid = (message: Message): React.ReactNode => (
    <ProgressiveImageGrid
      jobId={message.generation_job.job_id}
      modelCount={message.generation_job.model_count}
      models={message.generation_job.models}
      workspaceId={workspaceId}
      roomType={message.generation_job.room_type}
      onImageClick={(url, name) => setLightboxImage({ url, name })}
      onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
      onGenerateVideo={(imageUrl, videoType, vm) => handleGenerateVideo(imageUrl, message, videoType, vm ?? videoModel)}
      onGenerateMaterialsBoard={(imageUrl, boardMode) => handleGenerateMaterialsBoard(imageUrl, boardMode, message)}
      onGenerateVirtualStaging={(imageUrl, params) => handleGenerateVirtualStaging(imageUrl, params)}
      onEditImage={(imageUrl) => {
        if (imageUrl.includes('|LIGHTING|')) {
          const idx = imageUrl.indexOf('|LIGHTING|');
          const imgUrl = imageUrl.slice(0, idx);
          const prompt = imageUrl.slice(idx + '|LIGHTING|'.length);
          setAttachedImages([imgUrl]);
          setSelectedGenerationMode('image-edit');
          setInput(prompt);
          setTimeout(() => { handleSendMessageRef.current(); }, 100);
          return;
        }
        setAttachedImages([imageUrl]);
        setSelectedGenerationMode('image-edit');
        setGeminiEditRoomType(message.generation_job?.room_type || null);
        setGeminiEditStyle(message.generation_job?.style || null);
        setShowGeminiEditModal(true);
      }}
      onAskJARVIS={(segment) => {
        const prompt = `Find products similar to this material zone from my 3D render: ${segment.material_type}, ${segment.finish} finish${segment.crop_storage_url ? `. Image: ${segment.crop_storage_url}` : ''}`;
        setInput(prompt);
        setTimeout(async () => { await handleSendMessage(); }, 100);
      }}
      onFindMaterial={(segment) => {
        const cropUrl = segment.crop_data_url || segment.crop_storage_url;
        if (cropUrl) setAttachedImages([cropUrl]);
        const prompt = `Find this exact material using all available search methods. Zone analysis: ${segment.label} — material type: ${segment.material_type}, finish: ${segment.finish}, dominant color: ${segment.dominant_color}, confidence: ${Math.round((segment.confidence ?? 0) * 100)}%. Identify and return matching products from our catalog with full similarity scoring across all dimensions.`;
        setInput(prompt);
        setTimeout(async () => { await handleSendMessage(); }, 100);
      }}
      pendingReplacement={pendingReplacement}
      onZoneSelectedForReplacement={() => setPendingReplacement(null)}
    />
  );

  // Bespoke "data cards" (jobs / sourcing / POs / mentions / SEO / catalog). Extracted so the
  // SAME markup renders on the canvas AND inline (#253 P4). The trailing markdown content stays in
  // the chat rail; this returns only the card body.
  const renderDataCardBody = (message: Message): React.ReactNode => {
    if (message.jobFindingsData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between mb-1">
            <div>
              <div className="text-xs text-muted-foreground">Daily job digest · {message.jobFindingsData.discovered_at_window === 'last_24h' ? 'last 24 hours' : message.jobFindingsData.discovered_at_window}</div>
              <div className="text-sm font-medium mt-0.5">{message.jobFindingsData.tracked_job_label}</div>
            </div>
            <div className="text-2xl font-light text-foreground">
              {message.jobFindingsData.listings.length}
              <span className="text-xs text-muted-foreground ml-1">{message.jobFindingsData.listings.length === 1 ? 'match' : 'matches'}</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">New roles matching this saved search. Open one to apply, or flag a bad fit so future digests get sharper.</p>
          {message.jobFindingsData.listings.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              No new matches in this window — nothing to review yet. I'll keep watching and surface fresh roles as they appear.
            </div>
          ) : (
          <div className="space-y-2">
            {message.jobFindingsData.listings.slice(0, 8).map((l, idx) => (
              <div key={l.id || `${idx}-${l.url}`} className="bg-muted/40 rounded-md p-2.5 border border-border">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary hover:underline inline-flex items-start gap-1 min-w-0"
                  >
                    <span className="line-clamp-1">{l.title || '(untitled role)'}</span>
                  </a>
                  {l.id && (
                    <button
                      type="button"
                      title="Wrong match? Tell the classifier"
                      onClick={async () => {
                        const reason = window.prompt(
                          `Why is "${l.title || 'this listing'}" a wrong match?`,
                          '',
                        );
                        if (reason === null) return;
                        try {
                          const { jobResearchService } = await import('@/services/jobResearchService');
                          await jobResearchService.correctMatch(l.id!, 'mismatch', reason || undefined);
                          window.alert('Thanks — the classifier will mirror this judgment on the next refresh.');
                        } catch (e: unknown) {
                          window.alert('Failed to record correction: ' + String(e));
                        }
                      }}
                      className="text-[11px] text-muted-foreground hover:text-red-600 dark:hover:text-red-400 shrink-0 px-1"
                    >
                      ⚠ wrong fit
                    </button>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{l.company || 'Company not listed'}</span>
                  {l.location && <span>· {l.location}</span>}
                  {l.is_remote && <span className="text-emerald-600 dark:text-emerald-400">· Remote</span>}
                  {(l.salary_min || l.salary_max) && (
                    <span>
                      · {l.salary_currency || ''}
                      {l.salary_min ? l.salary_min.toLocaleString() : ''}
                      {l.salary_min && l.salary_max ? '–' : ''}
                      {l.salary_max ? l.salary_max.toLocaleString() : (l.salary_min ? '+' : '')}
                    </span>
                  )}
                  {l.source && <span className="text-muted-foreground/70">· via {l.source.replace(/_/g, ' ')}</span>}
                  {l.employment_type && <span className="bg-muted border border-border rounded-full px-2 py-0.5 text-[10px]">{l.employment_type.replace(/_/g, ' ')}</span>}
                  {l.posted_at && <span>· {new Date(l.posted_at).toLocaleDateString()}</span>}
                </div>
                {(l.seniority || l.description_excerpt || l.match_note) && (
                  <details className="group mt-1.5">
                    <summary className="cursor-pointer list-none text-[11px] text-primary hover:underline">Details</summary>
                    <div className="mt-1 space-y-1 text-xs">
                      {l.seniority && (
                        <span className="inline-block bg-muted border border-border rounded-full px-2 py-0.5 text-[10px] capitalize">{l.seniority}</span>
                      )}
                      {l.description_excerpt && (
                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{l.description_excerpt}</p>
                      )}
                      {l.match_note && (
                        <p className="text-muted-foreground"><span className="text-foreground">Why it matched:</span> {l.match_note}</p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            ))}
            {message.jobFindingsData.listings.length > 8 && (
              <div className="text-xs text-muted-foreground text-center pt-1">
                + {message.jobFindingsData.listings.length - 8} more
              </div>
            )}
          </div>
          )}
          <div className="text-[11px] text-muted-foreground mt-3">
            Tip: ask "show me the rest" or "find more like #2" to dig in.
          </div>
        </div>
      );
    }
    if (message.sourcingOptionsData) {
      const so = message.sourcingOptionsData;
      const sell = so.result?.sell_price;
      const warehouseOpts: any[] = so.result?.options?.warehouse || [];
      const inboundOpts: any[] = so.result?.options?.inbound_po || [];
      const supplierOpts: any[] = so.result?.options?.supplier || [];
      const hasMarketplace = so.counts?.marketplace != null;
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-0.5">
            Supply options · quantity {so.quantity}
            {sell?.final_sell != null && (
              <span> · sell ref {sell.final_sell} {sell.currency || ''}</span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">Where this quantity can be filled from — stock already on hand, units already inbound on a PO, or suppliers to order from.</p>
          <div className={`grid ${hasMarketplace ? 'grid-cols-4' : 'grid-cols-3'} gap-3 text-center`}>
            <div className="bg-muted/40 border border-border rounded-md py-2"><div className="text-2xl font-medium text-foreground">{so.counts?.warehouse ?? 0}</div><div className="text-[11px] text-muted-foreground">In warehouse</div></div>
            <div className="bg-muted/40 border border-border rounded-md py-2"><div className="text-2xl font-medium text-foreground">{so.counts?.inbound_po ?? 0}</div><div className="text-[11px] text-muted-foreground">Inbound on PO</div></div>
            <div className="bg-muted/40 border border-border rounded-md py-2"><div className="text-2xl font-medium text-foreground">{so.counts?.supplier ?? 0}</div><div className="text-[11px] text-muted-foreground">Order from supplier</div></div>
            {hasMarketplace && (
              <div className="bg-muted/40 border border-border rounded-md py-2"><div className="text-2xl font-medium text-foreground">{so.counts?.marketplace ?? 0}</div><div className="text-[11px] text-muted-foreground">Marketplace</div></div>
            )}
          </div>
          {warehouseOpts.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40 mt-3">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">In warehouse</span>
                <span className="text-xs text-muted-foreground">{warehouseOpts.length} location{warehouseOpts.length === 1 ? '' : 's'}</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
                {warehouseOpts.map((w: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-t border-border/60 pt-1 first:border-0 first:pt-0">
                    <span>{w.warehouse_name || 'Warehouse'}</span>
                    <span className="text-muted-foreground text-right">
                      {w.available_qty != null ? `${w.available_qty} free` : ''}
                      {w.covers_destination ? ` · ${w.covers_destination}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {inboundOpts.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40 mt-2">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Inbound on PO</span>
                <span className="text-xs text-muted-foreground">{inboundOpts.length} order{inboundOpts.length === 1 ? '' : 's'}</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
                {inboundOpts.map((p: any, i: number) => (
                  <div key={i} className="flex justify-between gap-2 border-t border-border/60 pt-1 first:border-0 first:pt-0">
                    <span>{p.order_number || (p.order_id ? `PO #${String(p.order_id).slice(0, 8)}` : 'PO')}</span>
                    <span className="text-muted-foreground text-right">
                      {p.uncommitted_qty != null ? `${p.uncommitted_qty} inbound` : ''}
                      {p.expected_at ? ` · ETA ${new Date(p.expected_at).toLocaleDateString()}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {supplierOpts.length > 0 && (
            <div className="mt-3 space-y-1">
              <div className="text-[11px] text-muted-foreground">Suppliers who can fulfil (★ = preferred), with unit cost and lead time:</div>
              {supplierOpts.slice(0, 5).map((s: any, i: number) => (
                <div key={i} className="flex justify-between gap-2 text-xs bg-muted/40 border border-border rounded-md px-2.5 py-1.5">
                  <span>{s.supplier_name || 'Supplier'}{s.is_preferred ? ' ★' : ''}</span>
                  <span className="text-muted-foreground text-right">
                    {s.cost != null ? `${s.cost} ${s.currency || ''}` : 'price on request'}
                    {s.lead_time_days != null ? ` · ${s.lead_time_days}d lead` : ''}
                    {s.moq != null ? ` · MOQ ${s.moq}${s.meets_moq === false ? ' (short)' : ''}` : ''}
                    {s.availability ? ` · ${s.availability}` : ''}
                    {s.valid_until ? ` · until ${new Date(s.valid_until).toLocaleDateString()}` : ''}
                  </span>
                </div>
              ))}
              {supplierOpts.length > 5 && (
                <div className="text-xs text-muted-foreground text-center pt-1">+ {supplierOpts.length - 5} more</div>
              )}
            </div>
          )}
        </div>
      );
    }
    if (message.purchaseOrderCreatedData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-2">Sourcing committed</div>
          <div className="text-sm text-foreground">Created {message.purchaseOrderCreatedData.purchase_orders_created} draft purchase order{message.purchaseOrderCreatedData.purchase_orders_created === 1 ? '' : 's'} and reserved {message.purchaseOrderCreatedData.allocations_created} allocation{message.purchaseOrderCreatedData.allocations_created === 1 ? '' : 's'} of stock.</div>
          {(message.purchaseOrderCreatedData.orders || []).length > 0 && (
            <div className="mt-3 space-y-1">
              {message.purchaseOrderCreatedData.orders.map((o, i) => (
                <div key={o.order_id || i} className="flex justify-between gap-2 text-xs bg-muted/40 border border-border rounded-md px-2.5 py-1.5">
                  <span className="text-muted-foreground">Draft PO {o.order_id ? `#${String(o.order_id).slice(0, 8)}` : `#${i + 1}`}</span>
                  <span className="text-foreground">{o.subtotal_net != null ? o.subtotal_net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2">The POs are still drafts — review and send them to the supplier when you're ready.</p>
        </div>
      );
    }
    if (message.purchaseOrderSentData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-2">Purchase order sent to the supplier</div>
          <div className="space-y-1 text-sm text-foreground">
            <div><span className="text-muted-foreground">PO number:</span> {message.purchaseOrderSentData.order_number}</div>
            {message.purchaseOrderSentData.recipient && <div><span className="text-muted-foreground">Sent to:</span> {message.purchaseOrderSentData.recipient}</div>}
            {message.purchaseOrderSentData.pdf_url && <a href={message.purchaseOrderSentData.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Open PDF</a>}
          </div>
        </div>
      );
    }
    if (message.mentionSummaryData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-0.5">
            Mention summary · last {message.mentionSummaryData.days} days
          </div>
          {message.mentionSummaryData.summary?.latest_at && (
            <div className="text-[11px] text-muted-foreground mb-0.5">last mentioned {new Date(message.mentionSummaryData.summary.latest_at).toLocaleDateString()}</div>
          )}
          <p className="text-[11px] text-muted-foreground mb-2">How often this subject was written about lately, and how the coverage felt.</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-muted/40 border border-border rounded-md p-2">
              <div className="text-xs text-muted-foreground">Total</div>
              <div className="text-2xl font-medium text-foreground">{message.mentionSummaryData.summary?.total_count ?? 0}</div>
            </div>
            <div className="bg-muted/40 border border-border rounded-md p-2">
              <div className="text-xs text-emerald-600 dark:text-emerald-400">Positive</div>
              <div className="text-2xl font-medium text-foreground">{message.mentionSummaryData.summary?.by_sentiment?.positive ?? 0}</div>
            </div>
            <div className="bg-muted/40 border border-border rounded-md p-2">
              <div className="text-xs text-muted-foreground">Neutral</div>
              <div className="text-2xl font-medium text-foreground">{message.mentionSummaryData.summary?.by_sentiment?.neutral ?? 0}</div>
            </div>
            <div className="bg-muted/40 border border-border rounded-md p-2">
              <div className="text-xs text-red-600 dark:text-red-400">Negative</div>
              <div className="text-2xl font-medium text-foreground">{message.mentionSummaryData.summary?.by_sentiment?.negative ?? 0}</div>
            </div>
            {message.mentionSummaryData.summary?.sentiment_avg != null && (
              <div className="bg-muted/40 border border-border rounded-md p-2">
                <div className="text-xs text-muted-foreground">Avg sentiment</div>
                <div className="text-2xl font-medium text-foreground">{message.mentionSummaryData.summary.sentiment_avg.toFixed(2)}</div>
              </div>
            )}
          </div>
          {(message.mentionSummaryData.summary?.top_outlets || []).length > 0 && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Outlets covering it most (domain · mentions)</div>
              <div className="flex flex-wrap gap-1">
                {message.mentionSummaryData.summary.top_outlets.slice(0, 6).map((o: any) => (
                  <span key={o.domain} className="text-[11px] bg-muted border border-border rounded-full px-2 py-0.5">
                    {o.domain} · {o.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          <a
            href={`/admin/mention-monitoring/products/${message.mentionSummaryData.product_id}`}
            className="text-xs text-primary hover:underline mt-3 inline-block"
          >Open Mentions tab →</a>
        </div>
      );
    }
    if (message.llmVisibilityData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-0.5">LLM visibility{message.llmVisibilityData.forced ? ' · fresh probe' : ''}</div>
          <p className="text-[11px] text-muted-foreground mb-2">How AI assistants (ChatGPT, Gemini, Claude and others) talk about this subject when asked — how often it comes up, and where it ranks.</p>
          {!message.llmVisibilityData.snapshot?.present ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">No AI-assistant probes have run yet — once they do, you'll see how often each model mentions this and who it names alongside.</div>
          ) : (
            <>
              <div className={`grid ${message.llmVisibilityData.snapshot.total_probes != null ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
                <div className="bg-muted/40 border border-border rounded-md p-2">
                  <div className="text-xs text-muted-foreground">Share of voice</div>
                  <div className="text-2xl font-medium text-foreground">
                    {Math.round((message.llmVisibilityData.snapshot.share_of_voice || 0) * 100)}%
                  </div>
                </div>
                <div className="bg-muted/40 border border-border rounded-md p-2">
                  <div className="text-xs text-muted-foreground">Average rank</div>
                  <div className="text-2xl font-medium text-foreground">
                    {message.llmVisibilityData.snapshot.avg_position
                      ? `#${message.llmVisibilityData.snapshot.avg_position.toFixed(1)}`
                      : 'not ranked'}
                  </div>
                </div>
                {message.llmVisibilityData.snapshot.total_probes != null && (
                  <div className="bg-muted/40 border border-border rounded-md p-2">
                    <div className="text-xs text-muted-foreground">Total probes</div>
                    <div className="text-2xl font-medium text-foreground">{message.llmVisibilityData.snapshot.total_probes}</div>
                  </div>
                )}
              </div>
              {message.llmVisibilityData.snapshot.per_model && (
                <div className="mt-3 space-y-1 text-xs">
                  <div className="text-[11px] text-muted-foreground">Per model — times it was mentioned out of probes run:</div>
                  {Object.entries(message.llmVisibilityData.snapshot.per_model).map(([model, stats]: any) => (
                    <details key={model} className="group rounded-lg border border-border bg-muted/40">
                      <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                        <span className="font-medium">{model}</span>
                        <span className="text-xs text-muted-foreground">{stats.mentioned}/{stats.probes} mentions</span>
                      </summary>
                      <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 text-xs">
                        {Array.isArray(stats.positions) && stats.positions.length > 0 ? (
                          <div className="text-muted-foreground">Ranks: {stats.positions.join(', ')}</div>
                        ) : (
                          <div className="text-muted-foreground">No ranked positions recorded.</div>
                        )}
                        {Array.isArray(stats.samples) && stats.samples.length > 0 && (
                          <div className="space-y-1.5">
                            <div className="text-[11px] text-muted-foreground">What {model} actually said:</div>
                            {stats.samples.map((s: any, si: number) => (
                              <div key={si} className="rounded-md border border-border bg-background/60 p-2">
                                <div className="flex items-center gap-2 mb-1">
                                  {s.template && <span className="text-[10px] text-muted-foreground">{s.template}</span>}
                                  {s.mentioned
                                    ? <span className="text-[10px] text-emerald-600 dark:text-emerald-400">mentioned{s.position ? ` · #${s.position}` : ''}</span>
                                    : <span className="text-[10px] text-muted-foreground">not mentioned</span>}
                                  {s.sentiment && <span className="text-[10px] text-muted-foreground">· {s.sentiment}</span>}
                                </div>
                                {s.response && <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{s.response}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}
              {message.llmVisibilityData.snapshot.top_competitors && message.llmVisibilityData.snapshot.top_competitors.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs text-muted-foreground mb-1">Named alongside it most often (rivals the models bring up)</div>
                  <div className="flex flex-wrap gap-1">
                    {message.llmVisibilityData.snapshot.top_competitors.slice(0, 8).map(([name, count]: any) => (
                      <span key={String(name)} className="text-[11px] bg-muted border border-border rounded-full px-2 py-0.5">
                        {String(name)} · {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      );
    }
    if (message.mentionFeedData) {
      return (
        <div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
          <div className="text-xs text-muted-foreground mb-0.5">
            Mention feed{message.mentionFeedData.sentiment_filter ? ` · ${message.mentionFeedData.sentiment_filter}` : ''} · last {message.mentionFeedData.days} days
          </div>
          <p className="text-[11px] text-muted-foreground mb-2">The individual articles and posts that mention this subject — newest first. Open one to read the source.</p>
          {message.mentionFeedData.rows.length === 0 ? (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Nothing matches this filter yet{message.mentionFeedData.sentiment_filter ? ` for ${message.mentionFeedData.sentiment_filter} coverage` : ''} — try widening the time range or clearing the sentiment filter.</div>
          ) : (
            <ul className="divide-y divide-border">
              {message.mentionFeedData.rows.slice(0, 10).map((r) => (
                <li key={r.id} className="py-2">
                  <details className="group">
                    <summary className="cursor-pointer list-none">
                      <a
                        href={r.url} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >{r.title || r.url}</a>
                      <div className="text-xs text-muted-foreground">
                        {r.outlet_name || r.outlet_domain}
                        {r.sentiment ? ` · ${r.sentiment}` : ''}
                        {r.published_at ? ` · ${new Date(r.published_at).toLocaleDateString()}` : ''}
                      </div>
                    </summary>
                    <div className="pt-1 space-y-1 text-xs">
                      {r.is_anomaly && (
                        <span className="inline-block text-amber-600 dark:text-amber-400 bg-muted border border-border rounded-full px-2 py-0.5">anomaly</span>
                      )}
                      {r.excerpt && <p className="text-muted-foreground">{r.excerpt}</p>}
                      {(r.author || r.outlet_type || r.sentiment_score != null) && (
                        <div className="flex items-center gap-2 flex-wrap text-muted-foreground">
                          {r.author && <span>By {r.author}</span>}
                          {r.outlet_type && <span className="bg-muted border border-border rounded-full px-2 py-0.5">{r.outlet_type}</span>}
                          {r.sentiment_score != null && <span>score {r.sentiment_score}</span>}
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    if (message.seoResearchData) return <SEOResearchCard data={message.seoResearchData} />;
    if (message.seoGenericData) return <SEOGenericCard data={message.seoGenericData} />;
    if (message.catalogExtractionData) {
      return (
        <CatalogExtractionCandidatesCard
          catalogId={message.catalogExtractionData.catalog_id}
          query={message.catalogExtractionData.query}
          candidates={message.catalogExtractionData.candidates}
        />
      );
    }
    if (message.catalogImageCandidatesData) {
      return (
        <CatalogImageCandidatesCard
          catalogId={message.catalogImageCandidatesData.catalog_id}
          sectionId={message.catalogImageCandidatesData.section_id}
          materialId={message.catalogImageCandidatesData.material_id}
          materialName={message.catalogImageCandidatesData.material_name}
          candidates={message.catalogImageCandidatesData.candidates}
        />
      );
    }
    return null;
  };

  const renderCanvasArtifact = (message: Message): React.ReactNode => {
    if (message.generation_job) return renderGenerationGrid(message);
    if (message.demoData) {
      return (
        <DemoAgentResults
          result={message.demoData}
          onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
          onGenerateVideo={(imageUrl) => handleGenerateVideo(imageUrl, message)}
          onUseIn3DScene={handleUseProductIn3DScene}
        />
      );
    }
    if (message.heatPumpData) return <HeatPumpResultCard result={message.heatPumpData.result} />;
    if (message.heatingCostData) return <HeatingCostResultCard result={message.heatingCostData.result} />;
    if (message.sheetPdfData) {
      return (
        <SheetPreviewCard
          sheetId={message.sheetPdfData.sheet_id}
          sheetType={message.sheetPdfData.sheet_type}
          title={message.sheetPdfData.title}
          pdfUrl={message.sheetPdfData.pdf_url}
          pageCount={message.sheetPdfData.page_count}
          creditsUsed={message.sheetPdfData.credits_used}
        />
      );
    }
    if (message.quoteData) return <QuoteCanvasCard data={message.quoteData} />;
    if (message.sheetCanvasData) {
      return (
        <SheetCanvasCard
          sheetId={message.sheetCanvasData.sheet_id}
          sheetType={message.sheetCanvasData.sheet_type}
          moodboardId={message.sheetCanvasData.moodboard_id}
          initialData={message.sheetCanvasData.initial_data}
          title={message.sheetCanvasData.title}
        />
      );
    }
    if (message.articleData) return <SEOArticleViewer articleId={message.articleData.article_id} />;
    if (message.virtualStagingData) {
      return (
        <VirtualStagingViewer
          resultImageUrl={message.virtualStagingData.image_url}
          sourceImageUrl={message.virtualStagingData.source_image_url}
          room={message.virtualStagingData.room}
          furnitureStyle={message.virtualStagingData.furniture_style}
          creditsUsed={message.virtualStagingData.credits_used}
          onAnalyzeQuality={() => {
            setInput('Analyze the quality of this virtual staging result. Compare the original empty room with the staged version. Assess: lighting consistency, perspective accuracy, furniture scale vs room size, material realism, and edge blending. Score each dimension 1-10.');
            if (message.virtualStagingData?.image_url) {
              setAttachedImages([message.virtualStagingData.image_url]);
            }
          }}
        />
      );
    }
    if (message.materialData?.products && message.materialData.products.length > 0) {
      return (
        <div className="space-y-4">
          {/* Explainable search spec rides with the products artifact (issue #253) */}
          {message.searchSpec && (
            <SearchSpecCard spec={message.searchSpec} query={message.searchSpec.query || ''} />
          )}
          <ProductStrip
            products={message.materialData.products}
            title={`Found ${message.materialData.products.length} products`}
            onReplaceInImage={(product) => {
              const primaryImage = product.images?.find((img: any) => img.isPrimary) || product.images?.[0];
              setPendingReplacement({ id: product.id, name: product.name, imageUrl: primaryImage?.url });
            }}
            onPinMaterial={selectedAgent === 'interior-designer' ? handlePinMaterial : undefined}
          />
        </div>
      );
    }
    if (message.worldData) {
      return (
        <div className="space-y-4">
          <WorldViewer
            vrWorldId={message.worldData.vrWorldId}
            initialStatus={message.worldData.status}
            splatUrls={{
              draft: message.worldData.splatUrl100k,
              standard: message.worldData.splatUrl500k,
              full: message.worldData.splatUrlFull,
            }}
            colliderUrl={message.worldData.colliderGlbUrl}
            caption={message.worldData.caption}
            onRetry={() => {
              if (message.worldData?.sourceImageUrl) {
                handleGenerateVR(message.worldData.sourceImageUrl, { prompt: message.worldData.prompt }, message);
              }
            }}
          />
          {message.worldData.splatUrl100k && (
            <div className="flex justify-end">
              <MoodboardSavePopover
                mediaUrl={message.worldData.splatUrl100k}
                mediaType="vr_world"
                mediaTitle={message.worldData.caption || message.worldData.prompt || 'VR World'}
              />
            </div>
          )}
        </div>
      );
    }
    if (message.materialsBoardData) {
      return (
        <div className="space-y-3">
          <img
            src={message.materialsBoardData.image_url}
            alt={`Materials Selection Board — ${message.materialsBoardData.board_mode}`}
            className="w-full rounded-xl border border-white/20 object-contain shadow-md"
            loading="lazy"
          />
          <div className="flex items-center justify-end gap-2">
            <MoodboardSavePopover
              mediaUrl={message.materialsBoardData.image_url}
              mediaType="image"
              mediaTitle={`Materials Selection Board — ${message.materialsBoardData.board_mode.replace(/-/g, ' ')}`}
            />
            <a href={message.materialsBoardData.image_url} download title="Download board">
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </a>
          </div>
        </div>
      );
    }
    if (message.geminiImageData) {
      return message.videoData ? (
        <video src={message.videoData.video_url} controls className="w-full rounded-xl border border-white/20 shadow-md" />
      ) : (
        <div
          className="group relative cursor-pointer"
          onClick={() => setGeminiModalImage(message.geminiImageData!.image_url)}
        >
          <img
            src={message.geminiImageData.image_url}
            alt="Gemini interior design"
            className="w-full rounded-xl border border-white/20 shadow-md transition-opacity group-hover:opacity-90"
            loading="lazy"
          />
        </div>
      );
    }
    if (message.videoData) {
      return (
        <div className="space-y-3">
          <video
            src={message.videoData.video_url}
            controls
            autoPlay
            loop
            className="w-full rounded-xl border border-white/20 shadow-md"
          />
          <div className="flex items-center justify-end gap-2">
            <MoodboardSavePopover mediaUrl={message.videoData.video_url} mediaType="video" mediaTitle="Generated Video" />
            <a href={message.videoData.video_url} download title="Download video">
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            </a>
          </div>
        </div>
      );
    }
    if (message.inspirationData) {
      return (
        <InspirationCard
          sourceUrl={message.inspirationData.source_url}
          pageTitle={message.inspirationData.page_title}
          heroImage={message.inspirationData.hero_image}
          colors={message.inspirationData.colors}
          colorHex={message.inspirationData.color_hex}
          materials={message.inspirationData.materials}
          textures={message.inspirationData.textures}
          styles={message.inspirationData.styles}
          roomType={message.inspirationData.room_type}
          focus={message.inspirationData.focus}
          products={message.inspirationData.products}
          searchQueryUsed={message.inspirationData.search_query_used}
          totalResults={message.inspirationData.total_results}
        />
      );
    }
    if (message.techRadarData) return <TechRadarFindingsCard data={message.techRadarData} />;
    if (message.agentResultData) return <AgentResultCard title={message.agentResultData.title} data={message.agentResultData.data} resultType={message.agentResultData.resultType} />;
    return renderDataCardBody(message);
  };

  // Contextual inspector for the active canvas artifact (issue #253 P3).
  const renderCanvasInspector = (message: Message): React.ReactNode => {
    if (message.generation_job) return <RenderInspector data={message.generation_job} />;
    if (message.sheetPdfData) return <SheetInspector data={message.sheetPdfData} />;
    if (message.quoteData) return <QuoteInspector data={message.quoteData} />;
    if (message.virtualStagingData) return <StagingInspector data={message.virtualStagingData} />;
    if (message.materialData?.products && message.materialData.products.length > 0) {
      return <ProductsInspector data={message.materialData} />;
    }
    if (message.worldData) return <WorldInspector data={message.worldData} />;
    if (message.materialsBoardData) return <BoardInspector data={message.materialsBoardData} />;
    if (message.jobFindingsData) return <JobFindingsInspector data={message.jobFindingsData} />;
    if (message.sourcingOptionsData) return <SourcingInspector data={message.sourcingOptionsData} />;
    if (message.purchaseOrderCreatedData || message.purchaseOrderSentData) {
      return <OrderInspector created={message.purchaseOrderCreatedData} sent={message.purchaseOrderSentData} />;
    }
    if (message.mentionSummaryData) return <MentionSummaryInspector data={message.mentionSummaryData} />;
    if (message.mentionFeedData) return <MentionFeedInspector data={message.mentionFeedData} />;
    if (message.llmVisibilityData) return <LlmVisibilityInspector data={message.llmVisibilityData} />;
    if (message.catalogExtractionData) return <CatalogInspector data={message.catalogExtractionData} />;
    if (message.catalogImageCandidatesData) return <CatalogInspector data={message.catalogImageCandidatesData} material={message.catalogImageCandidatesData.material_name} />;
    return null;
  };

  // Shared quick-start launcher for the toolkit onboarding starters — used from
  // both the canvas empty state and the (canvas-hidden) chat empty state so the
  // dispatch behaviour is identical wherever the starters are shown.
  const launchQuickStartFromOnboarding = (prompt: string, qs: ToolkitQuickStart, tk: ToolkitDefinition) => {
    setJustEnabledToolkitId(null);
    ensureAgentAndToolkit(tk);
    if (qs.form?.length) {
      setToolkitFormState({ quickStart: qs, toolkit: tk });
      return;
    }
    if (qs.run && fireDirectRun(qs, tk)) return;
    if (qs.opensModal || qs.opensSheetWizard !== undefined) {
      handleQuickStart(qs, tk);
      return;
    }
    if (qs.workflow_id) {
      bootWorkflowLocally(qs.workflow_id);
    } else {
      setInput(prompt);
      setTimeout(() => handleSendMessage(), 0);
    }
  };

  // The agent welcome + toolkit starters. This is the canvas-first empty state:
  // when the canvas is open with no artifact yet, it fills the middle workspace
  // (instead of a dead "your canvas" placeholder). When the canvas is hidden it
  // renders inside the chat rail instead. `withHero` shows the big agent intro
  // (only for a brand-new, message-less chat); mid-conversation we show just the
  // starter grid so the canvas isn't a void while outputs haven't landed yet.
  const renderAgentStarters = (withHero: boolean): React.ReactNode => {
    const justTk = justEnabledToolkitId ? TOOLKITS.find((t) => t.id === justEnabledToolkitId) : null;
    const showJustEnabled = !!justTk && (justTk.quick_starts?.length || 0) > 0;
    return (
      <div className="min-h-full flex flex-col items-center justify-center py-6">
        {withHero && (
          <div className="text-center space-y-4 mb-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/20 flex items-center justify-center">
              <AgentIcon className={`h-8 w-8 ${currentAgent?.color}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold">
                Welcome to {currentAgent?.name}
              </h3>
              <p className="text-sm text-muted-foreground">
                {currentAgent?.description}
              </p>
            </div>
          </div>
        )}
        <ToolkitOnboardingCard
          mode={showJustEnabled ? 'just_enabled' : 'empty_state'}
          toolkits={showJustEnabled
            ? [justTk!]
            : activeToolkits
                .map((id) => TOOLKITS.find((t) => t.id === id))
                .filter((tk): tk is NonNullable<typeof tk> => !!tk)
                .filter((tk) => (tk.quick_starts?.length || 0) > 0)}
          onLaunch={launchQuickStartFromOnboarding}
          onDismiss={showJustEnabled ? () => setJustEnabledToolkitId(null) : undefined}
        />
      </div>
    );
  };

  const activeCanvasMessage = activeCanvasId ? messages.find((m) => m.id === activeCanvasId) : undefined;
  // The canvas is the permanent middle workspace for every agent; the chat is a
  // right rail. `canvasHidden` is an escape hatch to reclaim a full-width chat.
  const canvasShown = !canvasHidden;
  // Single-pane below `md`: the canvas is mounted only when it's the active pane.
  const canvasPaneVisible = canvasShown && (!isMobile || chatCollapsed);
  const chatPaneHidden = canvasShown && chatCollapsed;

  return (
    <ActiveMoodboardProvider value={activeMoodboard} onChange={setActiveMoodboard}>
    <div className="flex flex-1 min-h-0">
      <ConversationManagerModal
        open={convManagerOpen}
        onOpenChange={setConvManagerOpen}
        conversations={conversations}
        currentConversationId={currentConversationId}
        agentName={currentAgent?.name}
        onSelect={handleLoadConversation}
        onNew={handleNewConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        onTogglePin={handleTogglePin}
      />

      {/* Studio canvas — full-width artifact workspace, docked left of the chat */}
      {canvasPaneVisible && (
        <CanvasPanel
          artifacts={canvasArtifacts}
          activeId={activeCanvasId}
          onSelect={setActiveCanvasId}
          singlePane={isMobile}
          // Mobile's control is "back to chat"; desktop's is "close the canvas".
          onClose={() => (isMobile ? setChatCollapsed(false) : setCanvasHidden(true))}
          inspector={activeCanvasMessage ? renderCanvasInspector(activeCanvasMessage) : null}
        >
          {activeCanvasMessage
            ? renderCanvasArtifact(activeCanvasMessage)
            : renderAgentStarters(messages.length === 0)}
        </CanvasPanel>
      )}

      {/* Collapsed-chat handle — re-dock the chat when the canvas is full-screen */}
      {canvasShown && chatCollapsed && !isMobile && (
        <button
          onClick={() => setChatCollapsed(false)}
          title="Show chat"
          className="flex w-10 shrink-0 flex-col items-center gap-2 border-l border-white/8 bg-sidebar py-4 text-muted-foreground transition-colors hover:text-foreground"
        >
          <PanelRightOpen className="h-5 w-5" />
          <span className="[writing-mode:vertical-rl] text-[11px] font-medium uppercase tracking-wider">Chat</span>
        </button>
      )}

      {/* Main Chat Area — full width, or a collapsible right rail when the canvas is shown */}
      <div
        className={cn(
          'min-h-0 flex flex-col',
          chatPaneHidden && 'hidden',
          // Right rail beside the canvas on desktop; full width on mobile (where
          // the canvas is a separate, mutually-exclusive pane).
          !chatPaneHidden && canvasShown && !isMobile
            ? 'w-full max-w-[400px] shrink-0 border-l border-white/8'
            : 'flex-1 min-w-0',
        )}
      >
        {/* Studio header — agent identity + conversation manager launcher (replaces the old left sidebar + mobile drawer) */}
        <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-white/8 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shadow-inner flex-shrink-0">
            <AgentIcon className={`h-5 w-5 ${currentAgent?.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold tracking-tight leading-tight truncate">{currentAgent?.name}</h3>
            {currentConversationTitle && (
              <p className="text-xs text-muted-foreground truncate">{currentConversationTitle}</p>
            )}
          </div>
          <Button
            variant={canvasShown && !isMobile ? 'default' : 'ghost'}
            size={isMobile ? 'icon' : 'sm'}
            onClick={() => {
              // Mobile: swap to the canvas pane. Desktop: dock/undock it.
              if (isMobile) {
                setCanvasHidden(false);
                setChatCollapsed(true);
              } else {
                setCanvasHidden((v) => !v);
              }
            }}
            className={cn('rounded-full relative', !isMobile && 'gap-2')}
            title={isMobile ? 'Open canvas' : canvasShown ? 'Hide canvas' : 'Show canvas'}
          >
            <LayoutTemplate className="h-4 w-4" />
            <span className="hidden sm:inline">Canvas</span>
            {canvasArtifacts.length > 0 && (
              <span
                className={cn(
                  'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                  // Icon-only on mobile — the count rides the corner instead of
                  // widening a fixed-size button.
                  isMobile
                    ? 'absolute -right-0.5 -top-0.5 bg-primary text-primary-foreground'
                    : 'bg-primary/20',
                )}
              >
                {canvasArtifacts.length}
              </span>
            )}
          </Button>
          {canvasShown && !isMobile && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatCollapsed(true)}
              className="rounded-full"
              title="Collapse chat"
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConvManagerOpen(true)}
            className="gap-2 rounded-full"
            title="Conversations (⌘K)"
          >
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Conversations</span>
            <kbd className="hidden md:inline rounded border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewConversation}
            className="gap-1.5 rounded-full"
            style={{ borderColor: 'var(--glass-border)' }}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New</span>
          </Button>
        </div>
        {/* Active moodboard context — products added from the agent land here */}
        {activeMoodboard && (
          <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-primary/10 border-b border-primary/20 text-sm">
            <span className="flex items-center gap-2 min-w-0 text-foreground">
              <Palette className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="truncate">
                Adding to moodboard <span className="font-semibold">{activeMoodboard.title}</span>
              </span>
            </span>
            <button
              onClick={() => setActiveMoodboard(null)}
              className="text-muted-foreground hover:text-foreground flex-shrink-0"
              title="Stop adding to this moodboard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar">
          {/* Active workflow wizards — render whenever any are active, regardless
              of message count. This is what makes the "click Build my first
              catalog → wizard appears instantly on an empty chat" path work.
              Without this rendered above the empty/non-empty branch, booting
              a workflow locally would update state but show nothing because
              the empty state still wins until the first message arrives. */}
          {Object.values(workflows).filter((wf) => wf.status !== 'aborted' && wf.status !== 'done').map((wf) => (
            <WorkflowWizardCard
              key={`wizard-${wf.run_id}`}
              runtime={wf}
              onAdvance={handleWizardAdvance}
              onSkip={handleWizardSkip}
              onDismiss={handleWizardDismiss}
            />
          ))}

          {/* Just-enabled toolkit onboarding card — the moment a toolkit is
              enabled, surface its quick-starts. When the canvas is open and
              empty, the starters live IN the canvas (renderAgentStarters), so
              suppress the chat copy there; still show it in chat when the canvas
              is hidden, or when the canvas already holds an artifact (mid-session
              enable) and the empty state won't render. */}
          {justEnabledToolkitId && messages.length > 0 && (!canvasPaneVisible || canvasArtifacts.length > 0) && (() => {
            const tk = TOOLKITS.find((t) => t.id === justEnabledToolkitId);
            if (!tk || !(tk.quick_starts?.length || 0)) return null;
            return (
              <ToolkitOnboardingCard
                mode="just_enabled"
                toolkits={[tk]}
                onLaunch={(prompt, qs, tkParam) => {
                  setJustEnabledToolkitId(null);
                  ensureAgentAndToolkit(tkParam);
                  // Form-bearing quick-starts collect their fields first, then
                  // auto-send one complete message (takes priority over the
                  // step-by-step workflow tracker).
                  if (qs.form?.length) {
                    setToolkitFormState({ quickStart: qs, toolkit: tkParam });
                    return;
                  }
                  if (qs.run && fireDirectRun(qs, tkParam)) {
                    return;
                  }
                  // Guided-modal quick-starts (e.g. Design a room → new-design,
                  // Sheets → wizard) route through the shared dispatcher.
                  if (qs.opensModal || qs.opensSheetWizard !== undefined) {
                    handleQuickStart(qs, tkParam);
                    return;
                  }
                  if (qs.workflow_id) {
                    bootWorkflowLocally(qs.workflow_id);
                  } else {
                    setInput(prompt);
                    setTimeout(() => handleSendMessage(), 0);
                  }
                }}
                onDismiss={() => setJustEnabledToolkitId(null)}
              />
            );
          })()}

          {messages.length === 0 && Object.values(workflows).filter((wf) => wf.status !== 'aborted' && wf.status !== 'done').length === 0 ? (
            // Canvas-first: when the canvas is open it hosts the welcome +
            // starters (renderAgentStarters), so the chat rail stays clean.
            // Only render the starters here when the canvas pane isn't mounted —
            // which on mobile is the normal case (single-pane), so a fresh chat
            // still opens on the welcome + starters instead of a blank screen.
            canvasPaneVisible ? null : renderAgentStarters(true)
          ) : messages.length === 0 ? (
            // Wizard is active but no messages yet — wizard already renders above.
            null
          ) : (
            <>
              {/* Workflow trackers — pinned above messages, one per active run */}
              {Object.values(workflows).length > 0 && (
                <div className="space-y-2">
                  {Object.values(workflows)
                    .filter((wf) => wf.status !== 'aborted')
                    .map((wf) => {
                      const awaitingId = wf.awaiting_input_step_id;
                      const showForm = awaitingId && wf.awaiting_input_schema && wf.awaiting_input_schema.length > 0;
                      return (
                        <WorkflowTracker
                          key={wf.run_id}
                          runtime={wf}
                          onToggleCollapse={() => setWorkflows((prev) => ({
                            ...prev,
                            [wf.run_id]: { ...prev[wf.run_id], collapsed: !prev[wf.run_id].collapsed },
                          }))}
                          onStepAction={(stepId, action) => {
                            if (action === 'skip') {
                              setWorkflows((prev) => ({
                                ...prev,
                                [wf.run_id]: {
                                  ...prev[wf.run_id],
                                  steps: { ...prev[wf.run_id].steps, [stepId]: { ...(prev[wf.run_id].steps[stepId] || { step_id: stepId, status: 'pending' }), status: 'skipped' } },
                                  awaiting_input_step_id: prev[wf.run_id].awaiting_input_step_id === stepId ? null : prev[wf.run_id].awaiting_input_step_id,
                                },
                              }));
                            } else if (action === 'rerun' || action === 'edit_input') {
                              const def = getWorkflowDefinition(wf.definition_id);
                              const stepDef = def?.steps.find((s) => s.id === stepId);
                              if (stepDef?.input_schema) {
                                setWorkflows((prev) => ({
                                  ...prev,
                                  [wf.run_id]: {
                                    ...prev[wf.run_id],
                                    awaiting_input_step_id: stepId,
                                    awaiting_input_schema: stepDef.input_schema,
                                    awaiting_input_prompt: `Edit input for "${stepDef.title}".`,
                                  },
                                }));
                              }
                            }
                          }}
                          bottomSlot={showForm && (
                            <WorkflowInlineForm
                              prompt={wf.awaiting_input_prompt || `Step "${awaitingId}" needs input.`}
                              schema={wf.awaiting_input_schema!}
                              initialValues={wf.steps[awaitingId!]?.input}
                              onSubmit={async (values) => {
                                // The agent picks up the next message and resumes the workflow.
                                // We package the form values as a structured continuation hint
                                // so the agent prompt addendum can parse it deterministically.
                                const continuation = `[workflow:${wf.definition_id}/${awaitingId}] continue with input: ${JSON.stringify(values)}`;
                                setWorkflows((prev) => ({
                                  ...prev,
                                  [wf.run_id]: {
                                    ...prev[wf.run_id],
                                    awaiting_input_step_id: null,
                                    awaiting_input_schema: undefined,
                                    awaiting_input_prompt: undefined,
                                    steps: { ...prev[wf.run_id].steps, [awaitingId!]: { ...(prev[wf.run_id].steps[awaitingId!] || { step_id: awaitingId!, status: 'pending' }), input: values, status: 'running' } },
                                  },
                                }));
                                setInput(continuation);
                                // Auto-send so the user doesn't have to click again
                                setTimeout(() => handleSendMessage(), 0);
                              }}
                              onCancel={() => setWorkflows((prev) => ({
                                ...prev,
                                [wf.run_id]: {
                                  ...prev[wf.run_id],
                                  awaiting_input_step_id: null,
                                  awaiting_input_schema: undefined,
                                  awaiting_input_prompt: undefined,
                                },
                              }))}
                              submitLabel={`Continue → ${wf.steps[awaitingId!]?.status === 'awaiting_input' ? 'Run step' : 'Save'}`}
                            />
                          )}
                        />
                      );
                    })}
                </div>
              )}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                        style={{
                          backgroundColor: 'hsl(var(--primary))',
                          borderColor: 'hsl(var(--primary))',
                        }}
                      >
                        <Bot className="h-4 w-4" style={{ color: '#fff' }} />
                      </div>
                    </div>
                  )}
                  <div
                    className={`${message.demoData || message.materialData || message.worldData || message.videoData || message.virtualStagingData || message.materialsBoardData || message.inspirationData || message.sheetCanvasData || message.actionConfirmationData || message.sheetPdfData || message.mentionSummaryData || message.llmVisibilityData || message.mentionFeedData || message.seoResearchData || message.seoGenericData || message.catalogExtractionData || message.catalogImageCandidatesData || message.sourcingOptionsData || message.purchaseOrderCreatedData || message.purchaseOrderSentData || message.agentResultData || message.techRadarData || message.jobFindingsData || message.articleData ? 'max-w-full' : 'max-w-[88%] sm:max-w-[75%]'} min-w-0 ${canvasShown ? 'overflow-x-auto' : ''} rounded-2xl p-3.5 sm:p-5 ${
                      message.role === 'user'
                        ? 'bg-[#1f2937] text-white shadow-md'
                        : 'msg-assistant text-white shadow-sm'
                    }`}
                  >
                    {message.demoData ? (
                      <div className="space-y-4">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="demo" title="Demo results" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (
                          <DemoAgentResults
                            result={message.demoData}
                            onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
                            onGenerateVideo={(imageUrl) => handleGenerateVideo(imageUrl, message)}
                            onUseIn3DScene={handleUseProductIn3DScene}
                          />
                        )}
                      </div>
                    ) : message.inspirationData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip
                            kind="inspiration"
                            title={message.inspirationData.page_title || 'Inspiration board'}
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <InspirationCard
                            sourceUrl={message.inspirationData.source_url}
                            pageTitle={message.inspirationData.page_title}
                            heroImage={message.inspirationData.hero_image}
                            colors={message.inspirationData.colors}
                            colorHex={message.inspirationData.color_hex}
                            materials={message.inspirationData.materials}
                            textures={message.inspirationData.textures}
                            styles={message.inspirationData.styles}
                            roomType={message.inspirationData.room_type}
                            focus={message.inspirationData.focus}
                            products={message.inspirationData.products}
                            searchQueryUsed={message.inspirationData.search_query_used}
                            totalResults={message.inspirationData.total_results}
                          />
                        )}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.heatPumpData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="calc" title="Heat-pump sizing" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (
                          <HeatPumpResultCard result={message.heatPumpData.result} />
                        )}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.heatingCostData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="calc" title="Heating cost comparison" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (
                          <HeatingCostResultCard result={message.heatingCostData.result} />
                        )}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.techRadarData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip
                            kind="radar"
                            title="Tech radar"
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <TechRadarFindingsCard data={message.techRadarData} />
                        )}
                        {message.content && <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />}
                      </div>
                    ) : message.jobFindingsData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="jobs" title={message.jobFindingsData.tracked_job_label ? `Jobs · ${message.jobFindingsData.tracked_job_label}` : 'Job findings'} active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.actionConfirmationData ? (
                      <ActionConfirmationCard
                        title={message.actionConfirmationData.title}
                        summary={message.actionConfirmationData.summary}
                        danger={message.actionConfirmationData.danger}
                        status={message.actionConfirmationData.status}
                        onApprove={() => handleActionApprove(message.id, message.actionConfirmationData!)}
                        onDecline={() => handleActionDecline(message.id)}
                      />
                    ) : message.agentResultData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip
                            kind="result"
                            title={message.agentResultData.title || 'Result'}
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <AgentResultCard title={message.agentResultData.title} data={message.agentResultData.data} resultType={message.agentResultData.resultType} />
                        )}
                      </div>
                    ) : message.sourcingOptionsData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="sourcing" title="Supply options" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.purchaseOrderCreatedData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="order" title="Purchase orders created" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.purchaseOrderSentData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="order" title={message.purchaseOrderSentData.order_number ? `PO ${message.purchaseOrderSentData.order_number}` : 'Purchase order sent'} active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.mentionSummaryData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="mentions" title="Mention summary" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.llmVisibilityData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="llm" title="LLM visibility" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.mentionFeedData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="mentions" title="Mention feed" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.seoResearchData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="seo" title="SEO research" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.seoGenericData ? (
                      <div className="space-y-3">
                        {canvasShown ? (
                          <ArtifactChip kind="seo" title="SEO" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                      </div>
                    ) : message.materialData ? (
                      <div className="space-y-4">
                        {/* Explainable search spec — shows how KAI interpreted the query.
                            When the canvas is shown, it rides with the products artifact there
                            (renderCanvasArtifact), so suppress the inline copy to avoid a duplicate. */}
                        {message.searchSpec && !(canvasShown && (message.materialData?.products?.length ?? 0) > 0) && (
                          <SearchSpecCard spec={message.searchSpec} query={message.searchSpec.query || ''} />
                        )}
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {/* Products open in the canvas; the chip stands in when it's shown */}
                        {message.materialData.products && message.materialData.products.length > 0 && (
                          canvasShown ? (
                            <ArtifactChip
                              kind="products"
                              title={message.materialData.title || `${message.materialData.products.length} products`}
                              active={activeCanvasId === message.id}
                              onOpen={() => focusCanvas(message.id)}
                            />
                          ) : (
                            <DemoAgentResults
                              result={{
                                type: 'product_list',
                                data: message.materialData.products,
                                message: message.materialData.title || 'Material Results',
                              }}
                              onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
                              onGenerateVideo={(imageUrl) => handleGenerateVideo(imageUrl, message)}
                              onUseIn3DScene={handleUseProductIn3DScene}
                            />
                          )
                        )}
                      </div>
                    ) : message.geminiImageData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content).replace(/!\[.*?\]\(https?:\/\/[^)]+\)/g, '').trim()} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="image" title="Generated image" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : message.videoData ? (
                          <video
                            src={message.videoData.video_url}
                            controls
                            className="w-full rounded-xl border border-white/20 shadow-md"
                          />
                        ) : (
                          <div className="relative group cursor-pointer" onClick={() => setGeminiModalImage(message.geminiImageData!.image_url)}>
                            <img
                              src={message.geminiImageData.image_url}
                              alt="Gemini interior design"
                              className="w-full rounded-xl border border-white/20 shadow-md transition-opacity group-hover:opacity-90"
                              loading="lazy"
                            />
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              <span className="bg-black/60 text-white text-xs font-medium px-3 py-1.5 rounded-full backdrop-blur-sm">
                                Click to open
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : message.materialsBoardData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="board" title="Materials board" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (<>
                        <img
                          src={message.materialsBoardData.image_url}
                          alt={`Materials Selection Board — ${message.materialsBoardData.board_mode}`}
                          className="w-full rounded-xl border border-white/20 shadow-md object-contain"
                          loading="lazy"
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
                            {message.materialsBoardData.board_mode.replace(/-/g, ' ')}
                          </span>
                          <span className="ml-auto">{message.materialsBoardData.credits_used} credits used</span>
                        </div>
                        <div className="flex items-center justify-end gap-2">
                          <MoodboardSavePopover
                            mediaUrl={message.materialsBoardData.image_url}
                            mediaType="image"
                            mediaTitle={`Materials Selection Board — ${message.materialsBoardData.board_mode.replace(/-/g, ' ')}`}
                          />
                          <a
                            href={message.materialsBoardData.image_url}
                            download
                            title="Download board"
                          >
                            <Button variant="outline" size="sm" className="gap-2">
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </a>
                        </div>
                        </>)}
                      </div>
                    ) : message.sheetCanvasData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip
                            kind="sheet"
                            title={message.sheetCanvasData.title || 'Presentation sheet'}
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <SheetCanvasCard
                            sheetId={message.sheetCanvasData.sheet_id}
                            sheetType={message.sheetCanvasData.sheet_type}
                            moodboardId={message.sheetCanvasData.moodboard_id}
                            initialData={message.sheetCanvasData.initial_data}
                            title={message.sheetCanvasData.title}
                          />
                        )}
                      </div>
                    ) : message.sheetPdfData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip
                            kind="sheet"
                            title={message.sheetPdfData.title || 'Presentation sheet'}
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <SheetPreviewCard
                            sheetId={message.sheetPdfData.sheet_id}
                            sheetType={message.sheetPdfData.sheet_type}
                            title={message.sheetPdfData.title}
                            pdfUrl={message.sheetPdfData.pdf_url}
                            pageCount={message.sheetPdfData.page_count}
                            creditsUsed={message.sheetPdfData.credits_used}
                          />
                        )}
                      </div>
                    ) : message.quoteData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip
                            kind="quote"
                            title={message.quoteData.quote_number ? `Quote ${message.quoteData.quote_number}` : (message.quoteData.name || 'Quote')}
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                          <QuoteCanvasCard data={message.quoteData} />
                        )}
                      </div>
                    ) : message.catalogExtractionData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="catalog" title="Catalog candidates" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                      </div>
                    ) : message.catalogImageCandidatesData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="catalog" title={message.catalogImageCandidatesData.material_name ? `Images · ${message.catalogImageCandidatesData.material_name}` : 'Catalog images'} active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : renderDataCardBody(message)}
                      </div>
                    ) : message.virtualStagingData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip
                            kind="staging"
                            title="Virtual staging"
                            active={activeCanvasId === message.id}
                            onOpen={() => focusCanvas(message.id)}
                          />
                        ) : (
                        <VirtualStagingViewer
                          resultImageUrl={message.virtualStagingData.image_url}
                          sourceImageUrl={message.virtualStagingData.source_image_url}
                          room={message.virtualStagingData.room}
                          furnitureStyle={message.virtualStagingData.furniture_style}
                          creditsUsed={message.virtualStagingData.credits_used}
                          onAnalyzeQuality={() => {
                            setInput('Analyze the quality of this virtual staging result. Compare the original empty room with the staged version. Assess: lighting consistency, perspective accuracy, furniture scale vs room size, material realism, and edge blending. Score each dimension 1-10.');
                            if (message.virtualStagingData?.image_url) {
                              setAttachedImages([message.virtualStagingData.image_url]);
                            }
                          }}
                        />
                        )}
                      </div>
                    ) : message.videoData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="video" title="Generated video" active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (<>
                        <video
                          src={message.videoData.video_url}
                          controls
                          autoPlay
                          loop
                          className="w-full rounded-xl border border-white/20 shadow-md"
                          style={{ maxHeight: '480px' }}
                        />
                        <div className="flex items-center justify-end gap-2">
                          <MoodboardSavePopover
                            mediaUrl={message.videoData.video_url}
                            mediaType="video"
                            mediaTitle="Generated Video"
                          />
                          <a
                            href={message.videoData.video_url}
                            download
                            title="Download video"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-full text-xs font-medium text-sky-700 transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </a>
                        </div>
                        </>)}
                      </div>
                    ) : message.worldData ? (
                      <div className="space-y-4">
                        <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        {canvasShown ? (
                          <ArtifactChip kind="world" title={message.worldData.caption || message.worldData.prompt || 'VR world'} active={activeCanvasId === message.id} onOpen={() => focusCanvas(message.id)} />
                        ) : (<>
                        <WorldViewer
                          vrWorldId={message.worldData.vrWorldId}
                          initialStatus={message.worldData.status}
                          splatUrls={{
                            draft: message.worldData.splatUrl100k,
                            standard: message.worldData.splatUrl500k,
                            full: message.worldData.splatUrlFull,
                          }}
                          colliderUrl={message.worldData.colliderGlbUrl}
                          caption={message.worldData.caption}
                          onRetry={() => {
                            if (message.worldData?.sourceImageUrl) {
                              handleGenerateVR(
                                message.worldData.sourceImageUrl,
                                { prompt: message.worldData.prompt },
                                message,
                              );
                            }
                          }}
                        />
                        {message.worldData.splatUrl100k && (
                          <div className="flex justify-end">
                            <MoodboardSavePopover
                              mediaUrl={message.worldData.splatUrl100k}
                              mediaType="vr_world"
                              mediaTitle={message.worldData.caption || message.worldData.prompt || 'VR World'}
                            />
                          </div>
                        )}
                        </>)}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Credit exhaustion error — prompt user to top up */}
                        {message.insufficientCredits ? (
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/15 border border-amber-400/30">
                              <span className="text-amber-400 text-lg leading-none mt-0.5">⚡</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-amber-300 mb-0.5">Not enough credits</p>
                                <p className="text-xs text-amber-200/80">
                                  This generation requires more credits than your current balance.
                                  Top up to continue generating designs.
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => window.location.href = '/billing/credits'}
                              className="self-start flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-colors shadow-md"
                            >
                              Buy Credits
                            </button>
                          </div>
                        ) : message.role === 'assistant' ? (
                          <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap text-white">{normalizeContent(message.content)}</p>
                        )}

                        {/* Uploaded images on user messages */}
                        {message.role === 'user' && message.images && message.images.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {message.images.map((img, idx) => (
                              <img
                                key={img}
                                src={img}
                                alt={`Uploaded image ${idx + 1}`}
                                className="h-24 w-24 object-cover rounded-lg border border-white/20 shadow"
                              />
                            ))}
                          </div>
                        )}

                        {/* NOTE: materialData is handled by its own ternary branch above (with the
                            SearchSpec + products chip); it never reaches this regular-message block. */}

                        {/* Async 3D room-generation grid — full grid opens in the canvas (chip in chat) */}
                        {message.role === 'assistant' && message.generation_job && (
                          canvasShown ? (
                            <ArtifactChip
                              kind="render"
                              title={message.generation_job.room_type ? `Room · ${message.generation_job.room_type}` : 'Room generation'}
                              active={activeCanvasId === message.id}
                              onOpen={() => focusCanvas(message.id)}
                            />
                          ) : (
                            <div className="mt-4">{renderGenerationGrid(message)}</div>
                          )
                        )}

                        {/* SEO article pipeline — opens in the canvas; chip stands in when it's shown */}
                        {message.role === 'assistant' && message.articleData && (
                          canvasShown ? (
                            <ArtifactChip
                              kind="seo"
                              title="SEO article"
                              active={activeCanvasId === message.id}
                              onOpen={() => focusCanvas(message.id)}
                            />
                          ) : (
                            <SEOArticleViewer articleId={message.articleData.article_id} />
                          )
                        )}

                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-white/60">
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                      {/* Rating buttons for assistant messages */}
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMessageRating(message.id, 'up')}
                            className={`p-1 rounded-md transition-all ${
                              messageRatings[message.id] === 'up'
                                ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                : 'text-white/60 hover:text-green-300 hover:bg-white/10'
                            }`}
                            title="Helpful response"
                          >
                            <ThumbsUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleMessageRating(message.id, 'down')}
                            className={`p-1 rounded-md transition-all ${
                              messageRatings[message.id] === 'down'
                                ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                : 'text-white/60 hover:text-red-300 hover:bg-white/10'
                            }`}
                            title="Not helpful"
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                        style={{
                          backgroundColor: '#1f2937',
                          borderColor: '#1f2937',
                        }}
                      >
                        <User className="h-4 w-4" style={{ color: '#fff' }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading/Thinking Animation - Reasoning Trace Style */}
              {isLoading && (
                <div className="flex gap-3 justify-start animate-fade-in">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary shadow-lg shadow-primary/20">
                      <Bot className="h-4 w-4 text-white animate-pulse" />
                    </div>
                  </div>
                  <div className="min-w-0 max-w-[88%] sm:max-w-[80%] rounded-2xl p-3.5 sm:p-5 bg-primary/5 border border-primary/20">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce"></div>
                        </div>
                        <span className="text-sm font-bold text-primary uppercase tracking-widest">Reasoning</span>
                        <ThinkingTimer isActive={isLoading} onElapsedCapture={elapsedTimeRef} />
                      </div>

                      {/* Real Reasoning Steps - Jarvis Style */}
                      <ul className="space-y-2 text-sm border-l-2 border-primary/20 pl-4 ml-1">
                        {reasoningSteps.length === 0 ? (
                          // Initial message while waiting for first step
                          <li className="animate-fade-in text-muted-foreground/80 italic">
                            Standing by. Processing your request...
                          </li>
                        ) : (
                          // Real reasoning steps with Jarvis personality
                          reasoningSteps.slice(-5).map((step, idx) => (
                            <li
                              key={`${step.timestamp}-${idx}`}
                              className={cn(
                                'animate-fade-in flex items-start gap-2',
                                step.type === 'tool_call' && 'text-blue-600 dark:text-blue-400',
                                step.type === 'tool_result' && 'text-green-600 dark:text-green-400',
                                step.type === 'thinking' && 'text-amber-600 dark:text-amber-400 italic',
                                step.type === 'iteration' && 'text-muted-foreground/80',
                              )}
                            >
                              <span className="flex-shrink-0 mt-0.5">
                                {step.type === 'tool_call' && '⚙️'}
                                {step.type === 'tool_result' && '✓'}
                                {step.type === 'thinking' && '💭'}
                                {step.type === 'iteration' && '→'}
                              </span>
                              <span>{step.message}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="px-2.5 pb-3 pt-2 sm:px-4 sm:pb-4">
          {/* Voice Recording Indicator */}
          {isRecording && interimTranscript && (
            <div className="pb-2">
              <div className="p-2 border rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-700">Listening: {interimTranscript}</span>
                </div>
              </div>
            </div>
          )}

          {/* Attached catalog source PDFs — shown as removable chips; the extraction
              instruction is built from these at send-time (no composer text dump). */}
          {attachedCatalogPdfs.length > 0 && (
            <div className="pb-2 flex flex-wrap gap-2">
              {attachedCatalogPdfs.map((pdf) => (
                <div
                  key={pdf.id}
                  className="flex items-center gap-2 rounded-full border border-input bg-muted/60 pl-2.5 pr-1.5 py-1 text-xs"
                  title={pdf.filename}
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="max-w-[200px] truncate">{pdf.filename}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedCatalogPdfs((prev) => prev.filter((p) => p.id !== pdf.id))}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={`Remove ${pdf.filename}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Attached readable documents (PDFs Claude reads directly) */}
          {attachedDocuments.length > 0 && (
            <div className="pb-2 flex flex-wrap gap-2">
              {attachedDocuments.map((doc, i) => (
                <div
                  key={`${doc.name}-${i}`}
                  className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 pl-2.5 pr-1.5 py-1 text-xs"
                  title={`${doc.name} — Claude will read this document`}
                >
                  <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="max-w-[200px] truncate">{doc.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedDocuments((prev) => prev.filter((_, idx) => idx !== i))}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={`Remove ${doc.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Attached Images */}
          {attachedImages.length > 0 && (
            <div className="pb-2 space-y-2">

              {/* 2-image drag-and-drop slots for interior designer */}
              {attachedImages.length >= 2 && selectedAgent === 'interior-designer' ? (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">Drag to set the correct role for each image:</p>
                  <div className="flex gap-3">
                    {[0, 1].map((slotIdx) => {
                      const img = attachedImages[slotIdx];
                      const isDragOver = imageDragOverIndex === slotIdx;
                      const slotLabel = slotIdx === 0 ? 'Inspiration' : 'Your Room';
                      const slotDesc = slotIdx === 0 ? 'Style & colors to copy' : 'Layout to preserve';
                      const slotColor = slotIdx === 0
                        ? 'border-blue-300 bg-blue-50/50'
                        : 'border-violet-300 bg-violet-50/50';
                      const labelColor = slotIdx === 0
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-violet-100 text-violet-700';

                      return (
                        <div
                          key={slotIdx}
                          className="flex flex-col items-center gap-1"
                          onDragOver={(e) => { e.preventDefault(); setImageDragOverIndex(slotIdx); }}
                          onDragLeave={() => setImageDragOverIndex(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            const from = imageDragIndexRef.current;
                            if (from !== null && from !== slotIdx) {
                              setAttachedImages((prev) => {
                                const next = [...prev];
                                [next[from], next[slotIdx]] = [next[slotIdx], next[from]];
                                return next;
                              });
                            }
                            setImageDragOverIndex(null);
                            imageDragIndexRef.current = null;
                          }}
                        >
                          <div
                            draggable
                            onDragStart={() => { imageDragIndexRef.current = slotIdx; }}
                            onDragEnd={() => { imageDragIndexRef.current = null; setImageDragOverIndex(null); }}
                            className={cn(
                              'relative w-28 h-28 rounded-xl overflow-hidden border-2 border-dashed cursor-grab active:cursor-grabbing transition-all duration-150',
                              slotColor,
                              isDragOver && 'scale-105 brightness-95',
                            )}
                          >
                            <img
                              src={img}
                              alt={slotLabel}
                              className="w-full h-full object-cover"
                            />
                            {/* Drag handle overlay */}
                            <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors flex items-center justify-center">
                              <GripVertical className="w-5 h-5 text-white drop-shadow opacity-0 hover:opacity-100 transition-opacity" />
                            </div>
                            <button
                              onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== slotIdx))}
                              className="absolute top-1 right-1 bg-black/50 hover:bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center text-xs transition-colors"
                            >
                              ×
                            </button>
                          </div>
                          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', labelColor)}>
                            {slotLabel}
                          </span>
                          <span className="text-xs text-muted-foreground/70">{slotDesc}</span>
                        </div>
                      );
                    })}

                    {/* Extra images beyond slot 2 — plain thumbnails */}
                    {attachedImages.slice(2).map((img, i) => (
                      <div key={i + 2} className="relative w-14 h-14 self-start mt-1">
                        <img src={img} alt="Attached" className="w-full h-full object-cover rounded-lg" />
                        <button
                          onClick={() => setAttachedImages((prev) => prev.filter((_, idx) => idx !== i + 2))}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center text-xs"
                        >×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Default: framed attachments section so images read clearly
                   against the chat area (header + count + bordered thumbnails). */
                <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Paperclip className="h-3.5 w-3.5" />
                      <span>
                        {attachedImages.length} image{attachedImages.length === 1 ? '' : 's'} attached
                      </span>
                    </div>
                    <button
                      onClick={() => setAttachedImages([])}
                      className="text-xs text-muted-foreground/70 hover:text-destructive transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attachedImages.map((img, idx) => (
                      <div
                        key={img}
                        className="group relative h-20 w-20 overflow-hidden rounded-lg border border-border bg-background shadow-sm ring-1 ring-border/50"
                      >
                        <img src={img} alt={`Attachment ${idx + 1}`} className="h-full w-full object-cover" />
                        <button
                          onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                          aria-label="Remove attachment"
                          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-destructive group-hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Quick action chips — interior designer only */}
              {selectedAgent === 'interior-designer' && (
                <div className="flex flex-wrap gap-1.5">
                  {/* New Design — collects room/style/details upfront in a modal
                      (same pattern as Stage Room / Edit Image) so the agent never
                      has to ask follow-up questions in a second turn. */}
                  <button
                    onClick={() => setShowNewDesignModal(true)}
                    className="flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors bg-primary text-primary-foreground border-primary hover:opacity-90"
                    title="Design a room from scratch — pick room type, style, and details upfront"
                  >
                    <Sparkles className="w-3 h-3" />
                    Design a Room
                  </button>

                  {/* Floor Plan → 3D Render — guided capture (photo-first) */}
                  <button
                    onClick={() => launchInteriorQuickStart('Floor plan → 3D')}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${selectedGenerationMode === 'floor-plan-render' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'}`}
                    title="Convert a floor plan to a photorealistic eye-level interior perspective"
                  >
                    <LayoutTemplate className="w-3 h-3" />
                    Floor Plan → 3D Render
                  </button>

                  {/* Redesign Room (1 image) or Copy Style (2 images) — Flux Depth Pro */}
                  <button
                    onClick={() => {
                      if (attachedImages.length >= 2) {
                        setSelectedGenerationMode('copy-style');
                        setInput(
                          'I have two images uploaded.\n\n' +
                          'Image 1 (Inspiration): Extract the complete visual design — all floor materials, wall treatments/colors/textures, ceiling finish, furniture style and silhouettes, upholstery fabrics and patterns, hardware and fixture finishes, lighting atmosphere, decorative objects, and full color palette.\n\n' +
                          'Image 2 (My Room): This is the room to redesign.\n\n' +
                          'STRUCTURAL LOCK (never changes): wall positions, room dimensions, door and window openings, camera angle, perspective. These are the only things that are preserved from Image 2.\n\n' +
                          'EVERYTHING ELSE follows Image 1 completely — surfaces, fixtures, furniture, and fittings are ALL determined by Image 1, not by Image 2.\n\n' +
                          'FIXTURE REPLACEMENT RULES:\n' +
                          '- For each element in Image 2, look at what Image 1 shows in the equivalent functional zone.\n' +
                          '- If Image 1 shows the SAME type of element (e.g. both have a bathtub): keep it, but fully restyle its shape, finish, and material to exactly match Image 1.\n' +
                          '- If Image 1 shows a DIFFERENT element in that zone (e.g. Image 2 has bathtub, Image 1 has walk-in shower): completely erase the Image 2 element and replace it with exactly what Image 1 shows — same geometry, proportions, materials, finish. No remnant of the original shape.\n' +
                          '- If Image 1 shows NO element in that zone (e.g. Image 2 has a towel rack but Image 1 has empty wall): remove the element and apply the wall finish from Image 1.\n' +
                          '- Apply this same logic to every element in every room type — fixtures, furniture, fittings, decor, anything.\n\n' +
                          'SURFACE RULES: Every surface — floor, all walls, ceiling, tiles, cladding, niches — must exactly replicate the materials, colors, pattern, and texture from Image 1. No surface from Image 2 survives.\n\n' +
                          'Photorealistic professional render. No partial replacements, no hybrid shapes, no remnants of the original. Every element is either fully replaced by Image 1 or (if Image 1 has no equivalent) rendered in the closest matching style to Image 1.',
                        );
                      } else {
                        // Single-image redesign → guided capture (photo-first + target style).
                        launchInteriorQuickStart('Redesign from a photo');
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${(selectedGenerationMode === 'redesign' || selectedGenerationMode === 'copy-style') ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'}`}
                    title={attachedImages.length >= 2 ? 'Image 1 = inspiration style, Image 2 = your room (layout preserved)' : 'Redesign room keeping exact layout — uses Flux Depth Pro'}
                  >
                    <Layers className="w-3 h-3" />
                    {attachedImages.length >= 2 ? 'Copy Style' : 'Redesign Room'}
                  </button>

                  {/* Edit Image — guided capture (photo-first), then the targeted-edit builder */}
                  <button
                    onClick={() => launchInteriorQuickStart('Edit a photo')}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${selectedGenerationMode === 'image-edit' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700'}`}
                    title="Make targeted changes — change floor, lighting, plants, style, and more"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit Image
                  </button>

                  {/* Virtual Staging — guided capture (photo-first), then the staging wizard */}
                  <button
                    onClick={() => launchInteriorQuickStart('Stage a room')}
                    className="flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700"
                    title="Virtually stage this room with AI-generated furniture (20 credits)"
                  >
                    <Sparkles className="w-3 h-3" />
                    Stage Room
                  </button>
                </div>
              )}
            </div>
          )}

          {/* REMOVED: Attached PDF display - PDF processing moved to /admin/data-import page */}

          {/* Pinned Materials Tray (Interior Designer only) */}
          {selectedAgent === 'interior-designer' && pinnedMaterials.length > 0 && (
            <div className="px-4 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                  <Pin className="h-3 w-3" /> Pinned materials ({pinnedMaterials.length}/14)
                </span>
                {pinnedMaterials.map(m => (
                  <div key={m.id} className="relative group flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full pl-1 pr-2 py-0.5">
                    {m.imageUrl && (
                      <img src={m.imageUrl} alt={m.name} className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                    )}
                    <span className="text-xs text-amber-900 max-w-[80px] truncate">{m.name}</span>
                    <button
                      onClick={() => handleUnpinMaterial(m.id)}
                      className="ml-0.5 text-amber-500 hover:text-amber-700"
                      title="Unpin"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setPinnedMaterials([])}
                  className="text-xs text-muted-foreground hover:text-destructive underline"
                >
                  Clear all
                </button>
              </div>
              {/* Generate with pinned materials action */}
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => setInput('Generate an interior design incorporating my pinned materials. Use their exact colors, textures, and finishes for the walls, floors, and surfaces.')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full text-xs font-medium text-amber-800 transition-colors"
                  title="Generate a design using all pinned catalog materials"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate with these materials
                </button>
                <button
                  onClick={() => setInput('Create a materials selection board showcasing all my pinned materials in a professional layout.')}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-full text-xs font-medium text-amber-800 transition-colors"
                  title="Create a professional materials board from pinned catalog materials"
                >
                  <Layers className="w-3 h-3" />
                  Materials Board
                </button>
              </div>
            </div>
          )}


          {/* Input Controls */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Unified input container */}
            <TooltipProvider delayDuration={200}>
            <div className="border border-input rounded-xl bg-background shadow-sm">

              {/* Agent row — dropdown selector. JARVIS (orchestrator) is the
                  default and auto-routes to the right specialist; the rest are
                  pickable directly. */}
                <div className="flex items-center gap-2 px-2 py-1.5 border-b border-input">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted/60 hover:bg-muted text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title="Switch agent"
                      >
                        {(() => {
                          const Icon = currentAgent?.icon || Bot;
                          return <Icon className={cn('h-3.5 w-3.5', currentAgent?.color)} />;
                        })()}
                        <span>{currentAgent?.name || 'JARVIS'}</span>
                        {selectedAgent === 'orchestrator' && (
                          <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            Auto-assign
                          </span>
                        )}
                        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-semibold">Choose an agent</p>
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          JARVIS auto-routes to the right specialist — or pick one directly.
                        </p>
                      </div>
                      <DropdownMenuSeparator />
                      {availableAgents.map((agent) => {
                        const Icon = agent.icon;
                        const isActive = selectedAgent === agent.id;
                        const isOrchestrator = agent.id === 'orchestrator';
                        return (
                          <DropdownMenuItem
                            key={agent.id}
                            onSelect={() => setSelectedAgent(agent.id)}
                            className="flex items-start gap-2 py-2 cursor-pointer"
                          >
                            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', agent.color)} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{agent.name}</span>
                                {isOrchestrator && (
                                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                    Auto-assign
                                  </span>
                                )}
                                {isActive && <Check className="h-3.5 w-3.5 ml-auto shrink-0 text-primary" />}
                              </div>
                              <p className="text-[11px] text-muted-foreground leading-snug">{agent.description}</p>
                            </div>
                          </DropdownMenuItem>
                        );
                      })}
                      {comingSoonAgents.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {comingSoonAgents.map((agent) => {
                            const Icon = agent.icon;
                            return (
                              <DropdownMenuItem
                                key={agent.id}
                                disabled
                                onSelect={(e) => e.preventDefault()}
                                className="flex items-start gap-2 py-2 opacity-100 data-[disabled]:opacity-100"
                              >
                                <Icon className={cn('h-4 w-4 mt-0.5 shrink-0 opacity-60', agent.color)} />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-muted-foreground">{agent.name}</span>
                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                      Coming soon
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/70 leading-snug">{agent.description}</p>
                                </div>
                              </DropdownMenuItem>
                            );
                          })}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

              {/* Main input row */}
              <div className="flex items-stretch">

                {/* Left panel: attach, voice, prompt library */}
                {/* On a phone a 4-high icon column forced the whole composer to
                    ~120px tall; a 2×2 grid halves that without hiding tools. */}
                <div className="grid shrink-0 grid-cols-2 content-center items-center justify-items-center gap-0.5 border-r border-input px-1 py-2 sm:flex sm:flex-col sm:justify-around sm:gap-1 sm:px-1.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingCatalogPdf}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                      >
                        {uploadingCatalogPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left"><p>Attach images or a catalog PDF (extract products)</p></TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={handleVoiceInput}
                        disabled={!isVoiceSupported}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors',
                          isRecording
                            ? 'bg-red-500 text-white animate-pulse'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                          !isVoiceSupported && 'opacity-40 cursor-not-allowed',
                        )}
                      >
                        <Mic className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{isRecording ? 'Stop recording' : !isVoiceSupported ? 'Voice not supported' : 'Voice input'}</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowInspirationModal(true)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        <Globe className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left"><p>Design inspiration from URL</p></TooltipContent>
                  </Tooltip>

                  {/* ✨ Prompt Builder button removed (2026-06-21). Starter
                       processes now live inside the Toolkits picker (below),
                       each launchable as a guided process. One surface. */}

                  {/* Toolkits — primary picker. Visual cards, no checkboxes. */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setShowToolkitPicker(true)}
                        className={cn(
                          'p-1.5 rounded-lg transition-colors relative',
                          activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length > 0
                            ? 'text-primary bg-primary/10 hover:bg-primary/20'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                        )}
                      >
                        <Layers className="h-4 w-4" />
                        {activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                            {activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>
                        {activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length > 0
                          ? `${activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length} toolkit${activeToolkits.filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id)).length === 1 ? '' : 's'} loaded — click to manage`
                          : 'Toolkits — enable clusters of related tools'}
                      </p>
                    </TooltipContent>
                  </Tooltip>

                </div>

                {/* Textarea — resizable, with slash-command palette */}
                <div className="relative min-w-0 flex-1">
                  <CommandPalette
                    open={paletteOpen}
                    onClose={() => { setPaletteOpen(false); setPaletteQuery(''); }}
                    query={paletteQuery}
                    agentId={selectedAgent}
                    role={userRole}
                    enabledModules={enabledModulesArray}
                    onLaunchWorkflow={(wf) => {
                      // Boot the visual wizard locally so the user gets the
                      // step-by-step UI immediately (no LLM round-trip). The
                      // agent only sees the next-step continuation messages.
                      // For workflows that don't have a wizard-friendly first
                      // step (no input_schema), fall back to a generic prompt.
                      const firstStep = wf.steps[0];
                      if (firstStep?.input_schema?.length) {
                        bootWorkflowLocally(wf.id);
                      } else {
                        setInput(wf.examples?.[0] || `Run the "${wf.name}" workflow.`);
                      }
                    }}
                    onUseExample={(prompt) => setInput(prompt)}
                    onLaunchForm={(qs, tk) => {
                      // Form-bearing quick-start picked from the slash palette —
                      // collect fields first, then auto-send (same flow as cards).
                      setPaletteOpen(false);
                      setPaletteQuery('');
                      setToolkitFormState({ quickStart: qs, toolkit: tk });
                    }}
                  />
                  <Textarea
                    value={input}
                    onChange={(e) => {
                      const v = e.target.value;
                      setInput(v);
                      // Slash-trigger: opens when input starts with '/'. Query = chars after '/'.
                      if (v.startsWith('/')) {
                        setPaletteOpen(true);
                        setPaletteQuery(v.slice(1));
                      } else if (paletteOpen) {
                        setPaletteOpen(false);
                        setPaletteQuery('');
                      }
                    }}
                    onKeyDown={(e) => {
                      if (paletteOpen && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape')) {
                        // Let the palette handle navigation keys
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    onPaste={handleComposerPaste}
                    placeholder="Type your message... (Shift+Enter for new line, / for tools)"
                    className="min-h-[56px] sm:min-h-[80px] max-h-[400px] !resize-y border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-3 text-sm bg-transparent w-full"
                  />
                </div>

                {/* Right panel: send button — full height */}
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || (!input.trim() && attachedImages.length === 0 && attachedCatalogPdfs.length === 0 && attachedDocuments.length === 0)}
                  className={cn(
                    'flex shrink-0 items-center justify-center px-3.5 sm:px-4 border-l border-input rounded-r-xl transition-colors',
                    isLoading || (!input.trim() && attachedImages.length === 0 && attachedCatalogPdfs.length === 0 && attachedDocuments.length === 0)
                      ? 'text-muted-foreground/40 bg-muted/20 cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>

              </div>
            </div>
            </TooltipProvider>

            <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap">
              {/* Keyboard hint is desktop-only — it costs a whole line on a phone
                  and there is no "/" affordance worth teaching on touch. */}
              <div className="hidden text-xs text-muted-foreground/60 sm:block">
                Type <kbd className="px-1 py-0.5 rounded bg-muted/50 text-[10px]">/</kbd> to launch a workflow or invoke a specific tool
              </div>
              {/* Active toolkit chips — always visible above the chat. The Core
                  toolkit is rendered as a quiet badge; user-enabled toolkits as
                  removable chips. Click "+" to open the picker. */}
              <div className="flex items-center gap-1 flex-wrap">
                {activeToolkits
                  .map((id) => TOOLKITS.find((t) => t.id === id))
                  .filter((tk): tk is NonNullable<typeof tk> => !!tk)
                  .sort((a, b) => Number(!!b.alwaysOn) - Number(!!a.alwaysOn))
                  .map((tk) => {
                    const removable = !tk.alwaysOn;
                    return (
                      <span
                        key={tk.id}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border',
                          tk.alwaysOn
                            ? 'border-border/60 bg-muted/30 text-muted-foreground'
                            : 'border-primary/40 bg-primary/10 text-primary',
                        )}
                        title={tk.description}
                      >
                        <Layers className="h-2.5 w-2.5" />
                        {tk.name}
                        {removable && (
                          <button
                            onClick={() => updateActiveToolkits(activeToolkits.filter((id) => id !== tk.id))}
                            className="hover:text-destructive transition"
                            title="Remove"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                <button
                  onClick={() => setShowToolkitPicker(true)}
                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border/60 hover:border-primary/40 hover:text-primary transition px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  <Layers className="h-2.5 w-2.5" /> + Toolkit
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toolkit Picker Modal — the SINGLE tool surface: toggle clusters AND
          launch each toolkit's guided processes (quick-starts). Replaces the
          old separate ✨ prompts modal. */}
      <ToolkitPickerModal
        open={showToolkitPicker}
        onClose={() => setShowToolkitPicker(false)}
        role={userRole}
        enabledModules={enabledModulesArray}
        activeToolkitIds={activeToolkits}
        onChange={updateActiveToolkits}
        currentAgentId={selectedAgent}
        onLaunchQuickStart={(qs, tk) => {
          setShowToolkitPicker(false);
          handleQuickStart(qs, tk);
        }}
      />


      {/* Inspiration URL Modal */}
      {showInspirationModal && (
        <InspirationUrlModal
          onSubmit={(url, focus) => {
            const focusSuffix = focus !== 'all' ? ` (focus on ${focus} surfaces)` : '';
            setInput(`Find materials matching this design inspiration: ${url}${focusSuffix}`);
            setShowInspirationModal(false);
          }}
          onClose={() => setShowInspirationModal(false)}
        />
      )}

      {/* New Design — upfront room/style/details collection for from-scratch 3D
          designs. Reuses VirtualStagingModal (variant="design"): same room/style
          pickers, optional step 3. Composes a complete prompt and auto-sends so the
          agent calls generate_3d immediately without a second-turn question. */}
      {showNewDesignModal && (
        <VirtualStagingModal
          isOpen={showNewDesignModal}
          onClose={() => setShowNewDesignModal(false)}
          variant="design"
          initialDetails={input}
          hasReferenceImage={attachedImages.length > 0}
          onGenerate={({ room, style, furnitureItems }) => {
            setShowNewDesignModal(false);
            setSelectedGenerationMode(null);
            const base = `Generate a ${style.toLowerCase()} ${room.toLowerCase()} interior design.`;
            const extra = furnitureItems.trim();
            const refNote = attachedImages.length > 0
              ? ' Use my uploaded image as the reference room to redesign.'
              : '';
            const composedPrompt = extra ? `${base} Include: ${extra}.${refNote}` : `${base}${refNote}`;
            setInput(composedPrompt);
            setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
          }}
        />
      )}

      {/* Gemini single-image modal — reuses ProgressiveImageGrid's full modal (Edit Mode, zone select, Products tab, all actions) */}
      {geminiModalImage && (
        <ProgressiveImageGrid
          jobId=""
          modelCount={0}
          models={[]}
          directImage={{ url: geminiModalImage, title: 'Generated Design' }}
          onDirectImageClose={() => setGeminiModalImage(null)}
          workspaceId={workspaceId}
          onGenerateVR={(imageUrl, context) => {
            const ownerMsg = messages.find(m => m.geminiImageData?.image_url === imageUrl) ?? messages[messages.length - 1];
            handleGenerateVR(imageUrl, context, ownerMsg);
          }}
          onGenerateVideo={(imageUrl, videoType, vm) => {
            const ownerMsg = messages.find(m => m.geminiImageData?.image_url === imageUrl) ?? messages[messages.length - 1];
            handleGenerateVideo(imageUrl, ownerMsg, videoType, vm ?? videoModel);
          }}
          onGenerateMaterialsBoard={(imageUrl, boardMode) => {
            const ownerMsg = messages.find(m => m.geminiImageData?.image_url === imageUrl) ?? messages[messages.length - 1];
            handleGenerateMaterialsBoard(imageUrl, boardMode, ownerMsg);
          }}
          onGenerateVirtualStaging={(imageUrl, params) => handleGenerateVirtualStaging(imageUrl, params)}
          onEditImage={(imageUrl) => {
            // Auto-submit lighting edits directly (skip modal)
            if (imageUrl.includes('|LIGHTING|')) {
              const idx = imageUrl.indexOf('|LIGHTING|');
              const imgUrl = imageUrl.slice(0, idx);
              const prompt = imageUrl.slice(idx + '|LIGHTING|'.length);
              setAttachedImages([imgUrl]);
              setSelectedGenerationMode('image-edit');
              setInput(prompt);
              setTimeout(() => { handleSendMessageRef.current(); }, 100);
              return;
            }
            setAttachedImages([imageUrl]);
            setSelectedGenerationMode('image-edit');
            setGeminiModalImage(null);
            setShowGeminiEditModal(true);
          }}
          onAskJARVIS={(segment) => {
            const prompt = `Find products similar to this material zone: ${segment.material_type}, ${segment.finish} finish${segment.crop_storage_url ? `. Image: ${segment.crop_storage_url}` : ''}`;
            setInput(prompt);
            setGeminiModalImage(null);
          }}
          onFindMaterial={(segment) => {
            const cropUrl = segment.crop_data_url || segment.crop_storage_url;
            if (cropUrl) setAttachedImages([cropUrl]);
            const prompt = `Find this exact material. Zone: ${segment.label} — ${segment.material_type}, ${segment.finish} finish, color: ${segment.dominant_color}.`;
            setInput(prompt);
            setGeminiModalImage(null);
          }}
        />
      )}

      {/* Virtual Staging Modal — for uploaded images + prompt library trigger */}
      {virtualStagingImageUrl !== null && (
        <VirtualStagingModal
          isOpen={virtualStagingImageUrl !== null}
          onClose={() => setVirtualStagingImageUrl(null)}
          onGenerate={async (params) => {
            const url = virtualStagingImageUrl;
            setVirtualStagingImageUrl(null);
            if (url) {
              await handleGenerateVirtualStaging(url, params);
            } else {
              // No image yet — fall back to pre-filling the textarea so the AI handles it
              setInput(`Stage this ${params.room} in ${params.style} style. Include: ${params.furnitureItems}`);
            }
          }}
        />
      )}

      {/* Gemini Edit Modal — 3-step structured image edit */}
      <SheetWizardModal
        open={sheetWizardOpen}
        onClose={() => setSheetWizardOpen(false)}
        presetType={sheetWizardType as any}
        onCreated={(res: SheetWizardResult) => {
          // Mount the same result card the agent flow uses: interactive →
          // canvas, passive → PDF preview. Persist best-effort if a conversation
          // is open so it survives a reload.
          if (res.is_interactive) {
            const canvasMsg = {
              id: `msg-sheet-canvas-${Date.now()}`,
              role: 'assistant' as const,
              content: 'Sheet ready for editing — use the canvas below to finish it, then click Render PDF.',
              timestamp: new Date(),
              agentId: selectedAgent,
              model: selectedModel,
              sheetCanvasData: {
                sheet_id: res.sheet_id,
                sheet_type: res.sheet_type,
                moodboard_id: res.moodboard_id,
                initial_data: res.initial_data || {},
                title: res.title,
              },
            };
            setMessages((prev) => [...prev, canvasMsg]);
            if (currentConversationId) {
              agentChatHistoryService.saveMessage({
                conversationId: currentConversationId, role: 'assistant', content: canvasMsg.content,
                metadata: { agentId: selectedAgent, model: selectedModel, sheetCanvasData: canvasMsg.sheetCanvasData },
              }).catch(() => { /* non-blocking */ });
            }
          } else {
            const pdfMsg = {
              id: `msg-sheet-pdf-${Date.now()}`,
              role: 'assistant' as const,
              content: `${res.title} ready (${res.sheet_type.replace(/_/g, ' ')}).${res.page_count != null ? ` ${res.page_count} page${res.page_count === 1 ? '' : 's'}.` : ''}`,
              timestamp: new Date(),
              agentId: selectedAgent,
              model: selectedModel,
              sheetPdfData: {
                sheet_id: res.sheet_id,
                sheet_type: res.sheet_type,
                title: res.title,
                pdf_url: res.pdf_url,
                page_count: res.page_count,
                credits_used: res.credits_charged,
              },
            };
            setMessages((prev) => [...prev, pdfMsg]);
            if (currentConversationId) {
              agentChatHistoryService.saveMessage({
                conversationId: currentConversationId, role: 'assistant', content: pdfMsg.content,
                metadata: { agentId: selectedAgent, model: selectedModel, sheetPdfData: pdfMsg.sheetPdfData },
              }).catch(() => { /* non-blocking */ });
            }
          }
        }}
      />

      <GeminiEditModal
        isOpen={showGeminiEditModal}
        onClose={() => setShowGeminiEditModal(false)}
        roomType={geminiEditRoomType}
        style={geminiEditStyle}
        onApply={(params) => {
          if (params.regionEdit) {
            // Use the image the user clicked Edit on, falling back to last generated then attached
            const lastGenerated = [...messages].reverse().find(m => m.geminiImageData?.image_url)?.geminiImageData?.image_url ?? null;
            const targetImage = geminiModalImage ?? lastGenerated ?? attachedImages[0] ?? null;
            if (!targetImage) {
              toast({ title: 'No image to edit', description: 'Generate or attach a room image first, then use Region Edit.' });
              return;
            }
            setRegionEditImageUrl(targetImage);
            return;
          }
          // Direct submit: set input + modelTier indicator, then auto-send
          setSelectedGenerationMode('image-edit');
          // Encode model tier as a prefix the agent strips — generation-tools reads forcedMode from UI chip
          const tierPrefix = params.modelTier !== 'fast' ? `[model:${params.modelTier}] ` : '';
          setInput(tierPrefix + params.prompt);
          // Auto-submit after React state settles
          setTimeout(() => { handleSendMessageRef.current(); }, 100);
        }}
      />

      {/* Region Edit Canvas — full-screen mask painter */}
      {regionEditImageUrl && (
        <RegionEditCanvas
          imageUrl={regionEditImageUrl}
          onClose={() => setRegionEditImageUrl(null)}
          onApply={async (result: RegionEditResult) => {
            // Canvas stays open (applying=true) until this Promise resolves
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              toast({ title: 'Not authenticated', variant: 'destructive' });
              return;
            }
            const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

            try {
              const res = await fetch(`${supabaseUrl}/functions/v1/generate-region-edit`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                  image_url: result.imageUrl,
                  mask_data_url: result.maskDataUrl,
                  prompt: result.prompt,
                  workspace_id: getActiveWorkspaceId(session.user?.id) ?? session.user?.user_metadata?.workspace_id,
                  conversation_id: conversationIdRef.current ?? undefined,
                }),
              });

              const data = await res.json();
              if (!data.success) {
                // Keep canvas open so user can retry or adjust
                toast({
                  title: data.insufficient_credits ? 'Insufficient credits' : 'Region edit failed',
                  description: data.insufficient_credits
                    ? 'Not enough credits — 20 required.'
                    : data.error ?? 'Unknown error',
                  variant: 'destructive',
                });
                return;
              }

              // Success — close canvas and emit result into chat
              setRegionEditImageUrl(null);
              setMessages((prev) => [
                ...prev,
                {
                  id: `msg-${Date.now()}`,
                  role: 'assistant' as const,
                  content: 'Region edit applied.',
                  timestamp: new Date(),
                  geminiImageData: {
                    image_url: data.image_url,
                    mode: 'image-edit',
                    model: data.model,
                    job_id: data.job_id,
                    credits_used: data.credits_used,
                  },
                },
              ]);
            } catch (err) {
              toast({ title: 'Region edit failed', description: String(err), variant: 'destructive' });
            }
          }}
        />
      )}

      {/* Material Matching Modal */}
      {showMaterialModal && selectedMaterialsData && (
        <MaterialMatchingModal
          materials={selectedMaterialsData.materials}
          spatialAnalysis={selectedMaterialsData.spatialAnalysis}
          roomType={selectedMaterialsData.roomType}
          style={selectedMaterialsData.style}
          onClose={() => {
            setShowMaterialModal(false);
            setSelectedMaterialsData(null);
          }}
          onExportToMoodboard={(materials) => {
            toast({
              title: 'Materials Exported',
              description: `${materials.length} materials added to moodboard`,
            });
          }}
          onEstimateCost={(_materialIds) => {
            toast({
              title: 'Cost Estimation',
              description: 'Calculating cost estimate...',
            });
          }}
        />
      )}

      {/* Job-sites modal — triggered by the manage_job_sites agent tool when user is vague */}
      <ToolkitFormModal
        state={toolkitFormState}
        onClose={() => setToolkitFormState(null)}
        onSubmit={(renderedPrompt) => {
          // Collected the fields — inject the complete message and auto-send it.
          setInput(renderedPrompt);
          setToolkitFormState(null);
          setTimeout(() => { handleSendMessageRef.current(); }, 0);
        }}
        onRunTool={({ toolName, toolInput, toolkit, quickStart }) => {
          // Deterministic run — stash the payload and fire the same send pipeline
          // in mode:'direct_tool'. The agent switch (if any) already happened when
          // the quick-start opened the form, so selectedAgent is correct here.
          pendingDirectRunRef.current = { toolName, toolInput, label: quickStart.label, toolkitId: toolkit.id };
          setToolkitFormState(null);
          setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
        }}
        onGenerate={({ images, mode, opensModal, renderedPrompt }) => {
          // Interior image flow: the form already captured the photo(s) + creative
          // inputs. Attach the photo(s), then either open a guided builder seeded
          // with it (staging wizard / gemini-edit canvas) or force the generation
          // pipeline + auto-send the rendered prompt as ONE complete message.
          setToolkitFormState(null);
          if (images.length > 0) setAttachedImages(images);
          if (opensModal === 'virtual-staging') {
            if (images[0]) setVirtualStagingImageUrl(images[0]);
            return;
          }
          if (opensModal === 'gemini-edit') {
            setGeminiEditRoomType(null);
            setGeminiEditStyle(null);
            setShowGeminiEditModal(true);
            return;
          }
          if (mode) setSelectedGenerationMode(mode);
          setInput(renderedPrompt);
          // Let setState commit (attached images + mode) before the send reads them.
          setTimeout(() => { void handleSendMessageRef.current?.(); }, 100);
        }}
      />

      <JobSitesFormModal
        state={jobSitesFormState}
        onClose={() => setJobSitesFormState(null)}
        onSubmit={(followupMessage) => {
          setInput(followupMessage);
          toast({
            title: 'Form ready',
            description: 'Review the message in the input box and hit Send to apply.',
          });
        }}
      />

      {/* Tech Radar setup modal — triggered by Pepper's tech_radar_form_open chunk */}
      <TechRadarReviewModal
        state={techRadarFormState}
        onClose={() => setTechRadarFormState(null)}
        onSubmit={(followupMessage) => {
          setInput(followupMessage);
          setTechRadarFormState(null);
          setTimeout(() => { void handleSendMessageRef.current?.(); }, 50);
        }}
      />

      {/* Image Lightbox — full-size view of generated images */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={() => setLightboxImage(null)}
          role="dialog"
          aria-label={lightboxImage.name || 'Image preview'}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightboxImage(null); }}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightboxImage.url}
            alt={lightboxImage.name || 'Generated image'}
            className="max-h-[92vh] max-w-[92vw] rounded-lg object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {lightboxImage.name && (
            <div className="absolute bottom-6 left-1/2 max-w-[80vw] -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-sm text-white">
              {lightboxImage.name}
            </div>
          )}
        </div>
      )}
    </div>
    </ActiveMoodboardProvider>
  );
};

