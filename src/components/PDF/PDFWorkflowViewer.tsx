import React, { useState } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Database,
  PlayCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { HTMLDocumentViewer } from './HTMLDocumentViewer';

export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  icon?: React.ComponentType<{ className?: string }>;
  details?: string[];
  error?: string;
  logs?: string[];
  metadata?: WorkflowStepMetadata;
}

interface WorkflowStepMetadata {
  knowledgeEntryId?: string;
  title?: string;
  [key: string]: unknown;
}

export interface WorkflowJob {
  id: string;
  name?: string;
  filename?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  steps: WorkflowStep[];
  currentStepIndex: number;
  startTime: Date;
  endTime?: Date;
  metadata: Record<string, unknown>;
}

interface PDFWorkflowViewerProps {
  jobs: WorkflowJob[];
  onRetryJob?: (jobId: string) => void;
  className?: string;
}

export const PDFWorkflowViewer: React.FC<PDFWorkflowViewerProps> = ({
  jobs,
  onRetryJob,
  className,
}) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [htmlViewerOpen, setHtmlViewerOpen] = useState(false);
  const [selectedKnowledgeEntryId, setSelectedKnowledgeEntryId] = useState<string>('');
  const [selectedDocumentTitle, setSelectedDocumentTitle] = useState<string>('');

  const toggleJobExpansion = (jobId: string) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const toggleStepExpansion = (stepId: string) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stepId)) {
        newSet.delete(stepId);
      } else {
        newSet.add(stepId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: WorkflowStep['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'running':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: WorkflowStep['status']) => {
    const colors = {
      pending: 'bg-gray-100 text-gray-700',
      running: 'bg-blue-100 text-blue-700',
      completed: 'bg-green-100 text-green-700',
      failed: 'bg-red-100 text-red-700',
      skipped: 'bg-gray-100 text-gray-500',
    };

    return (
      <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize', colors[status])}>
        {status}
      </span>
    );
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) return `${duration}ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
    return `${(duration / 60000).toFixed(1)}m`;
  };

  const getJobProgress = (job: WorkflowJob) => {
    const totalSteps = job.steps.length;
    const completedSteps = job.steps.filter(step => step.status === 'completed').length;
    return Math.round((completedSteps / totalSteps) * 100);
  };

  if (jobs.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <PlayCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No workflows running</p>
            <p className="text-sm text-muted-foreground">Upload a PDF to see the processing workflow</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {jobs.map((job) => {
        const isExpanded = expandedJobs.has(job.id);
        const progress = getJobProgress(job);

        return (
          <Card key={job.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => toggleJobExpansion(job.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        toggleJobExpansion(job.id);
                      }
                    }}
                    className="p-1 h-auto text-sm bg-transparent hover:bg-gray-100"
                  >
                    {isExpanded ?
                      <ChevronDown className="h-4 w-4" /> :
                      <ChevronRight className="h-4 w-4" />
                    }
                  </Button>

                  {getStatusIcon(job.status)}

                  <div>
                    <CardTitle className="text-base">{job.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{job.filename}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {job.status === 'running' && (
                    <div className="text-sm text-muted-foreground">
                      {progress}% complete
                    </div>
                  )}

                  {getStatusBadge(job.status)}

                  {job.status === 'failed' && onRetryJob && (
                    <Button
                      onClick={() => onRetryJob(job.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          onRetryJob(job.id);
                        }
                      }}
                      className="text-sm border border-gray-300 hover:bg-gray-50 px-3 py-1"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  )}
                </div>
              </div>

              {(job.status === 'running' || job.status === 'completed') && (
                <div className="mt-3">
                  <Progress value={progress} className="h-2" />
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                <span>Started: {job.startTime.toLocaleTimeString()}</span>
                {job.endTime && (
                  <span>Duration: {formatDuration(job.endTime.getTime() - job.startTime.getTime())}</span>
                )}
                <span>{job.steps.length} steps</span>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <Separator className="mb-4" />

                <div className="space-y-3">
                  {job.steps.map((step, index) => {
                    const isStepExpanded = expandedSteps.has(step.id);
                    const Icon = step.icon;

                    return (
                      <div key={step.id} className="relative">
                        {/* Connector line */}
                        {index < job.steps.length - 1 && (
                          <div className="absolute left-6 top-8 bottom-0 w-px bg-border" />
                        )}

                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getStatusIcon(step.status)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
                                <span className="font-medium">{step.name}</span>
                                {getStatusBadge(step.status)}
                              </div>

                              <div className="flex items-center gap-2">
                                {step.duration && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatDuration(step.duration)}
                                  </span>
                                )}

                                {(step.details || step.logs || step.error) && (
                                  <Button
                                    onClick={() => toggleStepExpansion(step.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        toggleStepExpansion(step.id);
                                      }
                                    }}
                                    className="p-1 h-auto text-sm bg-transparent hover:bg-gray-100"
                                  >
                                    {isStepExpanded ?
                                      <ChevronDown className="h-3 w-3" /> :
                                      <ChevronRight className="h-3 w-3" />
                                    }
                                  </Button>
                                )}
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground mt-1">
                              {step.description}
                            </p>

                            {step.error && (
                              <Alert className="mt-2 border-red-200 bg-red-50">
                                <AlertCircle className="h-4 w-4 text-red-600" />
                                <AlertDescription className="text-red-800">
                                  <strong>Error:</strong> {step.error}
                                </AlertDescription>
                              </Alert>
                            )}

                            {isStepExpanded && (
                              <div className="mt-3 space-y-3">
                                {step.details && step.details.length > 0 && (
                                  <div className="text-sm">
                                    <strong className="text-foreground">Details:</strong>
                                    <ul className="list-disc list-inside mt-1 space-y-1 text-muted-foreground">
                                      {step.details.map((detail, i) => (
                                        <li key={i}>{detail}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {/* Show HTML link for knowledge-storage step */}
                                {step.id === 'knowledge-storage' && step.status === 'completed' && step.metadata?.knowledgeEntryId && (
                                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
                                      <ExternalLink className="h-4 w-4" />
                                      <span>Generated HTML Document</span>
                                    </div>
                                    <p className="text-sm text-green-700 mb-2">
                                      The PDF has been processed into a rich HTML document with preserved layout and extracted images.
                                    </p>
                                    <div className="space-y-2">
                                     <button
                                        onClick={() => {
                                          setSelectedKnowledgeEntryId(step.metadata?.knowledgeEntryId || '');
                                          setSelectedDocumentTitle(step.metadata?.title || 'HTML Document');
                                          setHtmlViewerOpen(true);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            setSelectedKnowledgeEntryId(step.metadata?.knowledgeEntryId || '');
                                            setSelectedDocumentTitle(step.metadata?.title || 'HTML Document');
                                            setHtmlViewerOpen(true);
                                          }
                                        }}
                                          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 underline mr-4"
                                        >
                                          <ExternalLink className="h-3 w-3" />
                                          View HTML Document
                                        </button>
                                       <button
                                         onClick={() => {
                                           // Navigate to knowledge base with search filter
                                           window.open('/admin/knowledge-base', '_blank');
                                         }}
                                         onKeyDown={(e) => {
                                           if (e.key === 'Enter') {
                                             // Navigate to knowledge base with search filter
                                             window.open('/admin/knowledge-base', '_blank');
                                           }
                                         }}
                                         className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800 underline"
                                       >
                                         <Database className="h-3 w-3" />
                                         View in Knowledge Base
                                       </button>
                                    </div>
                                    <div className="text-xs text-green-600 mt-1">
                                      Document ID: {step.metadata?.knowledgeEntryId}
                                    </div>
                                  </div>
                                )}

                                {step.metadata && Object.keys(step.metadata).length > 0 && (
                                  <div className="text-sm">
                                    <strong className="text-foreground">Metadata:</strong>
                                    <div className="mt-1 font-mono text-xs bg-muted p-2 rounded">
                                      {JSON.stringify(step.metadata, null, 2)}
                                    </div>
                                  </div>
                                )}

                                {step.logs && step.logs.length > 0 && (
                                  <div className="text-sm">
                                    <strong className="text-foreground">Logs:</strong>
                                    <div className="mt-1 font-mono text-xs bg-black text-green-400 p-3 rounded max-h-32 overflow-y-auto">
                                      {step.logs.map((log, i) => (
                                        <div key={i} className="whitespace-pre-wrap">{log}</div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      <HTMLDocumentViewer
        isOpen={htmlViewerOpen}
        onClose={() => setHtmlViewerOpen(false)}
        knowledgeEntryId={selectedKnowledgeEntryId}
        documentTitle={selectedDocumentTitle}
      />
    </div>
  );
};
