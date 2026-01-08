/**
 * PDFProcessingWorkflow - Visual workflow for PDF processing
 * Displays 14 stages with real-time progress updates
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import {
  usePDFProcessingMonitor,
  mapCheckpointToStages,
  getCurrentActiveStage,
  extractMetricsFromJob,
  extractStageMetrics,
} from '@/services/pdf/pdfProcessingMonitor';

interface PDFProcessingWorkflowProps {
  jobId: string;
  onComplete: () => void;
  onReset: () => void;
}

interface Stage {
  id: number;
  name: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  progress: number;
  metrics?: Record<string, any>;
  error?: string;
}

export const PDFProcessingWorkflow: React.FC<PDFProcessingWorkflowProps> = ({
  jobId,
  onComplete,
  onReset,
}) => {
  const { jobStatus, isPolling, error: monitorError } = usePDFProcessingMonitor(jobId);
  const [stages, setStages] = useState<Stage[]>([
    { id: 1, name: 'Product Discovery', status: 'pending', progress: 0 },
    { id: 2, name: 'Entity Discovery', status: 'pending', progress: 0 },
    { id: 3, name: 'Focused Extraction', status: 'pending', progress: 0 },
    { id: 4, name: 'Chunking', status: 'pending', progress: 0 },
    { id: 5, name: 'Text Embeddings', status: 'pending', progress: 0 },
    { id: 6, name: 'Image Extraction', status: 'pending', progress: 0 },
    { id: 7, name: 'Image Classification', status: 'pending', progress: 0 },
    { id: 8, name: 'Image Analysis', status: 'pending', progress: 0 },
    { id: 9, name: 'CLIP Embeddings', status: 'pending', progress: 0 },
    { id: 10, name: 'Product Creation', status: 'pending', progress: 0 },
    { id: 11, name: 'Document Entities', status: 'pending', progress: 0 },
    { id: 12, name: 'Relationship Mapping', status: 'pending', progress: 0 },
    { id: 13, name: 'Metadata Extraction', status: 'pending', progress: 0 },
    { id: 14, name: 'Quality Enhancement', status: 'pending', progress: 0 },
  ]);

  // Update stages based on job status
  useEffect(() => {
    if (!jobStatus) return;

    const currentCheckpoint = jobStatus.last_checkpoint?.stage;
    if (!currentCheckpoint) return;

    // Get completed stage IDs from checkpoint
    const completedStageIds = mapCheckpointToStages(currentCheckpoint);
    const activeStageId = getCurrentActiveStage(currentCheckpoint);

    // Update stages
    const updatedStages = stages.map((stage) => {
      // Stage is complete
      if (completedStageIds.includes(stage.id)) {
        return {
          ...stage,
          status: 'complete' as const,
          progress: 100,
          metrics: extractStageMetrics(stage.id, jobStatus.last_checkpoint?.metadata),
        };
      }

      // Stage is active
      if (stage.id === activeStageId) {
        // Calculate progress for active stage based on overall job progress
        const stageProgress = Math.min(99, Math.max(0, (jobStatus.progress || 0) % 100));
        return {
          ...stage,
          status: 'active' as const,
          progress: stageProgress,
          metrics: extractStageMetrics(stage.id, jobStatus.last_checkpoint?.metadata),
        };
      }

      // Stage is pending
      return {
        ...stage,
        status: 'pending' as const,
        progress: 0,
      };
    });

    setStages(updatedStages);

    // Check if completed
    if (jobStatus.status === 'completed') {
      onComplete();
    }

    // Handle errors
    if (jobStatus.status === 'failed' && activeStageId) {
      setStages((prev) =>
        prev.map((stage) =>
          stage.id === activeStageId
            ? { ...stage, status: 'error' as const, error: jobStatus.error }
            : stage,
        ),
      );
    }
  }, [jobStatus, onComplete]);

  const getStageIcon = (status: Stage['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'active':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Circle className="h-5 w-5 text-white/30" />;
    }
  };

  // Extract overall metrics
  const overallMetrics = extractMetricsFromJob(jobStatus?.last_checkpoint?.metadata);

  // Show loading state while waiting for job data
  if (!jobStatus && !monitorError) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
            <div>
              <h2 className="text-xl font-semibold text-white">Initializing Processing...</h2>
              <p className="text-sm text-white/60 mt-1">Job ID: {jobId}</p>
              <p className="text-xs text-white/40 mt-1">Connecting to processing pipeline...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if monitoring failed
  if (monitorError && !jobStatus) {
    return (
      <div className="space-y-6">
        <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/30 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <h2 className="text-xl font-semibold text-white">Monitoring Error</h2>
                <p className="text-sm text-red-400 mt-1">{monitorError}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-sm text-white/70">
              <strong>Troubleshooting:</strong>
            </p>
            <ul className="text-sm text-white/60 mt-2 space-y-1 list-disc list-inside">
              <li>Check if the job was created successfully (Job ID: {jobId})</li>
              <li>Verify database permissions for background_jobs table</li>
              <li>Check browser console for detailed error messages</li>
              <li>Try uploading the file again</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workflow Header */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-white/10 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Processing Workflow</h2>
            <p className="text-xs text-white/40 mt-1">Job ID: {jobId}</p>
          </div>
          {jobStatus?.status === 'failed' && (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Start New Upload
            </Button>
          )}
        </div>

        {/* Overall Progress */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm text-white/70 mb-2">
            <span>Overall Progress</span>
            <span>{jobStatus?.progress || 0}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${jobStatus?.progress || 0}%` }}
            />
          </div>
        </div>

        {/* Overall Metrics Grid */}
        {Object.keys(overallMetrics).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {Object.entries(overallMetrics).map(([key, value]) => (
              <div
                key={key}
                className="bg-slate-700/30 rounded-lg p-3 border border-white/5"
              >
                <p className="text-xs text-white/50 mb-1">{key}</p>
                <p className="text-lg font-semibold text-white">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {(jobStatus?.error || monitorError) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
            <p className="font-semibold">Error:</p>
            <p className="text-sm">{jobStatus?.error || monitorError}</p>
          </div>
        )}
      </div>

      {/* Stage Cards */}
      <div className="space-y-3">
        {stages.map((stage) => (
          <div
            key={stage.id}
            className={`bg-slate-800/50 backdrop-blur-sm border rounded-lg p-4 transition-all ${
              stage.status === 'active'
                ? 'border-primary shadow-lg shadow-primary/20'
                : stage.status === 'complete'
                ? 'border-green-500/30'
                : stage.status === 'error'
                ? 'border-red-500/30'
                : 'border-white/10'
            }`}
          >
            <div className="flex items-center gap-3">
              {getStageIcon(stage.status)}
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-medium text-white">
                    {stage.id}. {stage.name}
                  </h3>
                  <span className="text-sm text-white/60">{stage.progress}%</span>
                </div>
                {stage.progress > 0 && (
                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        stage.status === 'error' ? 'bg-red-500' : 'bg-primary'
                      }`}
                      style={{ width: `${stage.progress}%` }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Metrics */}
            {stage.metrics && (
              <div className="mt-3 pl-8 text-sm text-white/60 space-y-1">
                {Object.entries(stage.metrics).map(([key, value]) => {
                  // Special rendering for 4-layer extraction metrics
                  if (key === 'Layer 1 (Embedded)' || key === 'Layer 2 (Full Render)' || key === 'Layer 3 (Vision AI)' || key === 'Layer 4 (Deduplicated)') {
                    const layerIcons: Record<string, string> = {
                      'Layer 1 (Embedded)': '📎',
                      'Layer 2 (Full Render)': '🖼️',
                      'Layer 3 (Vision AI)': '👁️',
                      'Layer 4 (Deduplicated)': '✨'
                    };
                    const layerColors: Record<string, string> = {
                      'Layer 1 (Embedded)': 'text-blue-400',
                      'Layer 2 (Full Render)': 'text-purple-400',
                      'Layer 3 (Vision AI)': 'text-green-400',
                      'Layer 4 (Deduplicated)': 'text-yellow-400'
                    };
                    return (
                      <div key={key} className={`flex items-center gap-2 ${layerColors[key]}`}>
                        <span className="text-lg">{layerIcons[key]}</span>
                        <span className="font-medium">{key}:</span>
                        <span>{value} images</span>
                      </div>
                    );
                  }

                  // Legacy: Special rendering for vision-guided metrics
                  if (key === 'Vision-Guided' || key === 'PyMuPDF Fallback') {
                    const isVision = key === 'Vision-Guided';
                    return (
                      <div key={key} className={`flex items-center gap-2 ${isVision ? 'text-green-400' : 'text-yellow-400'}`}>
                        <span className="text-lg">{isVision ? '👁️' : '📄'}</span>
                        <span className="font-medium">{key}:</span>
                        <span>{value} images</span>
                      </div>
                    );
                  }

                  // Special rendering for confidence scores
                  if (key === 'Avg Confidence' || key === 'Vision Confidence') {
                    return (
                      <div key={key} className="flex items-center gap-2 text-blue-400">
                        <span className="text-lg">✨</span>
                        <span className="font-medium">{key}:</span>
                        <span>{value}</span>
                      </div>
                    );
                  }

                  // Special rendering for extraction method
                  if (key === 'Method') {
                    const isVisionMethod = String(value).includes('Vision');
                    return (
                      <div key={key} className={`flex items-center gap-2 ${isVisionMethod ? 'text-green-400' : 'text-gray-400'}`}>
                        <span className="text-lg">{isVisionMethod ? '🎯' : '📋'}</span>
                        <span className="font-medium">{key}:</span>
                        <span>{value}</span>
                      </div>
                    );
                  }

                  // Default rendering
                  return (
                    <div key={key}>
                      • {key}: {value}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Error */}
            {stage.error && (
              <div className="mt-3 pl-8 text-sm text-red-400">
                ⚠️ {stage.error}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

