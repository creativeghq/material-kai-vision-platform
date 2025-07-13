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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Upload, AlertCircle, CheckCircle, Clock, Eye, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PDFResultsViewer } from './PDFResultsViewer';

interface ProcessingOptions {
  extractMaterials: boolean;
  language: string;
}

interface ProcessingResult {
  processingId: string;
  knowledgeEntryId: string;
  confidence: number;
  processingTimeMs: number;
  extractedContent: {
    textLength: number;
    title: string;
  };
}

interface ProcessingStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  progress?: number;
  result?: ProcessingResult;
  error?: string;
  errorCategory?: string;
  troubleshooting?: string[];
  technicalDetails?: string;
}

export const PDFProcessor: React.FC = () => {
  const { toast } = useToast();
  const [processing, setProcessing] = useState<ProcessingStatus[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [options, setOptions] = useState<ProcessingOptions>({
    extractMaterials: true,
    language: 'en',
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

    let response: any = null;

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

      // Process using the ConvertAPI pdf-processor
      console.log('Processing PDF with ConvertAPI approach...');
      response = await supabase.functions.invoke('convertapi-pdf-processor', {
        body: {
          fileUrl: publicUrl,
          originalFilename: file.name,
          fileSize: file.size,
          userId: user.id,
          options: options
        }
      });
      
      if (response.error) {
        throw new Error(`PDF processing failed: ${response.error.message}`);
      }

      // Update with successful result
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { 
              ...p, 
              status: 'completed', 
              progress: 100,
              result: response.data
            }
          : p
      ));

      toast({
        title: "ConvertAPI Processing Complete",
        description: `Successfully converted ${file.name} to HTML and added to knowledge base. Text: ${response.data.extractedContent.textLength} chars, HTML: ${response.data.extractedContent.htmlLength} chars, Images: ${response.data.conversionInfo.imagesProcessed}`,
      });

    } catch (error) {
      console.error('PDF processing error:', error);
      
      let errorMessage = 'Unknown error occurred';
      let errorCategory = 'UNKNOWN_ERROR';
      let troubleshooting: string[] = [];
      let technicalDetails = '';

      // Check if it's an enhanced error response from the edge function
      if (response?.data && !response.data.success) {
        errorMessage = response.data.error || 'PDF processing failed';
        errorCategory = response.data.errorCategory || 'PROCESSING_ERROR';
        troubleshooting = response.data.troubleshooting || [];
        technicalDetails = response.data.technicalDetails || '';
      } else if (error instanceof Error) {
        errorMessage = error.message;
        technicalDetails = error.message;
        
        // Add basic troubleshooting for common errors
        if (error.message.includes('network') || error.message.includes('fetch')) {
          errorCategory = 'NETWORK_ERROR';
          troubleshooting = [
            'Check your internet connection',
            'Try again in a few minutes',
            'Verify the PDF file is accessible'
          ];
        } else if (error.message.includes('auth')) {
          errorCategory = 'AUTHENTICATION_ERROR';
          troubleshooting = [
            'Please log in again',
            'Check if your session has expired',
            'Refresh the page and try again'
          ];
        } else if (error.message.includes('upload') || error.message.includes('storage')) {
          errorCategory = 'STORAGE_ERROR';
          troubleshooting = [
            'Check your internet connection',
            'Verify file size is under 50MB',
            'Try uploading again'
          ];
        }
      }
      
      setProcessing(prev => prev.map(p => 
        p.id === processingId 
          ? { 
              ...p, 
              status: 'failed', 
              error: errorMessage,
              errorCategory,
              troubleshooting,
              technicalDetails
            }
          : p
      ));

      toast({
        title: `Processing Failed: ${errorCategory.replace(/_/g, ' ')}`,
        description: `${errorMessage}${troubleshooting.length > 0 ? ' (See troubleshooting steps below)' : ''}`,
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
            PDF Knowledge Base Processor
          </CardTitle>
           <CardDescription>
             Upload PDF documents to convert to HTML with ConvertAPI, extract images, and add to the knowledge base for AI-powered search and analysis.
           </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Processing Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4" />
              <Label className="text-base font-medium">Processing Options</Label>
            </div>
            <Alert>
              <Brain className="h-4 w-4" />
              <AlertDescription>
                ConvertAPI PDF processing converts documents to HTML, downloads all images to local storage, and generates embeddings for intelligent search. The AI agents will analyze and categorize materials on-demand when users search.
              </AlertDescription>
            </Alert>
          </div>

          <Separator />

          {/* Simple Options */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="extractMaterials"
                checked={options.extractMaterials}
                onCheckedChange={(checked) => setOptions(prev => ({ ...prev, extractMaterials: !!checked }))}
              />
              <Label htmlFor="extractMaterials">Enable material analysis hints</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Document Language</Label>
              <Select
                value={options.language}
                onValueChange={(value) => setOptions(prev => ({ ...prev, language: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                </SelectContent>
              </Select>
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
                 <p className="text-sm text-muted-foreground">
                   ConvertAPI processing: Convert PDF to HTML, download images, generate embeddings, and add to knowledge base for AI-powered analysis
                 </p>
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
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            <span>Content: {item.result.extractedContent.textLength} chars</span>
                            <span>Time: {Math.round(item.result.processingTimeMs / 1000)}s</span>
                            <span>Confidence: {Math.round(item.result.confidence * 100)}%</span>
                          </div>
                        </div>
                      )}
                      
                      {item.error && (
                        <div className="mt-2 space-y-2">
                          <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <div className="font-medium text-sm mb-2">
                                {item.errorCategory ? `${item.errorCategory.replace(/_/g, ' ')}: ` : ''}{item.error}
                              </div>
                              {item.troubleshooting && item.troubleshooting.length > 0 && (
                                <div className="text-xs space-y-1">
                                  <div className="font-medium">Troubleshooting Steps:</div>
                                  <ul className="list-disc list-inside space-y-1 ml-2">
                                    {item.troubleshooting.map((step, idx) => (
                                      <li key={idx}>{step}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {item.technicalDetails && (
                                <details className="mt-2">
                                  <summary className="text-xs cursor-pointer text-muted-foreground">Technical Details</summary>
                                  <div className="text-xs mt-1 p-2 bg-muted rounded font-mono">
                                    {item.technicalDetails}
                                  </div>
                                </details>
                              )}
                            </AlertDescription>
                          </Alert>
                        </div>
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