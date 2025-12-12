/**
 * 3D Room Designer Page
 * Standalone page for AI-powered 3D interior design generation
 */

import React, { useState } from 'react';
import { Cube, Sparkles, Loader2, Download, RefreshCw } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { MaterialAgent3DGenerationAPI } from '@/services/materialAgent3DGenerationAPI';
import { DesignCanvas } from '@/components/AI/DesignCanvas';

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
    try {
      const result = await MaterialAgent3DGenerationAPI.generate3D({
        prompt: prompt.trim(),
        room_type: roomType,
        style: style,
        specific_materials: [],
      });

      if (result.success) {
        setGenerationResult(result);
        toast({
          title: 'Design Generated!',
          description: 'Your 3D interior design has been created successfully.',
        });
      } else {
        throw new Error('Generation failed');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to generate 3D design. Please try again.',
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
                AI-powered interior design generation with material matching
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="page-container py-8">
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
                        Generating...
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
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-2">
            {generationResult ? (
              <DesignCanvas
                images={generationResult.image_urls}
                parsedRequest={generationResult.parsed_request}
                matchedMaterials={generationResult.matched_materials}
                qualityAssessment={generationResult.quality_assessment}
                processingTimeMs={generationResult.processing_time_ms}
              />
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
                      3D interior design visualization.
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

