import React, { useState } from 'react';
import { Upload } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PDFUploadProgressModal } from './PDFUploadProgressModal';
import { consolidatedPDFWorkflowService } from '@/services/consolidatedPDFWorkflowService';
import { useToast } from '@/hooks/use-toast';

interface WorkflowJob {
  id: string;
  name?: string;
  filename?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: Array<{
    id: string;
    name: string;
    description?: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    details: string[];
    metadata?: Record<string, unknown>;
    result?: unknown;
    startTime?: Date;
    endTime?: Date;
    duration?: number;
    error?: string;
    logs?: string[];
  }>;
  currentStepIndex: number;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, unknown>;
}

export const PDFUploadTest: React.FC = () => {
  const [currentJob, setCurrentJob] = useState<WorkflowJob | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const { toast } = useToast();

  // Subscribe to workflow updates
  React.useEffect(() => {
    const unsubscribe = consolidatedPDFWorkflowService.subscribe((job: any) => {
      setCurrentJob(prevCurrentJob => {
        if (prevCurrentJob && prevCurrentJob.id === job.id) {
          return job;
        }
        return prevCurrentJob;
      });
    });

    return unsubscribe;
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        const jobId = await consolidatedPDFWorkflowService.startPDFProcessing(file);
        
        // Get the job and show progress modal
        const job = consolidatedPDFWorkflowService.getJob(jobId);
        if (job) {
          setCurrentJob(job);
          setIsProgressModalOpen(true);
        }
        
        toast({
          title: 'Processing Started',
          description: `Started processing ${file.name}. You can monitor the progress in the modal.`,
        });
      } catch (error) {
        toast({
          title: 'Failed to Start Processing',
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: 'destructive',
        });
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const handleRetry = () => {
    if (currentJob) {
      // For now, just close the modal and allow re-upload
      setIsProgressModalOpen(false);
      setCurrentJob(null);
    }
  };

  const handleViewResults = () => {
    setIsProgressModalOpen(false);
    toast({
      title: 'Results Ready',
      description: 'PDF processing completed successfully!',
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            PDF Upload Progress Test
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-gray-300 hover:border-primary/50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            {isDragActive ? (
              <p className="text-lg">Drop PDF file here...</p>
            ) : (
              <div>
                <p className="text-lg mb-2">
                  Drag & drop a PDF file here, or click to select
                </p>
                <p className="text-sm text-gray-500">
                  Test the new progress modal workflow
                </p>
              </div>
            )}
          </div>

          {currentJob && (
            <div className="mt-4">
              <Button 
                onClick={() => setIsProgressModalOpen(true)}
                variant="outline"
              >
                Show Progress Modal
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PDF Upload Progress Modal */}
      <PDFUploadProgressModal
        isOpen={isProgressModalOpen}
        onClose={() => setIsProgressModalOpen(false)}
        job={currentJob}
        onRetry={handleRetry}
        onViewResults={handleViewResults}
      />
    </div>
  );
};
