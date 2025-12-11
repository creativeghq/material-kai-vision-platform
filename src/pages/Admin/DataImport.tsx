/**
 * DataImport - PDF Processing Page
 * Admin-only page for uploading and processing PDF catalogs
 */

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PDFUploadSection } from '@/components/PDF/PDFUploadSection';
import { PDFProcessingWorkflow } from '@/components/PDF/PDFProcessingWorkflow';

export const DataImport: React.FC = () => {
  const navigate = useNavigate();
  const [jobId, setJobId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [completedJobStatus, setCompletedJobStatus] = useState<any>(null);

  const handleUploadComplete = (newJobId: string) => {
    setJobId(newJobId);
    setIsProcessing(true);
    setShowSummary(false);
  };

  const handleProcessingComplete = () => {
    setIsProcessing(false);
    // Show summary modal after a brief delay
    setTimeout(() => {
      setShowSummary(true);
    }, 500);
  };

  const handleReset = () => {
    setJobId(null);
    setIsProcessing(false);
    setShowSummary(false);
    setCompletedJobStatus(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-white/10 bg-slate-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin')}
              className="text-white/70 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">PDF Processing</h1>
              <p className="text-sm text-white/60">Upload and process material catalogs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Upload Section */}
        {!isProcessing && (
          <PDFUploadSection onUploadComplete={handleUploadComplete} />
        )}

        {/* Workflow Section */}
        {jobId && (
          <PDFProcessingWorkflow
            jobId={jobId}
            onComplete={handleProcessingComplete}
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  );
};

