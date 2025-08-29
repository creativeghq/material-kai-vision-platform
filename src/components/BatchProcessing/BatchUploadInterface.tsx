import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  Image,
  File,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader2,
  Settings,
  Play,
  Trash2,
  Download,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';

// Utility function for formatting bytes
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

export interface BatchFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface BatchProcessingConfig {
  processingType: 'pdf_extraction' | 'image_analysis' | 'document_parsing' | 'custom';
  options: {
    extractText?: boolean;
    extractImages?: boolean;
    extractTables?: boolean;
    ocrEnabled?: boolean;
    languageDetection?: boolean;
    customPrompt?: string;
    outputFormat?: 'json' | 'markdown' | 'text';
    batchSize?: number;
    priority?: 'low' | 'normal' | 'high';
  };
}

export interface BatchUploadInterfaceProps {
  websocketUrl: string;
  maxFiles?: number;
  maxFileSize?: number;
  acceptedFileTypes?: string[];
  className?: string;
  onBatchStart?: (batchId: string, files: BatchFile[]) => void;
  onBatchComplete?: (batchId: string, results: Record<string, unknown>[]) => void;
  onFileComplete?: (file: BatchFile) => void;
  onError?: (error: string) => void;
}

const getFileIcon = (file: File) => {
  if (file.type.startsWith('image/')) return Image;
  if (file.type === 'application/pdf') return FileText;
  return File;
};

const getStatusConfig = (status: BatchFile['status']) => {
  switch (status) {
    case 'uploading':
      return {
        icon: Loader2,
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        label: 'Uploading',
        animate: true,
      };
    case 'processing':
      return {
        icon: Loader2,
        color: 'text-yellow-600',
        bgColor: 'bg-yellow-100',
        label: 'Processing',
        animate: true,
      };
    case 'completed':
      return {
        icon: CheckCircle,
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        label: 'Completed',
      };
    case 'failed':
      return {
        icon: AlertCircle,
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        label: 'Failed',
      };
    case 'pending':
    default:
      return {
        icon: Clock,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        label: 'Pending',
      };
  }
};

