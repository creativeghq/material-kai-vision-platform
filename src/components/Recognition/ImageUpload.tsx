import React, { useState, useCallback } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ImageUploadProps {
  onImagesSelected: (files: File[]) => void;
  isProcessing?: boolean;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  onImagesSelected,
  isProcessing = false,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type.startsWith('image/'),
    );

    if (files.length > 0) {
      setSelectedFiles(files);
      onImagesSelected(files);
    }
  }, [onImagesSelected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file =>
      file.type.startsWith('image/'),
    );

    if (files.length > 0) {
      setSelectedFiles(files);
      onImagesSelected(files);
    }
  }, [onImagesSelected]);

  const removeFile = useCallback((index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onImagesSelected(newFiles);
  }, [selectedFiles, onImagesSelected]);

  return (
    <Card>
      <CardContent className="p-6">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          } ${isProcessing ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              document.getElementById('file-input')?.click();
            }
          }}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-primary animate-spin" />
              <h3 className="text-lg font-semibold mb-2">Processing Images...</h3>
              <p className="text-muted-foreground">AI is analyzing your materials</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">Upload Material Images</h3>
              <p className="text-muted-foreground mb-4">
                Drag and drop your images here, or click to select files
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports JPG, PNG, WebP up to 10MB each
              </p>
              <Button>Select Files</Button>
            </div>
          )}

          <input
            id="file-input"
            type="file"
            multiple
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Selected Files Preview */}
        {selectedFiles.length > 0 && (
          <div className="mt-6">
            <h4 className="font-medium mb-3">Selected Images ({selectedFiles.length})</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {selectedFiles.map((file, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <Button
                    className="absolute -top-2 -right-2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        removeFile(index);
                      }
                    }}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                  <p className="text-xs text-center mt-1 truncate px-1">
                    {file.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
