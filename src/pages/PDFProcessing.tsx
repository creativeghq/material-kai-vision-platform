import { useState, useEffect } from 'react';

import { PDFWorkflowViewer, WorkflowJob } from '@/components/PDF/PDFWorkflowViewer';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Badge } from '@/components/ui/badge';
import { useDropzone } from 'react-dropzone';
import { Upload, Activity } from 'lucide-react';
import { consolidatedPDFWorkflowService } from '@/services/consolidatedPDFWorkflowService';
import { useToast } from '@/hooks/use-toast';

const PDFProcessing = () => {
  const [workflowJobs, setWorkflowJobs] = useState<WorkflowJob[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    // Subscribe to workflow updates
    const unsubscribe = consolidatedPDFWorkflowService.subscribe((job) => {
      setWorkflowJobs(prev => {
        const filtered = prev.filter(j => j.id !== job.id);
        return [job, ...filtered];
      });
    });

    // Load existing jobs
    setWorkflowJobs(consolidatedPDFWorkflowService.getAllJobs());

    return () => {
      unsubscribe();
    };
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      try {
        void await consolidatedPDFWorkflowService.startPDFProcessing(file);
        toast({
          title: "Processing Started",
          description: `Started processing ${file.name}. You can monitor the progress in the workflow below.`,
        });
      } catch (error) {
        toast({
          title: "Failed to Start Processing",
          description: error instanceof Error ? error.message : 'Unknown error',
          variant: "destructive",
        });
      }
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 5,
    maxSize: 50 * 1024 * 1024 // 50MB
  });

  const handleRetryJob = (jobId: string) => {
    consolidatedPDFWorkflowService.retryJob(jobId);
    toast({
      title: "Job Retried",
      description: "The processing job has been restarted.",
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
      
      <Tabs defaultValue="workflow" className="w-full">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="workflow" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Live Workflow
            {runningJobs > 0 && (
              <Badge variant="default" className="ml-1">
                {runningJobs}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="workflow" className="space-y-6">
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

          {/* Workflow Viewer */}
          <PDFWorkflowViewer 
            jobs={workflowJobs} 
            onRetryJob={handleRetryJob}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PDFProcessing;