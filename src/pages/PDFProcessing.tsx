import React from 'react';
import { PDFProcessor } from '@/components/PDF/PDFProcessor';
import { EnhancedPDFProcessor } from '@/components/PDF/EnhancedPDFProcessor';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const PDFProcessing = () => {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">PDF Processing</h1>
        <p className="text-muted-foreground mt-2">
          Upload and process PDF documents with advanced layout-aware chunking, image-text mapping, and semantic search capabilities.
        </p>
      </div>
      
      <Tabs defaultValue="enhanced" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="enhanced">Enhanced Processing</TabsTrigger>
          <TabsTrigger value="basic">Basic Processing</TabsTrigger>
        </TabsList>
        <TabsContent value="enhanced">
          <EnhancedPDFProcessor />
        </TabsContent>
        <TabsContent value="basic">
          <PDFProcessor />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PDFProcessing;