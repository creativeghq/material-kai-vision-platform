import React, { useState } from 'react';
import { ImageUpload } from './ImageUpload';
import { RecognitionResults } from './RecognitionResults';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RecognitionResult } from '@/types/materials';
import { Play, Settings, History } from 'lucide-react';

// Mock recognition service
const mockRecognitionService = (files: File[]): Promise<RecognitionResult[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const results: RecognitionResult[] = files.map((file, index) => {
        const materials = [
          { name: 'Marble White Carrara', confidence: 0.94, color: 'white', finish: 'polished', brand: 'Premium Stone Co.' },
          { name: 'Oak Wood Natural', confidence: 0.89, color: 'brown', finish: 'matte', brand: 'WoodCraft Ltd.' },
          { name: 'Steel Brushed Finish', confidence: 0.96, color: 'silver', finish: 'brushed', brand: 'MetalWorks Pro' },
          { name: 'Ceramic Tile Blue', confidence: 0.91, color: 'blue', finish: 'glossy', brand: 'CeramicArt' },
          { name: 'Granite Black Absolute', confidence: 0.87, color: 'black', finish: 'honed', brand: 'Stone Masters' },
        ];
        
        const material = materials[index % materials.length];
        
        return {
          materialId: `mat-${Date.now()}-${index}`,
          name: material.name,
          confidence: material.confidence,
          imageUrl: URL.createObjectURL(file),
          metadata: {
            color: material.color,
            finish: material.finish,
            brand: material.brand,
          },
          processingTime: 1.2 + Math.random() * 2,
        };
      });
      resolve(results);
    }, 2000 + Math.random() * 1000); // Simulate processing time
  });
};

export const MaterialRecognition: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingHistory, setProcessingHistory] = useState<RecognitionResult[]>([]);

  const handleImagesSelected = (files: File[]) => {
    setSelectedFiles(files);
  };

  const startRecognition = async () => {
    if (selectedFiles.length === 0) return;
    
    setIsProcessing(true);
    setResults([]);
    
    try {
      const recognitionResults = await mockRecognitionService(selectedFiles);
      setResults(recognitionResults);
      setProcessingHistory(prev => [...recognitionResults, ...prev].slice(0, 10)); // Keep last 10
    } catch (error) {
      console.error('Recognition failed:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearResults = () => {
    setResults([]);
    setSelectedFiles([]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Material Recognition</h1>
          <p className="text-muted-foreground">
            Upload images for AI-powered material identification
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="icon">
            <Settings className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon">
            <History className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Recognition Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {processingHistory.length}
            </div>
            <p className="text-xs text-muted-foreground">Total Processed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {processingHistory.length > 0 
                ? Math.round((processingHistory.reduce((acc, r) => acc + r.confidence, 0) / processingHistory.length) * 100) + '%'
                : '0%'
              }
            </div>
            <p className="text-xs text-muted-foreground">Avg Confidence</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {processingHistory.length > 0 
                ? (processingHistory.reduce((acc, r) => acc + r.processingTime, 0) / processingHistory.length).toFixed(1) + 's'
                : '0s'
              }
            </div>
            <p className="text-xs text-muted-foreground">Avg Processing</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">
              {selectedFiles.length}
            </div>
            <p className="text-xs text-muted-foreground">Images Selected</p>
          </CardContent>
        </Card>
      </div>

      {/* Image Upload */}
      <ImageUpload 
        onImagesSelected={handleImagesSelected}
        isProcessing={isProcessing}
      />

      {/* Action Buttons */}
      {selectedFiles.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Badge variant="secondary">
                  {selectedFiles.length} image{selectedFiles.length !== 1 ? 's' : ''} ready
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Ready for AI analysis
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Button 
                  variant="outline" 
                  onClick={clearResults}
                  disabled={isProcessing}
                >
                  Clear
                </Button>
                <Button 
                  onClick={startRecognition}
                  disabled={isProcessing || selectedFiles.length === 0}
                  className="min-w-[140px]"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {isProcessing ? 'Processing...' : 'Start Recognition'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recognition Results */}
      <RecognitionResults 
        results={results}
        isLoading={isProcessing}
      />

      {/* Recent History */}
      {processingHistory.length > 0 && !isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <History className="w-5 h-5 mr-2" />
              Recent Recognition History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {processingHistory.slice(0, 5).map((result, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-muted rounded-lg overflow-hidden">
                      <img 
                        src={result.imageUrl} 
                        alt={result.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{result.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {result.processingTime.toFixed(1)}s processing time
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary">
                    {Math.round(result.confidence * 100)}% confidence
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};