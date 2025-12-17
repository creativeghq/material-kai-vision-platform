/**
 * AgentHub - Multi-Agent AI Interface
 * Replaces SearchHub with comprehensive agent orchestration
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Bot,
  Search,
  BarChart3,
  Briefcase,
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

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { getCachedResponse, cacheResponse } from '@/services/agents/agentChatCache';
import { MaterialAgent3DGenerationAPI } from '@/services/materialAgent3DGenerationAPI';

// Agent definitions with RBAC
interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  requiredRole: 'viewer' | 'member' | 'admin' | 'owner';
  available: boolean;
}

const AGENTS: AgentDefinition[] = [
  {
    id: 'search',
    name: 'Search Agent',
    description: 'Material search and discovery',
    icon: Search,
    color: 'text-blue-500',
    requiredRole: 'member',
    available: true,
  },
  {
    id: 'research',
    name: 'Research Agent',
    description: 'Deep research and analysis',
    icon: Bot,
    color: 'text-purple-500',
    requiredRole: 'admin',
    available: true,
  },
  {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Data analysis and insights',
    icon: BarChart3,
    color: 'text-green-500',
    requiredRole: 'admin',
    available: true,
  },
  {
    id: 'business',
    name: 'Business Agent',
    description: 'Business intelligence',
    icon: Briefcase,
    color: 'text-orange-500',
    requiredRole: 'admin',
    available: true,
  },
  {
    id: 'product',
    name: 'Product Agent',
    description: 'Product management',
    icon: Package,
    color: 'text-pink-500',
    requiredRole: 'admin',
    available: true,
  },
  {
    id: 'admin',
    name: 'Admin Agent',
    description: 'System administration',
    icon: Settings,
    color: 'text-red-500',
    requiredRole: 'owner',
    available: true,
  },
  {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Platform showcase demos',
    icon: Package,
    color: 'text-cyan-500',
    requiredRole: 'admin',
    available: true,
  },
  // REMOVED: 'pdf-processor' agent - PDF processing moved to /admin/data-import page
  {
    id: 'interior-designer',
    name: 'Interior Agent',
    description: 'AI-powered interior design with 3D generation and material matching',
    icon: Sparkles,
    color: 'text-violet-500',
    requiredRole: 'member',
    available: true,
  },
];

// AI Models available (format: provider/model-name for Mastra)
const AI_MODELS = [
  { id: 'anthropic/claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'anthropic/claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'openai/gpt-5', name: 'GPT-5', provider: 'openai' },
  { id: 'together/meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout 17B', provider: 'together' },
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
}

interface AgentHubProps {
  userRole?: 'viewer' | 'member' | 'admin' | 'owner';
  onMaterialSelect?: (materialId: string) => void;
}



export const AgentHub: React.FC<AgentHubProps> = ({
  userRole = 'member',
  onMaterialSelect,
}) => {
  const { toast } = useToast();
  const [selectedAgent, setSelectedAgent] = useState<string>('search');
  const [selectedModel, setSelectedModel] = useState<string>('anthropic/claude-sonnet-4-20250514');
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // REMOVED: pdfInputRef - PDF processing moved to /admin/data-import page

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

    const loadConversations = async () => {
      const convos = await agentChatHistoryService.getUserConversations(userId, selectedAgent);
      setConversations(convos);
    };

    loadConversations();
  }, [userId, selectedAgent]);

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

  const handleSendMessage = useCallback(async () => {
    if (!input.trim() && attachedImages.length === 0) return;
    if (!userId) return;

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

    try {
      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      // Create or get conversation
      let conversationId = currentConversationId;
      if (!conversationId) {
        const conversation = await agentChatHistoryService.createConversation({
          title: userInput.slice(0, 50) + (userInput.length > 50 ? '...' : ''),
          agentId: selectedAgent,
          userId: userId,
        });
        if (conversation) {
          conversationId = conversation.id;
          setCurrentConversationId(conversationId);
          setConversations((prev) => [conversation, ...prev]);
        }
      }

      // Save user message to database
      if (conversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'user',
          content: userInput,
        });
      }

      // Check cache for similar queries (only for search-type queries without images)
      const workspaceId = session.user?.user_metadata?.workspace_id;
      const canUseCache = attachedImages.length === 0 && selectedAgent === 'search';
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

        console.log('🚀 Calling agent-chat edge function...');
        console.log('📤 Request body:', JSON.stringify(requestBody, null, 2));
        const response = await fetch(
          `${supabaseUrl}/functions/v1/agent-chat`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          }
        );

        console.log('📡 Response status:', response.status);
        console.log('📡 Response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Error response:', errorText);
          throw new Error(`Agent execution failed: ${response.status} - ${errorText}`);
        }

        // Streaming response
        if (!response.body) {
          throw new Error('No response body');
        }

        console.log('✅ ========================================');
        console.log('✅ Starting to read stream...');
        console.log('✅ ========================================');

        // Read streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: any = null;
        let chunkCount = 0;
        const streamStartTime = Date.now();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            const streamElapsed = Date.now() - streamStartTime;
            console.log('📭 ========================================');
            console.log('📭 Stream ended');
            console.log('📭 Total chunks received:', chunkCount);
            console.log('📭 Total time:', streamElapsed + 'ms', `(${(streamElapsed / 1000).toFixed(2)}s)`);
            console.log('📭 ========================================');
            break;
          }

          const decoded = decoder.decode(value, { stream: true });
          console.log('📦 Raw chunk received:', decoded.substring(0, 200) + (decoded.length > 200 ? '...' : ''));
          buffer += decoded;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const chunk = JSON.parse(line);
              chunkCount++;
              const elapsed = Date.now() - streamStartTime;
              console.log(`📨 ========================================`);
              console.log(`📨 Chunk #${chunkCount} [${chunk.type}] at ${elapsed}ms`);
              console.log(`📨 Data:`, chunk);
              console.log(`📨 ========================================`);

              // Handle different chunk types
              if (chunk.type === 'status') {
                console.log('📊 [STATUS]:', chunk.message);
              } else if (chunk.type === 'iteration') {
                console.log(`🔄 [ITERATION] ${chunk.iteration}/${chunk.maxIterations}:`, chunk.message);
              } else if (chunk.type === 'tool_call') {
                console.log(`🔧 [TOOL_CALL] ${chunk.tool}`);
                console.log('   Args:', chunk.args);
              } else if (chunk.type === 'tool_result') {
                console.log(`✅ [TOOL_RESULT] ${chunk.tool} completed`);
                console.log('   Result preview:', JSON.stringify(chunk.result).substring(0, 200));
              } else if (chunk.type === 'tool_error') {
                console.error(`❌ [TOOL_ERROR] ${chunk.tool} failed:`, chunk.error);
              } else if (chunk.type === 'assistant_thinking') {
                console.log('💭 [THINKING]', chunk.hasToolCalls ? 'Has tool calls to execute' : 'Generating final response');
              } else if (chunk.type === 'heartbeat') {
                console.log('💓 [HEARTBEAT] Stream alive');
              } else if (chunk.type === 'generation_job_created') {
                console.log('🎨 ========================================');
                console.log('🎨 GENERATION JOB CREATED IMMEDIATELY!');
                console.log('🎨 ========================================');
                console.log('🎨 Job ID:', chunk.job_id);
                console.log('🎨 Model count:', chunk.model_count);
                console.log('🎨 Models:', chunk.models);
                console.log('🎨 ========================================');

                // Store as final result immediately so frontend can start polling
                finalResult = {
                  type: 'final_result',
                  text: `Started generating ${chunk.model_count} interior design variations. You can monitor progress in the generation panel.`,
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
                console.log('✅ Stored generation job as final result for immediate use');
              } else if (chunk.type === 'final_result') {
                console.log('🎯 ========================================');
                console.log('🎯 FINAL RESULT RECEIVED!');
                console.log('🎯 ========================================');
                console.log('🎯 Full chunk:', chunk);
                console.log('🎯 Has generation_job:', !!chunk.generation_job);
                if (chunk.generation_job) {
                  console.log('🎨 Generation job details:', chunk.generation_job);
                }
                console.log('🎯 ========================================');
                finalResult = chunk;
                // Check if this is an error result
                if (chunk.error) {
                  console.error('❌ Final result contains error:', chunk.errorMessage);
                }
              } else if (chunk.type === 'done') {
                console.log('✅ Done chunk received');
              } else {
                console.warn('⚠️ Unknown chunk type:', chunk.type, chunk);
              }
            } catch (parseError) {
              console.warn('⚠️ Failed to parse chunk:', line, parseError);
            }
          }
        }

        console.log('🔍 Final result check:', finalResult ? 'Found' : 'NOT FOUND');
        console.log('📊 Stream summary:', {
          totalChunks: chunkCount,
          finalResultReceived: !!finalResult,
          lastChunkType: finalResult ? 'final_result' : 'unknown'
        });

        if (!finalResult) {
          console.error('❌ ========================================');
          console.error('❌ NO FINAL_RESULT CHUNK RECEIVED');
          console.error('❌ ========================================');
          console.error('❌ Total chunks received:', chunkCount);
          console.error('❌ Stream duration:', (Date.now() - streamStartTime) + 'ms');
          console.error('❌ This usually means:');
          console.error('   1. Edge function threw an error before sending final_result');
          console.error('   2. Edge function timed out (400s limit on paid plan)');
          console.error('   3. Tool execution failed (check tool logs above)');
          console.error('   4. MIVAA/Spaceformer API timeout (5 minute limit)');
          console.error('❌ ========================================');
          console.error('❌ ACTION: Check Supabase Edge Function logs:');
          console.error('   supabase functions logs agent-chat --tail');
          console.error('❌ ========================================');
          throw new Error('No final result received from agent. Check edge function logs for details.');
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

      // Generate 3D design + SpaceFormer analysis for Interior Designer Agent
      let designData: Message['designData'] = undefined;
      if (selectedAgent === 'interior-designer') {
        try {
          // Check if the user's message or agent's response contains design-related keywords
          const designKeywords = ['design', 'interior', 'room', 'space', 'layout', 'furniture', 'decor', 'modern', 'minimalist', 'bedroom', 'living room', 'kitchen', 'bathroom'];
          const combinedText = `${userInput} ${cleanedText}`.toLowerCase();
          const containsDesignContent = designKeywords.some(keyword => combinedText.includes(keyword));

          if (containsDesignContent) {
            console.log('🎨 Triggering 3D generation + SpaceFormer analysis for Interior Designer...');

            // Extract room type and style from user input (simple keyword matching)
            const roomTypes = ['bedroom', 'living room', 'kitchen', 'bathroom', 'office', 'dining room'];
            const styles = ['modern', 'minimalist', 'industrial', 'scandinavian', 'traditional', 'contemporary'];

            const detectedRoomType = roomTypes.find(type => combinedText.includes(type)) || 'general';
            const detectedStyle = styles.find(style => combinedText.includes(style)) || 'modern';

            const generationResult = await MaterialAgent3DGenerationAPI.generate3D({
              prompt: userInput,
              room_type: detectedRoomType,
              style: detectedStyle,
              specific_materials: [],
              enable_spatial_analysis: true, // Enable SpaceFormer analysis
            });

            if (generationResult.success) {
              designData = {
                images: generationResult.image_urls,
                modelResults: generationResult.model_results, // Per-model results with attribution
                totalModels: generationResult.total_models,
                successfulModels: generationResult.successful_models,
                spatialAnalysis: generationResult.spatial_analysis, // SpaceFormer analysis included!
                matchedMaterials: generationResult.matched_materials,
                parsedRequest: generationResult.parsed_request,
                qualityAssessment: generationResult.quality_assessment,
                processingTimeMs: generationResult.processing_time_ms,
              };
              console.log(`✅ Multi-model generation completed: ${generationResult.successful_models}/${generationResult.total_models} models succeeded`);
              console.log('📊 Design data with model results:', designData);
            }
          }
        } catch (generationError) {
          console.warn('⚠️ 3D generation failed (non-critical):', generationError);
          // Continue without design data - don't fail the entire message
        }
      }

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
        }))
      );
    },
    []
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
      <div className="w-80 flex flex-col m-4 rounded-3xl dashboard-card bg-card">
        {/* Header */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Conversations</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleImportConversation}
                title="Import conversation"
                className="hover:bg-white/10"
              >
                <Upload className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportConversation}
                title="Export current conversation"
                disabled={!currentConversationId}
                className="hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
              </Button>
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
        {/* Chat Header */}
        <div className="min-h-16 px-6 py-3 flex items-center justify-between m-4 rounded-3xl dashboard-card bg-card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <AgentIcon className={`h-5 w-5 ${currentAgent?.color}`} />
            </div>
            <div>
              <h3 className="font-semibold">{currentAgent?.name}</h3>
              <p className="text-xs text-muted-foreground">
                {currentAgent?.description}
              </p>
            </div>
          </div>

          {/* Admin Controls */}
          {(userRole === 'admin' || userRole === 'owner') && (
            <div className="flex items-center gap-3">
              {/* Agent Selection */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Agent:</label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-[180px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => {
                      const Icon = agent.icon;
                      return (
                        <SelectItem key={agent.id} value={agent.id}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${agent.color}`} />
                            <span>{agent.name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>



              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Settings className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

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
                          borderColor: 'hsl(var(--primary))'
                        }}
                      >
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`${message.demoData || message.materialData || message.designData ? 'max-w-full' : 'max-w-[70%]'} rounded-lg p-4 dashboard-card ${
                      message.role === 'user' ? 'bg-secondary' : 'bg-card'
                    }`}
                  >
                    {message.demoData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        <DemoAgentResults result={message.demoData} />
                      </div>
                    ) : message.materialData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        {/* Display real materials using DemoAgentResults format */}
                        <DemoAgentResults
                          result={{
                            type: 'product_list',
                            data: message.materialData.products,
                            message: message.materialData.title || 'Material Results'
                          }}
                        />
                      </div>
                    ) : message.designData ? (
                      <div className="space-y-4">
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
                    ) : (
                      <div className="space-y-2">
                        {/* Render markdown content for assistant messages */}
                        {message.role === 'assistant' ? (
                          <MarkdownRenderer content={message.content} className="text-sm" />
                        ) : (
                          <p className="text-sm whitespace-pre-wrap text-foreground">{message.content}</p>
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
                                // TODO: Open modal or add to mood board
                              }}
                            />
                          </div>
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
                          borderColor: '#1f2937'
                        }}
                      >
                        <User className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Loading/Thinking Animation */}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div className="flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                      style={{
                        backgroundColor: 'hsl(var(--primary))',
                        borderColor: 'hsl(var(--primary))'
                      }}
                    >
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div
                    className="max-w-[70%] rounded-lg p-4 border-2"
                    style={{
                      background: 'var(--glass-bg)',
                      backdropFilter: 'var(--glass-blur)',
                      borderColor: 'hsl(var(--primary))'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'hsl(var(--primary))', animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'hsl(var(--primary))', animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'hsl(var(--primary))', animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-foreground">Thinking...</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {formatElapsedTime(elapsedTime)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="m-4 rounded-3xl dashboard-card bg-card">
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

