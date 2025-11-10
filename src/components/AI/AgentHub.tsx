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
  Sparkles,
  ChevronDown,
  MessageSquare,
  Clock,
  User,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';

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
    available: false, // Not yet implemented
  },
  {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Data analysis and insights',
    icon: BarChart3,
    color: 'text-green-500',
    requiredRole: 'admin',
    available: false,
  },
  {
    id: 'business',
    name: 'Business Agent',
    description: 'Business intelligence',
    icon: Briefcase,
    color: 'text-orange-500',
    requiredRole: 'admin',
    available: false,
  },
  {
    id: 'product',
    name: 'Product Agent',
    description: 'Product management',
    icon: Package,
    color: 'text-pink-500',
    requiredRole: 'admin',
    available: false,
  },
  {
    id: 'admin',
    name: 'Admin Agent',
    description: 'System administration',
    icon: Settings,
    color: 'text-red-500',
    requiredRole: 'owner',
    available: false,
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
}

interface AgentHubProps {
  userRole?: 'viewer' | 'member' | 'admin' | 'owner';
  onMaterialSelect?: (materialId: string) => void;
}

export const AgentHub: React.FC<AgentHubProps> = ({
  userRole = 'member',
  onMaterialSelect,
}) => {
  const [selectedAgent, setSelectedAgent] = useState<string>('search');
  const [selectedModel, setSelectedModel] = useState<string>('anthropic/claude-sonnet-4-20250514');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Get current user session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('User not authenticated');

      // Call Supabase Edge Function for agent execution
      const { data, error } = await supabase.functions.invoke('agent-chat', {
        body: {
          messages: messages.concat({
            id: `msg-${Date.now()}`,
            role: 'user',
            content: input,
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

      // Add assistant response to messages
      const assistantMessage: Message = {
        id: `msg-${Date.now()}-response`,
        role: 'assistant',
        content: data.text || 'No response from agent',
        timestamp: new Date(),
        agentId: data.agentId || selectedAgent,
        model: data.model || selectedModel,
      };

      setMessages((prev) => [...prev, assistantMessage]);
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
  }, [input, selectedAgent, selectedModel, userRole, attachedImages]);

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
    setIsRecording(!isRecording);
    // TODO: Implement voice recording with Web Speech API
    console.log('Voice input not yet implemented');
  }, [isRecording]);

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent);
  const AgentIcon = currentAgent?.icon || Bot;

  return (
    <div className="h-[calc(100vh-12rem)] flex gap-6">
      {/* Chat Sidebar */}
      <div className="w-80 flex flex-col gap-4">
        {/* Agent Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Select Agent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedAgent} onValueChange={setSelectedAgent}>
              <SelectTrigger>
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
            <p className="text-sm text-muted-foreground mt-2">
              {currentAgent?.description}
            </p>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              AI Model
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
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
          </CardContent>
        </Card>

        {/* Recent Conversations */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 overflow-y-auto">
            <div className="text-sm text-muted-foreground text-center py-4">
              No recent conversations
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AgentIcon className={`h-6 w-6 ${currentAgent?.color}`} />
              <div>
                <CardTitle>{currentAgent?.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {currentAgent?.description}
                </p>
              </div>
            </div>
            <Badge variant="outline">{selectedModel}</Badge>
          </div>
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-4">
                <AgentIcon className={`h-16 w-16 mx-auto ${currentAgent?.color}`} />
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
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  </div>
                )}
                <div
                  className={`max-w-[70%] rounded-lg p-4 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className="text-xs opacity-70 mt-2">
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input Area */}
        <div className="border-t p-4">
          {attachedImages.length > 0 && (
            <div className="flex gap-2 mb-2">
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
          )}
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleVoiceInput}
              className={isRecording ? 'bg-red-500 text-white' : ''}
            >
              <Mic className="h-4 w-4" />
            </Button>
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
              className="flex-1 min-h-[60px] max-h-[120px]"
            />
            <Button
              onClick={handleSendMessage}
              disabled={isLoading || (!input.trim() && attachedImages.length === 0)}
              size="icon"
              className="h-[60px]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

