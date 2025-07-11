import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage, Loader2, CheckCircle, AlertCircle, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RecognitionResult } from '@/types/materials';
import { RecognitionResults } from './RecognitionResults';
import { clientMLService } from '@/services/ml/clientMLService';
import { toast } from 'sonner';

// AI-powered recognition service using client-side ML
const recognizeWithClientML = async (files: File[]): Promise<RecognitionResult[]> => {
  const results: RecognitionResult[] = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Analyze material using client-side ML
    const mlResult = await clientMLService.analyzeMaterial(file);
    
    if (mlResult.success && mlResult.data) {
      const { image, combined } = mlResult.data;
      const topClassification = image?.[0];
      
      const result: RecognitionResult = {
        // New schema properties
        id: `client-ml-${Date.now()}-${i}`,
        file_id: `file-${Date.now()}-${i}`,
        material_id: `mat-${combined.materialType}-${i}`,
        confidence_score: mlResult.confidence || 0,
        detection_method: 'visual' as const,
        ai_model_version: 'client-v1.0',
        properties_detected: {
          material_type: combined.materialType,
          classification: topClassification?.label || 'unknown',
          features: combined.features?.map(f => f.label) || []
        },
        processing_time_ms: mlResult.processingTime || 0,
        user_verified: false,
        created_at: new Date().toISOString(),
        
        // Legacy properties for backward compatibility
        materialId: `mat-${combined.materialType}-${i}`,
        name: topClassification?.label || 'Unknown Material',
        confidence: mlResult.confidence || 0,
        imageUrl: URL.createObjectURL(file),
        metadata: {
          properties: {
            material_type: combined.materialType,
            classification: topClassification?.label || 'unknown',
            score: topClassification?.score || 0,
            features: combined.features || []
          }
        },
        processingTime: mlResult.processingTime || 0,
      };
      
      results.push(result);
    } else {
      // Fallback for failed analysis
      const result: RecognitionResult = {
        id: `fallback-${Date.now()}-${i}`,
        file_id: `file-${Date.now()}-${i}`,
        material_id: `mat-unknown-${i}`,
        confidence_score: 0,
        detection_method: 'visual' as const,
        ai_model_version: 'client-v1.0',
        properties_detected: { error: mlResult.error || 'Analysis failed' },
        processing_time_ms: mlResult.processingTime || 0,
        user_verified: false,
        created_at: new Date().toISOString(),
        
        materialId: `mat-unknown-${i}`,
        name: 'Analysis Failed',
        confidence: 0,
        imageUrl: URL.createObjectURL(file),
        metadata: { 
          properties: { error: mlResult.error || 'Analysis failed' }
        },
        processingTime: mlResult.processingTime || 0,
      };
      
      results.push(result);
    }
  }
  
  return results;
};

export const MaterialRecognition: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setResults([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.bmp', '.tiff']
    },
    multiple: true,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const startRecognition = async () => {
    if (files.length === 0) return;
    
    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + Math.random() * 10;
      });
    }, 200);

    try {
      const recognitionResults = await recognizeWithClientML(files);
      toast.success(`Analyzed ${recognitionResults.length} materials using AI`);
      setResults(recognitionResults);
      setProgress(100);
    } catch (error) {
      console.error('Recognition failed:', error);
      toast.error('Material recognition failed. Please try again.');
    } finally {
      setIsProcessing(false);
      clearInterval(progressInterval);
    }
  };

  const clearFiles = () => {
    setFiles([]);
    setResults([]);
    setProgress(0);
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="w-5 h-5" />
            Material Recognition
            <Badge variant="secondary" className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              AI Powered
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Upload Area */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
            `}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg">Drop the images here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">Drag & drop material images here</p>
                <p className="text-sm text-muted-foreground mb-4">
                  or click to select files (JPEG, PNG, WebP)
                </p>
                <Button variant="outline">Select Images</Button>
              </div>
            )}
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Selected Files ({files.length})</h3>
                <Button variant="ghost" size="sm" onClick={clearFiles}>
                  Clear All
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {files.map((file, index) => (
                  <div key={index} className="relative group">
                    <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeFile(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="mt-1 text-xs text-center truncate px-1">
                      {file.name}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recognition Controls */}
          {files.length > 0 && (
            <div className="flex gap-3">
              <Button
                onClick={startRecognition}
                disabled={isProcessing}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Start Recognition
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Analyzing materials...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Status Messages */}
          {results.length > 0 && !isProcessing && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-green-800 dark:text-green-200">
                Recognition completed! Found {results.length} material{results.length !== 1 ? 's' : ''}.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <RecognitionResults results={results} />
      )}
    </div>
  );
};