export const BatchUploadInterface: React.FC<BatchUploadInterfaceProps> = ({
  websocketUrl,
  maxFiles = 50,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  acceptedFileTypes = ['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.docx'],
  className,
  onBatchStart,
  onBatchComplete,
  onFileComplete,
  onError,
}) => {
  const [files, setFiles] = useState<BatchFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [config, setConfig] = useState<BatchProcessingConfig>({
    processingType: 'pdf_extraction',
    options: {
      extractText: true,
      extractImages: false,
      extractTables: false,
      ocrEnabled: true,
      languageDetection: true,
      outputFormat: 'json',
      batchSize: 5,
      priority: 'normal',
    },
  });

  const { send, isConnected } = useWebSocket(websocketUrl, {
    onMessage: (message) => {
      if (message.type === 'batch_file_update' && message.payload.batchId === batchId) {
        const { fileId, status, progress, error, result } = message.payload as {
          fileId: string;
          status: 'pending' | 'uploading' | 'processing' | 'completed' | 'failed';
          progress: number;
          error?: string;
          result?: Record<string, unknown>;
          batchId: string;
        };

        setFiles(prev => prev.map(file =>
          file.id === fileId
            ? {
                ...file,
                status,
                progress,
                ...(error !== undefined && { error }),
                ...(result !== undefined && { result })
              }
            : file,
        ));

        const updatedFile = files.find(f => f.id === fileId);
        if (updatedFile && status === 'completed' && onFileComplete) {
          onFileComplete({
            ...updatedFile,
            status,
            progress,
            ...(error !== undefined && { error }),
            ...(result !== undefined && { result })
          });
        }
      }

      if (message.type === 'batch_complete' && message.payload.batchId === batchId) {
        setIsProcessing(false);
        if (onBatchComplete && batchId) {
          onBatchComplete(batchId, message.payload.results as Record<string, unknown>[]);
        }
      }

      if (message.type === 'batch_error' && message.payload.batchId === batchId) {
        setIsProcessing(false);
        if (onError) {
          onError(message.payload.error as string);
        }
      }
    },
  });

  const validateFile = useCallback((file: File): string | null => {
    if (file.size > maxFileSize) {
      return `File size exceeds ${formatBytes(maxFileSize)} limit`;
    }

    const extension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!acceptedFileTypes.includes(extension)) {
      return `File type ${extension} not supported`;
    }

    return null;
  }, [maxFileSize, acceptedFileTypes]);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);
    const validFiles: BatchFile[] = [];
    const errors: string[] = [];

    fileArray.forEach(file => {
      if (files.length + validFiles.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const error = validateFile(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        return;
      }

      validFiles.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: 'pending',
        progress: 0,
      });
    });

    if (errors.length > 0 && onError) {
      onError(errors.join('\n'));
    }

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, [files.length, maxFiles, validateFile, onError]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    addFiles(droppedFiles);
  }, [addFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
  }, [addFiles]);

  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const clearAll = () => {
    setFiles([]);
    setBatchId(null);
    setIsProcessing(false);
  };

  const startProcessing = async () => {
    if (files.length === 0 || !isConnected) return;

    const newBatchId = `batch-${Date.now()}`;
    setBatchId(newBatchId);
    setIsProcessing(true);

    // Update all files to uploading status
    setFiles(prev => prev.map(file => ({ ...file, status: 'uploading' as const })));

    if (onBatchStart) {
      onBatchStart(newBatchId, files);
    }

    // Send batch processing request
    send({
      type: 'start_batch_processing',
      payload: {
        batchId: newBatchId,
        files: files.map(f => ({
          id: f.id,
          name: f.file.name,
          size: f.file.size,
          type: f.file.type,
        })),
        config,
      },
    });

    // Upload files
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file.file);
        formData.append('batchId', newBatchId);
        formData.append('fileId', file.id);

        // This would be replaced with actual upload logic
        // For now, simulate upload progress
        for (let progress = 0; progress <= 100; progress += 10) {
          await new Promise(resolve => setTimeout(resolve, 100));
          setFiles(prev => prev.map(f =>
            f.id === file.id ? { ...f, progress } : f,
          ));
        }

        setFiles(prev => prev.map(f =>
          f.id === file.id ? { ...f, status: 'processing' } : f,
        ));
      } catch {
        setFiles(prev => prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'failed', error: 'Upload failed' }
            : f,
        ));
      }
    }
  };

  const downloadResults = () => {
    const completedFiles = files.filter(f => f.status === 'completed' && f.result);
    const results = completedFiles.map(f => ({
      filename: f.file.name,
      result: f.result,
    }));

    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${batchId || Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const completedCount = files.filter(f => f.status === 'completed').length;
  const failedCount = files.filter(f => f.status === 'failed').length;
  const overallProgress = files.length > 0 ? (completedCount + failedCount) / files.length * 100 : 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Upload Area */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Batch File Upload</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                className="border border-border bg-background text-foreground"

                onClick={() => setShowConfig(!showConfig)}
              >
                <Settings className="h-4 w-4 mr-1" />
                Configure
              </Button>
              {files.length > 0 && (
                <Button
                  className="border border-border bg-background text-foreground"

                  onClick={clearAll}
                  disabled={isProcessing}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Configuration Panel */}
          {showConfig && (
            <div className="p-4 border rounded-lg bg-gray-50 space-y-4">
              <h4 className="font-medium">Processing Configuration</h4>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="processing-type">Processing Type</Label>
                  <Select
                    value={config.processingType}
                    onValueChange={(value: BatchProcessingConfig['processingType']) =>
                      setConfig(prev => ({ ...prev, processingType: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf_extraction">PDF Extraction</SelectItem>
                      <SelectItem value="image_analysis">Image Analysis</SelectItem>
                      <SelectItem value="document_parsing">Document Parsing</SelectItem>
                      <SelectItem value="custom">Custom Processing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="output-format">Output Format</Label>
                  <Select
                    value={config.options.outputFormat || 'json'}
                    onValueChange={(value: 'json' | 'markdown' | 'text') =>
                      setConfig(prev => ({
                        ...prev,
                        options: { ...prev.options, outputFormat: value },
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="text">Plain Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="extract-text"
                    checked={config.options.extractText || false}
                    onCheckedChange={(checked: boolean) =>
                      setConfig(prev => ({
                        ...prev,
                        options: { ...prev.options, extractText: !!checked },
                      }))
                    }
                  />
                  <Label htmlFor="extract-text">Extract Text</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="extract-images"
                    checked={config.options.extractImages || false}
                    onCheckedChange={(checked: boolean) =>
                      setConfig(prev => ({
                        ...prev,
                        options: { ...prev.options, extractImages: !!checked },
                      }))
                    }
                  />
                  <Label htmlFor="extract-images">Extract Images</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ocr-enabled"
                    checked={config.options.ocrEnabled || false}
                    onCheckedChange={(checked: boolean) =>
                      setConfig(prev => ({
                        ...prev,
                        options: { ...prev.options, ocrEnabled: !!checked },
                      }))
                    }
                  />
                  <Label htmlFor="ocr-enabled">Enable OCR</Label>
                </div>
              </div>

              {config.processingType === 'custom' && (
                <div>
                  <Label htmlFor="custom-prompt">Custom Processing Prompt</Label>
                  <Textarea
                    id="custom-prompt"
                    placeholder="Describe what you want to extract or analyze..."
                    value={config.options.customPrompt || ''}
                    onChange={(e) =>
                      setConfig(prev => ({
                        ...prev,
                        options: { ...prev.options, customPrompt: e.target.value },
                      }))
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Drop Zone */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
              files.length === 0 ? 'py-12' : 'py-6',
            )}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <Upload className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <div className="space-y-2">
              <p className="text-lg font-medium">
                Drop files here or{' '}
                <button
                  className="text-blue-600 hover:text-blue-700 underline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse
                </button>
              </p>
              <p className="text-sm text-gray-500">
                Supports: {acceptedFileTypes.join(', ')} • Max {formatBytes(maxFileSize)} per file • Up to {maxFiles} files
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptedFileTypes.join(',')}
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Files ({files.length})</h4>
                {!isProcessing && (
                  <Button
                    onClick={startProcessing}
                    disabled={!isConnected || files.length === 0}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    Start Processing
                  </Button>
                )}
              </div>

              {/* Overall Progress */}
              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Overall Progress</span>
                    <span>{Math.round(overallProgress)}%</span>
                  </div>
                  <Progress value={overallProgress} className="h-2" />
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span>Completed: {completedCount}</span>
                    <span>Failed: {failedCount}</span>
                    <span>Remaining: {files.length - completedCount - failedCount}</span>
                  </div>
                </div>
              )}

              {/* File Items */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {files.map((file) => {
                  const FileIcon = getFileIcon(file.file);
                  const statusConfig = getStatusConfig(file.status);
                  const StatusIcon = statusConfig.icon;

                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 p-3 border rounded-lg"
                    >
                      <FileIcon className="h-8 w-8 text-gray-400" />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium truncate">
                            {file.file.name}
                          </p>
                          <div className="flex items-center gap-2">
                            <Badge className="border border-border bg-background text-foreground text-xs">
                              {formatBytes(file.file.size)}
                            </Badge>
                            <div className={cn(
                              'flex items-center gap-1 px-2 py-1 rounded text-xs',
                              statusConfig.bgColor,
                            )}>
                              <StatusIcon
                                className={cn(
                                  'h-3 w-3',
                                  statusConfig.color,
                                  statusConfig.animate && 'animate-spin',
                                )}
                              />
                              <span className={statusConfig.color}>
                                {statusConfig.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {(file.status === 'uploading' || file.status === 'processing') && (
                          <div className="mt-2">
                            <Progress value={file.progress} className="h-1" />
                          </div>
                        )}

                        {file.error && (
                          <p className="text-xs text-red-600 mt-1">{file.error}</p>
                        )}
                      </div>

                      {!isProcessing && file.status === 'pending' && (
                        <Button
                          className="bg-transparent hover:bg-accent hover:text-accent-foreground"

                          onClick={() => removeFile(file.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Results Download */}
              {completedCount > 0 && !isProcessing && (
                <div className="flex justify-end">
                  <Button
                    className="border border-border bg-background text-foreground"
                    onClick={downloadResults}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download Results ({completedCount})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
