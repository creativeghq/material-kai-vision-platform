import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  Database
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  thinking?: string;
  suggestions?: string[];
  materials?: any[];
  metadata?: any;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input,
      timestamp: new Date()
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

      console.log('Sending request to enhanced-crewai function...');

      const { data, error } = await supabase.functions.invoke('enhanced-crewai', {
        body: {
          query: input,
          sessionId: sessionId,
          context: {
            previousMessages: messages.slice(-5), // Last 5 messages for context
            userPreferences: {
              includeDesignSuggestions: true,
              includeMaterialProperties: true,
              includeApplicationExamples: true
            }
          }
        }
      });

      if (error) {
        console.error('CrewAI function error:', error);
        throw new Error(error.message || 'Failed to get AI response');
      }

      if (!data.success) {
        throw new Error(data.error || 'AI processing failed');
      }

      console.log('CrewAI response:', data);

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response || 'I processed your request successfully.',
        timestamp: new Date(),
        thinking: data.thinking,
        suggestions: data.suggestions || [],
        materials: data.materials || [],
        metadata: data.metadata
      };

      setMessages(prev => [...prev, assistantMessage]);

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
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me about materials, properties, applications, or design ideas..."
              disabled={isLoading}
              className="flex-1"
            />
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