import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import ProcessingModal from '@/components/ProcessingModal';
import { consolidatedPDFWorkflowService } from '@/services/consolidatedPDFWorkflowService';
import { supabase } from '@/integrations/supabase/client';
import { Upload, Link, FileText, Settings, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ProcessingOptions {
  extractImages?: boolean;
  extractTables?: boolean;
  generateEmbeddings?: boolean;
  analyzeMaterials?: boolean;
  enableOCR?: boolean;
}

interface EnhancedPDFUploadProps {
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

const EnhancedPDFUpload: React.FC<EnhancedPDFUploadProps> = ({
  onComplete,
  onError,
  className
}) => {
  const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('file');
  const [fileUrl, setFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>({
    extractImages: true,
    extractTables: true,
    generateEmbeddings: true,
    analyzeMaterials: true,
    enableOCR: true
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadMethod('file');
    } else {
      toast.error('Please select a valid PDF file');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const handleUrlSubmit = () => {
    if (!fileUrl.trim()) {
      toast.error('Please enter a valid URL');
      return;
    }

    if (!fileUrl.toLowerCase().endsWith('.pdf')) {
      toast.error('URL must point to a PDF file');
      return;
    }

    startProcessing();
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    // For file upload, we need to upload to Supabase storage first
    try {
      setIsProcessing(true);
      
      // Upload file to Supabase storage
      const fileExt = selectedFile.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('pdf-documents')
        .upload(fileName, selectedFile);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('pdf-documents')
        .getPublicUrl(fileName);

      // Start processing with the uploaded file URL
      await startProcessingWithUrl(publicUrl, selectedFile.name);
      
    } catch (error) {
      console.error('File upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      setIsProcessing(false);
    }
  };

  const startProcessing = () => {
    if (uploadMethod === 'url') {
      startProcessingWithUrl(fileUrl, 'document.pdf');
    } else {
      handleFileUpload();
    }
  };

  const startProcessingWithUrl = async (url: string, filename: string) => {
    try {
      setIsProcessing(true);
      setShowProcessingModal(true);

      // Start processing with polling
      const jobId = await consolidatedPDFWorkflowService.startProcessingWithPolling(
        url,
        filename,
        processingOptions,
        (status) => {
          console.log('Processing status update:', status);
        }
      );

      setCurrentJobId(jobId);
      toast.success('Processing started successfully');

    } catch (error) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      toast.error(errorMessage);
      
      if (onError) {
        onError(errorMessage);
      }
      
      setIsProcessing(false);
      setShowProcessingModal(false);
    }
  };

  const handleProcessingComplete = (result: any) => {
    setIsProcessing(false);
    setShowProcessingModal(false);
    setCurrentJobId(null);
    setSelectedFile(null);
    setFileUrl('');
    
    toast.success('Document processed successfully!');
    
    if (onComplete) {
      onComplete(result);
    }
  };

  const handleProcessingError = (error: string) => {
    setIsProcessing(false);
    setShowProcessingModal(false);
    setCurrentJobId(null);
    
    toast.error(`Processing failed: ${error}`);
    
    if (onError) {
      onError(error);
    }
  };

  const handleCloseModal = () => {
    setShowProcessingModal(false);
    // Don't reset processing state - let it continue in background
  };

  return (
    <div className={cn("space-y-6", className)}>
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center space-x-2">
            <FileText className="w-5 h-5" />
            <span>PDF Document Processing</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Method Selection */}
          <div className="flex space-x-4">
            <Button
              variant={uploadMethod === 'file' ? 'default' : 'outline'}
              onClick={() => setUploadMethod('file')}
              className="flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </Button>
            <Button
              variant={uploadMethod === 'url' ? 'default' : 'outline'}
              onClick={() => setUploadMethod('url')}
              className="flex items-center space-x-2"
            >
              <Link className="w-4 h-4" />
              <span>From URL</span>
            </Button>
          </div>

          {/* File Upload */}
          {uploadMethod === 'file' && (
            <div className="space-y-4">
              <div
                {...getRootProps()}
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                  isDragActive ? "border-blue-500 bg-blue-500/10" : "border-gray-600 hover:border-gray-500",
                  selectedFile && "border-green-500 bg-green-500/10"
                )}
              >
                <input {...getInputProps()} />
                <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                {selectedFile ? (
                  <div>
                    <p className="text-green-400 font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-gray-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-300 mb-2">
                      {isDragActive ? 'Drop the PDF here' : 'Drag & drop a PDF file here'}
                    </p>
                    <p className="text-sm text-gray-400">or click to select</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* URL Input */}
          {uploadMethod === 'url' && (
            <div className="space-y-2">
              <Label htmlFor="pdf-url" className="text-gray-300">PDF URL</Label>
              <Input
                id="pdf-url"
                type="url"
                placeholder="https://example.com/document.pdf"
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                className="bg-gray-800 border-gray-600 text-white"
              />
            </div>
          )}

          {/* Processing Options */}
          <Card className="bg-gray-800 border-gray-600">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-300 flex items-center space-x-2">
                <Settings className="w-4 h-4" />
                <span>Processing Options</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="extract-images"
                    checked={processingOptions.extractImages}
                    onCheckedChange={(checked) =>
                      setProcessingOptions(prev => ({ ...prev, extractImages: !!checked }))
                    }
                  />
                  <Label htmlFor="extract-images" className="text-sm text-gray-300">
                    Extract Images
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="extract-tables"
                    checked={processingOptions.extractTables}
                    onCheckedChange={(checked) =>
                      setProcessingOptions(prev => ({ ...prev, extractTables: !!checked }))
                    }
                  />
                  <Label htmlFor="extract-tables" className="text-sm text-gray-300">
                    Extract Tables
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="generate-embeddings"
                    checked={processingOptions.generateEmbeddings}
                    onCheckedChange={(checked) =>
                      setProcessingOptions(prev => ({ ...prev, generateEmbeddings: !!checked }))
                    }
                  />
                  <Label htmlFor="generate-embeddings" className="text-sm text-gray-300">
                    Generate Embeddings
                  </Label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="analyze-materials"
                    checked={processingOptions.analyzeMaterials}
                    onCheckedChange={(checked) =>
                      setProcessingOptions(prev => ({ ...prev, analyzeMaterials: !!checked }))
                    }
                  />
                  <Label htmlFor="analyze-materials" className="text-sm text-gray-300">
                    Analyze Materials
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Process Button */}
          <Button
            onClick={startProcessing}
            disabled={isProcessing || (uploadMethod === 'file' && !selectedFile) || (uploadMethod === 'url' && !fileUrl.trim())}
            className="w-full"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Start Processing
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Processing Modal */}
      <ProcessingModal
        isOpen={showProcessingModal}
        onClose={handleCloseModal}
        jobId={currentJobId || undefined}
        title="Processing PDF Document"
        onComplete={handleProcessingComplete}
        onError={handleProcessingError}
      />
    </div>
  );
};

export default EnhancedPDFUpload;
