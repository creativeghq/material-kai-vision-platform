import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Loader2, CheckCircle, Download } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mivaaService } from '@/services/mivaaIntegrationService';

interface PDFProcessingResult {
  id: string;
  fileName: string;
  markdownContent: string;
  extractedImages: Array<{
    id: string;
    url: string;
    caption?: string;
    page: number;
  }>;
  extractedTables: Array<{
    id: string;
    data: string[][];
    page: number;
  }>;
  metadata: {
    pageCount: number;
    wordCount: number;
    processingTime: number;
  };
}

export const MivaaPDFProcessor: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<PDFProcessingResult[]>([]);
  const [progress, setProgress] = useState(0);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(prev => [...prev, ...acceptedFiles]);
    setResults([]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const startProcessing = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    setResults([]);

    try {
      console.log('🚀 Starting MIVAA PDF processing...');
      
      const processingResults: PDFProcessingResult[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress((i / files.length) * 90);
        
        // Upload file to temporary storage and get URL
        const formData = new FormData();
        formData.append('file', file);
        
        // For demo purposes, we'll use a placeholder URL
        // In production, you'd upload to Supabase storage first
        const fileUrl = `https://example.com/temp/${file.name}`;
        
        // Call MIVAA service for PDF processing
        const response = await mivaaService.processPDF(fileUrl, {
          extractImages: true,
          extractText: true,
          extractTables: true,
          ocrEnabled: true,
        });
        
        if (response.success && response.data) {
          processingResults.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            markdownContent: response.data.markdown_content || '',
            extractedImages: response.data.extracted_images || [],
            extractedTables: response.data.extracted_tables || [],
            metadata: {
              pageCount: response.data.page_count || 0,
              wordCount: response.data.word_count || 0,
              processingTime: response.metadata.processingTime,
            },
          });
        } else {
          console.error('MIVAA PDF processing failed:', response.error);
          // Add fallback result
          processingResults.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            markdownContent: '# Processing Failed\n\nUnable to process this PDF file.',
            extractedImages: [],
            extractedTables: [],
            metadata: {
              pageCount: 0,
              wordCount: 0,
              processingTime: 0,
            },
          });
        }
      }
      
      console.log('✅ MIVAA PDF processing completed:', processingResults);
      
      setResults(processingResults);
      setProgress(100);
      
      toast.success(`Successfully processed ${processingResults.length} PDF files with MIVAA!`);
      
    } catch (error) {
      console.error('❌ MIVAA PDF processing failed:', error);
      toast.error(error instanceof Error ? error.message : 'MIVAA PDF processing failed');
    } finally {
      setIsProcessing(false);
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

  const downloadMarkdown = (result: PDFProcessingResult) => {
    const blob = new Blob([result.markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.fileName.replace('.pdf', '')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            MIVAA PDF Processor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            {isDragActive ? (
              <p className="text-lg">Drop PDF files here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop PDF files here, or click to select
                </p>
                <p className="text-sm text-gray-500">
                  Supports multiple files up to 50MB each
                </p>
              </div>
            )}
          </div>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Selected Files ({files.length})
                </h3>
                <div className="space-x-2">
                  <Button
                    onClick={startProcessing}
                    disabled={isProcessing}
                    className="bg-primary hover:bg-primary/90"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4 mr-2" />
                        Process with MIVAA
                      </>
                    )}
                  </Button>
                  <Button variant="outline" onClick={clearFiles}>
                    Clear All
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-red-500" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>

              {isProcessing && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Processing Progress</span>
                    <span className="text-sm text-gray-500">{progress}%</span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Processing Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {results.map((result) => (
                <div key={result.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{result.fileName}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{result.metadata.pageCount} pages</span>
                        <span>{result.metadata.wordCount} words</span>
                        <span>{result.metadata.processingTime}ms</span>
                      </div>
                    </div>
                    <div className="space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadMarkdown(result)}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download MD
                      </Button>
                    </div>
                  </div>

                  <Tabs defaultValue="content" className="w-full">
                    <TabsList>
                      <TabsTrigger value="content">Content</TabsTrigger>
                      <TabsTrigger value="images">
                        Images ({result.extractedImages.length})
                      </TabsTrigger>
                      <TabsTrigger value="tables">
                        Tables ({result.extractedTables.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="content" className="mt-4">
                      <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">
                          {result.markdownContent}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="images" className="mt-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {result.extractedImages.map((image) => (
                          <div key={image.id} className="border rounded-lg p-2">
                            <img
                              src={image.url}
                              alt={image.caption || 'Extracted image'}
                              className="w-full h-32 object-cover rounded"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Page {image.page}
                            </p>
                            {image.caption && (
                              <p className="text-xs mt-1">{image.caption}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="tables" className="mt-4">
                      <div className="space-y-4">
                        {result.extractedTables.map((table) => (
                          <div key={table.id} className="border rounded-lg p-4">
                            <p className="text-sm text-gray-500 mb-2">
                              Page {table.page}
                            </p>
                            <div className="overflow-x-auto">
                              <table className="min-w-full border-collapse border border-gray-300">
                                <tbody>
                                  {table.data.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {row.map((cell, cellIndex) => (
                                        <td
                                          key={cellIndex}
                                          className="border border-gray-300 px-2 py-1 text-sm"
                                        >
                                          {cell}
                                        </td>
                                      ))}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
