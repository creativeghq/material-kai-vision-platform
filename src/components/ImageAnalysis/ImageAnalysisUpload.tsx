import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, FileImage, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { useImageAnalysis } from '../../hooks/useImageAnalysis';
import { ImageAnalysisRequest } from '../../services/imageAnalysis/ImageAnalysisService';

interface ImageAnalysisUploadProps {
  onAnalysisComplete?: (analysisId: string) => void;
  onAnalysisStart?: (analysisId: string) => void;
  maxFiles?: number;
  acceptedFileTypes?: string[];
  className?: string;
}

interface FileWithPreview extends File {
  preview?: string;
  analysisId?: string;
  progress?: number;
  status?: 'pending' | 'analyzing' | 'completed' | 'failed';
  error?: string;
}

const ImageAnalysisUpload: React.FC<ImageAnalysisUploadProps> = ({
  onAnalysisComplete,
  onAnalysisStart,
  maxFiles = 10,
  acceptedFileTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
  className = '',
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analysisType, setAnalysisType] = useState<ImageAnalysisRequest['analysisType']>('full_analysis');
  const [options, setOptions] = useState({
    language: 'en',
    confidence_threshold: 0.8,
    extract_tables: true,
    extract_forms: true,
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { analyzeImage, results, isAnalyzing } = useImageAnalysis({
    onComplete: (result) => {
      // Update file status
      setFiles(prev => prev.map(file => 
        file.analysisId === result.id 
          ? { ...file, status: 'completed', progress: 100 }
          : file
      ));
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result.id);
      }
    },
    onError: (error) => {
      console.error('Analysis error:', error);
    },
    onProgress: (progress) => {
      // Update progress for active analyses
      const activeResults = results.filter(r => r.status === 'processing');
      if (activeResults.length > 0) {
        const latestResult = activeResults[activeResults.length - 1];
        if (latestResult) {
          setFiles(prev => prev.map(file =>
            file.analysisId === latestResult.id
              ? { ...file, progress }
              : file
          ));
        }
      }
    },
  });

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | File[]) => {
    const fileArray = Array.from(selectedFiles);
    const validFiles = fileArray.filter(file => {
      if (!acceptedFileTypes.includes(file.type)) {
        console.warn(`File type ${file.type} not accepted`);
        return false;
      }
      if (file.size > 50 * 1024 * 1024) { // 50MB limit
        console.warn(`File ${file.name} is too large`);
        return false;
      }
      return true;
    });

    if (files.length + validFiles.length > maxFiles) {
      console.warn(`Cannot upload more than ${maxFiles} files`);
      return;
    }

    const filesWithPreview = validFiles.map(file => {
      const fileWithPreview = file as FileWithPreview;
      fileWithPreview.status = 'pending';
      fileWithPreview.progress = 0;
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        fileWithPreview.preview = URL.createObjectURL(file);
      }
      
      return fileWithPreview;
    });

    setFiles(prev => [...prev, ...filesWithPreview]);
  }, [files.length, maxFiles, acceptedFileTypes]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    handleFileSelect(droppedFiles);
  }, [handleFileSelect]);

  // Handle file input change
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFileSelect(e.target.files);
    }
  }, [handleFileSelect]);

  // Remove file
  const removeFile = useCallback((index: number) => {
    setFiles(prev => {
      const newFiles = [...prev];
      const file = newFiles[index];
      
      // Revoke preview URL to prevent memory leaks
      if (file && file.preview) {
        URL.revokeObjectURL(file.preview);
      }
      
      newFiles.splice(index, 1);
      return newFiles;
    });
  }, []);

  // Start analysis for all pending files
  const startAnalysis = useCallback(async () => {
    const pendingFiles = files.filter(file => file.status === 'pending');
    
    for (const file of pendingFiles) {
      try {
        // Update file status to analyzing
        setFiles(prev => prev.map(f => 
          f === file ? { ...f, status: 'analyzing' } : f
        ));
        
        const analysisId = await analyzeImage(file, {
          analysisType,
          options,
        });
        
        // Update file with analysis ID
        setFiles(prev => prev.map(f => 
          f === file ? { ...f, analysisId } : f
        ));
        
        if (onAnalysisStart) {
          onAnalysisStart(analysisId);
        }
      } catch (error) {
        // Update file status to failed
        setFiles(prev => prev.map(f => 
          f === file 
            ? { 
                ...f, 
                status: 'failed', 
                error: error instanceof Error ? error.message : 'Analysis failed' 
              } 
            : f
        ));
      }
    }
  }, [files, analyzeImage, analysisType, options, onAnalysisStart]);

  // Clear all files
  const clearFiles = useCallback(() => {
    files.forEach(file => {
      if (file.preview) {
        URL.revokeObjectURL(file.preview);
      }
    });
    setFiles([]);
  }, [files]);

  // Get status icon
  const getStatusIcon = (status: FileWithPreview['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-gray-500" />;
      case 'analyzing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Get status color
  const getStatusColor = (status: FileWithPreview['status']) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'analyzing':
        return 'default';
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const pendingFilesCount = files.filter(f => f.status === 'pending').length;
  const canStartAnalysis = pendingFilesCount > 0 && !isAnalyzing;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileImage className="h-5 w-5" />
            Image Analysis Upload
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`
              border-2 border-dashed rounded-lg p-8 text-center transition-colors
              ${isDragOver 
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' 
                : 'border-gray-300 dark:border-gray-600'
              }
              ${files.length >= maxFiles ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}
            `}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">
              Drop files here or click to upload
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Supports JPEG, PNG, GIF, WebP, and PDF files up to 50MB
            </p>
            <p className="text-xs text-gray-400">
              {files.length} / {maxFiles} files uploaded
            </p>
            
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptedFileTypes.join(',')}
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </CardContent>
      </Card>

      {/* Analysis Options */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Analysis Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="analysis-type">Analysis Type</Label>
                <Select
                  value={analysisType}
                  onValueChange={(value: ImageAnalysisRequest['analysisType']) => 
                    setAnalysisType(value)
                  }
                >
                  <SelectTrigger id="analysis-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ocr">OCR Only</SelectItem>
                    <SelectItem value="object_detection">Object Detection</SelectItem>
                    <SelectItem value="classification">Classification</SelectItem>
                    <SelectItem value="full_analysis">Full Analysis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">Language</Label>
                <Select
                  value={options.language}
                  onValueChange={(value) => 
                    setOptions(prev => ({ ...prev, language: value }))
                  }
                >
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="de">German</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="extract-tables"
                  checked={options.extract_tables}
                  onCheckedChange={(checked) =>
                    setOptions(prev => ({ ...prev, extract_tables: !!checked }))
                  }
                />
                <Label htmlFor="extract-tables">Extract Tables</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="extract-forms"
                  checked={options.extract_forms}
                  onCheckedChange={(checked) =>
                    setOptions(prev => ({ ...prev, extract_forms: !!checked }))
                  }
                />
                <Label htmlFor="extract-forms">Extract Forms</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Files ({files.length})</CardTitle>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={clearFiles}
                disabled={isAnalyzing}
              >
                Clear All
              </Button>
              <Button
                onClick={startAnalysis}
                disabled={!canStartAnalysis}
                className="min-w-[120px]"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  `Analyze ${pendingFilesCount} File${pendingFilesCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 p-3 border rounded-lg"
                >
                  {/* File Preview */}
                  <div className="flex-shrink-0">
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-12 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                        <FileImage className="h-6 w-6 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* File Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <Badge variant={getStatusColor(file.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(file.status)}
                          {file.status}
                        </span>
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    
                    {file.status === 'analyzing' && file.progress !== undefined && (
                      <div className="mt-2">
                        <Progress value={file.progress} className="h-2" />
                        <p className="text-xs text-gray-500 mt-1">
                          {file.progress}% complete
                        </p>
                      </div>
                    )}
                    
                    {file.status === 'failed' && file.error && (
                      <p className="text-xs text-red-500 mt-1">{file.error}</p>
                    )}
                  </div>

                  {/* Remove Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(index)}
                    disabled={file.status === 'analyzing'}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ImageAnalysisUpload;