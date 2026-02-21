/**
 * PDFUploadSection - Upload interface for PDF catalogs
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';

interface PDFUploadSectionProps {
  onUploadComplete: (jobId: string, fileName?: string) => void;
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
        const { data, error} = await supabase
          .from('material_categories')
          .select('id, category_key, name, display_name')
          .eq('is_active', true)
          .order('sort_order');

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }

        if (data && data.length > 0) {
          // Map to expected format (category_name is actually 'name' in DB)
          const formattedCategories = data.map(cat => ({
            id: cat.id,
            category_key: cat.category_key,
            category_name: cat.name,
            display_name: cat.display_name,
          }));

          setCategories(formattedCategories);
          // Set first category as default
          setCategory(formattedCategories[0].category_key);
        } else {
          // No data returned, use fallback
          throw new Error('No categories found in database');
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
        toast({
          title: 'Warning',
          description: 'Could not load categories from database. Using defaults.',
          variant: 'destructive',
        });
        // Fallback to hardcoded categories (matches database structure)
        const fallbackCategories = [
          { id: '1', category_key: 'tiles', category_name: 'Tiles', display_name: 'Tiles' },
          { id: '2', category_key: 'wood', category_name: 'Wood', display_name: 'Wood' },
          { id: '3', category_key: 'decor', category_name: 'Decor', display_name: 'Decor' },
          { id: '4', category_key: 'furniture', category_name: 'Furniture', display_name: 'Furniture' },
          { id: '5', category_key: 'general_materials', category_name: 'General Materials', display_name: 'General Materials' },
          { id: '6', category_key: 'paint_wall_decor', category_name: 'Paint / Wall Decors', display_name: 'Paint / Wall Decors' },
          { id: '7', category_key: 'heating', category_name: 'Heating', display_name: 'Heating' },
          { id: '8', category_key: 'sanitary', category_name: 'Sanitary', display_name: 'Sanitary' },
          { id: '9', category_key: 'kitchen', category_name: 'Kitchen', display_name: 'Kitchen' },
          { id: '10', category_key: 'lighting', category_name: 'Lighting', display_name: 'Lighting' },
        ];
        setCategories(fallbackCategories);
        setCategory('tiles');
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

      // Call MIVAA API to start processing using standardized client
      const formData = new FormData();
      formData.append('file_url', publicUrl);
      formData.append('categories', 'products'); // Extraction type: products, certificates, logos, specifications, all, extract_only
      formData.append('material_category', category); // Material category: tiles, wood, heating, sanitary, etc.
      formData.append('workspace_id', 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e'); // Default workspace ID
      formData.append('title', file.name);

      const response = await mivaaApi.uploadPDF(formData);

      if (!response.success) {
        throw new Error(`Processing failed: ${response.error || 'Unknown error'}`);
      }

      console.log('📦 Upload Response:', response);

      const jobId = response.data?.job_id;

      if (!jobId) {
        console.error('❌ No job ID in response:', response);
        throw new Error('No job ID returned from API');
      }

      console.log('✅ Job created successfully:', jobId);

      toast({
        title: 'Upload Successful',
        description: `PDF processing started. Job ID: ${jobId}`,
      });

      const uploadedFileName = file.name;

      // Reset form
      setFile(null);

      console.log('🚀 Calling onUploadComplete with job ID:', jobId, 'and filename:', uploadedFileName);
      onUploadComplete(jobId, uploadedFileName);
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
          <Button variant="outline" className="mt-2 bg-white hover:bg-primary/10 hover:text-[#3e192a]" asChild>
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
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Upload & Start Processing'
            )}
          </Button>
        </div>
      )}
    </div>
  );
};

