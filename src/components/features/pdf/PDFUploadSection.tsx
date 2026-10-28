/**
 * PDFUploadSection - Upload interface for PDF catalogs
 */

import React, { useState, useCallback, useEffect } from 'react';
import { CATEGORY_VOCAB } from '@/lib/categoryVocab.generated';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { mivaaApi } from '@/services/mivaaApiClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';

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
  const { activeWorkspaceId } = useWorkspace();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('');
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [publishOnComplete, setPublishOnComplete] = useState(true);
  const [multiBrand, setMultiBrand] = useState(false);
  const [editionLabel, setEditionLabel] = useState('');
  const [supersedesId, setSupersedesId] = useState('');
  const [missingPolicy, setMissingPolicy] = useState('keep');
  const [earlierDocs, setEarlierDocs] = useState<Array<{ id: string; filename: string }>>([]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    void (async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, filename')
        .eq('workspace_id', activeWorkspaceId)
        .eq('processing_status', 'completed')
        .order('created_at', { ascending: false })
        .limit(100);
      setEarlierDocs((data ?? []) as Array<{ id: string; filename: string }>);
    })();
  }, [activeWorkspaceId]);

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
        // The build-time projection of the same table, not a hand-kept list: the 10 values
        // written here went stale the day building_materials shipped.
        const fallbackCategories = CATEGORY_VOCAB.map((c) => ({
          id: c.key,
          category_key: c.key,
          category_name: c.displayName,
          display_name: c.displayName,
        }));
        setCategories(fallbackCategories);
        setCategory(fallbackCategories[0]?.category_key ?? 'tiles');
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
    if (!activeWorkspaceId) {
      toast({
        title: 'No active workspace',
        description: 'Select a workspace before uploading a catalogue.',
        variant: 'destructive',
      });
      return;
    }

    setIsUploading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('pdf-documents')
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // pdf-documents is private — mint a signed URL for MIVAA to download from.
      // 1h TTL is plenty: the backend downloads the file immediately on the upload
      // request, then resume paths use storage_bucket/storage_object_path to re-mint.
      const { data: signed, error: signError } = await supabase.storage
        .from('pdf-documents')
        .createSignedUrl(fileName, 3600);
      if (signError || !signed?.signedUrl) {
        throw new Error(`Failed to sign upload URL: ${signError?.message ?? 'unknown error'}`);
      }

      const formData = new FormData();
      formData.append('file_url', signed.signedUrl);
      formData.append('categories', 'products'); // Extraction type: products, certificates, logos, specifications, all, extract_only
      formData.append('material_category', category); // Material category: tiles, wood, heating, sanitary, etc.
      formData.append('workspace_id', activeWorkspaceId);
      formData.append('title', file.name);
      formData.append('publish_on_complete', String(publishOnComplete));
      formData.append('multi_brand', String(multiBrand));
      if (editionLabel.trim()) formData.append('edition_label', editionLabel.trim());
      if (supersedesId) {
        formData.append('supersedes_document_id', supersedesId);
        formData.append('missing_policy', missingPolicy);
      }

      const response = await mivaaApi.uploadPDF(formData);

      const duplicate = response.status === 409 ? (response.detail as { job_id?: string } | undefined) : undefined;
      if (duplicate?.job_id) {
        toast({
          title: 'Already uploaded',
          description: 'This file is already in this workspace — showing its existing job.',
        });
        setFile(null);
        onUploadComplete(duplicate.job_id, file.name);
        return;
      }

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
      {/* Presentational: drag-and-drop is an enhancement here. The keyboard path is the real
          "Browse Files" label + hidden file input inside this box. */}
      <div
        role="presentation"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          isDragging
            ? 'border-primary bg-primary/10'
            : 'border-border hover:border-muted-foreground/40 bg-card/50'
        }`}
      >
        <Upload className={`h-12 w-12 mx-auto mb-4 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
        <p className="text-foreground mb-2 font-medium">
          {file ? file.name : 'Drag & drop your PDF here, or click to browse'}
        </p>
        {file && (
          <p className="text-sm text-muted-foreground mb-2">
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
          <Button variant="outline" className="mt-2" asChild>
            <span>Browse Files</span>
          </Button>
        </label>
      </div>

      {/* Category Selection */}
      {file && (
        <div className="space-y-4">
          <div>
            <label htmlFor="pdfuploadsection-material-category" className="text-sm text-muted-foreground mb-2 block font-medium">Material Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="pdfuploadsection-material-category">
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
            <p className="text-xs text-muted-foreground mt-1">
              Select the material category for products in this PDF
            </p>
          </div>

          <div className="flex items-start gap-3">
            <Checkbox
              id="pdfuploadsection-multi-brand"
              checked={multiBrand}
              onCheckedChange={(v) => setMultiBrand(v === true)}
              disabled={isUploading}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="pdfuploadsection-multi-brand" className="text-sm font-medium block">
                Multi-brand catalog (distributor)
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                {multiBrand
                  ? 'Each product keeps its own brand. The catalog’s main company is recorded as a supplier of those products, so the same brand can have several distributors and the best one is picked by price.'
                  : 'Leave off for a single-brand catalog: its main company is the brand of every product.'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Switch
              id="pdfuploadsection-publish-on-complete"
              checked={publishOnComplete}
              onCheckedChange={setPublishOnComplete}
              disabled={isUploading}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="pdfuploadsection-publish-on-complete" className="text-sm font-medium block">
                Publish products when processing finishes
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                {publishOnComplete
                  ? 'Products become Active as soon as every product in this PDF has processed. If any product fails, they stay as drafts.'
                  : 'Products stay as drafts so you can review them before publishing.'}
              </p>
            </div>
          </div>

          <div className="space-y-3 border-t border-hairline pt-4">
            <div>
              <label htmlFor="pdfuploadsection-edition-label" className="text-sm font-medium block">
                Edition label (optional)
              </label>
              <Input
                id="pdfuploadsection-edition-label"
                value={editionLabel}
                onChange={(e) => setEditionLabel(e.target.value)}
                disabled={isUploading}
                placeholder="e.g. 2027"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium block">Replaces an earlier catalogue (optional)</label>
              <Select value={supersedesId || 'none'} onValueChange={(v) => setSupersedesId(v === 'none' ? '' : v)} disabled={isUploading}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — this is a new catalogue</SelectItem>
                  {earlierDocs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.filename}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Products are matched to the earlier catalogue and nothing is published until you review the changes in Products.
              </p>
            </div>
            {supersedesId && (
              <div>
                <label className="text-sm font-medium block">Products missing from this edition</label>
                <Select value={missingPolicy} onValueChange={setMissingPolicy} disabled={isUploading}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">Keep, only report them</SelectItem>
                    <SelectItem value="retire">Retire (mark discontinued)</SelectItem>
                    <SelectItem value="needs_replacement">Retire and list as needing a new source</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleUpload}
              disabled={isUploading || !category || !activeWorkspaceId}
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
        </div>
      )}
    </div>
  );
};

