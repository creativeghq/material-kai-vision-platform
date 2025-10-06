import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  Send,
  Loader2,
  User,
  Search,
  Brain,
  Sparkles,
  MessageSquare,
  Lightbulb,
  Database,
  Paperclip,
  X,
  FileImage,
  FileText,
  Settings,
  Cpu,
  Eye,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';
import { EnhancedRAGService } from '@/services/enhancedRAGService';
import { HybridAIService } from '@/services/hybridAIService';
import { MaterialAgent3DGenerationAPI } from '@/services/materialAgent3DGenerationAPI';

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  preview?: string;
}

interface MaterialResult {
  id: string;
  name: string;
  type?: string;
  description?: string;
  category?: string;
  properties?: Record<string, unknown>;
  relevanceScore?: number;
  source?: string;
}

interface MessageMetadata {
  taskId?: string;
  processingTime?: number | undefined;
  overallConfidence?: number | undefined;
  agentCount?: number | undefined;
  provider?: string;
  finalScore?: number | undefined;
  ragEnabled?: boolean | undefined;
  attachmentCount?: number | undefined;
  hybridAI?: boolean | undefined;
  attempts?: number | undefined;
  crewAI?: boolean | undefined;
  has3DContent?: boolean;
  designGeneration?: Record<string, unknown>;
}

interface APIResponse {
  success?: boolean;
  data?: Record<string, unknown>;
  error?: string;
  error_message?: string;
  coordinated_result?: {
    content?: string;
    analysis?: string;
    recommendations?: string[];
    materials?: MaterialResult[];
  };
  coordination_summary?: string;
  task_id?: string;
  total_processing_time_ms?: number;
  overall_confidence?: number;
  agent_executions?: Array<Record<string, unknown>>;
  response?: string;
  materials?: MaterialResult[];
}

interface HybridAIResponse {
  success: boolean;
  data?: string;
  provider?: string;
  final_score?: number;
  total_processing_time_ms?: number;
  attempts: Array<Record<string, unknown>>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  thinking?: string;
  suggestions?: string[];
  materials?: MaterialResult[];
  metadata?: MessageMetadata;
  attachments?: AttachedFile[];
}

interface HybridModelConfig {
  primary: 'openai' | 'claude' | 'vertex';
  fallback: 'openai' | 'claude' | 'vertex';
  temperature: number;
  maxTokens: number;
  useRAG: boolean;
  use3DGeneration: boolean;
  enableRAG: boolean;
  enable3DGeneration: boolean;
  useVisualSearch: boolean;
  enableVisualSearch: boolean;
}

interface RAGResults {
  knowledgeResults: Array<{
    id: string;
    title: string;
    content: string;
    relevanceScore: number;
    source: string;
  }>;
  materialResults: Array<{
    id: string;
    title: string;
    content: string;
    relevanceScore: number;
    source: string;
  }>;
  totalResults: number;
  searchTime: number;
}

interface EnhancedContext {
  previousMessages: Message[];
  userPreferences: {
    includeDesignSuggestions: boolean;
    includeMaterialProperties: boolean;
    includeApplicationExamples: boolean;
    use3DGeneration: boolean;
    useRAG: boolean;
    useVisualSearch: boolean;
  };
  hybridModelConfig: HybridModelConfig;
  attachments: {
    id: string;
    name: string;
    type: string;
    size: number;
    url?: string;
  }[];
  ragResults?: RAGResults;
  visualSearchResults?: VisualSearchResults;
  similaritySearchResults?: SimilaritySearchResults;
}

interface VisualSearchResults {
  searchId: string;
  matches: Array<{
    id: string;
    name: string;
    description?: string;
    similarity_score: number;
    llama_analysis?: Record<string, unknown>;
    visual_features?: Record<string, unknown>;
    thumbnail_url?: string;
  }>;
  search_execution_time_ms: number;
  total_results: number;
  query_analysis?: Record<string, unknown>;
}

interface SimilaritySearchResults {
  searchId: string;
  results: Array<{
    id: string;
    title: string;
    content: string;
    similarity_score: number;
    metadata?: Record<string, unknown>;
    document_type?: string;
    source?: string;
  }>;
  processing_time_ms: number;
  total_results: number;
  search_type: 'semantic' | 'vector' | 'hybrid';
  threshold_used: number;
}

