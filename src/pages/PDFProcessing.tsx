import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Activity, Link } from 'lucide-react';

import { PDFWorkflowViewer, WorkflowJob } from '@/components/PDF/PDFWorkflowViewer';
import { PDFUploadProgressModal } from '@/components/PDF/PDFUploadProgressModal';


import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { consolidatedPDFWorkflowService } from '@/services/consolidatedPDFWorkflowService';
import { useToast } from '@/hooks/use-toast';

const PDFProcessing = () => {
  const [workflowJobs, setWorkflowJobs] = useState<WorkflowJob[]>([]);
  const [currentJob, setCurrentJob] = useState<WorkflowJob | null>(null);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isProcessingUrl, setIsProcessingUrl] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Subscribe to workflow updates
    const unsubscribe = consolidatedPDFWorkflowService.subscribe((job: any) => {
      setWorkflowJobs((prev: WorkflowJob[]) => {
        const filtered = prev.filter(j => j.id !== job.id);
        return [job, ...filtered];
      });

      // Update current job if it's the one being tracked
      setCurrentJob(prevCurrentJob => {
        if (prevCurrentJob && prevCurrentJob.id === job.id) {
          return job;
        }
        return prevCurrentJob;
      });
    });

    // Load existing jobs
    setWorkflowJobs(consolidatedPDFWorkflowService.getAllJobs() as WorkflowJob[]);

    // Check for test URL from localStorage
    const testUrl = localStorage.getItem('testPdfUrl');
    if (testUrl) {
      setPdfUrl(testUrl);
      localStorage.removeItem('testPdfUrl'); // Remove after using
    }

    return () => {
      unsubscribe();
    };
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

  const processUrlPdf = async () => {
    if (!pdfUrl.trim()) {
      toast({
        title: 'URL Required',
        description: 'Please enter a valid PDF URL',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessingUrl(true);
    try {
      // Create a mock file object from URL for the workflow service
      const response = await fetch(pdfUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`);
      }

      const blob = await response.blob();
      const fileName = pdfUrl.split('/').pop() || 'document.pdf';
      const file = new File([blob], fileName, { type: 'application/pdf' });

      const jobId = await consolidatedPDFWorkflowService.startPDFProcessing(file);

      // Get the job and show progress modal
      const job = consolidatedPDFWorkflowService.getJob(jobId);
      if (job) {
        setCurrentJob(job);
        setIsProgressModalOpen(true);
      }

      toast({
        title: 'Processing Started',
        description: `Started processing PDF from URL. You can monitor the progress in the modal.`,
      });

      setPdfUrl(''); // Clear the URL input
    } catch (error) {
      toast({
        title: 'Failed to Process URL',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingUrl(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 5,
    maxSize: 50 * 1024 * 1024, // 50MB
  });

  const handleRetryJob = (jobId: string) => {
    consolidatedPDFWorkflowService.retryJob(jobId);
    toast({
      title: 'Job Retried',
      description: 'The processing job has been restarted.',
    });
  };

  const runningJobs = workflowJobs.filter(job => job.status === 'running').length;
  const completedJobs = workflowJobs.filter(job => job.status === 'completed').length;
  const failedJobs = workflowJobs.filter(job => job.status === 'failed').length;

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">PDF Processing</h1>
        <p className="text-muted-foreground mt-2">
          Upload and process PDF documents with advanced workflow monitoring and step-by-step tracking.
        </p>
      </div>

      <div className="space-y-6">
        {/* Header with status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <h2 className="text-xl font-semibold">PDF Processing Workflow</h2>
            {runningJobs > 0 && (
              <Badge variant="default" className="ml-2">
                {runningJobs} running
              </Badge>
            )}
          </div>
        </div>
          {/* Status Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Total Jobs</span>
                  <Badge variant="outline">{workflowJobs.length}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Running</span>
                  <Badge variant="default">{runningJobs}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Completed</span>
                  <Badge variant="default" className="bg-green-100 text-green-700">{completedJobs}</Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Failed</span>
                  <Badge variant="destructive">{failedJobs}</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Upload Area */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Quick Start Workflow
              </CardTitle>
              <CardDescription>
                Drop PDFs here to instantly start the complete processing workflow with real-time monitoring
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}`}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                {isDragActive ? (
                  <p className="text-lg text-primary">Drop PDF files here...</p>
                ) : (
                  <div>
                    <p className="text-lg mb-2">Drag & drop PDF files here, or click to select</p>
                    <p className="text-sm text-muted-foreground">
                      Complete workflow with authentication, upload, validation, processing, and knowledge base storage
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* URL Processing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="h-5 w-5" />
                Process PDF from URL
              </CardTitle>
              <CardDescription>
                Enter a direct URL to a PDF file to process it through the workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  type="url"
                  placeholder="https://example.com/document.pdf"
                  value={pdfUrl}
                  onChange={(e) => setPdfUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={processUrlPdf}
                  disabled={isProcessingUrl || !pdfUrl.trim()}
                >
                  {isProcessingUrl ? 'Processing...' : 'Process'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Workflow Viewer */}
          <PDFWorkflowViewer
            jobs={workflowJobs}
            onRetryJob={handleRetryJob}
          />
      </div>

      {/* PDF Upload Progress Modal */}
      <PDFUploadProgressModal
        isOpen={isProgressModalOpen}
        onClose={() => setIsProgressModalOpen(false)}
        job={currentJob}
        enablePolling={true} // Enable real-time polling
        onRetry={() => {
          if (currentJob) {
            handleRetryJob(currentJob.id);
          }
        }}
        onViewResults={() => {
          setIsProgressModalOpen(false);
          // Could navigate to results view or show results in another modal
        }}
      />
    </div>
  );
};

export default PDFProcessing;
