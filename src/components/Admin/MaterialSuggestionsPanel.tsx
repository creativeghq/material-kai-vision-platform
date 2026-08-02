import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Settings,
  Brain,
  FileText,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
// Removed direct Supabase client - using Edge Functions instead
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

import { GlobalAdminHeader } from './GlobalAdminHeader';

interface MaterialSuggestion {
  name: string;
  category: string;
  confidence: number;
  source: 'pdf_knowledge' | 'catalog' | 'ai_generated';
  properties?: Record<string, unknown>;
}

interface SuggestionConfig {
  roomType: string;
  style: string;
  prompt: string;
  includeProperties: boolean;
  maxSuggestions: number;
  confidenceThreshold: number;
}

export const MaterialSuggestionsPanel: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [config, setConfig] = useState<SuggestionConfig>({
    roomType: 'living_room',
    style: 'modern',
    prompt: '',
    includeProperties: true,
    maxSuggestions: 8,
    confidenceThreshold: 0.7,
  });

  const [suggestions, setSuggestions] = useState<MaterialSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // 3D integration tests live at /agent-hub, not here.
  const { toast } = useToast();

  const generateSuggestions = useCallback(async () => {
    if (!config.prompt.trim()) {
      toast({
        title: 'Prompt Required',
        description: 'Please enter a prompt for material suggestions',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Call enhanced RAG search for material suggestions
      const apiService = BrowserApiIntegrationService.getInstance();
      const result = await apiService.callSupabaseFunction(
        'enhanced-rag-search',
        {
          query: `${config.roomType} ${config.style} ${config.prompt}`,
          action: 'material_suggestions',
          searchType: 'hybrid',
          maxResults: config.maxSuggestions,
          context: {
            roomType: config.roomType,
            style: config.style,
            purpose: '3d_generation',
          },
        },
      );

      if (!result.success) {
        throw new Error(
          result.error?.message || 'Failed to generate suggestions',
        );
      }

      const data = result.data;

      // Process and format suggestions
      const formattedSuggestions: MaterialSuggestion[] = [];

      // From PDF knowledge base
      if (data.results?.knowledgeBase) {
        data.results.knowledgeBase.forEach((item: Record<string, unknown>) => {
          const metadata = item.metadata as any;
          if (
            metadata?.material_categories &&
            Array.isArray(metadata.material_categories)
          ) {
            metadata.material_categories.forEach((category: string) => {
              formattedSuggestions.push({
                name: category,
                category: (metadata.content_type as string) || 'pdf_content',
                confidence: (item.confidence as number) || 0.8,
                source: 'pdf_knowledge',
                properties: metadata as Record<string, unknown>,
              });
            });
          }
        });
      }

      // From materials catalog
      if (data.results?.materials) {
        data.results.materials.forEach((item: Record<string, unknown>) => {
          formattedSuggestions.push({
            name: (item.title as string) || '',
            category: (item.category as string) || 'material',
            confidence: (item.confidence as number) || 0.7,
            source: 'catalog',
            properties: (item.properties as Record<string, unknown>) || {},
          });
        });
      }

      // Filter by confidence and deduplicate
      const uniqueSuggestions = formattedSuggestions
        .filter((s) => s.confidence >= config.confidenceThreshold)
        .filter(
          (suggestion, index, self) =>
            index ===
            self.findIndex(
              (s) => s.name.toLowerCase() === suggestion.name.toLowerCase(),
            ),
        )
        .slice(0, config.maxSuggestions);

      setSuggestions(uniqueSuggestions);

      toast({
        title: 'Suggestions Generated',
        description: `Found ${uniqueSuggestions.length} material suggestions from PDF knowledge base`,
      });
    } catch (error) {
      console.error('Error generating suggestions:', error);
      toast({
        title: 'Generation Failed',
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [config, toast]);

  // 3D generation is handled by MaterialAgent3DGenerationAPI on the frontend;
  // use /agent-hub to test 3D generation with material suggestions.

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'pdf_knowledge':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'catalog':
        return <Settings className="h-4 w-4 text-green-500" />;
      default:
        return <Brain className="h-4 w-4 text-purple-500" />;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'bg-green-500';
    if (confidence >= 0.7) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && (
        <GlobalAdminHeader
          title="3D Material Suggestions"
          description="AI-powered material suggestions for 3D design and visualization"
          breadcrumbs={[
            { label: 'Admin', path: '/admin' },
            { label: '3D Suggestions' },
          ]}
        />
      )}
      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              3D Material Suggestions Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="roomType">Room Type</Label>
                <Select
                  value={config.roomType}
                  onValueChange={(value: string) =>
                    setConfig((prev) => ({ ...prev, roomType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="living_room">Living Room</SelectItem>
                    <SelectItem value="kitchen">Kitchen</SelectItem>
                    <SelectItem value="bathroom">Bathroom</SelectItem>
                    <SelectItem value="bedroom">Bedroom</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="commercial">Commercial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="style">Style</Label>
                <Select
                  value={config.style}
                  onValueChange={(value: string) =>
                    setConfig((prev) => ({ ...prev, style: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modern">Modern</SelectItem>
                    <SelectItem value="traditional">Traditional</SelectItem>
                    <SelectItem value="industrial">Industrial</SelectItem>
                    <SelectItem value="minimalist">Minimalist</SelectItem>
                    <SelectItem value="rustic">Rustic</SelectItem>
                    <SelectItem value="contemporary">Contemporary</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prompt">Design Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Describe your design requirements... e.g., 'Sustainable kitchen with fire-resistant surfaces'"
                value={config.prompt}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, prompt: e.target.value }))
                }
                className="min-h-20"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxSuggestions">Max Suggestions</Label>
                <Input
                  id="maxSuggestions"
                  type="number"
                  min="1"
                  max="20"
                  value={config.maxSuggestions}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      maxSuggestions: parseInt(e.target.value),
                    }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="threshold">Confidence Threshold</Label>
                <Input
                  id="threshold"
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={config.confidenceThreshold}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      confidenceThreshold: parseFloat(e.target.value),
                    }))
                  }
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={generateSuggestions}
                onKeyDown={(e) => e.key === 'Enter' && generateSuggestions()}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="h-4 w-4" />
                )}
                Generate Suggestions
              </Button>

              {/* Test 3D Integration button removed - use /agent-hub instead */}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="suggestions" className="space-y-4">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="suggestions">
              Material Suggestions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="suggestions">
            <Card>
              <CardHeader>
                <CardTitle>
                  Generated Material Suggestions ({suggestions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {suggestions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No suggestions generated yet. Configure settings and click
                    "Generate Suggestions".
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 border rounded"
                      >
                        <div className="flex items-center gap-3">
                          {getSourceIcon(suggestion.source)}
                          <div>
                            <div className="font-medium">{suggestion.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {suggestion.category}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <div
                              className={`w-2 h-2 rounded-full ${getConfidenceColor(suggestion.confidence)}`}
                            />
                            <span className="text-sm">
                              {(suggestion.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground capitalize">
                            {suggestion.source}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
