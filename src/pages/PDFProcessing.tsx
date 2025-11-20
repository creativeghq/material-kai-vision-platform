/**
 * PDF Processing Page
 *
 * Uses EnhancedPDFProcessor component which handles:
 * - File upload to Supabase storage
 * - MIVAA API integration for PDF processing
 * - Real-time job tracking and progress updates
 * - Category selection and metadata extraction
 */

import { EnhancedPDFProcessor } from '@/components/PDF/EnhancedPDFProcessor';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

const PDFProcessing = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100">
      <GlobalAdminHeader
        title="PDF Processing"
        description="Upload and process PDF documents to extract materials, products, and metadata"
      />

      <div className="container mx-auto px-4 py-8">
        <EnhancedPDFProcessor />
      </div>
    </div>
  );
};

export default PDFProcessing;
