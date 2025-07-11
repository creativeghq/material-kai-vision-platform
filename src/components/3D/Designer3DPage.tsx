import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThreeJsViewer } from './ThreeJsViewer';
import { CrewAI3DGenerationAPI } from '@/services/crewai3DGenerationAPI';
import { toast } from '@/hooks/use-toast';
import { Loader2, Wand2, Download, Share2 } from 'lucide-react';

export const Designer3DPage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [roomType, setRoomType] = useState('');
  const [style, setStyle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [generationData, setGenerationData] = useState<any>(null);

  const roomTypes = [
    'living room', 'kitchen', 'bedroom', 'bathroom', 'dining room',
    'office', 'study', 'library', 'hallway', 'balcony'
  ];

  const styles = [
    'modern', 'contemporary', 'minimalist', 'scandinavian', 'industrial',
    'mid-century', 'traditional', 'rustic', 'mediterranean', 'art-deco'
  ];

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt Required',
        description: 'Please enter a design prompt to generate your 3D interior.',
        variant: 'destructive'
      });
      return;
    }

    setIsGenerating(true);
    try {
      const result = await CrewAI3DGenerationAPI.generate3D({
        prompt,
        room_type: roomType || undefined,
        style: style || undefined
      });

      setGeneratedImage(result.image_url);
      setGenerationData(result);
      
      toast({
        title: '3D Design Generated!',
        description: `Your interior design was created in ${(result.processing_time_ms / 1000).toFixed(1)}s`,
        variant: 'default'
      });
    } catch (error) {
      console.error('Generation failed:', error);
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate 3D design',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `3d-design-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">3D Interior Designer</h1>
        <p className="text-muted-foreground mt-2">
          Generate photorealistic interior designs using AI-powered Canopus Architecture model
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5" />
              Design Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="prompt">Design Prompt</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your ideal interior design... (e.g., 'A modern living room with oak furniture, marble accents, and warm lighting')"
                rows={4}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="room-type">Room Type (Optional)</Label>
                <Select value={roomType} onValueChange={setRoomType}>
                  <SelectTrigger id="room-type" className="mt-1">
                    <SelectValue placeholder="Select room type" />
                  </SelectTrigger>
                  <SelectContent>
                    {roomTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="style">Style (Optional)</Label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger id="style" className="mt-1">
                    <SelectValue placeholder="Select style" />
                  </SelectTrigger>
                  <SelectContent>
                    {styles.map(styleOption => (
                      <SelectItem key={styleOption} value={styleOption}>
                        {styleOption.charAt(0).toUpperCase() + styleOption.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating Design...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4 mr-2" />
                  Generate 3D Design
                </>
              )}
            </Button>

            {generatedImage && (
              <div className="flex gap-2">
                <Button onClick={handleDownload} variant="outline" className="flex-1">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button variant="outline" className="flex-1">
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Preview Panel */}
        <Card>
          <CardHeader>
            <CardTitle>3D Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {generatedImage ? (
              <div className="space-y-4">
                <div className="aspect-square w-full overflow-hidden rounded-lg border">
                  <img 
                    src={generatedImage} 
                    alt="Generated interior design"
                    className="w-full h-full object-cover"
                  />
                </div>
                <ThreeJsViewer imageUrl={generatedImage} className="h-64" />
              </div>
            ) : (
              <div className="aspect-square w-full border border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Your generated design will appear here</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Generation Details */}
      {generationData && (
        <Card>
          <CardHeader>
            <CardTitle>Generation Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <h4 className="font-medium mb-1">Parsed Request</h4>
                <p className="text-muted-foreground">
                  Room: {generationData.parsed_request?.room_type || 'Auto-detected'}<br/>
                  Style: {generationData.parsed_request?.style || 'Auto-detected'}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Materials Used</h4>
                <p className="text-muted-foreground">
                  {generationData.matched_materials?.length || 0} materials matched from catalog
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Quality Score</h4>
                <p className="text-muted-foreground">
                  {Math.round((generationData.quality_assessment?.score || 0) * 100)}% quality rating
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};