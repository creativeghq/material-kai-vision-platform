/**
 * PDFCompletionSummary - Modal showing comprehensive results after PDF processing
 */

import React from 'react';
import { CheckCircle2, XCircle, AlertCircle, FileText, Image, Package, Link2, Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';

interface PDFCompletionSummaryProps {
  isOpen: boolean;
  onClose: () => void;
  jobStatus: any;
  onStartNew: () => void;
}

export const PDFCompletionSummary: React.FC<PDFCompletionSummaryProps> = ({
  isOpen,
  onClose,
  jobStatus,
  onStartNew,
}) => {
  if (!jobStatus) return null;

  const metadata = jobStatus.last_checkpoint?.metadata || {};
  const isSuccess = jobStatus.status === 'completed';

  const summaryMetrics = [
    {
      icon: Package,
      label: 'Products Created',
      value: metadata.products_created || 0,
      color: 'text-green-500',
    },
    {
      icon: FileText,
      label: 'Chunks Created',
      value: metadata.chunks_created || 0,
      color: 'text-blue-500',
    },
    {
      icon: Image,
      label: 'Images Processed',
      value: metadata.images_extracted || 0,
      color: 'text-purple-500',
    },
    {
      icon: Database,
      label: 'Text Embeddings',
      value: metadata.embeddings_generated || 0,
      color: 'text-yellow-500',
    },
    {
      icon: Database,
      label: 'Image Embeddings',
      value: metadata.clip_embeddings_generated || 0,
      color: 'text-orange-500',
    },
    {
      icon: Link2,
      label: 'Relationships Created',
      value: metadata.relationships_created || 0,
      color: 'text-pink-500',
    },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-slate-900 border-white/10">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {isSuccess ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <XCircle className="h-8 w-8 text-red-500" />
            )}
            <DialogTitle className="text-2xl text-white">
              {isSuccess ? 'Processing Complete!' : 'Processing Failed'}
            </DialogTitle>
          </div>
          <DialogDescription className="text-white/60">
            {isSuccess
              ? 'Your PDF has been successfully processed and all data has been extracted.'
              : 'An error occurred during processing. Please review the details below.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Summary Metrics */}
          {isSuccess && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {summaryMetrics.map((metric) => (
                <div
                  key={metric.label}
                  className="bg-slate-800/50 rounded-lg p-4 border border-white/10"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <metric.icon className={`h-5 w-5 ${metric.color}`} />
                    <p className="text-sm text-white/60">{metric.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-white">{metric.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Processing Details */}
          <div className="bg-slate-800/30 rounded-lg p-4 border border-white/10">
            <h3 className="text-sm font-semibold text-white mb-3">Processing Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/60">Job ID:</span>
                <span className="text-white font-mono text-xs">{jobStatus.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Status:</span>
                <span className={isSuccess ? 'text-green-500' : 'text-red-500'}>
                  {jobStatus.status}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/60">Progress:</span>
                <span className="text-white">{jobStatus.progress}%</span>
              </div>
              {metadata.processing_time_ms && (
                <div className="flex justify-between">
                  <span className="text-white/60">Processing Time:</span>
                  <span className="text-white">
                    {Math.round(metadata.processing_time_ms / 1000)}s
                  </span>
                </div>
              )}
              {metadata.ai_model && (
                <div className="flex justify-between">
                  <span className="text-white/60">AI Model:</span>
                  <span className="text-white">{metadata.ai_model}</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Details */}
          {!isSuccess && jobStatus.error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-400 mb-1">Error Details:</p>
                  <p className="text-sm text-red-300">{jobStatus.error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={onStartNew} className="bg-primary hover:bg-primary/90">
              Process Another PDF
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

