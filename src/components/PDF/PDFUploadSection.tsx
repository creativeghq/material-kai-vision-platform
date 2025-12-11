/**
 * PDFUploadSection - Upload interface for PDF catalogs
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PDFUploadSectionProps {
  onUploadComplete: (jobId: string) => void;
}

interface MaterialCategory {
  id: string;
  category_key: string;
  category_name: string;
  display_name: string;
}

export const PDFUploadSection: React.FC<PDFUploadSectionProps> = ({ onUploadComplete }) => {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Load material categories from database
  useEffect(() => {
    const loadCategories = async () => {
      try {
        const { data, error } = await supabase
          .from('material_categories')
          .select('id, category_key, category_name, display_name')
          .eq('is_active', true)
          .order('display_name');

        if (error) throw error;

        setCategories(data || []);
        // Set first category as default
        if (data && data.length > 0) {
          setCategory(data[0].category_key);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
        toast({
          title: 'Warning',
          description: 'Could not load categories. Using defaults.',
          variant: 'destructive',
        });
        // Fallback to hardcoded categories
        setCategories([
          { id: '1', category_key: 'ceramic_tile', category_name: 'Ceramic Tile', display_name: 'Ceramic Tile' },
          { id: '2', category_key: 'porcelain_tile', category_name: 'Porcelain Tile', display_name: 'Porcelain Tile' },
          { id: '3', category_key: 'wood', category_name: 'Wood', display_name: 'Wood' },
          { id: '4', category_key: 'stone', category_name: 'Stone', display_name: 'Stone' },
        ]);
        setCategory('ceramic_tile');
      }
    };

    loadCategories();
  }, [toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === 'application/pdf') {
      setFile(droppedFile);
    } else {
      toast({
        title: 'Invalid File',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
    } else {
      toast({
        title: 'Invalid File',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
    }
  }, [toast]);

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      // Upload to Supabase Storage
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('pdf-documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('pdf-documents')
        .getPublicUrl(fileName);

      // Call MIVAA API to start processing
      const MIVAA_API_URL = import.meta.env.VITE_MIVAA_SERVICE_URL || 'https://v1api.materialshub.gr';
      const response = await fetch(`${MIVAA_API_URL}/api/rag/documents/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_url: publicUrl,
          category: category,
          workspace_id: user.id, // Using user ID as workspace ID
          title: file.name,
        }),
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const result = await response.json();
      const jobId = result.job_id;

      if (!jobId) {
        throw new Error('No job ID returned from API');
      }

      toast({
        title: 'Upload Successful',
        description: 'PDF processing started',
      });

      onUploadComplete(jobId);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
      >
        <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-gray-400'}`} />
        <p className="text-gray-600 mb-2 font-medium">
          {file ? file.name : 'Drag & drop your PDF here, or click to browse'}
        </p>
        {file && (
          <p className="text-sm text-gray-500 mb-2">
            {(file.size / 1024 / 1024).toFixed(2)} MB
          </p>
        )}
        <input
          type="file"
          accept="application/pdf"
          onChange={handleFileSelect}
          className="hidden"
          id="pdf-upload"
        />
        <label htmlFor="pdf-upload">
          <Button variant="outline" className="mt-2 bg-white hover:bg-gray-50" asChild>
            <span>Browse Files</span>
          </Button>
        </label>
      </div>

      {/* Category Selection */}
      {file && (
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-700 mb-2 block font-medium">Material Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="bg-white border-gray-300">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.category_key}>
                    {cat.display_name || cat.category_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              Select the material category for products in this PDF
            </p>
          </div>

          <Button
            onClick={handleUpload}
            disabled={isUploading || !category}
            className="w-full"
          >
            {isUploading ? 'Uploading...' : 'Upload & Start Processing'}
          </Button>
        </div>
      )}
    </div>
  );
};

