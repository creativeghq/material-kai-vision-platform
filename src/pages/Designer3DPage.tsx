/**
 * 3D Room Designer Page
 * Standalone page for AI-powered 3D interior design generation
 *
 * This page uses DIRECT API calls to Replicate/Hugging Face.
 * It does NOT use the agent system (agents run on Supabase and have timeouts).
 */

import React, { useState } from 'react';
import { Cube, Sparkles, Loader2, Download, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { designer3DService } from '@/services/designer3DService';

const roomTypes = [
  { value: 'living_room', label: 'Living Room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'dining_room', label: 'Dining Room' },
  { value: 'office', label: 'Office' },
  { value: 'general', label: 'General' },
];

const styles = [
  { value: 'modern', label: 'Modern' },
  { value: 'contemporary', label: 'Contemporary' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'scandinavian', label: 'Scandinavian' },
  { value: 'traditional', label: 'Traditional' },
  { value: 'rustic', label: 'Rustic' },
  { value: 'bohemian', label: 'Bohemian' },
];

export const Designer3DPage: React.FC = () => {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [roomType, setRoomType] = useState('living_room');
  const [style, setStyle] = useState('modern');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<any>(null);
  const [generationProgress, setGenerationProgress] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt Required',
        description: 'Please enter a description for your design',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    setGenerationProgress('Initializing...');

    try {
      setGenerationProgress('Generating design with AI...');

      // Use standalone service (NOT agent-based)
      const result = await designer3DService.generateDesign({
        prompt: prompt.trim(),
        room_type: roomType,
        style: style,
        width: 768,
        height: 768,
      });

      if (result.success) {
        setGenerationResult({
          image_urls: result.image_urls,
          generation_id: result.generation_id,
          enhanced_prompt: result.enhanced_prompt,
          processing_time_ms: result.processing_time_ms,
        });

        setGenerationProgress('');

        toast({
          title: 'Design Generated!',
          description: `Created in ${(result.processing_time_ms / 1000).toFixed(1)}s`,
        });
      } else {
        throw new Error(result.error || 'Generation failed');
      }
    } catch (error) {
      console.error('Generation error:', error);
      setGenerationProgress('');

      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate 3D design. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setPrompt('');
    setRoomType('living_room');
    setStyle('modern');
    setGenerationResult(null);
    setGenerationProgress('');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b">
        <div className="page-container py-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Cube className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">3D Room Designer</h1>
              <p className="text-muted-foreground">
                Standalone AI-powered interior design generation
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container py-8">
        {/* Info Alert */}
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            This designer uses <strong>direct API calls</strong> to Replicate/Hugging Face for image generation.
            It does NOT use the agent system and can handle longer processing times.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Controls */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  Design Parameters
                </CardTitle>
                <CardDescription>
                  Describe your ideal interior design
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">Design Description</Label>
                  <Input
                    id="prompt"
                    placeholder="e.g., A cozy living room with warm lighting..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="roomType">Room Type</Label>
                  <Select value={roomType} onValueChange={setRoomType} disabled={isGenerating}>
                    <SelectTrigger id="roomType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="style">Design Style</Label>
                  <Select value={style} onValueChange={setStyle} disabled={isGenerating}>
                    <SelectTrigger id="style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {styles.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className="flex-1"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {generationProgress || 'Generating...'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate Design
                      </>
                    )}
                  </Button>
                  {generationResult && (
                    <Button
                      onClick={handleReset}
                      variant="outline"
                      disabled={isGenerating}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {isGenerating && (
                  <div className="mt-4 p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground text-center">
                      ⏳ This may take 30-60 seconds...
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-2">
            {generationResult ? (
              <Card>
                <CardHeader>
                  <CardTitle>Generated Design</CardTitle>
                  <CardDescription>
                    Processing time: {(generationResult.processing_time_ms / 1000).toFixed(1)}s
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Image Gallery */}
                  <div className="grid grid-cols-1 gap-4">
                    {generationResult.image_urls.map((url: string, index: number) => (
                      <div key={index} className="relative group">
                        <img
                          src={url}
                          alt={`Generated design ${index + 1}`}
                          className="w-full rounded-lg shadow-lg"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = url;
                            link.download = `design-${Date.now()}.png`;
                            link.click();
                          }}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>

                  {/* Enhanced Prompt */}
                  {generationResult.enhanced_prompt && (
                    <div className="p-4 bg-muted rounded-lg">
                      <h4 className="text-sm font-semibold mb-2">Enhanced Prompt</h4>
                      <p className="text-sm text-muted-foreground">
                        {generationResult.enhanced_prompt}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card className="h-full min-h-[600px] flex items-center justify-center">
                <CardContent className="text-center space-y-4">
                  <div className="mx-auto w-20 h-20 bg-muted rounded-full flex items-center justify-center">
                    <Cube className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">No Design Yet</h3>
                    <p className="text-muted-foreground max-w-md">
                      Enter a description and click "Generate Design" to create your AI-powered
                      3D interior design visualization using direct API calls.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Designer3DPage;

