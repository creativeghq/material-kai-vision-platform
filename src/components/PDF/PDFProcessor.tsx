import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileText, Upload, AlertCircle, CheckCircle, Clock, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PDFResultsViewer } from './PDFResultsViewer';

interface ProcessingOptions {
  tileSize: number;
  overlapPercentage: number;
  extractStructuredData: boolean;
  detectMaterials: boolean;
}

interface ProcessingResult {
  processingId: string;
  summary: {
    totalPages: number;
    tilesExtracted: number;
    materialsIdentified: number;
    averageConfidence: number;
    processingTimeMs: number;
    azureModel?: string;
    extractedTables?: number;
    keyValuePairs?: number;
  };
}

interface ProcessingStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  progress?: number;
  result?: ProcessingResult;
  error?: string;
}

export const PDFProcessor: React.FC = () => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<ProcessingStatus[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>({
    tileSize: 512,
    overlapPercentage: 10,
    extractStructuredData: true,
    detectMaterials: true,
  });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      await processFile(file);
    }
  }, [options]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 5,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  const processFile = async (file: File) => {
    const processingId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to processing queue
    setProcessing(prev => [...prev, {
      id: processingId,
      status: 'pending',
      filename: file.name,
      progress: 0
    }]);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Update status to processing
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { ...p, status: 'processing', progress: 10 }
          : p
      ));

      // Upload file to storage
      setUploadProgress(20);
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdf-documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('pdf-documents')
        .getPublicUrl(fileName);

      setUploadProgress(40);
      
      // Update processing status
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { ...p, progress: 50 }
          : p
      ));

      // Call Azure PDF processor edge function (with fallback)
      const { data: processingResult, error: processingError } = await supabase.functions.invoke('azure-pdf-processor', {
        body: {
          fileUrl: publicUrl,
          originalFilename: file.name,
          fileSize: file.size,
          userId: user.id,
          extractionOptions: options
        }
      });

      // If Azure processing fails, fallback to regular PDF processor
      if (processingError) {
        console.warn('Azure processing failed, falling back to standard processor:', processingError);
        
        const { data: fallbackResult, error: fallbackError } = await supabase.functions.invoke('pdf-processor', {
          body: {
            fileUrl: publicUrl,
            originalFilename: file.name,
            fileSize: file.size,
            userId: user.id,
            extractionOptions: options
          }
        });

        if (fallbackError) {
          throw new Error(`Both Azure and fallback processing failed: ${fallbackError.message}`);
        }
        
        // Use fallback result
        setProcessing(prev => prev.map(p => 
          p.id === processingId 
            ? { 
                ...p, 
                status: 'completed', 
                progress: 100,
                result: fallbackResult
              }
            : p
        ));

        toast({
          title: "PDF Processing Complete (Standard Mode)",
          description: `Successfully processed ${file.name} using standard processing. Found ${fallbackResult.summary.materialsIdentified} materials.`,
        });
        return;
      }

      if (processingError) {
        throw new Error(`Processing failed: ${processingError.message}`);
      }

      // Update with successful result
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { 
              ...p, 
              status: 'completed', 
              progress: 100,
              result: processingResult
            }
          : p
      ));

      toast({
        title: "Azure AI Processing Complete",
        description: `Successfully processed ${file.name}. Found ${processingResult.summary.materialsIdentified} materials, ${processingResult.summary.extractedTables || 0} tables, and ${processingResult.summary.keyValuePairs || 0} key-value pairs.`,
      });

    } catch (error) {
      console.error('PDF processing error:', error);
      
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { 
              ...p, 
              status: 'failed', 
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          : p
      ));

      toast({
        title: "Processing Failed",
        description: `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setUploadProgress(0);
    }
  };

  const getStatusIcon = (status: ProcessingStatus['status']) => {
    switch (status) {
      case 'pending':
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = (status: ProcessingStatus['status']) => {
    const variants = {
      pending: 'secondary',
      processing: 'default',
      completed: 'default',
      failed: 'destructive'
    } as const;

    return (
      <Badge variant={variants[status]} className="capitalize">
        {status}
      </Badge>
    );
  };

  // Show results viewer if viewing results
  if (viewingResults) {
    return (
      <PDFResultsViewer 
        processingId={viewingResults} 
        onClose={() => setViewingResults(null)} 
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            AI-Powered PDF Material Catalog Processor
          </CardTitle>
          <CardDescription>
            Upload PDF documents for advanced analysis using Azure AI Document Intelligence. Extracts material specifications, technical data, tables, and structured information with high accuracy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Processing Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tileSize">Tile Size (pixels)</Label>
              <Input
                id="tileSize"
                type="number"
                value={options.tileSize}
                onChange={(e) => setOptions(prev => ({ ...prev, tileSize: parseInt(e.target.value) || 512 }))}
                min="256"
                max="1024"
                step="64"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overlap">Overlap Percentage</Label>
              <Input
                id="overlap"
                type="number"
                value={options.overlapPercentage}
                onChange={(e) => setOptions(prev => ({ ...prev, overlapPercentage: parseInt(e.target.value) || 10 }))}
                min="0"
                max="50"
                step="5"
              />
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="extractStructured"
                checked={options.extractStructuredData}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, extractStructuredData: !!checked }))}
              />
              <Label htmlFor="extractStructured">Extract Structured Data</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="detectMaterials"
                checked={options.detectMaterials}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, detectMaterials: !!checked }))}
              />
              <Label htmlFor="detectMaterials">Detect Materials</Label>
            </div>
          </div>

          <Separator />

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
          >
            <input {...getInputProps()} />
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            {isDragActive ? (
              <p className="text-lg text-primary">Drop PDF files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">Drag & drop PDF files here, or click to select</p>
                <p className="text-sm text-muted-foreground">Supports multiple PDFs up to 50MB each</p>
              </div>
            )}
          </div>

          {uploadProgress > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Processing Queue */}
      {processing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Queue</CardTitle>
            <CardDescription>
              Track the progress of your PDF processing jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {processing.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(item.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{item.filename}</span>
                        {getStatusBadge(item.status)}
                      </div>
                      
                      {item.status === 'processing' && item.progress && (
                        <Progress value={item.progress} className="h-2" />
                      )}
                      
                      {item.result && (
                        <div className="text-sm text-muted-foreground mt-2">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <span>Pages: {item.result.summary.totalPages}</span>
                          <span>Tiles: {item.result.summary.tilesExtracted}</span>
                          <span>Materials: {item.result.summary.materialsIdentified}</span>
                          <span>Confidence: {Math.round(item.result.summary.averageConfidence * 100)}%</span>
                        </div>
                        {item.result.summary.extractedTables !== undefined && (
                          <div className="grid grid-cols-2 gap-2 mt-1 text-xs">
                            <span>Tables: {item.result.summary.extractedTables}</span>
                            <span>Key-Value Pairs: {item.result.summary.keyValuePairs}</span>
                          </div>
                        )}
                        </div>
                      )}
                      
                      {item.error && (
                        <Alert className="mt-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription>{item.error}</AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                  
                  {item.status === 'completed' && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setViewingResults(item.result?.processingId || item.id)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Results
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};