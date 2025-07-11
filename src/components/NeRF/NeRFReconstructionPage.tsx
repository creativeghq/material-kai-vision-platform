import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ThreeJsViewer } from '@/components/3D/ThreeJsViewer';
import { useToast } from '@/components/ui/use-toast';
import { NeRFProcessingAPI, NeRFReconstructionRecord } from '@/services/nerfProcessingAPI';
import { Upload, Camera, Download, Share2, Eye, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface NeRFReconstructionPageProps {}

export const NeRFReconstructionPage: React.FC<NeRFReconstructionPageProps> = () => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [reconstruction, setReconstruction] = useState<NeRFReconstructionRecord | null>(null);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const imageFiles = acceptedFiles.filter(file => 
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024 // 10MB limit
    );
    
    if (imageFiles.length !== acceptedFiles.length) {
      toast({
        title: "Invalid files",
        description: "Some files were rejected. Only images under 10MB are allowed.",
        variant: "destructive"
      });
    }

    setUploadedFiles(prev => [...prev, ...imageFiles]);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    multiple: true
  });

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleStartReconstruction = async () => {
    if (uploadedFiles.length < 3) {
      toast({
        title: "Not enough images",
        description: "You need at least 3 images for NeRF reconstruction.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      toast({
        title: "Starting reconstruction",
        description: "Uploading images and initializing NeRF processing..."
      });

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 15;
        });
      }, 1000);

      const result = await NeRFProcessingAPI.uploadImagesAndReconstruct(uploadedFiles);

      clearInterval(progressInterval);
      setProgress(100);

      if (result.success) {
        // Fetch the complete reconstruction record
        const reconstructionRecord = await NeRFProcessingAPI.getReconstruction(result.reconstruction_id);
        setReconstruction(reconstructionRecord);
        
        toast({
          title: "Reconstruction completed!",
          description: `3D model generated with quality score: ${result.quality_score?.toFixed(2) || 'N/A'}`
        });
      } else {
        throw new Error(result.error_message || 'Reconstruction failed');
      }

    } catch (error) {
      console.error('Reconstruction error:', error);
      toast({
        title: "Reconstruction failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'processing':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Processing</Badge>;
      case 'failed':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          NeRF 3D Reconstruction
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Upload multiple images of a scene to create a 3D Neural Radiance Field reconstruction. 
          You can then view and interact with the generated 3D model.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload Images
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
                <p>Drop the images here...</p>
              ) : (
                <div>
                  <p className="text-lg font-medium">Drag & drop images here</p>
                  <p className="text-muted-foreground">or click to select files</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Need at least 3 images • Max 10MB each
                  </p>
                </div>
              )}
            </div>

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium">{uploadedFiles.length} images uploaded:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="text-sm truncate">{file.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {uploadedFiles.length >= 3 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Ready for reconstruction! You have {uploadedFiles.length} images.
                </AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleStartReconstruction}
              disabled={uploadedFiles.length < 3 || isProcessing}
              className="w-full"
            >
              {isProcessing ? 'Processing...' : 'Start 3D Reconstruction'}
            </Button>

            {isProcessing && (
              <div className="space-y-2">
                <Progress value={progress} className="w-full" />
                <p className="text-sm text-muted-foreground text-center">
                  Processing {uploadedFiles.length} images... This may take several minutes.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3D Viewer Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              3D Model Viewer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reconstruction ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(reconstruction.reconstruction_status)}
                    {reconstruction.quality_score && (
                      <Badge variant="outline">
                        Quality: {reconstruction.quality_score.toFixed(2)}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {reconstruction.model_file_url && (
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        Download
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      <Share2 className="w-4 h-4 mr-1" />
                      Share
                    </Button>
                  </div>
                </div>

                <ThreeJsViewer 
                  imageUrl={reconstruction.source_image_urls[0]}
                  className="h-80 w-full"
                />

                {reconstruction.reconstruction_status === 'completed' && (
                  <div className="text-sm text-muted-foreground">
                    <p>Processing time: {reconstruction.processing_time_ms ? 
                      `${(reconstruction.processing_time_ms / 1000).toFixed(1)}s` : 'N/A'}</p>
                    <p>Source images: {reconstruction.source_image_urls.length}</p>
                  </div>
                )}

                {reconstruction.error_message && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      {reconstruction.error_message}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            ) : (
              <div className="h-80 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Camera className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Upload images and start reconstruction to view your 3D model</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};