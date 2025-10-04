import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Camera, Download, Link, Eye, AlertCircle, CheckCircle, Clock, Palette, Layers, Settings } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { SVBRDFExtractionAPI, SVBRDFExtractionRecord } from '@/services/svbrdfExtractionAPI';

export const SVBRDFExtractionPage: React.FC = () => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [extraction, setExtraction] = useState<SVBRDFExtractionRecord | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [extractionHistory, setExtractionHistory] = useState<SVBRDFExtractionRecord[]>([]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const imageFile = acceptedFiles.find(file =>
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024, // 10MB limit
    );

    if (!imageFile && acceptedFiles.length > 0) {
      toast({
        title: 'Invalid file',
        description: 'Please upload an image file under 10MB.',
        variant: 'destructive',
      });
      return;
    }

    if (imageFile) {
      setUploadedFile(imageFile);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
    },
    multiple: false,
  });

  const handleStartExtraction = async () => {
    if (!uploadedFile) {
      toast({
        title: 'No image selected',
        description: 'Please upload an image first.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      toast({
        title: 'Starting extraction',
        description: 'Uploading image and initializing SVBRDF processing...',
      });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 10;
        });
      }, 800);

      const result = await SVBRDFExtractionAPI.uploadImageAndExtract(
        uploadedFile,
        selectedMaterialId || undefined,
      );

      clearInterval(progressInterval);
      setProgress(100);

      if (result.success) {
        // Fetch the complete extraction record
        const extractionRecord = await SVBRDFExtractionAPI.getExtraction(result.extraction_id);
        setExtraction(extractionRecord);

        toast({
          title: 'Extraction completed!',
          description: `Material properties extracted with ${(result.confidence_score || 0 * 100).toFixed(1)}% confidence`,
        });

        // Refresh history
        loadExtractionHistory();
      } else {
        throw new Error(result.error_message || 'Extraction failed');
      }

    } catch (error) {
      console.error('Extraction error:', error);
      toast({
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const loadExtractionHistory = async () => {
    try {
      const history = await SVBRDFExtractionAPI.getUserExtractions(10);
      setExtractionHistory(history);
    } catch (error) {
      console.error('Error loading extraction history:', error);
    }
  };

  useEffect(() => {
    loadExtractionHistory();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-green-500 border-transparent text-primary-foreground hover:bg-green-500/80"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"><Clock className="w-3 h-3 mr-1" />Processing</Badge>;
      case 'failed':
        return <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 text-foreground"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const renderSVBRDFMaps = (extraction: SVBRDFExtractionRecord) => {
    const maps = [
      { name: 'Albedo', url: extraction.albedo_map_url, icon: Palette, description: 'Base color without lighting' },
      { name: 'Normal', url: extraction.normal_map_url, icon: Layers, description: 'Surface detail and bumps' },
      { name: 'Roughness', url: extraction.roughness_map_url, icon: Settings, description: 'Surface roughness' },
      { name: 'Metallic', url: extraction.metallic_map_url, icon: Eye, description: 'Metallic properties' },
      { name: 'Height', url: extraction.height_map_url, icon: Layers, description: 'Surface displacement' },
    ];

    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {maps.map((map) => (
          <div key={map.name} className="space-y-2">
            <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
              {map.url ? (
                <img
                  src={map.url}
                  alt={`${map.name} map`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <map.icon className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="text-center">
              <p className="font-medium text-sm">{map.name}</p>
              <p className="text-xs text-muted-foreground">{map.description}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          SVBRDF Material Extraction
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Upload an image to extract physically-based material properties including albedo, normal, roughness,
          metallic, and height maps for realistic 3D rendering.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Material Image
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-border'
              }`}
            >
              <input {...getInputProps()} />
              <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p>Drop the image here...</p>
              ) : (
                <div>
                  <p className="text-lg font-medium">Drag & drop an image here</p>
                  <p className="text-muted-foreground">or click to select a file</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Max 10MB • PNG, JPG, JPEG, WebP
                  </p>
                </div>
              )}
            </div>

            {uploadedFile && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <span className="text-sm font-medium">{uploadedFile.name}</span>
                  <Button
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"

                    onClick={() => setUploadedFile(null)}
                  >
                    ×
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Link to Material (Optional)</label>
                  <Select value={selectedMaterialId} onValueChange={setSelectedMaterialId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a material from catalog" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No material selected</SelectItem>
                      {/* Material options would be loaded from API */}
                    </SelectContent>
                  </Select>
                </div>

                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Ready for SVBRDF extraction! This will generate all material maps.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <Button
              onClick={handleStartExtraction}
              disabled={!uploadedFile || isProcessing}
              className="w-full"
            >
              {isProcessing ? 'Extracting Properties...' : 'Start SVBRDF Extraction'}
            </Button>

            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  Analyzing material properties... This may take a few minutes.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Extraction Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {extraction ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(extraction.extraction_status)}
                    {extraction.confidence_score && (
                      <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                        Confidence: {(extraction.confidence_score * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3">
                      <Download className="w-4 h-4 mr-1" />
                      Download Maps
                    </Button>
                    <Button className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3">
                      <Link className="w-4 h-4 mr-1" />
                      Link to Material
                    </Button>
                  </div>
                </div>

                {extraction.extraction_status === 'completed' && (
                  <>
                    <div>
                      <h4 className="font-medium mb-3">Generated SVBRDF Maps</h4>
                      {renderSVBRDFMaps(extraction)}
                    </div>

                    {extraction.extracted_properties && (
                      <div className="space-y-3">
                        <h4 className="font-medium">Material Properties</h4>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Material Type:</span>
                            <span className="ml-2 font-medium capitalize">
                              {(extraction.extracted_properties as any).material_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Surface:</span>
                            <span className="ml-2 font-medium capitalize">
                              {(extraction.extracted_properties as any).surface_category}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Roughness:</span>
                            <span className="ml-2 font-medium">
                              {((extraction.extracted_properties as any).roughness as number)?.toFixed(2)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Metallic:</span>
                            <span className="ml-2 font-medium">
                              {((extraction.extracted_properties as any).metallic as number)?.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="text-sm text-muted-foreground">
                      <p>Processing time: {extraction.processing_time_ms ?
                        `${(extraction.processing_time_ms / 1000).toFixed(1)}s` : 'N/A'}</p>
                    </div>
                  </>
                )}

                {extraction.error_message && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {extraction.error_message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Settings className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Upload an image and start extraction to view material maps</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Extraction History */}
      {extractionHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Extractions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {extractionHistory.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-muted rounded overflow-hidden">
                      {item.albedo_map_url && (
                        <img
                          src={item.albedo_map_url}
                          alt="Albedo preview"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {(item.extracted_properties as any)?.material_type || 'Material'} extraction
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {new Date(item.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(item.extraction_status)}
                    <Button
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"

                      onClick={() => setExtraction(item)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
