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
import { Loader2, Wand2, Download, Share2, Upload, X, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export const Designer3DPage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [roomType, setRoomType] = useState('');
  const [style, setStyle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{url: string, modelName: string}[]>([]);
  const [generationData, setGenerationData] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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

  const prefilledPrompts = [
    {
      name: "Interior Room with Plants",
      prompt: "Interior room of the house with plants, a chair and candles, space to relax, soft lighting, pastel colors, style of ultrafine detail, high quality photo --ar 2:3 --v 5"
    },
    {
      name: "Modern Living Room",
      prompt: "Modern living room with minimalist furniture, large windows, natural light, neutral colors, clean lines, high-end photography style --ar 16:9 --v 6"
    },
    {
      name: "Cozy Bedroom",
      prompt: "Cozy bedroom with warm lighting, soft textures, wooden furniture, books, comfortable bedding, intimate atmosphere --ar 4:5 --v 5"
    },
    {
      name: "Luxury Kitchen",
      prompt: "Luxury kitchen with marble countertops, stainless steel appliances, pendant lighting, island, high-end finishes, professional photography --ar 3:2 --v 6"
    }
  ];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: 'File Too Large',
          description: 'Please select an image smaller than 10MB.',
          variant: 'destructive'
        });
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const uploadImageToSupabase = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `3d-inputs/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('3d-models')
      .upload(filePath, file);

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    const { data: { publicUrl } } = supabase.storage
      .from('3d-models')
      .getPublicUrl(filePath);

    return publicUrl;
  };

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
    setIsUploading(selectedImage ? true : false);
    
    try {
      let imageUrl: string | undefined;
      
      // Upload image to Supabase if provided
      if (selectedImage) {
        toast({
          title: 'Uploading Image',
          description: 'Uploading your reference image...'
        });
        imageUrl = await uploadImageToSupabase(selectedImage);
        setIsUploading(false);
      }

      const requestData = {
        user_id: (await supabase.auth.getUser()).data.user?.id,
        prompt: prompt.trim(),
        room_type: roomType || undefined,
        style: style || undefined,
        reference_image_url: imageUrl // Add the uploaded image URL
      };

      const response = await supabase.functions.invoke('crewai-3d-generation', {
        body: requestData
      });

      if (response.error) {
        throw new Error(response.error.message || 'Generation failed');
      }

      const result = response.data;
      console.log("Generation result received:", result);
      
      if (result.success && result.images_with_models?.length > 0) {
        console.log("Using new format with models:", result.images_with_models);
        setGeneratedImages(result.images_with_models);
        setGenerationData(result);
        toast({
          title: 'Generation Complete!',
          description: `Generated ${result.images_with_models.length} interior designs successfully.`
        });
      } else if (result.success && result.image_urls?.length > 0) {
        // Fallback for old format
        console.log("Using fallback format, creating model names:", result.image_urls);
        const imagesWithModels = result.image_urls.map((url: string, index: number) => ({
          url,
          modelName: modelNames[index] || `Model ${index + 1}`
        }));
        console.log("Created images with models:", imagesWithModels);
        setGeneratedImages(imagesWithModels);
        setGenerationData(result);
        toast({
          title: 'Generation Complete!',
          description: `Generated ${result.image_urls.length} interior designs successfully.`
        });
      } else {
        throw new Error(result.error || 'No images were generated');
      }
    } catch (error: any) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate 3D interior. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
      setIsUploading(false);
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

  const modalImages = generatedImages;

  const handleDownload = (imageIndex = 0) => {
    if (!generatedImages.length || !generatedImages[imageIndex]) return;
    
    const image = generatedImages[imageIndex];
    const link = document.createElement('a');
    link.href = image.url;
    link.download = `interior-design-${image.modelName?.replace(/\s+/g, '-').toLowerCase() || `model-${imageIndex + 1}`}-${Date.now()}.png`;
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
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="prompt">Design Prompt</Label>
              <Select onValueChange={(value) => setPrompt(value)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Choose a preset" />
                </SelectTrigger>
                <SelectContent className="bg-background border shadow-lg z-50">
                  {prefilledPrompts.map((preset) => (
                    <SelectItem key={preset.name} value={preset.prompt}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your ideal interior design... (e.g., 'A modern living room with oak furniture, marble accents, and warm lighting')"
              rows={4}
              className="mt-1"
            />
          </div>

          {/* Image Upload Section */}
          <div>
            <Label htmlFor="image-upload">Reference Image (Optional)</Label>
            <div className="mt-1 space-y-2">
              {!imagePreview ? (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                  <input
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <label
                    htmlFor="image-upload"
                    className="cursor-pointer flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm">
                      Click to upload a reference image
                    </span>
                    <span className="text-xs">
                      Supports JPG, PNG (max 10MB)
                    </span>
                  </label>
                </div>
              ) : (
                <div className="relative border rounded-lg p-2">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="w-full h-32 object-cover rounded"
                  />
                  <Button
                    onClick={removeImage}
                    variant="destructive"
                    size="sm"
                    className="absolute top-1 right-1"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
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
            disabled={isGenerating || isUploading || !prompt.trim()}
            className="w-full"
            size="lg"
          >
            {isGenerating || isUploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isUploading ? 'Uploading Image...' : 'Generating Designs...'}
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
              {generatedImages.map((image, index) => (
                <div key={index} className="space-y-2">
                  <div 
                    className="aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => handleImageClick(index)}
                  >
                    <img 
                      src={image.url} 
                      alt={`Interior design by ${image.modelName}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform"
                      onError={(e) => {
                        console.error(`Image ${index + 1} failed to load:`, image.url);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <h4 className="font-medium text-sm truncate">
                      {image.modelName || `Model ${index + 1}`}
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
            <ThreeJsViewer imageUrl={generatedImages[0]?.url} className="h-96 rounded-lg border" />
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