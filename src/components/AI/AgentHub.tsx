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
];

// AI Models available (format: provider/model-name for Mastra)
const AI_MODELS = [
  { id: 'anthropic/claude-sonnet-4-20250514', name: 'Claude Sonnet 4.5', provider: 'anthropic' },
  { id: 'anthropic/claude-haiku-4-20250514', name: 'Claude Haiku 4.5', provider: 'anthropic' },
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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

      // Call Supabase Edge Function for agent execution
      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: {
          messages: messages.concat({
            id: `msg-${Date.now()}`,
            role: 'user',
            content: userInput,
            timestamp: new Date(),
          }),
          agentId: selectedAgent,
          model: selectedModel,
          images: attachedImages,
        },
      });

      if (error) {
        throw new Error(error.message || 'Agent execution failed');
      }

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
            } else if (command === '3d_design') {
              const designData = await import('@/data/demo/3d-design.json');
              demoData = { type: '3d_design', data: designData.default.design, message: 'Modern living room 3D design' };
            }
          }
        } catch (e) {
          console.error('Error parsing demo data:', e);
        }
      }

      // Parse material data from agent responses (for Search Agent, etc.)
      let materialData = undefined;
      if (data.materialResults) {
        // Agent returned structured material data
        materialData = {
          products: data.materialResults.products || [],
          images: data.materialResults.images || {},
          title: data.materialResults.title || 'Material Results',
        };
      } else if (data.text && data.text.includes('MATERIAL_DATA:')) {
        // Parse embedded material data from response text
        try {
          const materialDataMatch = data.text.match(/MATERIAL_DATA:\s*(\{[\s\S]*?\})\s*$/m);
          if (materialDataMatch) {
            const parsedData = JSON.parse(materialDataMatch[1]);
            materialData = {
              products: parsedData.products || [],
              images: parsedData.images || {},
              title: parsedData.title || 'Material Results',
            };
          }
        } catch (e) {
          console.error('Error parsing material data:', e);
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
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message to database
      if (conversationId) {
        await agentChatHistoryService.saveMessage({
          conversationId,
          role: 'assistant',
          content: data.text || 'No response from agent',
          metadata: {
            agentId: data.agentId || selectedAgent,
            model: data.model || selectedModel,
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
        }))
      );
    },
    []
  );

  const handleNewConversation = useCallback(() => {
    setCurrentConversationId(null);
    setMessages([]);
  }, []);

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
      <div
        className="w-80 flex flex-col m-4 rounded-3xl"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
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
                <button
                  key={convo.id}
                  onClick={() => handleLoadConversation(convo.id)}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                    currentConversationId === convo.id
                      ? 'bg-primary/10 border-l-2 border-primary'
                      : 'hover:bg-accent'
                  }`}
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
                </button>
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
        <div
          className="min-h-16 px-6 py-3 flex items-center justify-between m-4 rounded-3xl"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
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

              {/* Model Selection */}
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Model:</label>
                <Select value={selectedModel} onValueChange={setSelectedModel}>
                  <SelectTrigger className="w-[200px] h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_MODELS.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
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
                          backgroundColor: 'var(--mocha-color)',
                          borderColor: 'var(--mocha-color)'
                        }}
                      >
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  )}
                  <div
                    className={`${message.demoData || message.materialData ? 'max-w-full' : 'max-w-[70%]'} rounded-lg p-4 border-2 ${
                      message.role === 'user'
                        ? 'bg-white text-gray-900'
                        : 'bg-white text-gray-900'
                    }`}
                    style={{
                      borderColor: message.role === 'user' ? '#1f2937' : 'var(--mocha-color)'
                    }}
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
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                    <p className="text-xs opacity-70 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
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
                        backgroundColor: 'var(--mocha-color)',
                        borderColor: 'var(--mocha-color)'
                      }}
                    >
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div
                    className="max-w-[70%] rounded-lg p-4 border-2 bg-white"
                    style={{ borderColor: 'var(--mocha-color)' }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                      <span className="text-sm text-gray-600">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div
          className="m-4 rounded-3xl"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
            boxShadow: 'var(--glass-shadow)',
          }}
        >
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
    </div>
  );
};