interface MaterialAgentSearchInterfaceProps {
  onMaterialSelect?: (materialId: string) => void;
  onNavigateToMoodboard?: () => void;
  onNavigateTo3D?: () => void;
}

export const MaterialAgentSearchInterface: React.FC<MaterialAgentSearchInterfaceProps> = ({
  onMaterialSelect,
  onNavigateToMoodboard,
  onNavigateTo3D,
}) => {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [hybridConfig, setHybridConfig] = useState<HybridModelConfig>({
    primary: 'claude',
    fallback: 'openai',
    temperature: 0.7,
    maxTokens: 4000,
    useRAG: true,
    use3DGeneration: true,
    enableRAG: true,
    enable3DGeneration: true,
    useVisualSearch: true,
    enableVisualSearch: true,
  });
  const [searchMode, setSearchMode] = useState<'text' | 'visual' | 'hybrid' | 'similarity'>('text');
  const [visualSearchResults, setVisualSearchResults] = useState<VisualSearchResults | null>(null);
  const [similaritySearchResults, setSimilaritySearchResults] = useState<SimilaritySearchResults | null>(null);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initialize with welcome message
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "👋 Hello! I'm your AI material research assistant powered by Material Agent Orchestrator. I can help you:\n\n• Search and analyze materials from our PDF knowledge base\n• Find materials based on specific properties or applications\n• Generate design suggestions and 3D concepts\n• Cross-reference materials with projects and mood boards\n\nWhat would you like to explore today?",
      timestamp: new Date(),
      suggestions: [
        'Find sustainable materials for modern interiors',
        'Search for acoustic materials with high performance',
        'Show me trending colors and textures for 2024',
        'Find materials suitable for outdoor applications',
      ],
    }]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // File handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      // Validate file type and size
      const maxSize = 10 * 1024 * 1024; // 10MB
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];

      if (file.size > maxSize) {
        toast({
          title: 'File too large',
          description: `${file.name} is larger than 10MB`,
          variant: 'destructive',
        });
        return;
      }

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Unsupported file type',
          description: `${file.name} is not a supported file type`,
          variant: 'destructive',
        });
        return;
      }

      const newFile: AttachedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
      };

      // Generate preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          newFile.preview = e.target?.result as string;
          setAttachedFiles(prev => [...prev, newFile]);
        };
        reader.readAsDataURL(file);
      } else {
        setAttachedFiles(prev => [...prev, newFile]);
      }
    });

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachedFile = (fileId: string) => {
    setAttachedFiles(prev => {
      const fileToRemove = prev.find(f => f.id === fileId);
      if (fileToRemove?.url) {
        URL.revokeObjectURL(fileToRemove.url);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date(),
      ...(attachedFiles.length > 0 && { attachments: [...attachedFiles] }),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Check authentication
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Please sign in to use the AI assistant');
      }

      // Enhanced diagnostic logging
      console.log('=== Enhanced Material Agent Integration ===');
      console.log('1. File attachments:', attachedFiles.length > 0 ? `${attachedFiles.length} files attached` : 'No files');
      console.log('2. Hybrid model config:', hybridConfig);
      console.log('3. RAG enabled:', hybridConfig.useRAG);
      console.log('4. 3D generation enabled:', hybridConfig.use3DGeneration);
      console.log('5. Session context:', sessionId);
      console.log('6. User input:', { length: input.length, hasAttachments: attachedFiles.length > 0 });
      console.log('=====================================');

      // Prepare enhanced context with RAG integration
      const enhancedContext: EnhancedContext = {
        previousMessages: messages.slice(-5),
        userPreferences: {
          includeDesignSuggestions: true,
          includeMaterialProperties: true,
          includeApplicationExamples: true,
          use3DGeneration: hybridConfig.use3DGeneration,
          useRAG: hybridConfig.useRAG,
          useVisualSearch: hybridConfig.useVisualSearch,
        },
        hybridModelConfig: hybridConfig,
        attachments: attachedFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          url: file.url || '',
        })),
      };

      // If RAG is enabled, perform knowledge base search first
      let ragResults: RAGResults | null = null;
      if (hybridConfig.useRAG && input.trim()) {
        try {
          console.log('🧠 Performing RAG search...');
          const ragResponse = await EnhancedRAGService.search({
            query: input,
            context: {
              projectType: 'interior_design',
              roomType: 'general',
              materialCategories: ['all'],
            },
            searchType: 'hybrid',
            maxResults: 5,
            includeRealTime: false,
          });

          if (ragResponse.success && ragResponse.results) {
            ragResults = {
              knowledgeResults: (ragResponse.results.knowledgeBase || []).map(kb => ({
                id: kb.id,
                title: kb.title,
                content: kb.content.substring(0, 500) + '...', // Truncate for context
                relevanceScore: kb.relevanceScore,
                source: kb.source,
              })),
              materialResults: (ragResponse.results.materialKnowledge || []).map(mk => ({
                id: mk.materialId,
                title: mk.materialName,
                content: mk.extractedKnowledge,
                relevanceScore: mk.relevanceScore,
                source: 'material_knowledge',
              })),
              totalResults: (ragResponse.results.knowledgeBase || []).length + (ragResponse.results.materialKnowledge || []).length,
              searchTime: ragResponse.performance?.totalTime || 0,
            };
            console.log('✅ RAG search completed:', ragResults);
            enhancedContext.ragResults = ragResults;
          }
        } catch (ragError) {
          console.warn('⚠️ RAG search failed, continuing without:', ragError);
          // Continue without RAG results
        }
      }

      // If Visual Search is enabled and images are attached, perform visual search
      let visualSearchResults: VisualSearchResults | null = null;
      if (hybridConfig.useVisualSearch && attachedFiles.some(file => file.type.startsWith('image/'))) {
        try {
          console.log('👁️ Performing visual search...');
          const imageFiles = attachedFiles.filter(file => file.type.startsWith('image/'));
          
          for (const imageFile of imageFiles) {
            try {
              // Call the visual search API endpoint
              const apiService = BrowserApiIntegrationService.getInstance();
              const visualResponse = await apiService.callSupabaseFunction('visual-search', {
                user_id: session.user.id,
                search_type: input.trim() ? 'hybrid' : 'visual', // Hybrid if text + image, pure visual if just image
                query_text: input.trim() || 'Find similar materials',
                image_data: {
                  name: imageFile.name,
                  type: imageFile.type,
                  url: imageFile.url,
                  preview: imageFile.preview,
                },
                search_filters: {},
                similarity_threshold: 0.75,
                max_results: 20,
                session_id: sessionId,
              });

              // ✅ Handle standardized visual search response format
              if (visualResponse.success && visualResponse.data) {
                const responseData = visualResponse.data as any;

                // Handle both new standardized format and legacy format
                const matches = responseData.matches || responseData.results || [];
                const searchId = responseData.query_id || responseData.search_id || crypto.randomUUID();
                const executionTime = responseData.search_statistics?.search_time_ms || responseData.search_execution_time_ms || 0;

                if (matches.length > 0) {
                  visualSearchResults = {
                    searchId: searchId,
                    matches: matches.map((result: any) => ({
                      id: result.material_id || result.id || crypto.randomUUID(),
                      name: result.material_name || result.name || 'Unknown Material',
                      description: result.description || result.material_data?.description || 'No description available',
                      similarity_score: result.similarity_score || 0.8,
                      llama_analysis: result.llama_analysis || {},
                      visual_features: result.visual_features || {},
                      thumbnail_url: result.thumbnail_url || result.image_url || '',
                    })),
                    search_execution_time_ms: executionTime,
                    total_results: matches.length,
                    query_analysis: responseData.query_analysis || responseData.query_metadata || {},
                  };
                  console.log('✅ Visual search completed:', visualSearchResults);
                  enhancedContext.visualSearchResults = visualSearchResults || null;
                  setVisualSearchResults(visualSearchResults);
                  break; // Use first image for now
                }
              }
            } catch (imageError) {
              console.warn(`⚠️ Visual search failed for ${imageFile.name}:`, imageError);
            }
          }
        } catch (visualError) {
          console.warn('⚠️ Visual search failed, continuing without:', visualError);
        }
      }

      // If Similarity Search mode is enabled, perform vector similarity search
      let similaritySearchResults: SimilaritySearchResults | null = null;
      if (searchMode === 'similarity' && input.trim()) {
        try {
          console.log('🔍 Performing vector similarity search...');
          const apiService = BrowserApiIntegrationService.getInstance();
          const similarityResponse = await apiService.callSupabaseFunction('mivaa-gateway', {
            action: 'vector_similarity_search',
            payload: {
              query_text: input.trim(),
              similarity_threshold: similarityThreshold,
              limit: 20,
              include_metadata: true,
              search_type: 'semantic'
            }
          });

          if (similarityResponse.success && similarityResponse.data?.results) {
            similaritySearchResults = {
              searchId: crypto.randomUUID(),
              results: similarityResponse.data.results.map((result: any) => ({
                id: result.id || crypto.randomUUID(),
                title: result.title || result.name || 'Untitled',
                content: result.content || result.description || '',
                similarity_score: result.similarity_score || 0,
                metadata: result.metadata || {},
                document_type: result.document_type || 'material',
                source: result.source || 'vector_search'
              })),
              processing_time_ms: similarityResponse.data.processing_time_ms || 0,
              total_results: similarityResponse.data.results.length,
              search_type: 'semantic',
              threshold_used: similarityThreshold
            };
            console.log('✅ Vector similarity search completed:', similaritySearchResults);
            enhancedContext.similaritySearchResults = similaritySearchResults;
            setSimilaritySearchResults(similaritySearchResults);
          }
        } catch (similarityError) {
          console.warn('⚠️ Vector similarity search failed, continuing without:', similarityError);
        }
      }

      // Determine which AI service to use based on hybrid configuration
      let data: APIResponse | null = null;
      let error: string | null = null;

      if (hybridConfig.enableRAG && hybridConfig.primary && hybridConfig.fallback) {
        console.log('🔄 Using Hybrid AI Service...');
        try {
          // Use HybridAIService for enhanced AI processing
          const hybridResponse = await (HybridAIService as unknown as {
            processRequest: (params: Record<string, unknown>) => Promise<HybridAIResponse>;
          }).processRequest({
            prompt: input,
            model: hybridConfig.primary,
            type: 'general',
            maxRetries: 2,
            minimumScore: 0.7,
          });

          if (hybridResponse.success) {
            // Convert hybrid response to standard format
            data = {
              success: true,
              response: hybridResponse.data || 'Processed using hybrid AI models',
              coordination_summary: 'Processed using hybrid AI models with fallback support',
              coordinated_result: {
                content: hybridResponse.data || 'Processed using hybrid AI models',
                recommendations: [],
                materials: [],
              },
              task_id: crypto.randomUUID(),
              total_processing_time_ms: hybridResponse.total_processing_time_ms || 0,
              overall_confidence: hybridResponse.final_score || 0.7,
              agent_executions: hybridResponse.attempts || [],
            };
            error = null;
          } else {
            throw new Error('Hybrid AI failed: No successful response');
          }
        } catch (hybridError) {
          console.warn('⚠️ Hybrid AI failed, falling back to standard Material Agent:', hybridError);
          // Fallback to standard Material Agent
          const apiService = BrowserApiIntegrationService.getInstance();
          const response = await apiService.callSupabaseFunction('material-agent-orchestrator', {
            user_id: session.user.id,
            task_type: 'comprehensive_design',
            input_data: {
              query: input,
              sessionId: sessionId,
              context: enhancedContext,
              hybridConfig: hybridConfig,
              attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
            },
          });
          data = response.data as APIResponse;
          error = response.error?.message || null;
        }
      } else {
        console.log('🤖 Using standard Material Agent...');
        // Use standard Material Agent endpoint
        const apiService = BrowserApiIntegrationService.getInstance();
        const response = await apiService.callSupabaseFunction('material-agent-orchestrator', {
          user_id: session.user.id,
          task_type: 'comprehensive_design',
          input_data: {
            query: input,
            sessionId: sessionId,
            context: enhancedContext,
            hybridConfig: hybridConfig,
            attachments: attachedFiles.length > 0 ? attachedFiles : undefined,
          },
        });
        data = response.data as APIResponse;
        error = response.error?.message || null;
      }

      if (error) {
        console.error('Material Agent function error:', error);
        throw new Error(error || 'Failed to get AI response');
      }

      if (!data || !data.success) {
        throw new Error(data?.error_message || data?.error || 'AI processing failed');
      }

      // Transform Material Agent response to expected format
      const transformedData = {
        success: true,
        response: data.coordinated_result?.content || data.coordinated_result?.analysis || String(data.coordinated_result) || 'Analysis completed successfully',
        thinking: data.coordination_summary || 'Task processed through Material Agent coordination',
        suggestions: data.coordinated_result?.recommendations || [],
        materials: data.coordinated_result?.materials || [],
        metadata: {
          taskId: data.task_id,
          processingTime: data.total_processing_time_ms,
          overallConfidence: data.overall_confidence,
          agentCount: data.agent_executions?.length || 0,
          crewAI: true,
        },
      };

      console.log('Material Agent response:', transformedData);

      // Check if 3D generation is enabled and should be triggered
      let enhanced3DContent = null;
      if (hybridConfig.enable3DGeneration && data.response) {
        try {
          console.log('🎨 Attempting 3D generation...');
          // Check if the response contains design-related keywords that would benefit from 3D generation
          const designKeywords = ['interior', 'room', 'space', 'design', 'layout', 'furniture', 'decor'];
          const responseText = String(data.response || '');
          const containsDesignContent = designKeywords.some(keyword =>
            responseText.toLowerCase().includes(keyword),
          );

          if (containsDesignContent) {
            const generationResult = await MaterialAgent3DGenerationAPI.generate3D({
              prompt: input,
              room_type: 'general', // Could be extracted from context
              style: 'modern', // Could be made configurable
              specific_materials: [], // Could be extracted from attachments or context
            });

            if (generationResult.success) {
              enhanced3DContent = {
                generationId: generationResult.generation_id,
                imageUrls: generationResult.image_urls,
                parsedRequest: generationResult.parsed_request,
                matchedMaterials: generationResult.matched_materials,
                qualityAssessment: generationResult.quality_assessment,
                processingTime: generationResult.processing_time_ms,
              };
              console.log('✅ 3D generation completed:', enhanced3DContent);
            }
          }
        } catch (generationError) {
          console.warn('⚠️ 3D generation failed:', generationError);
          // Continue without 3D content
        }
      }

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: transformedData.response || 'I processed your request successfully.',
        timestamp: new Date(),
        thinking: String(transformedData.thinking || ''),
        suggestions: transformedData.suggestions || [],
        materials: transformedData.materials || [],
        metadata: {
          ...(transformedData.metadata?.taskId && { taskId: transformedData.metadata.taskId }),
          processingTime: transformedData.metadata?.processingTime,
          overallConfidence: transformedData.metadata?.overallConfidence,
          agentCount: transformedData.metadata?.agentCount,
          crewAI: transformedData.metadata?.crewAI,
          ...(enhanced3DContent && {
            has3DContent: true,
            designGeneration: enhanced3DContent,
          }),
        },
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Clear attached files after successful send
      setAttachedFiles([]);

      // Show success notification with additional info
      toast({
        title: 'AI Response Generated',
        description: `Found ${(data.coordinated_result?.materials || []).length} relevant materials`,
        duration: 3000,
      });

    } catch (error) {
      console.error('Error sending message:', error);

      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process request'}`,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);

      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get AI response',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleMaterialClick = (material: MaterialResult) => {
    if (onMaterialSelect && material.id) {
      onMaterialSelect(material.id);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            Material Agent Research Assistant
            <Badge className="ml-auto border border-border bg-background text-foreground">
              <Sparkles className="h-3 w-3 mr-1" />
              AI-Powered
            </Badge>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Messages */}
      <Card className="min-h-[500px] max-h-[600px] overflow-hidden">
        <CardContent className="p-0">
          <div className="h-[500px] overflow-y-auto p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`flex gap-3 max-w-[80%] ${
                    message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {message.role === 'user' ? (
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <User className="h-4 w-4 text-primary-foreground" />
                      </div>
                    ) : message.role === 'system' ? (
                      <div className="w-8 h-8 rounded-full bg-destructive flex items-center justify-center">
                        <MessageSquare className="h-4 w-4 text-destructive-foreground" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <Bot className="h-4 w-4 text-secondary-foreground" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div
                      className={`p-3 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.role === 'system'
                          ? 'bg-destructive/10 text-destructive border border-destructive/20'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.content}</p>

                      {message.thinking && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm opacity-70 flex items-center gap-1">
                            <Brain className="h-3 w-3" />
                            AI Thinking Process
                          </summary>
                          <div className="mt-2 p-2 bg-background/50 rounded text-sm">
                            {message.thinking}
                          </div>
                        </details>
                      )}
                    </div>

                    {/* Material Results */}
                    {message.materials && message.materials.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Database className="h-3 w-3" />
                          Found Materials ({message.materials.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {message.materials.slice(0, 4).map((material, idx) => (
                            <div
                              key={idx}
                              onClick={() => handleMaterialClick(material)}
                              className="p-2 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              <div className="font-medium text-sm">{material.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {material.description}
                              </div>
                              {material.category && (
                                <Badge className="mt-1 text-xs border border-border bg-background text-foreground">
                                  {material.category}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                        {message.materials.length > 4 && (
                          <div className="text-xs text-muted-foreground">
                            +{message.materials.length - 4} more materials found
                          </div>
                        )}
                      </div>
                    )}
                    {/* Visual Search Results */}
                    {visualSearchResults && visualSearchResults.matches.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Eye className="h-3 w-3" />
                          Visual Search Results ({visualSearchResults.total_results} found)
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {visualSearchResults.matches.slice(0, 6).map((match) => (
                            <div
                              key={match.id}
                              onClick={() => handleMaterialClick({
                                id: match.id,
                                name: match.name,
                                description: match.description || 'No description available',
                                relevanceScore: match.similarity_score,
                                source: 'visual_search'
                              })}
                              className="p-2 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              {match.thumbnail_url && (
                                <img 
                                  src={match.thumbnail_url} 
                                  alt={match.name}
                                  className="w-full h-16 object-cover rounded mb-1"
                                />
                              )}
                              <div className="font-medium text-sm">{match.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {match.description}
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <Badge className="text-xs border border-blue-200 bg-blue-50 text-blue-700">
                                  <Eye className="h-2 w-2 mr-1" />
                                  {Math.round(match.similarity_score * 100)}% visual match
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                        {visualSearchResults.matches.length > 6 && (
                          <div className="text-xs text-muted-foreground">
                            +{visualSearchResults.matches.length - 6} more visual matches found
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Visual search completed in {visualSearchResults.search_execution_time_ms}ms
                        </div>
                      </div>
                    )}

                    {/* Similarity Search Results */}
                    {similaritySearchResults && similaritySearchResults.results.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Search className="h-3 w-3" />
                          Vector Similarity Results ({similaritySearchResults.total_results} found, {(similaritySearchResults.threshold_used * 100).toFixed(0)}% threshold)
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {similaritySearchResults.results.slice(0, 5).map((result) => (
                            <div
                              key={result.id}
                              onClick={() => handleMaterialClick({
                                id: result.id,
                                name: result.title,
                                description: result.content,
                                relevanceScore: result.similarity_score,
                                source: 'similarity_search'
                              })}
                              className="p-3 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                            >
                              <div className="font-medium text-sm">{result.title}</div>
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                {result.content.substring(0, 150)}...
                              </div>
                              <div className="flex items-center justify-between mt-2">
                                <Badge className="text-xs border border-green-200 bg-green-50 text-green-700">
                                  <Search className="h-2 w-2 mr-1" />
                                  {Math.round(result.similarity_score * 100)}% similarity
                                </Badge>
                                {result.document_type && (
                                  <Badge variant="outline" className="text-xs">
                                    {result.document_type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {similaritySearchResults.results.length > 5 && (
                          <div className="text-xs text-muted-foreground">
                            +{similaritySearchResults.results.length - 5} more similarity matches found
                          </div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          Similarity search completed in {similaritySearchResults.processing_time_ms}ms using {similaritySearchResults.search_type} search
                        </div>
                      </div>
                    )}

                    {/* Suggestions */}
                    {message.suggestions && message.suggestions.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Lightbulb className="h-3 w-3" />
                          Suggestions
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {message.suggestions.map((suggestion, idx) => (
                            <Button
                              key={idx}


                              onClick={() => handleSuggestionClick(suggestion)}
                              className="text-xs h-7"
                            >
                              {suggestion}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <Bot className="h-4 w-4 text-secondary-foreground" />
                </div>
                <div className="bg-muted p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* File Attachments Display */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-muted rounded-md">
                {attachedFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 bg-background rounded px-2 py-1 text-sm">
                    {file.type.startsWith('image/') ? (
                      <FileImage className="h-3 w-3" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span className="truncate max-w-[120px]">{file.name}</span>
                    <Button
                      onClick={() => removeAttachedFile(file.id)}
                      className="h-4 w-4 p-0 bg-transparent hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Settings Panel */}
            {showSettings && (
              <div className="p-3 bg-muted rounded-md space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    AI Configuration
                  </h4>
                  <Button
                    onClick={() => setShowSettings(false)}
                    className="h-6 w-6 p-0 bg-transparent hover:bg-accent hover:text-accent-foreground"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-muted-foreground mb-1">Primary Model</label>
                    <select
                      value={hybridConfig.primary}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, primary: e.target.value as 'openai' | 'claude' | 'vertex' }))}
                      className="w-full p-1 rounded border bg-background"
                    >
                      <option value="openai">OpenAI GPT</option>
                      <option value="claude">Claude</option>
                      <option value="vertex">Vertex AI</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-muted-foreground mb-1">Fallback Model</label>
                    <select
                      value={hybridConfig.fallback}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, fallback: e.target.value as 'openai' | 'claude' | 'vertex' }))}
                      className="w-full p-1 rounded border bg-background"
                    >
                      <option value="openai">OpenAI GPT</option>
                      <option value="claude">Claude</option>
                      <option value="vertex">Vertex AI</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-muted-foreground mb-1">
                      Temperature: {hybridConfig.temperature}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={hybridConfig.temperature}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enable-rag"
                      checked={hybridConfig.enableRAG}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, enableRAG: e.target.checked }))}
                      className="rounded"
                    />
                    <label htmlFor="enable-rag" className="text-muted-foreground">
                      Enable Knowledge Base Search
                    </label>
                  </div>

                  <div className="col-span-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="enable-3d"
                      checked={hybridConfig.enable3DGeneration}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, enable3DGeneration: e.target.checked }))}
                      className="rounded"
                    />
                    <label htmlFor="enable-3d" className="text-muted-foreground">
                      Enable 3D Generation
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Search Mode Controls */}
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
              <span className="text-sm font-medium text-muted-foreground">Search Mode:</span>
              <div className="flex gap-1">
                <Button
                  variant={searchMode === 'text' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchMode('text')}
                >
                  Text
                </Button>
                <Button
                  variant={searchMode === 'visual' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchMode('visual')}
                >
                  Visual
                </Button>
                <Button
                  variant={searchMode === 'hybrid' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchMode('hybrid')}
                >
                  Hybrid
                </Button>
                <Button
                  variant={searchMode === 'similarity' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchMode('similarity')}
                >
                  Similarity
                </Button>
              </div>

              {/* Similarity Threshold Control */}
              {searchMode === 'similarity' && (
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-sm text-muted-foreground">Threshold:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="0.95"
                    step="0.05"
                    value={similarityThreshold}
                    onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-sm font-mono w-10">
                    {(similarityThreshold * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>

            {/* Input Row */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask me about materials, properties, applications, or design ideas..."
                disabled={isLoading}
                className="flex-1"
              />

              {/* File Attachment Button */}
              <Button
                type="button"


                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>

              {/* Settings Button */}
              <Button
                type="button"


                onClick={() => setShowSettings(!showSettings)}
                disabled={isLoading}
                title="AI Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>

              {/* Send Button */}
              <Button
                onClick={handleSendMessage}
                disabled={isLoading || !input.trim()}
                className="h-8 w-8 p-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.doc,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          <div className="flex justify-between items-center mt-3 text-xs text-muted-foreground">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>Session: {sessionId.substring(0, 8)}...</span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Button

          onClick={onNavigateToMoodboard}
          className="justify-start gap-2"
        >
          <Search className="h-4 w-4" />
          Browse Mood Boards
        </Button>
        <Button

          onClick={onNavigateTo3D}
          className="justify-start gap-2"
        >
          <Sparkles className="h-4 w-4" />
          3D Generation
        </Button>
        <Button

          onClick={() => handleSuggestionClick('Show me the latest material trends')}
          className="justify-start gap-2"
        >
          <Lightbulb className="h-4 w-4" />
          Material Trends
        </Button>
      </div>
    </div>
  );
};
