import React from 'react';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { PDFDocumentsList } from './PDFDocumentsList';

export const PDFDocumentsManagement: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="PDF Documents & Extraction"
        description="View all processed material catalog PDFs with products, chunks, images, and embeddings"
        badge="Material Catalogs"
      />
      
      <div className="p-6">
        <PDFDocumentsList />
      </div>
    </div>
  );
};

