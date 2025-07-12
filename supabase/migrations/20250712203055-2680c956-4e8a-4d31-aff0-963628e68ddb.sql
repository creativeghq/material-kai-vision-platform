-- Make pdf-documents bucket public so Azure can access files
UPDATE storage.buckets 
SET public = true 
WHERE id = 'pdf-documents';

-- Create policy to allow public access for reading PDF documents
-- This is needed for Azure Document Intelligence to download files
CREATE POLICY "Public access for PDF documents" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'pdf-documents');

-- Allow authenticated users to upload PDFs
CREATE POLICY "Authenticated users can upload PDFs" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'pdf-documents' AND auth.role() = 'authenticated');

-- Allow users to delete their own PDFs
CREATE POLICY "Users can delete their own PDFs" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'pdf-documents' AND auth.uid()::text = (storage.foldername(name))[1]);