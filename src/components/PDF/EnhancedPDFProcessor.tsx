import React, { useState, useCallback, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Upload, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Eye, 
  Brain,
  Search,
  Image,
  Layout,
  Zap,
  Settings,
  BarChart3
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  hybridPDFPipelineAPI, 
  type ProcessingOptions, 
  type ProcessingStatus,
  type ProcessingResults,
  formatProcessingStatus,
  getQualityColor,
  getQualityLabel
} from '@/services/hybridPDFPipelineAPI';

interface EnhancedProcessingOptions extends ProcessingOptions {
  enableLayoutAnalysis: boolean;
  enableImageMapping: boolean;
  chunkingStrategy: 'semantic' | 'fixed' | 'hybrid';
  maxChunkSize: number;
  overlapSize: number;
}

interface ProcessingJob {
  id: string;
  filename: string;
  documentId?: string;
  processingId?: string;
  status: ProcessingStatus['status'];
  progress: number;
  currentStep: string;
  results?: ProcessingResults;
  error?: string;
  startTime: Date;
  endTime?: Date;
}

export const EnhancedPDFProcessor: React.FC = () => {
  const { toast } = useToast();
  const [processingJobs, setProcessingJobs] = useState<ProcessingJob[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [options, setOptions] = useState<EnhancedProcessingOptions>({
    enableLayoutAnalysis: true,
    enableImageMapping: true,
    chunkingStrategy: 'hybrid',
    maxChunkSize: 1000,
    overlapSize: 100,
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
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Add to processing queue
    const newJob: ProcessingJob = {
      id: jobId,
      filename: file.name,
      status: 'pending',
      progress: 0,
      currentStep: 'Initializing...',
      startTime: new Date()
    };

    setProcessingJobs(prev => [...prev, newJob]);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Update status
      updateJobStatus(jobId, 'processing', 10, 'Uploading file...');

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
      updateJobStatus(jobId, 'processing', 30, 'Creating document record...');

      // For demo purposes, simulate document creation without calling the problematic PDF processor
      updateJobStatus(jobId, 'processing', 50, 'Creating document record (demo mode)...');
      
      // Generate a mock document ID
      const documentId = `demo-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Update job with document ID
      setProcessingJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, documentId } : job
      ));

      updateJobStatus(jobId, 'processing', 60, 'Starting enhanced processing simulation...');
      // For now, simulate enhanced processing until hybrid pipeline functions are deployed
      updateJobStatus(jobId, 'processing', 70, 'Simulating enhanced processing...');
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      updateJobStatus(jobId, 'processing', 90, 'Finalizing enhanced features...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Create mock results structure for now
      const mockResults = {
        documentId,
        chunks: [
          {
            id: 'chunk-1',
            documentId: documentId,
            chunkIndex: 0,
            text: 'Sample enhanced chunk with layout awareness',
            htmlContent: '<p>Sample enhanced chunk with layout awareness</p>',
            chunkType: 'paragraph' as const,
            hierarchyLevel: 1,
            pageNumber: 1,
            metadata: { enhanced: true },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ],
        images: [],
        layout: [],
        quality: {
          id: 'quality-1',
          documentId: documentId,
          layoutPreservation: 0.85,
          chunkingQuality: 0.90,
          imageMappingAccuracy: 0.80,
          overallQuality: 0.85,
          statistics: { totalChunks: 1, totalImages: 0 },
          processingTimeMs: 3000,
          createdAt: new Date().toISOString()
        },
        summary: {
          totalChunks: 1,
          totalImages: 0,
          totalPages: 1,
          overallQuality: 0.85
        }
      };
      
      updateJobStatus(jobId, 'completed', 100, 'Enhanced processing completed (simulation mode)');
      setProcessingJobs(prev => prev.map(job =>
        job.id === jobId
          ? { ...job, results: mockResults, endTime: new Date() }
          : job
      ));

      toast({
        title: "Enhanced Processing Complete (Demo Mode)",
        description: `Successfully demonstrated enhanced processing for ${file.name}. File uploaded and demo workflow completed. Deploy the hybrid pipeline backend for full functionality.`,
      });

    } catch (error) {
      console.error('Enhanced PDF processing error:', error);
      
      updateJobStatus(
        jobId, 
        'failed', 
        0, 
        'Processing failed',
        error instanceof Error ? error.message : 'Unknown error'
      );

      toast({
        title: "Processing Failed",
        description: `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setUploadProgress(0);
    }
  };

  const updateJobStatus = (
    jobId: string, 
    status: ProcessingStatus['status'], 
    progress: number, 
    currentStep: string,
    error?: string
  ) => {
    setProcessingJobs(prev => prev.map(job => 
      job.id === jobId 
        ? { ...job, status, progress, currentStep, error }
        : job
    ));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    try {
      // For now, simulate search until hybrid pipeline functions are deployed
      const mockResults = [
        {
          id: 'result-1',
          text: `Sample search result for "${searchQuery}". This demonstrates the enhanced search functionality that will be available once the hybrid pipeline is fully deployed.`,
          chunk_type: 'paragraph',
          page_number: 1,
          chunk_index: 0,
          similarity_score: 0.85,
          metadata: { enhanced: true }
        },
        {
          id: 'result-2',
          text: `Another relevant result for "${searchQuery}". The enhanced processor will provide semantic search with layout-aware chunking.`,
          chunk_type: 'heading',
          page_number: 1,
          chunk_index: 1,
          similarity_score: 0.78,
          metadata: { enhanced: true }
        }
      ];
      
      setSearchResults(mockResults);
      
      toast({
        title: "Search Complete (Demo Mode)",
        description: `Found ${mockResults.length} sample results. Full search will be available once hybrid pipeline is deployed.`,
      });
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">Upload & Process</TabsTrigger>
          <TabsTrigger value="search">Search Documents</TabsTrigger>
          <TabsTrigger value="results">Processing Results</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-6">
          {/* Upload Area */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Enhanced PDF Pipeline
              </CardTitle>
              <CardDescription>
                Advanced PDF processing with layout-aware chunking, image-text mapping, and semantic analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Processing Options */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <Label className="text-base font-medium">Processing Configuration</Label>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableLayoutAnalysis"
                      checked={options.enableLayoutAnalysis}
                      onCheckedChange={(checked) => setOptions(prev => ({ 
                        ...prev, 
                        enableLayoutAnalysis: !!checked 
                      }))}
                    />
                    <Label htmlFor="enableLayoutAnalysis" className="flex items-center gap-2">
                      <Layout className="h-4 w-4" />
                      Layout Analysis
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enableImageMapping"
                      checked={options.enableImageMapping}
                      onCheckedChange={(checked) => setOptions(prev => ({ 
                        ...prev, 
                        enableImageMapping: !!checked 
                      }))}
                    />
                    <Label htmlFor="enableImageMapping" className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Image-Text Mapping
                    </Label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="chunkingStrategy">Chunking Strategy</Label>
                    <Select
                      value={options.chunkingStrategy}
                      onValueChange={(value: 'semantic' | 'fixed' | 'hybrid') => 
                        setOptions(prev => ({ ...prev, chunkingStrategy: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="semantic">Semantic</SelectItem>
                        <SelectItem value="fixed">Fixed Size</SelectItem>
                        <SelectItem value="hybrid">Hybrid (Recommended)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxChunkSize">Max Chunk Size</Label>
                    <Input
                      id="maxChunkSize"
                      type="number"
                      value={options.maxChunkSize}
                      onChange={(e) => setOptions(prev => ({ 
                        ...prev, 
                        maxChunkSize: parseInt(e.target.value) || 1000 
                      }))}
                      min={100}
                      max={5000}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="overlapSize">Overlap Size</Label>
                    <Input
                      id="overlapSize"
                      type="number"
                      value={options.overlapSize}
                      onChange={(e) => setOptions(prev => ({ 
                        ...prev, 
                        overlapSize: parseInt(e.target.value) || 100 
                      }))}
                      min={0}
                      max={500}
                    />
                  </div>
                </div>

                <Alert>
                  <Brain className="h-4 w-4" />
                  <AlertDescription>
                    Enhanced pipeline preserves document layout, creates semantic chunks, and maps images to relevant text for superior RAG performance.
                  </AlertDescription>
                </Alert>
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
                      Advanced processing with layout preservation, semantic chunking, and image mapping
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
        </TabsContent>

        <TabsContent value="search" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Semantic Document Search
              </CardTitle>
              <CardDescription>
                Search through processed documents using semantic similarity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter your search query..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button onClick={handleSearch}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium">Search Results ({searchResults.length})</h3>
                  {searchResults.map((result, index) => (
                    <Card key={index} className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline">
                          Similarity: {Math.round(result.similarity_score * 100)}%
                        </Badge>
                        <Badge variant="secondary">
                          {result.chunk_type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        Page {result.page_number} • Chunk {result.chunk_index}
                      </p>
                      <p className="text-sm">{result.text.substring(0, 300)}...</p>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {/* Processing Queue */}
          {processingJobs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Processing Queue
                </CardTitle>
                <CardDescription>
                  Track the progress of your enhanced PDF processing jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {processingJobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(job.status)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{job.filename}</span>
                            {getStatusBadge(job.status)}
                          </div>
                          
                          <div className="text-sm text-muted-foreground mb-2">
                            {formatProcessingStatus({
                              processingId: job.processingId || '',
                              status: job.status,
                              progress: job.progress,
                              currentStep: job.currentStep,
                              startTime: job.startTime.toISOString()
                            })}
                          </div>
                          
                          {job.status === 'processing' && (
                            <Progress value={job.progress} className="h-2" />
                          )}
                          
                          {job.results && (
                            <div className="text-sm text-muted-foreground mt-2">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <span>Chunks: {job.results.chunks.length}</span>
                                <span>Images: {job.results.images.length}</span>
                                <span>Pages: {job.results.layout.length}</span>
                                <span className={`text-${getQualityColor(job.results.quality?.overallQuality || 0)}-600`}>
                                  Quality: {getQualityLabel(job.results.quality?.overallQuality || 0)}
                                </span>
                              </div>
                            </div>
                          )}
                          
                          {job.error && (
                            <Alert className="mt-2">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{job.error}</AlertDescription>
                            </Alert>
                          )}
                        </div>
                      </div>
                      
                      {job.status === 'completed' && job.results && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setViewingResults(job.documentId || job.id)}
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
        </TabsContent>
      </Tabs>
    </div>
  );
};