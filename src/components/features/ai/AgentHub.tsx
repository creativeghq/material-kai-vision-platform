/**
 * AgentHub - Multi-Agent AI Interface
 * Replaces SearchHub with comprehensive agent orchestration
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Bot,
  Search,
  Package,
  Settings,
  Send,
  Mic,
  Paperclip,
  MessageSquare,
  User,
  Download,
  Upload,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Video,
  Pin,
  X,
  BookmarkPlus,
  LayoutTemplate,
  Layers,
  Camera,
  ChevronDown,
  Check,
  Globe,
  GripVertical,
  Pencil,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { logger } from '@/config';

import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/core/ui/sheet';
import { agentChatHistoryService, ChatConversation } from '@/services/agents/agentChatHistoryService';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useToast } from '@/hooks/use-toast';
import { DemoAgentResults } from './DemoAgentResults';
import { DesignCanvas } from './DesignCanvas';
import { MaterialMatchingModal } from './MaterialMatchingModal';
import { PromptLibrary } from './PromptLibrary';
import { VirtualStagingModal, VirtualStagingParams } from './VirtualStagingModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ProductStrip } from './ProductStrip';
import { ProgressiveImageGrid } from './ProgressiveImageGrid';
import SEOArticleViewer from './SEOArticleViewer';
import { getCachedResponse, cacheResponse } from '@/services/agents/agentChatCache';
import { SEO_ARTICLE_DEMO_DATA } from '@/data/demo/seo-article';
import { WorldViewer } from './WorldViewer';
import { vrWorldService, VR_CREDIT_COSTS } from '@/services/vrWorldService';
import { MoodboardSavePopover } from '@/components/business/moodboard/MoodboardSavePopover';
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
  defaultModel: string; // Default AI model for this agent
}

const AGENTS: AgentDefinition[] = [
  {
    id: 'kai',
    name: 'JARVIS',
    description: 'Material intelligence — search, insights, research & content',
    icon: Bot,
    color: 'text-blue-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
  },
  {
    id: 'interior-designer',
    name: 'Interior',
    description: 'AI-powered interior design with 3D generation',
    icon: Sparkles,
    color: 'text-violet-500',
    requiredRole: 'member',
    available: true,
    defaultModel: 'anthropic/claude-sonnet-4-5-20250929',
  },
  {
    id: 'demo',
    name: 'Demo',
    description: 'Platform showcase demos',
    icon: Package,
    color: 'text-cyan-500',
    requiredRole: 'admin',
    available: true,
    defaultModel: 'anthropic/claude-haiku-4-5-20251001',
  },
];

// AI Models available (format: provider/model-name for Mastra)
const AI_MODELS = [
  // Language Models
  { id: 'anthropic/claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic', type: 'language' },
  { id: 'anthropic/claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic', type: 'language' },
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'openai', type: 'language' },

  // Vision Models (HuggingFace Endpoint - 32B only)
  { id: 'huggingface/Qwen/Qwen3-VL-32B-Instruct', name: 'Qwen3-VL-32B', provider: 'huggingface', type: 'vision' },

  // Visual Embedding Models
  { id: 'google/siglip-so400m-patch14-384', name: 'SigLIP-SO400M', provider: 'google', type: 'visual-embedding' },
  { id: 'openai/clip-vit-base-patch32', name: 'CLIP-ViT-Base', provider: 'openai', type: 'visual-embedding' },

  // Text Embedding Models
  { id: 'voyage/voyage-3.5', name: 'Voyage AI 3.5', provider: 'voyage', type: 'text-embedding' },
  { id: 'openai/text-embedding-3-small', name: 'OpenAI Embedding 3 Small', provider: 'openai', type: 'text-embedding' },
];

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
  designData?: {
    images?: string[];
    modelResults?: Array<{
      model_id: string;
      model_name: string;
      provider: 'replicate' | 'huggingface';
      image_urls: string[];
      processing_time_ms: number;
      success: boolean;
      error?: string;
    }>;
    totalModels?: number;
    successfulModels?: number;
    spatialAnalysis?: any;
    matchedMaterials?: any[];
    parsedRequest?: any;
    qualityAssessment?: any;
    processingTimeMs?: number;
    costEstimate?: {
      materials: any[];
      total_cost: number;
      currency: string;
    };
  }; // Interior design results (3D images, spatial analysis, materials, cost)
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
    job_id: string;
    room: string;
    furniture_style: string;
    credits_used: number;
  }; // Virtual staging result
  materialsBoardData?: {
    image_url: string;
    job_id: string;
    board_mode: 'presentation-board' | 'selection-board' | 'photorealistic-render';
    credits_used: number;
  }; // Materials Selection Board result
}

interface AgentHubProps {
  userRole?: 'viewer' | 'member' | 'admin' | 'owner';
  onMaterialSelect?: (materialId: string) => void;
  initialPrompt?: string;
  initialConversationId?: string;
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

export const AgentHub: React.FC<AgentHubProps> = ({
  userRole = 'member',
  onMaterialSelect,
  initialPrompt,
  initialConversationId,
  onConversationChange,
}) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [mobileConvOpen, setMobileConvOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('kai');
  // Initialize with JARVIS agent's default model
  const [selectedModel, setSelectedModel] = useState<string>(
    AGENTS.find(a => a.id === 'kai')?.defaultModel || 'anthropic/claude-sonnet-4-5-20250929',
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeGenerationJobs, setActiveGenerationJobs] = useState<Map<string, any>>(new Map());
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [selectedGenerationMode, setSelectedGenerationMode] = useState<string | null>(null);
  const [imageDragOverIndex, setImageDragOverIndex] = useState<number | null>(null);
  const imageDragIndexRef = useRef<number | null>(null);
  const [geminiModalImage, setGeminiModalImage] = useState<string | null>(null);
  const [showGeminiEditModal, setShowGeminiEditModal] = useState(false);
  const [regionEditImageUrl, setRegionEditImageUrl] = useState<string | null>(null);
  // REMOVED: attachedPDF state - PDF processing moved to /admin/data-import page
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [editingConvoId, setEditingConvoId] = useState<string | null>(null);
  const [editingConvoTitle, setEditingConvoTitle] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | undefined>(undefined);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [virtualStagingImageUrl, setVirtualStagingImageUrl] = useState<string | null>(null);
  const [thinkingStartTime, setThinkingStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
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
  // REMOVED: pdfInputRef - PDF processing moved to /admin/data-import page

  // Track previous agent to detect actual agent switches
  const previousAgentRef = useRef<string | null>(null);
  // Ref to latest handleSendMessage for use in effects (avoids stale closures)
  const handleSendMessageRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const initialPromptSent = useRef(false);

  // Pending material replacement — set by "Replace in Image" on ProductStrip cards
  const [pendingReplacement, setPendingReplacement] = useState<{ id: string; name: string; imageUrl?: string } | null>(null);

  // Pinned materials tray — catalog products pinned for Gemini multi-reference generation
  const [pinnedMaterials, setPinnedMaterials] = useState<{ id: string; name: string; imageUrl?: string }[]>([]);

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

  // Voice input hook
  const {
    isRecording,
    transcript,
    interimTranscript,
    isSupported: isVoiceSupported,
    error: voiceError,
    toggleRecording,
    resetTranscript,
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
          .single();
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

  // Timer for thinking duration
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setThinkingStartTime(Date.now());
      setElapsedTime(0);
      interval = setInterval(() => {
        setElapsedTime((prev) => prev + 100);
      }, 100);
    } else {
      setThinkingStartTime(null);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isLoading]);

  // Format elapsed time as seconds with 1 decimal
  const formatElapsedTime = (ms: number) => {
    return (ms / 1000).toFixed(1) + 's';
  };

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
        'Searching through rather a lot of materials for you, sir.',
        'Running material analysis. The things I do for interior design.',
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
    };

    // Generic thinking messages
    const thinkingMessages = [
      'Processing your request. This shouldn\'t take long.',
      'Analyzing the parameters. Bear with me.',
      'Running calculations. The elegant kind.',
      'Thinking this through. Properly, of course.',
      'Considering the possibilities. There are several good ones.',
    ];

    // Iteration messages
    const iterationMessages = [
      'Making progress. Steady as she goes.',
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
        return `Executing ${data.tool || 'operation'}. One moment.`;

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
  const availableAgents = AGENTS.filter((agent) => {
    const roleHierarchy = { viewer: 0, member: 1, admin: 2, owner: 3 };
    return (
      agent.available &&
      roleHierarchy[userRole] >= roleHierarchy[agent.requiredRole]
    );
  });

  // Handle VR world generation from DesignCanvas
  const handleGenerateVR = useCallback(async (
    imageUrl: string,
    context: { prompt?: string; roomType?: string; style?: string },
    sourceMessage: Message,
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
          status: vrResult.status || 'completed',
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

  const VIDEO_TYPES = [
    { value: 'walkthrough',        label: 'Walkthrough',        description: 'Cinematic camera walk through the space', credits: 30 },
    { value: 'product_spotlight',  label: 'Product Spotlight',  description: 'Zoom focus on a featured material or element', credits: 30 },
    { value: 'before_after',       label: 'Before / After',     description: 'Transition between original and new design', credits: 30 },
    { value: 'floorplan_flythrough', label: 'Floorplan Flythrough', description: 'Aerial perspective from floor plan', credits: 30 },
    { value: 'social_reel',        label: 'Social Reel 9:16',   description: 'Vertical clip optimized for social media', credits: 30 },
  ] as const;

  const VIDEO_MODELS = [
    { value: 'auto',               label: 'Auto',               description: 'Best model selected automatically' },
    { value: 'veo-2',              label: 'Veo 2',              description: 'Google Veo 2 — high quality',         credits: 30 },
    { value: 'kling-v3.0',         label: 'Kling v3.0 Pro',     description: 'Kling v3.0 — latest & cinematic',     credits: 20 },
    { value: 'wan2.1-i2v-720p',    label: 'Wan 2.1 720p',       description: 'Wan2.1 720p — open-source quality',   credits: 12 },
    { value: 'runway-gen4-turbo',  label: 'Runway Gen-4',       description: 'Runway Gen-4 — premium output',       credits: 40 },
  ] as const;

  const [videoModel, setVideoModel] = useState<string>('auto');

  // Generate a Materials Selection Board from a Gemini-generated image
  const handleGenerateMaterialsBoard = useCallback(async (
    imageUrl: string,
    boardMode: 'presentation-board' | 'selection-board' | 'photorealistic-render',
    sourceMessage: Message,
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
    if (!input.trim() && attachedImages.length === 0) {
      return;
    }
    if (!userId) {
      return;
    }

    const userInput = input;
    const userAttachedImages = [...attachedImages];

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
    setSelectedGenerationMode(null);
    setIsLoading(true);
    setReasoningSteps([]); // Clear reasoning steps for new message

    try {
      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      // Create or get conversation
      let conversationId = currentConversationId;
      // Upload images first so URLs are available for both the API call and DB persistence
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
              const fileName = `user-uploads/${Date.now()}-${idx}.${ext}`;
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

      let newConversation: ChatConversation | null = null;
      if (!conversationId) {
        const conversation = await agentChatHistoryService.createConversation({
          title: userInput.slice(0, 50) + (userInput.length > 50 ? '...' : ''),
          agentId: selectedAgent,
          userId: userId,
        });
        if (conversation) {
          conversationId = conversation.id;
          setCurrentConversationId(conversationId);
          onConversationChange?.(conversationId);
          newConversation = conversation;
        }
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

      // Check cache for similar queries (only for search-type queries without images)
      const workspaceId = session.user?.user_metadata?.workspace_id;
      const canUseCache = userAttachedImages.length === 0 && selectedAgent === 'kai';
      let data: any = null;
      let pendingGeminiData: Message['geminiImageData'] | null = null;

      if (canUseCache) {
        const cachedResponse = getCachedResponse(userInput, selectedAgent, workspaceId);
        if (cachedResponse) {
          data = {
            text: cachedResponse.text,
            agentId: cachedResponse.agentId,
            model: cachedResponse.model,
            materialResults: cachedResponse.products ? { products: cachedResponse.products } : undefined,
          };
        }
      }

      // If no cache hit, make API call
      if (!data) {
        // Prepare request body
        const requestBody: any = {
          messages: messages.concat({
            id: `msg-${Date.now()}`,
            role: 'user',
            content: userInput,
            timestamp: new Date(),
          }),
          agentId: selectedAgent,
          model: selectedModel,
          images: resolvedImageUrls,
          conversation_id: currentConversationId,
          ...(selectedGenerationMode ? { generation_mode: selectedGenerationMode } : {}),
          ...(pinnedMaterials.length > 0 && selectedAgent === 'interior-designer'
            ? { pinned_material_images: pinnedMaterials.filter(m => m.imageUrl).map(m => m.imageUrl!) }
            : {}),
        };

        // REMOVED: PDF data attachment - PDF processing moved to /admin/data-import page

        // Call Supabase Edge Function for agent execution with STREAMING
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated');
        }

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
        let chunkCount = 0;
        let lastChunkTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();
          lastChunkTime = Date.now();

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
              chunkCount++;

              // Capture reasoning steps for Jarvis-style display
              if (chunk.type === 'status') {
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

          // Cache the response for future use
          if (canUseCache && data) {
            cacheResponse(userInput, selectedAgent, {
              text: data.text,
              model: data.model,
              products: data.materialResults?.products,
            }, workspaceId);
          }
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
      const designData: Message['designData'] = undefined;

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
        designData, // Include design data with spatial analysis
        generation_job: data.generation_job, // Async 3D generation job info
        geminiImageData: pendingGeminiData ?? undefined,
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
        const responseTimeMs = elapsedTime; // Capture elapsed time before state resets
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'assistant',
          content: cleanedText || 'No response from agent',
          metadata: {
            agentId: data.agentId || selectedAgent,
            model: data.model || selectedModel,
            responseTimeMs, // Time taken to respond
            productsCount: materialData?.products?.length || 0,
            cachedResponse: !!getCachedResponse(userInput, selectedAgent, workspaceId),
            demoData, // Save demo data for DemoAgent
            materialData, // Save material data for Search Agent
            designData, // Save design data for Interior Designer Agent (includes spatial analysis)
            generation_job: data.generation_job, // Save generation job info for async 3D generation
            geminiImageData: pendingGeminiData ?? undefined, // Gemini single-image result merged into this message
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
      // REMOVED: setAttachedPDF(null) - PDF processing moved to /admin/data-import page
    }
  }, [input, selectedAgent, selectedModel, attachedImages, userId, currentConversationId, messages]);

  // Keep ref in sync so effects can call the latest handleSendMessage without stale closures
  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  // Auto-send initialPrompt once userId is available
  useEffect(() => {
    if (initialPrompt && userId && !initialPromptSent.current) {
      initialPromptSent.current = true;
      setInput(initialPrompt);
      setTimeout(() => { handleSendMessageRef.current(); }, 300);
    }
  }, [userId, initialPrompt]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    e.target.value = ''; // Reset now so the same file can be re-selected later

    Promise.all(
      fileArray.map(
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
      console.error('[AgentHub] Failed to read uploaded image(s):', err);
      toast({
        title: 'Image Upload Failed',
        description: 'One or more images could not be read. Please try again.',
        variant: 'destructive',
      });
    });
  }, []);

  // REMOVED: handlePDFUpload - PDF processing moved to /admin/data-import page

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
          designData: msg.metadata?.designData as any | undefined,
          generation_job: msg.metadata?.generation_job as any | undefined,
          geminiImageData: msg.metadata?.geminiImageData as any | undefined,
          worldData: msg.metadata?.worldData as any | undefined,
          videoData: msg.metadata?.videoData as any | undefined,
          articleData: msg.metadata?.articleData as any | undefined,
          virtualStagingData: msg.metadata?.virtualStagingData as any | undefined,
          materialsBoardData: msg.metadata?.materialsBoardData as any | undefined,
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
  }, [onConversationChange]);

  const handleDeleteConversation = useCallback(async (e: React.MouseEvent, conversationId: string) => {
    e.stopPropagation(); // Prevent loading the conversation when clicking delete

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

  const handleStartRename = useCallback((e: React.MouseEvent, convo: ChatConversation) => {
    e.stopPropagation();
    setEditingConvoId(convo.id);
    setEditingConvoTitle(convo.title);
  }, []);

  const handleConfirmRename = useCallback(async (conversationId: string) => {
    if (!editingConvoTitle.trim()) { setEditingConvoId(null); return; }
    const success = await agentChatHistoryService.renameConversation(conversationId, editingConvoTitle);
    if (success) {
      setConversations((prev) => prev.map((c) => c.id === conversationId ? { ...c, title: editingConvoTitle.trim() } : c));
    }
    setEditingConvoId(null);
  }, [editingConvoTitle]);

  const handleExportConversation = useCallback(async () => {
    if (!currentConversationId) {
      toast({
        title: 'No Conversation',
        description: 'Please select a conversation to export',
        variant: 'destructive',
      });
      return;
    }

    const jsonData = await agentChatHistoryService.exportConversation(currentConversationId);
    if (!jsonData) {
      toast({
        title: 'Export Failed',
        description: 'Failed to export conversation',
        variant: 'destructive',
      });
      return;
    }

    // Download as JSON file
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${currentConversationId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: 'Export Successful',
      description: 'Conversation exported successfully',
    });
  }, [currentConversationId, toast]);

  const handleImportConversation = useCallback(async () => {
    if (!userId) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const jsonData = event.target?.result as string;
        const conversation = await agentChatHistoryService.importConversation(jsonData, userId);

        if (!conversation) {
          toast({
            title: 'Import Failed',
            description: 'Failed to import conversation',
            variant: 'destructive',
          });
          return;
        }

        // Reload conversations
        const convos = await agentChatHistoryService.getUserConversations(userId, selectedAgent);
        setConversations(convos);

        toast({
          title: 'Import Successful',
          description: 'Conversation imported successfully',
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, [userId, selectedAgent, toast]);

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent);
  const AgentIcon = currentAgent?.icon || Bot;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Middle Panel - Conversation List (desktop only) */}
      <div className="hidden md:flex w-80 flex-col m-4 rounded-3xl glass-panel bg-white/40 border-white/20 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shadow-inner flex-shrink-0">
              <AgentIcon className={`h-5 w-5 ${currentAgent?.color}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold tracking-tight leading-tight">{currentAgent?.name}</h3>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              style={{ background: 'rgba(255, 255, 255, 0.1)', borderColor: 'var(--glass-border)' }}
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">No conversations yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start a new chat to begin</p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {conversations.map((convo) => (
                <div
                  key={convo.id}
                  className={`group w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors cursor-pointer ${
                    currentConversationId === convo.id
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => editingConvoId !== convo.id && handleLoadConversation(convo.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    {editingConvoId === convo.id ? (
                      <input
                        autoFocus
                        value={editingConvoTitle}
                        onChange={(e) => setEditingConvoTitle(e.target.value)}
                        onBlur={() => handleConfirmRename(convo.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(convo.id); if (e.key === 'Escape') setEditingConvoId(null); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full text-sm font-medium bg-white/80 border border-primary/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    ) : (
                      <div className="font-medium text-sm truncate">{convo.title}</div>
                    )}
                    <div className="text-xs text-muted-foreground truncate">
                      {convo.messageCount} messages • {new Date(convo.lastMessageAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <button
                      onClick={(e) => handleStartRename(e, convo)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                      title="Rename conversation"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteConversation(e, convo.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New Conversation Button */}
        <div className="p-3 border-t border-white/10">
          <Button
            variant="outline"
            className="w-full hover:bg-white/10"
            onClick={handleNewConversation}
            style={{ borderColor: 'var(--glass-border)' }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            New Conversation
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Mobile conversation header */}
        {isMobile && (
          <div className="flex items-center gap-3 px-4 py-2 border-b border-border/50 shrink-0">
            <Sheet open={mobileConvOpen} onOpenChange={setMobileConvOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0 glass-panel">
                <div className="flex flex-col h-full">
                  <div className="p-5 border-b border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shadow-inner flex-shrink-0">
                        <AgentIcon className={`h-5 w-5 ${currentAgent?.color}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-bold tracking-tight leading-tight">{currentAgent?.name}</h3>
                      </div>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search conversations..."
                        className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                        style={{ background: 'rgba(255, 255, 255, 0.1)', borderColor: 'var(--glass-border)' }}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    {conversations.length === 0 ? (
                      <div className="p-6 text-center">
                        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">No conversations yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Start a new chat to begin</p>
                      </div>
                    ) : (
                      <div className="p-2 space-y-1">
                        {conversations.map((convo) => (
                          <div
                            key={convo.id}
                            className={`group w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors cursor-pointer ${
                              currentConversationId === convo.id
                                ? 'bg-primary/10 border-l-2 border-primary'
                                : 'hover:bg-accent'
                            }`}
                            onClick={() => { if (editingConvoId !== convo.id) { handleLoadConversation(convo.id); setMobileConvOpen(false); } }}
                          >
                            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                              <MessageSquare className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              {editingConvoId === convo.id ? (
                                <input
                                  autoFocus
                                  value={editingConvoTitle}
                                  onChange={(e) => setEditingConvoTitle(e.target.value)}
                                  onBlur={() => handleConfirmRename(convo.id)}
                                  onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmRename(convo.id); if (e.key === 'Escape') setEditingConvoId(null); }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full text-sm font-medium bg-white/80 border border-primary/40 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              ) : (
                                <div className="font-medium text-sm truncate">{convo.title}</div>
                              )}
                              <div className="text-xs text-muted-foreground truncate">
                                {convo.messageCount} messages • {new Date(convo.lastMessageAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                              <button
                                onClick={(e) => handleStartRename(e, convo)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all"
                                title="Rename conversation"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteConversation(e, convo.id)}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                title="Delete conversation"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-3 border-t border-white/10">
                    <Button
                      variant="outline"
                      className="w-full hover:bg-white/10"
                      onClick={() => { handleNewConversation(); setMobileConvOpen(false); }}
                      style={{ borderColor: 'var(--glass-border)' }}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      New Conversation
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium truncate flex-1">
              {currentAgent?.name}
            </span>
          </div>
        )}
        {/* Messages Area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-4 custom-scrollbar">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
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
            </div>
          ) : (
            <>
              {messages.map((message, msgIdx) => (
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
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`${message.demoData || message.materialData || message.designData || message.worldData || message.videoData || message.virtualStagingData || message.materialsBoardData ? 'max-w-full' : 'max-w-[75%]'} rounded-2xl p-5 ${
                      message.role === 'user'
                        ? 'bg-[#1f2937] text-white shadow-md'
                        : 'bg-[#3E192A] text-white shadow-sm'
                    }`}
                  >
                    {message.demoData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
                        <DemoAgentResults
                          result={message.demoData}
                          onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
                          onGenerateVideo={(imageUrl) => handleGenerateVideo(imageUrl, message)}
                          onUseIn3DScene={handleUseProductIn3DScene}
                        />
                      </div>
                    ) : message.materialData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
                        {/* Display real materials using DemoAgentResults format */}
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
                      </div>
                    ) : message.designData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
                        {/* Display design results with DesignCanvas */}
                        <DesignCanvas
                          images={message.designData.images}
                          modelResults={message.designData.modelResults}
                          totalModels={message.designData.totalModels}
                          successfulModels={message.designData.successfulModels}
                          spatialAnalysis={message.designData.spatialAnalysis}
                          matchedMaterials={message.designData.matchedMaterials}
                          parsedRequest={message.designData.parsedRequest}
                          qualityAssessment={message.designData.qualityAssessment}
                          processingTimeMs={message.designData.processingTimeMs}
                          onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
                          onGenerateVideo={(imageUrl) => handleGenerateVideo(imageUrl, message)}
                          onMaterialClick={(_materialId) => {
                            // TODO: open material detail panel
                          }}
                          onFindMaterials={async (imageUrl) => {
                            const findMaterialsPrompt = `Find materials and products that match this interior design image: ${imageUrl}`;
                            setInput(findMaterialsPrompt);
                            setTimeout(async () => {
                              await handleSendMessage();
                            }, 100);
                          }}
                          onViewAllMaterials={() => {
                            setSelectedMaterialsData({
                              materials: message.designData.matchedMaterials || [],
                              spatialAnalysis: message.designData.spatialAnalysis,
                              roomType: message.designData.parsedRequest?.room_type,
                              style: message.designData.parsedRequest?.style,
                            });
                            setShowMaterialModal(true);
                          }}
                        />
                        {/* Display cost estimate if available */}
                        {message.designData.costEstimate && (
                          <div className="bg-blue-50 rounded-lg p-4 text-gray-900">
                            <h4 className="font-semibold mb-2">Cost Estimate</h4>
                            <div className="space-y-2">
                              {message.designData.costEstimate.materials.map((material: any) => (
                                <div key={material.name} className="flex justify-between text-sm">
                                  <span>{material.name}</span>
                                  <span className="font-medium">
                                    ${material.subtotal.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                              <div className="border-t border-gray-300 pt-2 flex justify-between font-bold">
                                <span>Total</span>
                                <span className="text-blue-600">
                                  ${message.designData.costEstimate.total_cost.toFixed(2)} {message.designData.costEstimate.currency}
                                </span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : message.geminiImageData ? (
                      <div className="space-y-3">
                        <MarkdownRenderer content={normalizeContent(message.content).replace(/!\[.*?\]\(https?:\/\/[^)]+\)/g, '').trim()} className="text-sm" />
                        {message.videoData ? (
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
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
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
                      </div>
                    ) : message.virtualStagingData ? (
                      <div className="space-y-3">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
                        <img
                          src={message.virtualStagingData.image_url}
                          alt={`Virtual staging — ${message.virtualStagingData.room}`}
                          className="w-full rounded-xl border border-white/20 shadow-md object-cover"
                          loading="lazy"
                        />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{message.virtualStagingData.room}</span>
                          <span className="bg-accent px-2 py-0.5 rounded-full">{message.virtualStagingData.furniture_style}</span>
                          <span className="ml-auto">{message.virtualStagingData.credits_used} credits used</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            const a = document.createElement('a');
                            a.href = message.virtualStagingData!.image_url;
                            a.download = `virtual-staging-${message.virtualStagingData!.room.toLowerCase().replace(' ', '-')}.jpg`;
                            a.click();
                          }}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </div>
                    ) : message.videoData ? (
                      <div className="space-y-3">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
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
                      </div>
                    ) : message.worldData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
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

                        {/* Show ProductStrip for messages with material data */}
                        {message.role === 'assistant' && message.materialData?.products && message.materialData.products.length > 0 && (
                          <ProductStrip
                            products={message.materialData.products}
                            title={`Found ${message.materialData.products.length} products`}
                            onReplaceInImage={(product) => {
                              const primaryImage = product.images?.find((img: any) => img.isPrimary) || product.images?.[0];
                              setPendingReplacement({
                                id: product.id,
                                name: product.name,
                                imageUrl: primaryImage?.url,
                              });
                            }}
                            onPinMaterial={selectedAgent === 'interior-designer' ? handlePinMaterial : undefined}
                          />
                        )}

                        {/* Show ProgressiveImageGrid for async 3D generation jobs */}
                        {message.role === 'assistant' && message.generation_job && (
                          <div className="mt-4">
                            <ProgressiveImageGrid
                              jobId={message.generation_job.job_id}
                              modelCount={message.generation_job.model_count}
                              models={message.generation_job.models}
                              workspaceId={workspaceId}
                              onImageClick={(_url, _name) => {
                                // TODO: open image lightbox
                              }}
                              onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
                              onGenerateVideo={(imageUrl, videoType, vm) => handleGenerateVideo(imageUrl, message, videoType, vm ?? videoModel)}
                              onGenerateMaterialsBoard={(imageUrl, boardMode) => handleGenerateMaterialsBoard(imageUrl, boardMode, message)}
                              onGenerateVirtualStaging={(imageUrl, params) => handleGenerateVirtualStaging(imageUrl, params)}
                              onEditImage={(imageUrl) => {
                                setAttachedImages([imageUrl]);
                                setSelectedGenerationMode('image-edit');
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
                              onZoneSelectedForReplacement={() => {
                                setPendingReplacement(null);
                              }}
                            />
                          </div>
                        )}

                        {/* Show SEOArticleViewer for async SEO article pipeline */}
                        {message.role === 'assistant' && message.articleData && (
                          <SEOArticleViewer articleId={message.articleData.article_id} />
                        )}

                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-white/50">
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
                                : 'text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
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
                                : 'text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
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
                        <User className="h-4 w-4 text-white" />
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
                  <div className="max-w-[80%] rounded-2xl p-5 glass-panel bg-primary/5 border-primary/20">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]"></div>
                          <div className="w-2 h-2 rounded-full bg-primary animate-bounce"></div>
                        </div>
                        <span className="text-sm font-bold text-primary uppercase tracking-widest">Reasoning</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-white/40 text-primary border border-primary/10">
                          {formatElapsedTime(elapsedTime)}
                        </span>
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
        <div className="m-4 rounded-3xl glass-panel bg-white/40 border-white/20">
          {/* Voice Recording Indicator */}
          {isRecording && interimTranscript && (
            <div className="px-6 pt-3">
              <div className="p-2 border rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-red-700">Listening: {interimTranscript}</span>
                </div>
              </div>
            </div>
          )}

          {/* Attached Images */}
          {attachedImages.length > 0 && (
            <div className="px-6 pt-3 space-y-2">

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
                /* Default: plain thumbnails */
                <div className="flex gap-2">
                  {attachedImages.map((img, idx) => (
                    <div key={img} className="relative w-16 h-16">
                      <img src={img} alt="Attached" className="w-full h-full object-cover rounded-lg" />
                      <button
                        onClick={() => setAttachedImages((prev) => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Quick action chips — interior designer only */}
              {selectedAgent === 'interior-designer' && (
                <div className="flex flex-wrap gap-1.5">
                  {/* Floor Plan → 3D Render */}
                  <button
                    onClick={() => { setSelectedGenerationMode('floor-plan-render'); setInput('Render this floor plan as a photorealistic eye-level perspective interior showing how the rooms look from inside, with realistic materials and natural lighting.'); }}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${selectedGenerationMode === 'floor-plan-render' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'}`}
                    title="Convert uploaded floor plan to a photorealistic eye-level interior perspective"
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
                        setSelectedGenerationMode('redesign');
                        setInput(
                          'Redesign this room with a high-end contemporary style. Keep all fixtures and architectural elements in their exact positions — sink, vanity, toilet, shower, doors, windows, niches, mirrors, towel rails. Nothing moves.\n\n' +
                          'Update all visual surfaces: floor material and pattern, wall tiles/finishes, ceiling finish, fixture aesthetics, hardware metal finish, and lighting. Make it look professionally designed and photorealistic.',
                        );
                      }
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${(selectedGenerationMode === 'redesign' || selectedGenerationMode === 'copy-style') ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-700'}`}
                    title={attachedImages.length >= 2 ? 'Image 1 = inspiration style, Image 2 = your room (layout preserved)' : 'Redesign room keeping exact layout — uses Flux Depth Pro'}
                  >
                    <Layers className="w-3 h-3" />
                    {attachedImages.length >= 2 ? 'Copy Style' : 'Redesign Room'}
                  </button>

                  {/* Edit Image — Gemini targeted edit (opens structured modal) */}
                  <button
                    onClick={() => {
                      setSelectedGenerationMode('image-edit');
                      setShowGeminiEditModal(true);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1 border rounded-full text-xs font-medium transition-colors ${selectedGenerationMode === 'image-edit' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-violet-50 hover:bg-violet-100 border-violet-200 text-violet-700'}`}
                    title="Make targeted changes — change floor, lighting, plants, style, and more"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit Image
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
          <div className="px-4 pb-4 pt-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />

            {/* Unified input container */}
            <TooltipProvider delayDuration={200}>
            <div className="border border-input rounded-xl bg-background shadow-sm">

              {/* Agent row — full width on top */}
                <div className="flex items-center gap-1 px-2 py-1.5 border-b border-input">
                  {availableAgents.map((agent) => {
                    const Icon = agent.icon;
                    const isActive = selectedAgent === agent.id;
                    return (
                      <Tooltip key={agent.id}>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setSelectedAgent(agent.id)}
                            className={cn(
                              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200',
                              isActive
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                            )}
                          >
                            <Icon className={cn('h-3.5 w-3.5', !isActive && agent.color)} />
                            <span>{agent.name}</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px]">
                          <p className="font-semibold">{agent.name}</p>
                          <p className="text-xs text-muted-foreground">{agent.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>

              {/* Main input row */}
              <div className="flex items-stretch">

                {/* Left panel: attach, voice, prompt library */}
                <div className="flex flex-col items-center justify-around px-1.5 py-2 border-r border-input gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                      >
                        <Paperclip className="h-4 w-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left"><p>Attach images</p></TooltipContent>
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

                  {selectedAgent === 'interior-designer' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setShowPromptLibrary(true)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          <Sparkles className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left"><p>Prompt library</p></TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Textarea — resizable */}
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your message... (Shift+Enter for new line)"
                  className="flex-1 min-h-[80px] max-h-[400px] !resize-y border-0 rounded-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 p-3 text-sm bg-transparent"
                />

                {/* Right panel: send button — full height */}
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
                  className={cn(
                    'flex items-center justify-center px-4 border-l border-input rounded-r-xl transition-colors',
                    isLoading || (!input.trim() && attachedImages.length === 0)
                      ? 'text-muted-foreground/40 bg-muted/20 cursor-not-allowed'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90',
                  )}
                >
                  <Send className="h-4 w-4" />
                </button>

              </div>
            </div>
            </TooltipProvider>

            <div className="mt-1.5 text-xs text-muted-foreground/60">
              Use ⌘ + K for shortcuts, or '/' for canned messages
            </div>
          </div>
        </div>
      </div>

      {/* Prompt Library Modal */}
      {showPromptLibrary && (
        <PromptLibrary
          onSelectPrompt={(promptText) => {
            setInput(promptText);
          }}
          onClose={() => setShowPromptLibrary(false)}
          hasUploadedImage={attachedImages.length > 0}
          onTriggerVirtualStaging={() => {
            // Resolve the most recent image URL from the conversation or attached images
            let imageUrl: string | null = attachedImages[0] || null;
            if (!imageUrl) {
              // Walk messages in reverse to find the latest generated/staged/uploaded image
              for (let i = messages.length - 1; i >= 0; i--) {
                const m = messages[i];
                if (m.geminiImageData?.image_url) { imageUrl = m.geminiImageData.image_url; break; }
                if (m.virtualStagingData?.image_url) { imageUrl = m.virtualStagingData.image_url; break; }
                if (m.designData?.images?.[0]) { imageUrl = m.designData.images[0]; break; }
                if (m.images?.[0]) { imageUrl = m.images[0]; break; }
              }
            }
            setVirtualStagingImageUrl(imageUrl || '');
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
      <GeminiEditModal
        isOpen={showGeminiEditModal}
        onClose={() => setShowGeminiEditModal(false)}
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
                  workspace_id: session.user?.user_metadata?.workspace_id,
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
    </div>
  );
};

