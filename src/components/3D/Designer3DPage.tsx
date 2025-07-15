import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThreeJsViewer } from './ThreeJsViewer';
import { integratedWorkflowService } from '@/services/integratedWorkflowService';
import { toast } from '@/hooks/use-toast';
import { Loader2, Wand2, Download, Share2 } from 'lucide-react';

export const Designer3DPage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [roomType, setRoomType] = useState('');
  const [style, setStyle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
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
      // Use integrated workflow service for enhanced 3D generation
      const { generationResult, enhancements } = await integratedWorkflowService.enhanced3DGeneration(prompt, {
        roomType: roomType || undefined,
        style: style || undefined
      });

      setGeneratedImages(generationResult.image_urls || []);
      setGenerationData({
        ...generationResult,
        ...(enhancements.nerfReconstruction && {
          nerf_reconstruction: enhancements.nerfReconstruction.reconstructionId,
          model_file_url: enhancements.nerfReconstruction.modelFileUrl,
          mesh_file_url: enhancements.nerfReconstruction.meshFileUrl
        })
      });
      
      toast({
        title: '3D Design Generated!',
        description: `Design created with ${enhancements.nerfReconstruction ? 'NeRF reconstruction' : 'standard processing'}`,
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

  const handleDownload = (imageIndex = 0) => {
    if (!generatedImages.length || !generatedImages[imageIndex]) return;
    
    const link = document.createElement('a');
    link.href = generatedImages[imageIndex];
    link.download = `3d-design-${imageIndex + 1}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">3D Interior Designer</h1>
        <p className="text-muted-foreground mt-2">
          Generate photorealistic interior designs using 3 different AI models: ArchSketch-LoRA, Sketch-Style-XL-LoRA, and ControlNet-Scribble
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

            {generatedImages.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {generatedImages.slice(0, 4).map((_, index) => (
                    <Button 
                      key={index}
                      onClick={() => handleDownload(index)} 
                      variant="outline" 
                      className="text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Model {index + 1}
                    </Button>
                  ))}
                </div>
                {generatedImages.length > 4 && (
                  <Button onClick={() => handleDownload(4)} variant="outline" className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    Download Model 5
                  </Button>
                )}
                <Button variant="outline" className="w-full">
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
            <CardTitle>3D Preview - Generated Model Variations</CardTitle>
          </CardHeader>
          <CardContent>
            {generatedImages.length > 0 ? (
              <div className="space-y-6">
                {/* Model Names */}
                {[
                  'ArchSketch-LoRA',
                  'Sketch-Style-XL-LoRA',
                  'ControlNet-Scribble'
                ].map((modelName, index) => (
                  generatedImages[index] && (
                    <div key={index} className="space-y-2">
                      <h4 className="font-medium text-sm text-muted-foreground">
                        Model {index + 1}: {modelName}
                      </h4>
                      <div className="aspect-square w-full overflow-hidden rounded-lg border bg-muted">
                        <img 
                          src={generatedImages[index]} 
                          alt={`Generated interior design - ${modelName}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            console.error(`Image ${index + 1} failed to load:`, generatedImages[index]);
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      </div>
                    </div>
                  )
                ))}
                
                {/* 3D Viewer for first image */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-muted-foreground">3D Viewer</h4>
                  <ThreeJsViewer imageUrl={generatedImages[0]} className="h-64 rounded-lg border" />
                </div>
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