import React from 'react';
import { PDFProcessor } from '@/components/PDF/PDFProcessor';

const PDFProcessing = () => {
  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">PDF Processing</h1>
        <p className="text-muted-foreground mt-2">
          Upload and process PDF documents to automatically extract material specifications and technical data.
        </p>
      </div>
      
      <PDFProcessor />
    </div>
  );
};

export default PDFProcessing;