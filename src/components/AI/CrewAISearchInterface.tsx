import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ApiIntegrationService } from '@/services/apiGateway/apiIntegrationService';
import { EnhancedRAGService } from '@/services/enhancedRAGService';
import { HybridAIService } from '@/services/hybridAIService';
import { CrewAI3DGenerationAPI } from '@/services/crewai3DGenerationAPI';
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
  Upload,
  Settings,
  Cpu
} from 'lucide-react';

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  url?: string;
  preview?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  thinking?: string;
  suggestions?: string[];
  materials?: any[];
  metadata?: any;
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
}

interface CrewAISearchInterfaceProps {
  onMaterialSelect?: (materialId: string) => void;
  onNavigateToMoodboard?: () => void;
  onNavigateTo3D?: () => void;
}

export const CrewAISearchInterface: React.FC<CrewAISearchInterfaceProps> = ({
  onMaterialSelect,
  onNavigateToMoodboard,
  onNavigateTo3D
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
    enable3DGeneration: true
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Initialize with welcome message
    setMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "👋 Hello! I'm your AI material research assistant powered by CrewAI. I can help you:\n\n• Search and analyze materials from our PDF knowledge base\n• Find materials based on specific properties or applications\n• Generate design suggestions and 3D concepts\n• Cross-reference materials with projects and mood boards\n\nWhat would you like to explore today?",
      timestamp: new Date(),
      suggestions: [
        "Find sustainable materials for modern interiors",
        "Search for acoustic materials with high performance",
        "Show me trending colors and textures for 2024",
        "Find materials suitable for outdoor applications"
      ]
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
          title: "File too large",
          description: `${file.name} is larger than 10MB`,
          variant: "destructive",
        });
        return;
      }

      if (!allowedTypes.includes(file.type)) {
        toast({
          title: "Unsupported file type",
          description: `${file.name} is not a supported file type`,
          variant: "destructive",
        });
        return;
      }

      const newFile: AttachedFile = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type,
        size: file.size,
        url: URL.createObjectURL(file)
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
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
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
      console.log('=== Enhanced CrewAI Integration ===');
      console.log('1. File attachments:', attachedFiles.length > 0 ? `${attachedFiles.length} files attached` : 'No files');
      console.log('2. Hybrid model config:', hybridConfig);
      console.log('3. RAG enabled:', hybridConfig.useRAG);
      console.log('4. 3D generation enabled:', hybridConfig.use3DGeneration);
      console.log('5. Session context:', sessionId);
      console.log('6. User input:', { length: input.length, hasAttachments: attachedFiles.length > 0 });
      console.log('=====================================');

      // Prepare enhanced context with RAG integration
      let enhancedContext: EnhancedContext = {
        previousMessages: messages.slice(-5),
        userPreferences: {
          includeDesignSuggestions: true,
          includeMaterialProperties: true,
          includeApplicationExamples: true,
          use3DGeneration: hybridConfig.use3DGeneration,
          useRAG: hybridConfig.useRAG
        },
        hybridModelConfig: hybridConfig,
        attachments: attachedFiles.map(file => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          url: file.url
        }))
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
              materialCategories: ['all']
            },
            searchType: 'hybrid',
            maxResults: 5,
            includeRealTime: false
          });

          if (ragResponse.success && ragResponse.results) {
            ragResults = {
              knowledgeResults: (ragResponse.results.knowledgeBase || []).map(kb => ({
                id: kb.id,
                title: kb.title,
                content: kb.content.substring(0, 500) + '...', // Truncate for context
                relevanceScore: kb.relevanceScore,
                source: kb.source
              })),
              materialResults: (ragResponse.results.materialKnowledge || []).map(mk => ({
                id: mk.materialId,
                title: mk.materialName,
                content: mk.extractedKnowledge,
                relevanceScore: mk.relevanceScore,
                source: 'material_knowledge'
              })),
              totalResults: (ragResponse.results.knowledgeBase || []).length + (ragResponse.results.materialKnowledge || []).length,
              searchTime: ragResponse.performance?.totalTime || 0
            };
            console.log('✅ RAG search completed:', ragResults);
            enhancedContext.ragResults = ragResults;
          }
        } catch (ragError) {
          console.warn('⚠️ RAG search failed, continuing without:', ragError);
          // Continue without RAG results
        }
      }

      // Determine which AI service to use based on hybrid configuration
      let data: any, error: any;
      
      if (hybridConfig.enableRAG && hybridConfig.primary && hybridConfig.fallback) {
        console.log('🔄 Using Hybrid AI Service...');
        try {
          // Use HybridAIService for enhanced AI processing
          const hybridResponse = await (HybridAIService as any).processRequest({
            prompt: input,
            model: hybridConfig.primary,
            type: 'general',
            maxRetries: 2,
            minimumScore: 0.7
          });

          if (hybridResponse.success) {
            // Convert hybrid response to standard format
            data = {
              success: true,
              response: hybridResponse.data || 'Processed using hybrid AI models',
              thinking: 'Processed using hybrid AI models with fallback support',
              suggestions: [], // Could be enhanced based on hybrid response
              materials: [], // Could be enhanced based on hybrid response
              metadata: {
                provider: hybridResponse.provider,
                finalScore: hybridResponse.final_score,
                processingTime: hybridResponse.total_processing_time_ms,
                ragEnabled: !!ragResults,
                attachmentCount: attachedFiles.length,
                hybridAI: true,
                attempts: hybridResponse.attempts.length
              }
            };
            error = null;
          } else {
            throw new Error(`Hybrid AI failed: No successful response`);
          }
        } catch (hybridError) {
          console.warn('⚠️ Hybrid AI failed, falling back to standard CrewAI:', hybridError);
          // Fallback to standard CrewAI
          const apiService = ApiIntegrationService.getInstance();
          const response = await apiService.executeSupabaseFunction('enhanced-crewai', {
            user_id: session.user.id,
            task_type: 'comprehensive_design',
            input_data: {
              query: input,
              sessionId: sessionId,
              context: enhancedContext,
              hybridConfig: hybridConfig,
              attachments: attachedFiles.length > 0 ? attachedFiles : undefined
            }
          });
          data = response.data;
          error = response.error;
        }
      } else {
        console.log('🤖 Using standard CrewAI...');
        // Use standard CrewAI endpoint
        const apiService = ApiIntegrationService.getInstance();
        const response = await apiService.executeSupabaseFunction('enhanced-crewai', {
          user_id: session.user.id,
          task_type: 'comprehensive_design',
          input_data: {
            query: input,
            sessionId: sessionId,
            context: enhancedContext,
            hybridConfig: hybridConfig,
            attachments: attachedFiles.length > 0 ? attachedFiles : undefined
          }
        });
        data = response.data;
        error = response.error;
      }

      if (error) {
        console.error('CrewAI function error:', error);
        throw new Error(error.message || 'Failed to get AI response');
      }

      if (!data || !data.success) {
        throw new Error(data?.error_message || data?.error || 'AI processing failed');
      }

      // Transform CrewAI response to expected format
      const transformedData = {
        success: true,
        response: data.coordinated_result?.content || data.coordinated_result?.analysis || data.coordinated_result || 'Analysis completed successfully',
        thinking: data.coordination_summary || 'Task processed through CrewAI agent coordination',
        suggestions: data.coordinated_result?.recommendations || [],
        materials: data.coordinated_result?.materials || [],
        metadata: {
          taskId: data.task_id,
          processingTime: data.total_processing_time_ms,
          overallConfidence: data.overall_confidence,
          agentCount: data.agent_executions?.length || 0,
          crewAI: true
        }
      };

      console.log('CrewAI response:', transformedData);

      // Check if 3D generation is enabled and should be triggered
      let enhanced3DContent = null;
      if (hybridConfig.enable3DGeneration && data.response) {
        try {
          console.log('🎨 Attempting 3D generation...');
          // Check if the response contains design-related keywords that would benefit from 3D generation
          const designKeywords = ['interior', 'room', 'space', 'design', 'layout', 'furniture', 'decor'];
          const containsDesignContent = designKeywords.some(keyword =>
            data.response.toLowerCase().includes(keyword)
          );

          if (containsDesignContent) {
            const generationResult = await CrewAI3DGenerationAPI.generate3D({
              prompt: input,
              room_type: 'general', // Could be extracted from context
              style: 'modern', // Could be made configurable
              specific_materials: [] // Could be extracted from attachments or context
            });

            if (generationResult.success) {
              enhanced3DContent = {
                generationId: generationResult.generation_id,
                imageUrls: generationResult.image_urls,
                parsedRequest: generationResult.parsed_request,
                matchedMaterials: generationResult.matched_materials,
                qualityAssessment: generationResult.quality_assessment,
                processingTime: generationResult.processing_time_ms
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
        thinking: transformedData.thinking,
        suggestions: transformedData.suggestions || [],
        materials: transformedData.materials || [],
        metadata: {
          ...transformedData.metadata,
          ...(enhanced3DContent && {
            has3DContent: true,
            designGeneration: enhanced3DContent
          })
        }
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Clear attached files after successful send
      setAttachedFiles([]);

      // Show success notification with additional info
      toast({
        title: "AI Response Generated",
        description: `Found ${data.materials?.length || 0} relevant materials`,
        duration: 3000,
      });

    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'system',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Failed to process request'}`,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);

      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const handleMaterialClick = (material: any) => {
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
            CrewAI Material Research Assistant
            <Badge variant="outline" className="ml-auto">
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
                                <Badge variant="outline" className="mt-1 text-xs">
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
                              variant="outline"
                              size="sm"
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
                      variant="ghost"
                      size="sm"
                      onClick={() => removeAttachedFile(file.id)}
                      className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
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
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSettings(false)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-muted-foreground mb-1">Primary Model</label>
                    <select
                      value={hybridConfig.primary}
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, primary: e.target.value as any }))}
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
                      onChange={(e) => setHybridConfig(prev => ({ ...prev, fallback: e.target.value as any }))}
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

            {/* Input Row */}
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me about materials, properties, applications, or design ideas..."
                disabled={isLoading}
                className="flex-1"
              />
              
              {/* File Attachment Button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                title="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              
              {/* Settings Button */}
              <Button
                type="button"
                variant="outline"
                size="icon"
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
                size="icon"
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
          variant="outline"
          onClick={onNavigateToMoodboard}
          className="justify-start gap-2"
        >
          <Search className="h-4 w-4" />
          Browse Mood Boards
        </Button>
        <Button
          variant="outline"
          onClick={onNavigateTo3D}
          className="justify-start gap-2"
        >
          <Sparkles className="h-4 w-4" />
          3D Generation
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSuggestionClick("Show me the latest material trends")}
          className="justify-start gap-2"
        >
          <Lightbulb className="h-4 w-4" />
          Material Trends
        </Button>
      </div>
    </div>
  );
};