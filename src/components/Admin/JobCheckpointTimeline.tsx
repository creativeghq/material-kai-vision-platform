import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, Clock, AlertCircle, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';

interface JobCheckpoint {
  id: string;
  job_id: string;
  stage: string;
  // Optional — present when the source row carried a status field
  // (in_progress / completed / failed). Old rows leave it undefined.
  status?: string;
  checkpoint_data: any;
  metadata: any;
  created_at: string;
}

interface JobCheckpointTimelineProps {
  checkpoints: JobCheckpoint[];
  jobStatus: string;
}

const STAGE_LABELS: Record<string, string> = {
  'initialized': 'Job Registration',
  'pdf_extracted': 'Document Text Extraction',
  'products_detected': 'AI Product Discovery',
  'stage_1_5_layout_precompute': 'Layout Cache Precompute',
  'chunks_created': 'Semantic Chunking',
  'text_embeddings_generated': 'Vector Vectorization',
  'images_extracted': 'Visual Asset Extraction',
  'image_embeddings_generated': 'Vision Embedding Analysis',
  'products_created': 'Material Catalog Creation',
  'relationships_created': 'Relational Entity Linking',
  'document_entities_created': 'Document Knowledge Graph',
  'metadata_extracted': 'Structural Metadata Refinement',
  'completed': 'Pipeline Execution Finalized',
};

export function JobCheckpointTimeline({ checkpoints, jobStatus }: JobCheckpointTimelineProps) {
  if (!checkpoints || checkpoints.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Processing Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No checkpoints recorded yet. Checkpoints will appear as the job progresses.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Processing Timeline
          <Badge variant="outline" className="ml-auto">
            {checkpoints.length} checkpoints
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checkpoints.map((checkpoint, index) => {
            const isLast = index === checkpoints.length - 1;
            const stageName = STAGE_LABELS[checkpoint.stage] || checkpoint.stage;

            return (
              <div key={checkpoint.id} className="relative">
                {/* Timeline Line */}
                {!isLast && (
                  <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-slate-100" />
                )}

                {/* Checkpoint Item */}
                <div className="flex gap-4">
                  {/* Icon — status-aware so in_progress / failed events
                      stand out in the audit log. Stages without a status
                      (legacy rows) keep the green check. */}
                  <div className="flex-shrink-0 mt-1">
                    {checkpoint.status === 'failed' ? (
                      <div className="w-6 h-6 rounded-full bg-red-50 border border-red-200 flex items-center justify-center">
                        <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      </div>
                    ) : checkpoint.status === 'in_progress' ? (
                      <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                        <Clock className="h-3.5 w-3.5 text-blue-600 animate-pulse" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-6">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm text-slate-900 leading-none">{stageName}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 font-medium bg-slate-50 px-1.5 py-0.5 rounded inline-block">
                          {formatDistanceToNow(new Date(checkpoint.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[9px] uppercase tracking-tighter bg-white shadow-none px-1 py-0 h-4 font-bold border-slate-200">
                        {checkpoint.stage}
                      </Badge>
                    </div>

                    {/* Checkpoint Metadata */}
                    {checkpoint.metadata && Object.keys(checkpoint.metadata).length > 0 && (
                      <div className="mt-2 p-3 bg-slate-50/80 border border-slate-100 rounded-lg text-xs space-y-1.5 shadow-sm">
                        {Object.entries(checkpoint.metadata).map(([key, value]) => {
                          const isSuccess = key.includes('success') && value === true;
                          const isCount = key.includes('count') || key.includes('total');

                          return (
                            <div key={key} className="flex justify-between items-center group">
                              <span className="text-muted-foreground capitalize text-[10px] font-medium">{key.replace(/_/g, ' ')}</span>
                              <span className={`font-bold transition-all duration-200 ${
                                isSuccess ? 'text-green-600' :
                                isCount ? 'text-primary' :
                                'text-slate-700'
                              }`}>
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Current Status Indicator */}
          {jobStatus === 'processing' && (
            <div className="relative">
              <div className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-blue-700">Processing...</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Job is currently running
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

