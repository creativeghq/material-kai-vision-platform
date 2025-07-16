import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ThreeJsViewer } from './ThreeJsViewer';
import { ImageModal } from './ImageModal';
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Replicate model names that match our edge function
  const modelNames = [
    'Designer Architecture',
    'Interior Design AI', 
    'Interior AI',
    'ComfyUI Interior Remodel',
    'Interiorly Gen1',
    'Interior V2',
    'Interior Design SDXL'
  ];

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

  const handleImageClick = (index: number) => {
    setCurrentImageIndex(index);
    setIsModalOpen(true);
  };

  const handleModalNavigate = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    } else if (direction === 'next' && currentImageIndex < generatedImages.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const modalImages = generatedImages.map((url, index) => ({
    url,
    modelName: modelNames[index] || `Model ${index + 1}`
  }));

  const handleDownload = (imageIndex = 0) => {
    if (!generatedImages.length || !generatedImages[imageIndex]) return;
    
    const link = document.createElement('a');
    link.href = generatedImages[imageIndex];
    link.download = `interior-design-${modelNames[imageIndex]?.replace(/\s+/g, '-').toLowerCase() || `model-${imageIndex + 1}`}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">3D Interior Designer</h1>
        <p className="text-muted-foreground mt-2">
          Generate photorealistic interior designs using 7 specialized Replicate AI models for interior design
        </p>
      </div>

      {/* Prompt Section at Top */}
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
                Generating Designs...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Interior Designs
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results Grid */}
      {generatedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Interior Designs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click on any image to view in full size and navigate between models
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {generatedImages.map((imageUrl, index) => (
                <div key={index} className="space-y-2">
                  <div 
                    className="aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => handleImageClick(index)}
                  >
                    <img 
                      src={imageUrl} 
                      alt={`Interior design by ${modelNames[index]}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      onError={(e) => {
                        console.error(`Image ${index + 1} failed to load:`, imageUrl);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm truncate">
                      {modelNames[index] || `Model ${index + 1}`}
                    </h4>
                    <Button 
                      onClick={() => handleDownload(index)} 
                      variant="outline" 
                      size="sm"
                      className="w-full text-xs"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3D Viewer */}
      {generatedImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3D Viewer</CardTitle>
            <p className="text-sm text-muted-foreground">
              Interactive 3D preview of the first generated design
            </p>
          </CardHeader>
          <CardContent>
            <ThreeJsViewer imageUrl={generatedImages[0]} className="h-96 rounded-lg border" />
          </CardContent>
        </Card>
      )}

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
                <h4 className="font-medium mb-1">Models Generated</h4>
                <p className="text-muted-foreground">
                  {generatedImages.length} of {modelNames.length} models completed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Image Modal */}
      <ImageModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        images={modalImages}
        currentIndex={currentImageIndex}
        onNavigate={handleModalNavigate}
      />
    </div>
  );
};