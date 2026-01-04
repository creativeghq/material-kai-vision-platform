import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle, Clock, AlertCircle, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface JobCheckpoint {
  id: string;
  job_id: string;
  stage: string;
  checkpoint_data: any;
  metadata: any;
  created_at: string;
}

interface JobCheckpointTimelineProps {
  checkpoints: JobCheckpoint[];
  jobStatus: string;
}

const STAGE_LABELS: Record<string, string> = {
  'initialized': 'Job Initialized',
  'pdf_extracted': 'PDF Extracted',
  'products_detected': 'Products Discovered',
  'chunks_created': 'Text Chunks Created',
  'text_embeddings_generated': 'Text Embeddings Generated',
  'images_extracted': 'Images Extracted',
  'image_embeddings_generated': 'Image Embeddings Generated',
  'products_created': 'Products Created',
  'relationships_created': 'Relationships Created',
  'document_entities_created': 'Document Entities Created',
  'metadata_extracted': 'Metadata Extracted',
  'completed': 'Job Completed',
};

export function JobCheckpointTimeline({ checkpoints, jobStatus }: JobCheckpointTimelineProps) {
  if (!checkpoints || checkpoints.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
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
        <CardTitle className="text-base flex items-center gap-2">
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
                  <div className="absolute left-[11px] top-8 bottom-0 w-0.5 bg-slate-200" />
                )}
                
                {/* Checkpoint Item */}
                <div className="flex gap-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    </div>
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{stageName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {formatDistanceToNow(new Date(checkpoint.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {checkpoint.stage}
                      </Badge>
                    </div>
                    
                    {/* Checkpoint Metadata */}
                    {checkpoint.metadata && Object.keys(checkpoint.metadata).length > 0 && (
                      <div className="mt-2 p-2 bg-slate-50 rounded text-xs space-y-1">
                        {Object.entries(checkpoint.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{key}:</span>
                            <span className="font-medium">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </span>
                          </div>
                        ))}
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

