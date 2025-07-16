import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, Clock, Image, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  modelType: 'text-to-image' | 'image-to-image';
  modelName: string;
  startTime?: string;
  endTime?: string;
  imageUrl?: string;
  errorMessage?: string;
  processingTimeMs?: number;
}

interface GenerationWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  generationId: string;
  onComplete: (images: any[]) => void;
}

export const GenerationWorkflowModal: React.FC<GenerationWorkflowModalProps> = ({
  isOpen,
  onClose,
  generationId,
  onComplete
}) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [overallProgress, setOverallProgress] = useState(0);
  const [generationData, setGenerationData] = useState<any>(null);
  const [isComplete, setIsComplete] = useState(false);

  // Initialize workflow steps
  useEffect(() => {
    const initialSteps: WorkflowStep[] = [
      // Text-to-Image Models
      {
        id: 'step-1',
        name: 'Designer Architecture',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'davisbrown/designer-architecture'
      },
      {
        id: 'step-2', 
        name: 'Interior Design SDXL LoRA',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'prithivMLmods/interior-design-sdxl-lora'
      },
      {
        id: 'step-3',
        name: 'Realistic Architecture',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'prithivMLmods/realistic-architecture'
      },
      {
        id: 'step-4',
        name: 'Flux Interior Architecture',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'prithivMLmods/flux-interior-architecture'
      },
      {
        id: 'step-5',
        name: 'Interior Decor SDXL',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'prithivMLmods/interior-decor-sdxl'
      },
      {
        id: 'step-6',
        name: 'Canopus Interior Architecture',
        status: 'pending',
        modelType: 'text-to-image',
        modelName: 'prithivMLmods/Canopus-Interior-Architecture-0.1'
      },
      // Image-to-Image Models (if reference image provided)
      {
        id: 'step-7',
        name: 'Interior Design AI',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'adirik/interior-design'
      },
      {
        id: 'step-8',
        name: 'Interior AI',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'erayyavuz/interior-ai'
      },
      {
        id: 'step-9',
        name: 'ComfyUI Interior Remodel',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'jschoormans/comfyui-interior-remodel'
      },
      {
        id: 'step-10',
        name: 'Interiorly Gen1 Dev',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'julian-at/interiorly-gen1-dev'
      },
      {
        id: 'step-11',
        name: 'Interior V2',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'jschoormans/interior-v2'
      },
      {
        id: 'step-12',
        name: 'Interior Design SDXL',
        status: 'pending',
        modelType: 'image-to-image',
        modelName: 'rocketdigitalai/interior-design-sdxl'
      }
    ];

    setSteps(initialSteps);
  }, []);

  // Poll for generation updates
  useEffect(() => {
    if (!generationId || !isOpen) return;

    const pollForUpdates = async () => {
      try {
        const { data, error } = await supabase
          .from('generation_3d')
          .select('*')
          .eq('id', generationId)
          .single();

        if (error) {
          console.error('Polling error:', error);
          return;
        }

        setGenerationData(data);

        // Parse workflow data from result_data
        if (data.result_data && typeof data.result_data === 'object' && 'workflow_steps' in data.result_data) {
          const workflowData = data.result_data as { workflow_steps?: any[] };
          if (workflowData.workflow_steps) {
            updateStepsFromData(workflowData.workflow_steps);
          }
        }

        // Check if generation is complete
        if (data.generation_status === 'completed') {
          setIsComplete(true);
          if (data.image_urls?.length > 0) {
            setTimeout(() => {
              onComplete(data.image_urls);
              onClose();
            }, 2000); // Show completion for 2 seconds before closing
          }
        } else if (data.generation_status === 'failed') {
          console.error('Generation failed:', data.error_message);
        }

      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // Initial poll
    pollForUpdates();

    // Set up polling interval
    const interval = setInterval(pollForUpdates, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [generationId, isOpen, onComplete, onClose]);

  const updateStepsFromData = (workflowSteps: any[]) => {
    setSteps(prevSteps => {
      const updatedSteps = [...prevSteps];
      
      workflowSteps.forEach(workflowStep => {
        const stepIndex = updatedSteps.findIndex(s => s.modelName === workflowStep.modelName);
        if (stepIndex !== -1) {
          updatedSteps[stepIndex] = {
            ...updatedSteps[stepIndex],
            status: workflowStep.status,
            startTime: workflowStep.startTime,
            endTime: workflowStep.endTime,
            imageUrl: workflowStep.imageUrl,
            errorMessage: workflowStep.errorMessage,
            processingTimeMs: workflowStep.processingTimeMs
          };
        }
      });

      // Update current step and progress
      const runningStep = updatedSteps.find(s => s.status === 'running');
      setCurrentStep(runningStep?.name || '');

      const completedSteps = updatedSteps.filter(s => s.status === 'success' || s.status === 'failed').length;
      const progress = (completedSteps / updatedSteps.length) * 100;
      setOverallProgress(progress);

      return updatedSteps;
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Clock className="h-4 w-4 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Running</Badge>;
      case 'success':
        return <Badge variant="secondary" className="bg-green-100 text-green-700">Success</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            AI Generation Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overall Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Overall Progress</span>
              <span>{Math.round(overallProgress)}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
            {currentStep && (
              <p className="text-sm text-muted-foreground">
                Currently processing: <span className="font-medium">{currentStep}</span>
              </p>
            )}
          </div>

          {/* Generation Steps */}
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-3">
              {/* Text-to-Image Section */}
              <div>
                <h4 className="font-medium mb-2 text-sm text-muted-foreground">TEXT-TO-IMAGE MODELS</h4>
                {steps.filter(s => s.modelType === 'text-to-image').map((step, index) => (
                  <Card key={step.id} className="mb-2">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(step.status)}
                          <div>
                            <p className="font-medium text-sm">{step.name}</p>
                            <p className="text-xs text-muted-foreground">{step.modelName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.processingTimeMs && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(step.processingTimeMs / 1000)}s
                            </span>
                          )}
                          {getStatusBadge(step.status)}
                        </div>
                      </div>

                      {step.imageUrl && (
                        <div className="mt-2">
                          <img 
                            src={step.imageUrl} 
                            alt={`Generated by ${step.name}`}
                            className="w-full h-32 object-cover rounded border"
                          />
                        </div>
                      )}

                      {step.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>{step.errorMessage}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Image-to-Image Section */}
              <div>
                <h4 className="font-medium mb-2 text-sm text-muted-foreground">IMAGE-TO-IMAGE MODELS</h4>
                {steps.filter(s => s.modelType === 'image-to-image').map((step, index) => (
                  <Card key={step.id} className="mb-2">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(step.status)}
                          <div>
                            <p className="font-medium text-sm">{step.name}</p>
                            <p className="text-xs text-muted-foreground">{step.modelName}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.processingTimeMs && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round(step.processingTimeMs / 1000)}s
                            </span>
                          )}
                          {getStatusBadge(step.status)}
                        </div>
                      </div>

                      {step.imageUrl && (
                        <div className="mt-2">
                          <img 
                            src={step.imageUrl} 
                            alt={`Generated by ${step.name}`}
                            className="w-full h-32 object-cover rounded border"
                          />
                        </div>
                      )}

                      {step.errorMessage && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                          <span>{step.errorMessage}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </ScrollArea>

          {isComplete && (
            <div className="text-center p-4 bg-green-50 border border-green-200 rounded">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-green-700">Generation Complete!</p>
              <p className="text-sm text-green-600">Closing modal and revealing images...</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};