import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileImage, Loader2, CheckCircle, Brain } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RecognitionResult } from '@/types/materials';
import { mivaaService } from '@/services/mivaaIntegrationService';

import { RecognitionResults } from './RecognitionResults';

// Enhanced recognition using integrated workflow service

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
      'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.bmp', '.tiff'],
    },
    multiple: true,
    maxSize: 10 * 1024 * 1024, // 10MB
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
      console.log('🚀 Starting MIVAA material recognition...');

      const recognitionResults: RecognitionResult[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress((i / files.length) * 90);

        // Convert file to base64
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]); // Remove data:image/... prefix
          };
          reader.readAsDataURL(file);
        });

        // Call MIVAA service for material analysis
        const response = await mivaaService.analyzeMaterial(base64, {
          includeProperties: true,
          includeComposition: true,
          confidenceThreshold: 0.8,
        });

        if (response.success && response.data) {
          recognitionResults.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            confidence: response.data.confidence || 0.8,
            materialType: response.data.material_type || 'Unknown',
            properties: response.data.properties || {},
            composition: response.data.composition || {},
            sustainability: response.data.sustainability || {},
            imageUrl: URL.createObjectURL(file),
            processingTime: response.metadata.processingTime,
          });
        } else {
          console.error('MIVAA analysis failed:', response.error);
          // Don't create fake results - let user know the analysis failed
          toast.error(`Analysis failed for ${file.name}: ${response.error?.message || 'Unknown error'}`);
          // Skip this file and continue with next one
          continue;
        }
      }

      console.log('✅ MIVAA recognition completed:', recognitionResults);

      setResults(recognitionResults);
      setProgress(100);

      toast.success(`Successfully analyzed ${recognitionResults.length} materials with MIVAA!`);

    } catch (error) {
      console.error('❌ MIVAA recognition failed:', error);
      toast.error(error instanceof Error ? error.message : 'MIVAA recognition failed');
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
            <Badge className="flex items-center gap-1 bg-secondary text-secondary-foreground hover:bg-secondary/80">
              <Brain className="w-3 h-3" />
              Hybrid AI
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
                <Button className="border border-input bg-background hover:bg-accent hover:text-accent-foreground">Select Images</Button>
              </div>
            )}
          </div>

          {/* Selected Files */}
          {files.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium">Selected Files ({files.length})</h3>
                <Button className="hover:bg-accent hover:text-accent-foreground h-9 px-3" onClick={clearFiles}>
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
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 px-3"
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
