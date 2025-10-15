/**
 * Test page for PDF Image Gallery component
 * 
 * This page demonstrates the image gallery functionality
 * and can be used for testing and development
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PDFImageGallery } from '@/components/PDF/PDFImageGallery';
import { ImageIcon, TestTube } from 'lucide-react';

const TestImageGallery: React.FC = () => {
  const [documentId, setDocumentId] = useState('');
  const [showGallery, setShowGallery] = useState(false);

  // Sample document IDs for testing (these would be real document IDs from your database)
  const sampleDocumentIds = [
    'sample-doc-1',
    'sample-doc-2', 
    'sample-doc-3'
  ];

  const handleTestGallery = () => {
    if (documentId.trim()) {
      setShowGallery(true);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <TestTube className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-3xl font-bold">PDF Image Gallery Test</h1>
          <p className="text-gray-600">Test the enhanced PDF image gallery component</p>
        </div>
      </div>

      {/* Test Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Gallery Test Controls
          </CardTitle>
          <CardDescription>
            Enter a document ID to test the image gallery functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="documentId">Document ID</Label>
            <Input
              id="documentId"
              placeholder="Enter document ID (e.g., job ID from PDF processing)"
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Sample Document IDs (for testing)</Label>
            <div className="flex flex-wrap gap-2">
              {sampleDocumentIds.map((id) => (
                <Button
                  key={id}
                  variant="outline"
                  size="sm"
                  onClick={() => setDocumentId(id)}
                >
                  {id}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleTestGallery} disabled={!documentId.trim()}>
              Load Image Gallery
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowGallery(false);
                setDocumentId('');
              }}
            >
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Gallery Display */}
      {showGallery && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Image Gallery for Document: {documentId}</CardTitle>
              <CardDescription>
                This gallery shows all images extracted from the specified document
              </CardDescription>
            </CardHeader>
          </Card>

          <PDFImageGallery
            documentId={documentId}
            showHeader={true}
            viewMode="grid"
            className="w-full"
            onImageSelect={(image) => {
              console.log('Image selected:', image);
            }}
            onImageView={(image, allImages) => {
              console.log('Image viewed:', image, 'Total images:', allImages.length);
            }}
          />
        </div>
      )}

      {/* Feature Documentation */}
      <Card>
        <CardHeader>
          <CardTitle>Gallery Features</CardTitle>
          <CardDescription>
            Overview of the PDF Image Gallery component capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold mb-2">Display Features</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Grid and list view modes</li>
                <li>• Responsive image thumbnails</li>
                <li>• Full-size image modal viewer</li>
                <li>• Image metadata display</li>
                <li>• Page number and confidence badges</li>
                <li>• Hover effects and transitions</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold mb-2">Functionality</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Search by caption, filename, content</li>
                <li>• Filter by image type</li>
                <li>• Sort by page, confidence, date</li>
                <li>• Image download functionality</li>
                <li>• Related content linking</li>
                <li>• Real-time database integration</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Modal Features</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Navigation between images</li>
                <li>• Detailed metadata sidebar</li>
                <li>• Image download from modal</li>
                <li>• Related chunks display</li>
                <li>• Context information</li>
                <li>• Keyboard navigation support</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Integration</h3>
              <ul className="text-sm space-y-1 text-gray-600">
                <li>• Supabase database integration</li>
                <li>• Real-time image loading</li>
                <li>• Error handling and retry</li>
                <li>• Loading states and feedback</li>
                <li>• Responsive design</li>
                <li>• TypeScript type safety</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">1. Testing with Real Data</h4>
              <p className="text-gray-600">
                To test with real data, process a PDF document through the PDF Processing page. 
                After processing completes, use the job ID as the document ID in this test page.
              </p>
            </div>

            <div>
              <h4 className="font-medium mb-2">2. Integration in Components</h4>
              <p className="text-gray-600">
                The gallery is already integrated into:
              </p>
              <ul className="list-disc list-inside mt-2 text-gray-600 space-y-1">
                <li>PDF Upload Progress Modal (when processing completes)</li>
                <li>Knowledge Base PDF Viewer (in the images section)</li>
                <li>PDF Results Viewer (as a dedicated "Extracted Images" tab)</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium mb-2">3. Database Requirements</h4>
              <p className="text-gray-600">
                The gallery requires the <code>document_images</code> table with the following structure:
              </p>
              <ul className="list-disc list-inside mt-2 text-gray-600 space-y-1">
                <li>id, document_id, image_url, image_type</li>
                <li>caption, alt_text, page_number, confidence</li>
                <li>processing_status, metadata, created_at</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestImageGallery;
