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
  Image as ImageIcon,
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { agentChatHistoryService, ChatConversation } from '@/services/agents/agentChatHistoryService';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useToast } from '@/hooks/use-toast';
import { DemoAgentResults } from './DemoAgentResults';
import { DesignCanvas } from './DesignCanvas';
import { MaterialMatchingModal } from './MaterialMatchingModal';
import { PromptLibrary } from './PromptLibrary';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ProductStrip } from './ProductStrip';
import { ProgressiveImageGrid } from './ProgressiveImageGrid';
import SEOArticleViewer from './SEOArticleViewer';
import { getCachedResponse, cacheResponse } from '@/services/agents/agentChatCache';
import { WorldViewer } from './WorldViewer';
import { vrWorldService, VR_CREDIT_COSTS } from '@/services/vrWorldService';

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
}

interface AgentHubProps {
  userRole?: 'viewer' | 'member' | 'admin' | 'owner';
  onMaterialSelect?: (materialId: string) => void;
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
}) => {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<string>('kai');
  // Initialize with KAI agent's default model
  const [selectedModel, setSelectedModel] = useState<string>(
    AGENTS.find(a => a.id === 'kai')?.defaultModel || 'anthropic/claude-sonnet-4-5-20250929'
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeGenerationJobs, setActiveGenerationJobs] = useState<Map<string, any>>(new Map());
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  // REMOVED: attachedPDF state - PDF processing moved to /admin/data-import page
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
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

  // Get current user ID
  useEffect(() => {
    const fetchUserId = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  /**
   * Transform raw reasoning data into Jarvis-style witty messages
   * Personality: Dry wit, subtle humor, calm, measured, professional
   */
  const toJarvisStyle = (
    type: 'thinking' | 'tool_call' | 'tool_result' | 'iteration',
    data: { tool?: string; content?: string; result?: any; iteration?: number }
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
      // Save rating to database via message metadata update
      await supabase
        .from('agent_chat_messages')
        .update({
          metadata: {
            ...(message as any).metadata,
            rating: newRating,
            ratedAt: new Date().toISOString(),
          },
        })
        .eq('conversation_id', currentConversationId)
        .eq('content', message.content)
        .eq('role', 'assistant');

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
        content: `Your explorable VR world is ready! Use orbit controls to look around, or switch to first-person (WASD) to walk through.`,
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
        description: `Your 3D world has been generated successfully.`,
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

  const handleSendMessage = useCallback(async () => {
    console.log('🎯 handleSendMessage CALLED');
    console.log('Input:', input);
    console.log('UserId:', userId);

    if (!input.trim() && attachedImages.length === 0) {
      console.log('❌ No input or images, returning');
      return;
    }
    if (!userId) {
      console.log('❌ No userId, returning');
      return;
    }

    console.log('✅ Validation passed, creating user message');
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const userInput = input;
    setInput('');
    setIsLoading(true);
    setReasoningSteps([]); // Clear reasoning steps for new message
    console.log('✅ State updated, starting try block');

    try {
      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      // Create or get conversation
      let conversationId = currentConversationId;
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
          newConversation = conversation;
        }
      }

      // Save user message to database
      if (conversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'user',
          content: userInput,
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
      const canUseCache = attachedImages.length === 0 && selectedAgent === 'kai';
      let data: any = null;

      if (canUseCache) {
        const cachedResponse = getCachedResponse(userInput, selectedAgent, workspaceId);
        if (cachedResponse) {
          console.log('🎯 Cache hit for query:', userInput);
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
          images: attachedImages,
        };

        // REMOVED: PDF data attachment - PDF processing moved to /admin/data-import page

        // Call Supabase Edge Function for agent execution with STREAMING
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated');
        }

        // Get Supabase URL from the client
        const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

        console.log('🚀 STARTING FETCH TO:', `${supabaseUrl}/functions/v1/agent-chat`);
        console.log('🚀 REQUEST BODY:', requestBody);

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
            // Prevent browser from timing out the connection
            keepalive: true,
          },
        );

        console.log('⏳ WAITING FOR RESPONSE...');
        const response = await fetchPromise;
        console.log('✅ GOT RESPONSE!');
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

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

        console.log('Starting to read stream...');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: any = null;
        let chunkCount = 0;
        let lastChunkTime = Date.now();

        while (true) {
          console.log('📖 Waiting for next chunk...');
          const { done, value } = await reader.read();
          const now = Date.now();
          console.log(`⏱️ Time since last chunk: ${now - lastChunkTime}ms`);
          lastChunkTime = now;

          if (done) {
            console.log('✅ Stream ended. Total chunks:', chunkCount);
            break;
          }

          const decoded = decoder.decode(value, { stream: true });
          console.log('📦 Raw chunk received:', decoded.substring(0, 200));
          buffer += decoded;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk = JSON.parse(line);
              chunkCount++;
              console.log(`Chunk #${chunkCount}:`, chunk.type);

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
            console.log('💾 Cached response for query:', userInput);
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
      };

      // Track active generation job if present
      if (data.generation_job) {
        console.log('🎨 Generation job detected:', data.generation_job);
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
          },
        });
      }
    } catch (error) {
      console.error('Error executing agent:', error);
      const errorMessage: Message = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        agentId: selectedAgent,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setAttachedImages([]);
      // REMOVED: setAttachedPDF(null) - PDF processing moved to /admin/data-import page
    }
  }, [input, selectedAgent, selectedModel, attachedImages, userId, currentConversationId, messages]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const imageUrls: string[] = [];
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          imageUrls.push(event.target.result as string);
          setAttachedImages((prev) => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
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
      const msgs = await agentChatHistoryService.getConversationMessages(conversationId);
      setMessages(
        msgs.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.createdAt),
          agentId: msg.metadata?.agentId as string,
          model: msg.metadata?.model as string,
          demoData: msg.metadata?.demoData as any | undefined,
          materialData: msg.metadata?.materialData as any | undefined,
          designData: msg.metadata?.designData as any | undefined, // Restore design data with spatial analysis
          generation_job: msg.metadata?.generation_job as any | undefined, // Restore generation job info for async 3D generation
          worldData: msg.metadata?.worldData as any | undefined, // Restore VR world data
          articleData: msg.metadata?.articleData as any | undefined, // Restore SEO article data
        })),
      );
    },
    [],
  );

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

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
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Middle Panel - Conversation List */}
      <div className="w-80 flex flex-col m-4 rounded-3xl glass-panel bg-white/40 border-white/20">
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
        <div className="flex-1 overflow-y-auto custom-scrollbar">
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
                  onClick={() => handleLoadConversation(convo.id)}
                >
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="font-medium text-sm truncate">{convo.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {convo.messageCount} messages • {new Date(convo.lastMessageAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConversation(e, convo.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
      <div className="flex-1 flex flex-col">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
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
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`${message.demoData || message.materialData || message.designData || message.worldData ? 'max-w-full' : 'max-w-[75%]'} rounded-2xl p-5 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                        : 'bg-white/80 dark:bg-gray-800/80 border border-white/40 dark:border-gray-700/40 text-gray-900 dark:text-gray-100 backdrop-blur-sm shadow-sm'
                    }`}
                  >
                    {message.demoData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{normalizeContent(message.content)}</p>
                        <DemoAgentResults
                          result={message.demoData}
                          onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
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
                          onMaterialClick={(materialId) => {
                            console.log('Material clicked:', materialId);
                            // Could open material details modal or navigate
                          }}
                          onFindMaterials={async (imageUrl) => {
                            console.log('🔍 Find Materials clicked for image:', imageUrl);
                            // Send a clear message that triggers material_search tool
                            // Use explicit keywords that match the system prompt conditions
                            const findMaterialsPrompt = `Find materials and products that match this interior design image: ${imageUrl}`;
                            setInput(findMaterialsPrompt);
                            // Wait for input to be set, then send
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
                              {message.designData.costEstimate.materials.map((material: any, idx: number) => (
                                <div key={idx} className="flex justify-between text-sm">
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
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Render markdown content for assistant messages */}
                        {message.role === 'assistant' ? (
                          <MarkdownRenderer content={normalizeContent(message.content)} className="text-sm" />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap text-foreground">{normalizeContent(message.content)}</p>
                        )}

                        {/* Show ProductStrip for messages with material data */}
                        {message.role === 'assistant' && message.materialData?.products && message.materialData.products.length > 0 && (
                          <ProductStrip
                            products={message.materialData.products}
                            title={`Found ${message.materialData.products.length} products`}
                          />
                        )}

                        {/* Show ProgressiveImageGrid for async 3D generation jobs */}
                        {message.role === 'assistant' && message.generation_job && (
                          <div className="mt-4">
                            <ProgressiveImageGrid
                              jobId={message.generation_job.job_id}
                              modelCount={message.generation_job.model_count}
                              models={message.generation_job.models}
                              onImageClick={(url, name) => {
                                console.log('🖼️ Image clicked:', url, name);
                              }}
                              onGenerateVR={(imageUrl, context) => handleGenerateVR(imageUrl, context, message)}
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
                      <p className="text-xs text-muted-foreground">
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
                                step.type === 'iteration' && 'text-muted-foreground/80'
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
            <div className="px-6 pt-3">
              <div className="flex gap-2">
                {attachedImages.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16">
                    <img
                      src={img}
                      alt="Attached"
                      className="w-full h-full object-cover rounded"
                    />
                    <button
                      onClick={() =>
                        setAttachedImages((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* REMOVED: Attached PDF display - PDF processing moved to /admin/data-import page */}

          {/* Agent Selector */}
          <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            <span className="text-xs text-muted-foreground/60 font-medium">Agent</span>
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-1 p-0.5 rounded-full bg-white/10 backdrop-blur-sm">
                {availableAgents.map((agent) => {
                  const Icon = agent.icon;
                  const isActive = selectedAgent === agent.id;
                  return (
                    <Tooltip key={agent.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSelectedAgent(agent.id)}
                          className={cn(
                            'p-2 rounded-full transition-all duration-200 ease-out',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-md scale-105 ring-1 ring-primary/30'
                              : 'hover:bg-white/20 text-muted-foreground hover:text-foreground hover:scale-105'
                          )}
                        >
                          <Icon className={cn('h-4 w-4', !isActive && agent.color)} />
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
            </TooltipProvider>
          </div>

          {/* Input Controls */}
          <div className="p-4">
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageUpload}
              />
              {/* REMOVED: PDF upload input and button - PDF processing moved to /admin/data-import page */}

              {/* Image Upload Buttons */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 w-9"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                className="h-9 w-9"
              >
                <ImageIcon className="h-4 w-4" />
              </Button>

              {/* Prompt Library Icon (Interior Designer Agent only) */}
              {selectedAgent === 'interior-designer' && (
                <button
                  onClick={() => setShowPromptLibrary(true)}
                  className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Open Prompt Library"
                >
                  <Sparkles className="h-5 w-5" />
                </button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={handleVoiceInput}
                className={`h-9 w-9 ${isRecording ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : ''}`}
                title={
                  !isVoiceSupported
                    ? 'Voice input not supported in this browser'
                    : isRecording
                      ? 'Stop recording'
                      : 'Start voice input'
                }
                disabled={!isVoiceSupported}
              >
                <Mic className="h-4 w-4" />
              </Button>
              <div className="flex-1 relative">
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
                  className="min-h-[44px] max-h-[120px] resize-none pr-12"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
                  size="icon"
                  className="absolute right-2 bottom-2 h-8 w-8 bg-primary hover:bg-primary/90"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
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
        />
      )}

      {/* Material Matching Modal with SpaceFormer Context */}
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
            console.log('Export to moodboard:', materials);
            toast({
              title: 'Materials Exported',
              description: `${materials.length} materials added to moodboard`,
            });
          }}
          onEstimateCost={(materialIds) => {
            console.log('Estimate cost for:', materialIds);
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

