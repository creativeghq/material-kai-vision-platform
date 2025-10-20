import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, Image, AlertCircle, ChevronDown, ChevronRight, Play, Pause, RotateCcw } from 'lucide-react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface WorkflowStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
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
  onComplete: (images: unknown[]) => void;
}

export const GenerationWorkflowModal: React.FC<GenerationWorkflowModalProps> = ({
  isOpen,
  onClose,
  generationId,
  onComplete,
}) => {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [overallProgress, setOverallProgress] = useState(0);
  const [generationData, setGenerationData] = useState<unknown>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [hasReferenceImage, setHasReferenceImage] = useState(false);
  const [apiResponse, setApiResponse] = useState<unknown>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [pollingError, setPollingError] = useState<string | null>(null);

  // Workflow control state
  const [isPaused, setIsPaused] = useState(false);
  const [workflowMode, setWorkflowMode] = useState<'running' | 'paused' | 'ready'>('ready');
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    'models': true,
    'api-response': false,
  });
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  // Suppress unused variable warning - this state is used by setters but not directly read
  void showCompletionDialog;

  // Initialize workflow steps based on actual edge function implementation
  useEffect(() => {
    if (!generationData) return;

    // Check if reference image is provided
    const dataWithPrompt = generationData as Record<string, unknown>;
    const hasRefImage = Boolean(
      dataWithPrompt.prompt &&
      typeof dataWithPrompt.prompt === 'string' &&
      !dataWithPrompt.prompt.includes('[NO_IMAGE]') &&
      dataWithPrompt.prompt !== '[NO_IMAGE]',
    );

    setHasReferenceImage(hasRefImage);

    const initialSteps: WorkflowStep[] = [
      // HuggingFace Models (text-to-image)
      {
        id: 'hf-sdxl',
        name: '🎨 Stable Diffusion XL Base 1.0',
        status: 'pending',
        modelName: 'stabilityai/stable-diffusion-xl-base-1.0',
      },
      {
        id: 'hf-flux',
        name: '⚡ FLUX-Schnell',
        status: 'pending',
        modelName: 'black-forest-labs/FLUX.1-schnell',
      },
      {
        id: 'hf-sd2',
        name: '🏠 Interior Design Model',
        status: 'pending',
        modelName: 'stabilityai/stable-diffusion-2-1',
      },
      // Replicate Models
      {
        id: 'rep-unified',
        name: '🎯 Interior Design AI (Unified)',
        status: 'pending',
        modelName: 'adirik/interior-design',
      },
      {
        id: 'rep-architecture',
        name: '🏗️ Designer Architecture',
        status: 'pending',
        modelName: 'davisbrown/designer-architecture',
      },
    ];

    // Add image-to-image models only if reference image is provided
    if (hasRefImage) {
      initialSteps.push(
        {
          id: 'rep-interior-ai',
          name: '🏡 Interior AI',
          status: 'pending',
          modelName: 'erayyavuz/interior-ai',
        },
        {
          id: 'rep-comfyui',
          name: '🎨 ComfyUI Interior Remodel',
          status: 'pending',
          modelName: 'jschoormans/comfyui-interior-remodel',
        },
        {
          id: 'rep-interiorly',
          name: '🏛️ Interiorly Gen1 Dev',
          status: 'pending',
          modelName: 'julian-at/interiorly-gen1-dev',
        },
        {
          id: 'rep-interior-v2',
          name: '🏘️ Interior V2',
          status: 'pending',

          modelName: 'jschoormans/interior-v2',
        },
        {
          id: 'rep-sdxl-interior',
          name: '🚀 Interior Design SDXL',
          status: 'pending',

          modelName: 'rocketdigitalai/interior-design-sdxl',
        },
      );
    }

    setSteps(initialSteps);
  }, [generationData]);

  // Poll for generation updates
  useEffect(() => {
    if (!generationId || !isOpen) return;

    const pollForUpdates = async () => {
      try {
        setIsPolling(true);
        setPollingError(null);

        // Import supabase client dynamically
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!,
        );

        const { data, error } = await supabase
          .from('generation_3d')
          .select('*')
          .eq('id', generationId)
          .single();

        if (error) {
          console.error('Polling error:', error);
          setPollingError(error.message);
          return;
        }

        if (data) {
          setGenerationData(data);
          setApiResponse(data); // Store full API response for display

          // Parse workflow data from result_data
          if (data.result_data && typeof data.result_data === 'object' && 'workflow_steps' in data.result_data) {
            const workflowData = data.result_data as { workflow_steps?: Record<string, unknown>[] };
            if (workflowData.workflow_steps) {
              updateStepsFromData(workflowData.workflow_steps);
            }
          }

          // Check if generation is complete
          if (data.generation_status === 'completed') {
            setIsComplete(true);
            setShowCompletionDialog(true);
            setWorkflowMode('ready');
            if (data.image_urls && data.image_urls.length > 0) {
              onComplete(data.image_urls);
              // Don't auto-close - show completion dialog instead
            }
          } else if (data.generation_status === 'failed') {
            console.error('Generation failed:', data.error_message);
            setIsComplete(true);
            setWorkflowMode('ready');
          } else if (data.generation_status === 'processing') {
            setWorkflowMode('running');
          }
        }

      } catch (error) {
        console.error('Polling error:', error);
        setPollingError(error instanceof Error ? error.message : 'Unknown polling error');
      } finally {
        setIsPolling(false);
      }
    };

    // Initial poll
    pollForUpdates();

    // Set up polling interval
    const interval = setInterval(pollForUpdates, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [generationId, isOpen, onComplete]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateStepsFromData = (workflowSteps: unknown[]) => {
    setSteps(prevSteps => {
      const updatedSteps = [...prevSteps];

      workflowSteps.forEach(workflowStep => {
        const step = workflowStep as Record<string, unknown>;
        const stepIndex = updatedSteps.findIndex(s => s.modelName === step.modelName);
        if (stepIndex !== -1) {
          // Map 'completed' to 'success' to match the expected status type
          let mappedStatus = step.status as string;
          if (mappedStatus === 'completed') {
            mappedStatus = 'success';
          }

          const currentStep = updatedSteps[stepIndex];
          if (currentStep) {
            updatedSteps[stepIndex] = {
              id: currentStep.id,
              name: currentStep.name,
              status: mappedStatus as 'pending' | 'running' | 'success' | 'failed' | 'skipped',
              modelName: currentStep.modelName,
              ...(step.startTime ? { startTime: step.startTime as string } : currentStep.startTime ? { startTime: currentStep.startTime } : {}),
              ...(step.endTime ? { endTime: step.endTime as string } : currentStep.endTime ? { endTime: currentStep.endTime } : {}),
              ...(step.imageUrl ? { imageUrl: step.imageUrl as string } : currentStep.imageUrl ? { imageUrl: currentStep.imageUrl } : {}),
              ...(step.errorMessage ? { errorMessage: step.errorMessage as string } : currentStep.errorMessage ? { errorMessage: currentStep.errorMessage } : {}),
              ...(step.processingTimeMs ? { processingTimeMs: step.processingTimeMs as number } : currentStep.processingTimeMs ? { processingTimeMs: currentStep.processingTimeMs } : {}),
            };
          }
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
      case 'skipped':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      default:
        return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-100 text-blue-700">Running</Badge>;
      case 'success':
        return <Badge className="bg-green-100 text-green-700">Success</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-700">Failed</Badge>;
      case 'skipped':
        return <Badge className="bg-yellow-100 text-yellow-700">Skipped</Badge>;
      default:
        return <Badge className="border border-gray-300 text-gray-600">Pending</Badge>;
    }
  };

  // Workflow control functions
  const handlePauseWorkflow = () => {
    setIsPaused(true);
    setWorkflowMode('paused');
  };

  const handleResumeWorkflow = () => {
    setIsPaused(false);
    setWorkflowMode('running');
  };

  const handleRestartWorkflow = () => {
    setIsPaused(false);
    setWorkflowMode('ready');
    setIsComplete(false);
    setShowCompletionDialog(false);
    // Reset all steps to pending
    setSteps(prevSteps =>
      prevSteps.map(step => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { startTime, endTime, imageUrl, errorMessage, processingTimeMs, ...baseStep } = step;
        return {
          ...baseStep,
          status: 'pending' as const,
        };
      }),
    );
    setOverallProgress(0);
    setCurrentStep('');
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Reset modal state when opened to ensure clean state (prevent flashing)
  useEffect(() => {
    if (isOpen && generationId) {
      // Only reset if we have a new generation ID
      setIsComplete(false);
      setShowCompletionDialog(false);
      setCurrentStep('');
      setOverallProgress(0);
      setWorkflowMode('ready');
      setIsPaused(false);
      setApiResponse(null);
      setPollingError(null);

      // Initialize steps immediately to prevent flashing
      const hasRefImage = Boolean(generationData &&
        typeof generationData === 'object' &&
        'reference_image_url' in generationData);
      setHasReferenceImage(hasRefImage);
    }
  }, [isOpen, generationId]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image className="h-5 w-5" />
            AI Generation Workflow
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Workflow Control Buttons */}
          <div className="flex items-center justify-between p-3 bg-background border border-border rounded">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Workflow Control:</span>
              {!isPaused ? (
                <Button
                  onClick={handlePauseWorkflow}
                  className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Pause className="h-3 w-3" />
                  Pause
                </Button>
              ) : (
                <Button
                  onClick={handleResumeWorkflow}
                  className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  <Play className="h-3 w-3" />
                  Resume
                </Button>
              )}
              <Button
                onClick={handleRestartWorkflow}
                className="flex items-center gap-1 px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                <RotateCcw className="h-3 w-3" />
                Restart
              </Button>
            </div>
            <Badge className={workflowMode === 'running' ? 'bg-green-100 text-green-700' : workflowMode === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'border border-gray-300 text-gray-600'}>
              {workflowMode === 'running' ? 'Running' : workflowMode === 'paused' ? 'Paused' : 'Ready'}
            </Badge>
          </div>

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
              {/* Unified Models Section */}
              {(<Collapsible
                  open={Boolean(expandedSections['models']) ?? false}
                  onOpenChange={() => toggleSection('models')}
                >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted rounded border">
                  <div className="flex items-center gap-2">
                    {expandedSections['models'] ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <h4 className="font-medium text-sm text-muted-foreground">GENERATION MODELS</h4>
                  </div>
                  <Badge className="text-xs border border-gray-300 text-gray-600">
                    {steps.length} models
                  </Badge>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <div className="space-y-2">
                    {steps.map((step) => (
                      <Card key={step.id} className="ml-4">
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
                </CollapsibleContent>
              </Collapsible>) as any}


              {/* API Response Section */}
              {apiResponse && (
                <Collapsible
                  open={expandedSections['api-response'] ?? false}
                  onOpenChange={() => toggleSection('api-response')}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-muted rounded border">
                    <div className="flex items-center gap-2">
                      {expandedSections['api-response'] ?
                        <ChevronDown className="h-4 w-4" /> :
                        <ChevronRight className="h-4 w-4" />
                      }
                      <h4 className="font-medium text-sm text-muted-foreground">API RESPONSE DATA</h4>
                    </div>
                    <Badge className="text-xs border border-gray-300 text-gray-600">
                      {isPolling ? 'Updating...' : 'Live Data'}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2">
                    <Card className="ml-4">
                      <CardContent className="p-3">
                        {pollingError && (
                          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-start gap-2">
                            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span>Polling Error: {pollingError}</span>
                          </div>
                        )}
                        <ScrollArea className="h-32">
                          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                            {JSON.stringify(apiResponse, null, 2)}
                          </pre>
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </ScrollArea>

          {/* Generation Status Summary */}
          <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
            <div className="flex items-center justify-between text-sm">
              <span>Reference Image:</span>
              <span className={hasReferenceImage ? 'text-green-600' : 'text-gray-600'}>
                {hasReferenceImage ? '✓ Provided' : '✗ Not provided'}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span>Models to Run:</span>
              <span>{steps.length} models</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span>Completed:</span>
              <span>{steps.filter(s => s.status === 'success').length} successful, {steps.filter(s => s.status === 'failed').length} failed, {steps.filter(s => s.status === 'skipped').length} skipped</span>
            </div>
          </div>

          {isComplete && (
            <div className="text-center p-4 bg-green-50 border border-green-200 rounded">
              <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
              <p className="font-medium text-green-700">Generation Complete!</p>
              <p className="text-sm text-green-600">You can now close this modal to view the generated images.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
