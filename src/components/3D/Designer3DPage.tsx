import React, { useState } from 'react';
import { Loader2, Wand2, Download, X, ImageIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BrowserApiIntegrationService } from '@/services/apiGateway/browserApiIntegrationService';

import { ImageModal } from './ImageModal';
import { ThreeJsViewer } from './ThreeJsViewer';
import { GenerationWorkflowModal } from './GenerationWorkflowModal';

export const Designer3DPage: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [roomType, setRoomType] = useState('');
  const [style, setStyle] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<{url: string, modelName: string}[]>([]);
  const [generationData, setGenerationData] = useState<unknown>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Workflow modal state
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin
  React.useEffect(() => {
    const checkAdminRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await (supabase as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown }> }).rpc('has_role', {
          _user_id: user.id,
          _role: 'admin',
        });
        setIsAdmin(data === true);
      }
    };

    checkAdminRole();
  }, []);

  // Available AI models - unified list without artificial type separation
  const availableModels = [
    { name: '🎨 Stable Diffusion XL Base 1.0', id: 'stabilityai/stable-diffusion-xl-base-1.0', provider: 'huggingface' },
    { name: '⚡ FLUX-Schnell', id: 'black-forest-labs/flux-schnell', provider: 'replicate' },
    { name: '🏠 Interior Design Model', id: 'stabilityai/stable-diffusion-2-1', provider: 'huggingface' },
    { name: '🏗️ Designer Architecture', id: 'davisbrown/designer-architecture', provider: 'replicate' },
    { name: '🎯 Interior Design AI', id: 'adirik/interior-design', provider: 'replicate' },
    { name: '🏡 Interior AI', id: 'erayyavuz/interior-ai', provider: 'replicate' },
    { name: '🎨 ComfyUI Interior Remodel', id: 'jschoormans/comfyui-interior-remodel', provider: 'replicate' },
    { name: '🏛️ Interiorly Gen1 Dev', id: 'julian-at/interiorly-gen1-dev', provider: 'replicate' },
    { name: '🏘️ Interior V2', id: 'jschoormans/interior-v2', provider: 'replicate' },
    { name: '🚀 Interior Design SDXL', id: 'rocketdigitalai/interior-design-sdxl', provider: 'replicate' },
  ];

  // All models are now available regardless of input type
  const filteredModels = availableModels;

  const roomTypes = [
    'living room', 'kitchen', 'bedroom', 'bathroom', 'dining room',
    'office', 'study', 'library', 'hallway', 'balcony',
  ];

  const styles = [
    'modern', 'contemporary', 'minimalist', 'scandinavian', 'industrial',
    'mid-century', 'traditional', 'rustic', 'mediterranean', 'art-deco',
  ];

  const prefilledPrompts = [
    {
      name: 'Interior Room with Plants',
      prompt: 'Interior room of the house with plants, a chair and candles, space to relax, soft lighting, pastel colors, style of ultrafine detail, high quality photo --ar 2:3 --v 5',
    },
    {
      name: 'Modern Living Room',
      prompt: 'Modern living room with minimalist furniture, large windows, natural light, neutral colors, clean lines, high-end photography style --ar 16:9 --v 6',
    },
    {
      name: 'Cozy Bedroom',
      prompt: 'Cozy bedroom with warm lighting, soft textures, wooden furniture, books, comfortable bedding, intimate atmosphere --ar 4:5 --v 5',
    },
    {
      name: 'Luxury Kitchen',
      prompt: 'Luxury kitchen with marble countertops, stainless steel appliances, pendant lighting, island, high-end finishes, professional photography --ar 3:2 --v 6',
    },
  ];

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: 'File Too Large',
          description: 'Please select an image smaller than 10MB.',
          variant: 'destructive',
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
    // CRITICAL DEBUG: Capture prompt state at function entry

    if (!prompt.trim()) {
      // Prompt validation failed at entry check
      toast({
        title: 'Prompt Required',
        description: 'Please enter a design prompt to generate your 3D interior.',
        variant: 'destructive',
      });
      return;
    }

    console.log('✅ DEBUG: Initial prompt validation passed');
    setIsGenerating(true);
    setIsUploading(selectedImage ? true : false);

    try {
      let imageUrl: string | undefined;

      // Upload image to Supabase if provided
      if (selectedImage) {
        toast({
          title: 'Uploading Image',
          description: 'Uploading your reference image...',
        });
        imageUrl = await uploadImageToSupabase(selectedImage);
        setIsUploading(false);
      }

      // Define models that require images vs text-only models
      const imageRequiredModels = [
        'adirik/interior-design',
        'davisbrown/designer-architecture',
        'erayyavuz/interior-ai',
        'jschoormans/comfyui-interior-remodel',
        'rocketdigitalai/interior-design-sdxl',
      ];

      const textOnlyModels = [
        'black-forest-labs/flux-schnell',
        'stabilityai/stable-diffusion-xl-base-1.0',
        'stabilityai/stable-diffusion-2-1',
        'julian-at/interiorly-gen1-dev',
        'jschoormans/interior-v2',
      ];

      // Determine which models to use based on whether we have an image
      let selectedModels;
      if (imageUrl) {
        // If we have an image, use all image-capable models
        selectedModels = imageRequiredModels;
        console.log('🔍 DEBUG: Using image-capable models:', selectedModels);
      } else {
        // If no image, use all text-only models
        selectedModels = textOnlyModels;
        console.log('🔍 DEBUG: Using text-only models:', selectedModels);
      }

      // Build request data with required model field
      // Add defensive checks to ensure required fields are never undefined
      console.log('🔍 DEBUG: Building request data');
      console.log('🔍 DEBUG: prompt state before sanitization:', {
        prompt,
        promptType: typeof prompt,
        promptLength: prompt?.length,
        promptValue: JSON.stringify(prompt),
      });

      const sanitizedPrompt = prompt?.trim() || '';

      console.log('🔍 DEBUG: After sanitization:', {
        sanitizedPrompt,
        sanitizedPromptType: typeof sanitizedPrompt,
        sanitizedPromptLength: sanitizedPrompt?.length,
        sanitizedPromptValue: JSON.stringify(sanitizedPrompt),
      });

      if (!sanitizedPrompt) {
        console.error('❌ DEBUG: Prompt validation failed after sanitization');
        throw new Error('Prompt is required but was undefined or empty');
      }

      if (!selectedModels || selectedModels.length === 0) {
        console.error('❌ DEBUG: Model selection failed');
        throw new Error('Model selection failed - no valid models found');
      }

      // Get current user for user_id field (required by backend)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User authentication required');
      }

      const requestData = {
        user_id: user.id, // Required by backend schema
        prompt: sanitizedPrompt,
        models: selectedModels, // Send all available models instead of just one
        room_type: roomType || undefined,
        style: style || undefined,
        ...(imageUrl && { image_url: imageUrl }), // Only include image_url if we have one
      };

      console.log('🔍 DEBUG: Final request data:', {
        requestData,
        requestDataStringified: JSON.stringify(requestData, null, 2),
      });

      // Use the new centralized API integration service
      const apiService = BrowserApiIntegrationService.getInstance();
      console.log('🔍 DEBUG: About to call API with request data');
      const result = await apiService.callSupabaseFunction('crewai-3d-generation', requestData);
      console.log('Generation response received:', result);

      // Type assertion for the response data
      const responseData = result.data as { generationId?: string; generation_status?: string; image_urls?: string[] } | null;

      if (result.success && responseData?.generationId) {
        if (isAdmin) {
          // Show workflow modal for admins
          setCurrentGenerationId(responseData.generationId);
          setShowWorkflowModal(true);
          setIsGenerating(false);
          setIsUploading(false);
        } else {
          // Regular polling for non-admin users
          toast({
            title: 'Generation Started',
            description: 'Your 3D interior is being generated. This may take a few minutes...',
          });
          await pollForResults(responseData.generationId);
        }
      } else {
        throw new Error(result.error?.message || 'Failed to start generation');
      }
    } catch (error: unknown) {
      console.error('Generation error:', error);
      toast({
        title: 'Generation Failed',
        description: (error as Error).message || 'Failed to generate 3D interior. Please try again.',
        variant: 'destructive',
      });
      setIsGenerating(false);
      setIsUploading(false);
    }
  };

  const pollForResults = async (_generationId: string) => { // eslint-disable-line @typescript-eslint/no-unused-vars
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    let attempts = 0;

    const poll = async () => {
      try {
        // TODO: Implement generation_3d table or replace with proper backend
        // const { data, error } = await supabase
        //   .from('generation_3d')
        //   .select('*')
        //   .eq('id', generationId)
        //   .single();

        // Mock response for now to prevent build errors
        const data: unknown = null;
        const error = { message: 'generation_3d table not implemented' };

        if (error) {
          console.error('Polling error:', error);
          return;
        }

        console.log('Polling result:', data);

        // Type assertion for the polling data
        const pollingData = data as { generation_status?: string; image_urls?: string[] } | null;

        if (pollingData && pollingData.generation_status === 'completed' && pollingData.image_urls && pollingData.image_urls.length > 0) {
          // Generation completed successfully
          console.log('🔍 DEBUG: Generation completed successfully');
          console.log('📊 Available models count:', filteredModels.length);
          console.log('📊 Available models:', filteredModels.map((m, i) => `${i}: ${m.name}`));
          console.log('🖼️ Received image URLs count:', pollingData.image_urls.length);
          console.log('🖼️ Received image URLs:', pollingData.image_urls);
          console.log('📋 Full generation data:', pollingData);

          // Robust image-to-model mapping that handles sparse results
          // The backend should ideally include model metadata with each result,
          // but for now we implement a robust mapping strategy
          const imagesWithModels = pollingData.image_urls.map((url: string, index: number) => {
            // Strategy 1: Try to extract model info from URL if available
            let modelName = `Model ${index + 1}`;
            let detectedModel = null;

            // Check if URL contains model identifier patterns
            for (const model of filteredModels) {
              if (url.includes(model.name.toLowerCase().replace(/\s+/g, '-')) ||
                  url.includes(model.name.toLowerCase().replace(/\s+/g, '_'))) {
                detectedModel = model;
                modelName = model.name;
                break;
              }
            }

            // Strategy 2: If no model detected from URL, use sequential mapping with validation
            if (!detectedModel && index < filteredModels.length) {
              // For sequential mapping, we need to account for potential gaps
              // This assumes the backend returns results in the same order as requested
              const candidateModel = filteredModels[index];
              if (candidateModel) {
                detectedModel = candidateModel;
                modelName = candidateModel.name;
              }
            }

            // Strategy 3: Fallback - try to map based on successful results count
            if (!detectedModel && filteredModels.length > 0) {
              // If we have fewer results than models, try to map to available models
              const modelIndex = Math.min(index, filteredModels.length - 1);
              const fallbackModel = filteredModels[modelIndex];
              if (fallbackModel) {
                detectedModel = fallbackModel;
                modelName = `${fallbackModel.name} (Result ${index + 1})`;
              }
            }

            const result = {
              url,
              modelName,
              modelId: detectedModel?.id || null,
              resultIndex: index,
            };

            console.log(`🔗 Robust mapping index ${index}: URL="${url}" -> Model="${result.modelName}" (ID: ${result.modelId})`);
            return result;
          });

          // Additional validation and logging
          console.log('🔍 Mapping validation:');
          console.log(`📊 Total models requested: ${filteredModels.length}`);
          console.log(`🖼️ Total results received: ${pollingData.image_urls?.length || 0}`);
          console.log(`✅ Successfully mapped: ${imagesWithModels.filter((img: unknown) => (img as { modelId?: string }).modelId).length}`);
          console.log(`⚠️ Fallback mappings: ${imagesWithModels.filter((img: unknown) => !(img as { modelId?: string }).modelId).length}`);

          console.log('✅ Final imagesWithModels mapping:', imagesWithModels);

          setGeneratedImages(imagesWithModels);
          setGenerationData(data);
          setIsGenerating(false);
          setIsUploading(false);

          toast({
            title: 'Generation Complete!',
            description: `Generated ${pollingData.image_urls?.length || 0} interior designs successfully.`,
          });
          return;
        }

        if (pollingData && pollingData.generation_status === 'failed') {
          throw new Error((pollingData as { error_message?: string }).error_message || 'Generation failed');
        }

        // Still processing, continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        } else {
          throw new Error('Generation timed out');
        }
      } catch (error: unknown) {
        console.error('Polling error:', error);
        setIsGenerating(false);
        setIsUploading(false);
        toast({
          title: 'Generation Failed',
          description: (error as Error).message || 'Generation failed during processing',
          variant: 'destructive',
        });
      }
    };

    poll();
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
          Generate photorealistic interior designs using our AI models.
          <span className="text-primary font-medium ml-1">
            {filteredModels.length} models available
          </span>
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
              <Select onValueChange={(value: string) => {
                console.log('🔍 DEBUG: Preset selection changed:', {
                  selectedValue: value,
                  valueType: typeof value,
                  valueLength: value?.length,
                  currentPrompt: prompt,
                  currentPromptType: typeof prompt,
                });
                setPrompt(value);
                console.log('🔍 DEBUG: After setPrompt from preset:', {
                  newPromptValue: value,
                  promptStateAfterSet: prompt, // Note: this might still show old value due to React batching
                });
              }}>
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
                    className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white text-sm px-2 py-1"
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
            className="w-full px-6 py-3 text-lg"
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
      {(generatedImages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Generated Interior Designs</CardTitle>
            <p className="text-sm text-muted-foreground">
              Click on any image to view in full size and navigate between models
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        onLoad={() => {
                          console.log(`✅ Image ${index + 1} loaded successfully:`, image.url);
                        }}
                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                          console.error(`❌ Image ${index + 1} failed to load:`, {
                            url: image.url,
                            modelName: image.modelName,
                            error: 'Failed to load image',
                          });
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                    <h4 className="font-medium text-sm truncate">
                      {image.modelName || `Model ${index + 1}`}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Modern interior with warm lighting and contemporary furniture
                    </p>
                    <Button
                      onClick={() => handleDownload(index)}
                      className="w-full text-xs border border-gray-300 hover:bg-gray-50 px-3 py-1"
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
      ) : null) as any}

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
            <ThreeJsViewer imageUrl={generatedImages[0]?.url || ''} className="h-96 rounded-lg border" />
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
                  Room: {(generationData as { parsed_request?: { room_type?: string; style?: string } })?.parsed_request?.room_type || 'Auto-detected'}<br/>
                  Style: {(generationData as { parsed_request?: { room_type?: string; style?: string } })?.parsed_request?.style || 'Auto-detected'}
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Materials Used</h4>
                <p className="text-muted-foreground">
                  {(generationData as { matched_materials?: unknown[] })?.matched_materials?.length || 0} materials matched from catalog
                </p>
              </div>
              <div>
                <h4 className="font-medium mb-1">Models Generated</h4>
                <p className="text-muted-foreground">
                  {generatedImages.length} of {filteredModels.length} models completed
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

      {/* Generation Workflow Modal - Only for Admins */}
      {isAdmin && (
        <GenerationWorkflowModal
          isOpen={showWorkflowModal}
          onClose={() => setShowWorkflowModal(false)}
          generationId={currentGenerationId}
          onComplete={(images) => {
            // Robust image-to-model mapping that handles sparse results
            const imagesWithModels = (images as string[]).map((url: string, index: number) => {
              let modelName = `Model ${index + 1}`;
              let modelId = '';
              const resultIndex = index;

              // Strategy 1: Extract model info from URL patterns
              const urlMatch = url.match(/model[_-](\w+)|(\w+)[_-]model/i);
              if (urlMatch) {
                const extractedId = urlMatch[1] || urlMatch[2];
                const matchingModel = filteredModels.find(m =>
                  (extractedId && m.id.toLowerCase().includes(extractedId.toLowerCase())) ||
                  (extractedId && m.name.toLowerCase().includes(extractedId.toLowerCase())),
                );
                if (matchingModel) {
                  modelName = matchingModel.name;
                  modelId = matchingModel.id;
                  console.log(`✅ Strategy 1 success: URL ${url} mapped to model ${modelName}`);
                  return { url, modelName, modelId, resultIndex };
                }
              }

              // Strategy 2: Sequential mapping with validation
              if (index < filteredModels.length) {
                const candidateModel = filteredModels[index];
                if (candidateModel) {
                  modelName = candidateModel.name;
                  modelId = candidateModel.id;
                  console.log(`✅ Strategy 2 success: Index ${index} mapped to model ${modelName}`);
                  return { url, modelName, modelId, resultIndex };
                }
              }

              // Strategy 3: Fallback mapping for remaining cases
              const availableModel = filteredModels[index % filteredModels.length];
              if (availableModel && filteredModels.length > 0) {
                modelName = `${availableModel.name} (Result ${index + 1})`;
                modelId = availableModel.id;
                console.log(`⚠️ Strategy 3 fallback: Index ${index} mapped to model ${modelName}`);
              } else {
                console.log(`❌ No model mapping found for index ${index}, using fallback name`);
              }

              return { url, modelName, modelId, resultIndex };
            });

            console.log('🎯 WorkflowModal mapping results:', {
              totalImages: images.length,
              totalModels: filteredModels.length,
              mappedResults: imagesWithModels.length,
              mappings: imagesWithModels.map(img => ({ url: img.url, modelName: img.modelName })),
            });

            setGeneratedImages(imagesWithModels);
            setShowWorkflowModal(false);
            toast({
              title: 'Generation Complete!',
              description: `Generated ${images.length} interior designs successfully.`,
            });
          }}
        />
      )}
    </div>
  );
};
