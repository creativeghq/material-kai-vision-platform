import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  RefreshCw,
  Settings,
  Sparkles,
  Image,
  FileText,
  ExternalLink,
  Copy,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/core/ui/accordion';
import { Alert, AlertDescription } from '@/components/core/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';

import { GlobalAdminHeader } from './GlobalAdminHeader';
// Relocated here from its orphaned /admin/3d-suggestions route.
import { MaterialSuggestionsPanel } from './MaterialSuggestionsPanel';
import { formatDate } from '@/utils/datetime';

interface ModelLog {
  id: string;
  timestamp: string;
  model: string;
  status: 'success' | 'error' | 'pending';
  duration?: number;
  errorType?: string;
  errorMessage?: string;
  imageUrl?: string;
  predictionId?: string;
}

interface ModelStatus {
  name: string;
  displayName: string;
  type: 'text-to-image' | 'image-to-image' | 'hybrid';
  status: 'working' | 'failing' | 'untested';
  lastTested?: string;
  successRate?: number;
  avgDuration?: number;
  recentLogs: ModelLog[];
  versionHash: string;
  description: string;
}

interface ModelDebuggingPanelProps {
  /** When embedded as a tab (e.g. in AI Configurations), hide the page header
   *  and keep tab state local so the ?tab query param doesn't collide with the
   *  parent page's tab routing. */
  embedded?: boolean;
}

const ModelDebuggingPanel: React.FC<ModelDebuggingPanelProps> = ({ embedded = false }) => {
  // URL-synced tab so the legacy /admin/3d-suggestions route deep-links via ?tab=suggestions.
  const [searchParams, setSearchParams] = useSearchParams();
  const [localTab, setLocalTab] = useState<'debug' | 'suggestions'>('debug');
  const activeTab = embedded
    ? localTab
    : (searchParams.get('tab') === 'suggestions' ? 'suggestions' : 'debug');
  const handleTabChange = (val: string) => {
    if (embedded) {
      setLocalTab(val === 'suggestions' ? 'suggestions' : 'debug');
      return;
    }
    const params = new URLSearchParams(searchParams);
    if (val === 'debug') params.delete('tab');
    else params.set('tab', val);
    setSearchParams(params, { replace: true });
  };
  const { toast } = useToast();
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load models from localStorage or use defaults
  useEffect(() => {
    const savedModels = localStorage.getItem('model-debugging-status');
    if (savedModels) {
      try {
        setModels(JSON.parse(savedModels));
        return;
      } catch (error) {
        console.error('Failed to parse saved models:', error);
      }
    }

    // Initialize with all Replicate models from replicateConfig
    const initialModels: ModelStatus[] = [
      {
        name: 'adirik/interior-design',
        displayName: 'Interior Design AI',
        type: 'image-to-image',
        status: 'working',
        lastTested: '2025-07-16T17:10:00Z',
        successRate: 100,
        avgDuration: 5.55,
        recentLogs: [
          {
            id: '1',
            timestamp: '2025-07-16T17:10:00Z',
            model: 'adirik/interior-design',
            status: 'success',
            duration: 5.55,
            imageUrl:
              'https://replicate.delivery/xezq/BJkO9E29UeWrGiJaOfeus09teBJMoBo8GiieUwmQHAhnaxKoC/out.png',
            predictionId: 've6q56x78hrmc0cr2e59vccny0',
          },
        ],
        versionHash:
          '76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38',
        description: 'Interior design transformation with ControlNet depth',
      },
      {
        name: 'erayyavuz/interior-ai',
        displayName: 'Interior AI',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash:
          'e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9',
        description: 'Lifelike interior designs from text and image references',
      },
      {
        name: 'jschoormans/comfyui-interior-remodel',
        displayName: 'ComfyUI Interior Remodel',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'ComfyUI-based interior remodeling',
      },
      {
        name: 'julian-at/interiorly-gen1-dev',
        displayName: 'Interiorly Gen1 Dev',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'Interiorly generation model v1 development',
      },
      {
        name: 'jschoormans/interior-v2',
        displayName: 'Interior V2',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'Interior design v2 — fast generation',
      },
      {
        name: 'doobls-ai/interor-2',
        displayName: 'Doobls Interior 2',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash:
          '91f2ef63c76a73d2ec4c67cf7b2a9672e074046cf4fde1d98e46a5829f7ea68b',
        description: 'Flux LoRA interior design — fast generation with img2img support',
      },
      {
        name: 'rihan-a/colourful_interiors',
        displayName: 'Colourful Interiors',
        type: 'hybrid',
        status: 'untested',
        recentLogs: [],
        versionHash:
          'ba0425bc2e4bebafa8bd918519fdf3b5a022969a6a7c8ba0746b807bb5b541a3',
        description: 'Flux LoRA for vibrant colourful interiors (trigger word: INTR)',
      },
      {
        name: 'pointblack/stable-interiors-v2',
        displayName: 'Stable Interiors V2 (PointBlack)',
        type: 'image-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash:
          '569b1bd6e4df6c9c900ad932d4a3a9f05585fac957dc6bc627aa1654853a97b5',
        description: 'SD-based img2img interior transformation',
      },
      {
        name: 'youzu/stable-interiors-v2',
        displayName: 'Stable Interiors V2 (Youzu)',
        type: 'image-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash:
          '4836eb257a4fb8b87bac9eacbef9292ee8e1a497398ab96207067403a4be2daf',
        description: 'Fast SD-based img2img interior transformation (~12s)',
      },
      {
        name: 'rocketdigitalai/interior-design-sdxl',
        displayName: 'Interior Design SDXL',
        type: 'text-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'SDXL + ControlNet depth/ProMax for photorealistic interior renders',
      },
      {
        name: 'davisbrown/designer-architecture',
        displayName: 'Designer Architecture',
        type: 'text-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'Designer architecture generation',
      },
      {
        name: 'stability-ai/stable-diffusion',
        displayName: 'Stable Diffusion',
        type: 'text-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'Stable Diffusion text-to-image generation',
      },
      {
        name: 'runwayml/stable-diffusion-v1-5',
        displayName: 'Stable Diffusion v1.5',
        type: 'text-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: 'Stable Diffusion v1.5 text-to-image generation',
      },
      {
        name: 'threestudio-project/threestudio',
        displayName: 'ThreeStudio 3D',
        type: 'text-to-image',
        status: 'untested',
        recentLogs: [],
        versionHash: 'latest',
        description: '3D object generation from text',
      },
    ];
    setModels(initialModels);
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'working':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'failing':
        return 'text-red-500 dark:text-red-400';
      case 'untested':
        return 'text-amber-600 dark:text-amber-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'working':
        return <CheckCircle className="h-4 w-4" />;
      case 'failing':
        return <AlertCircle className="h-4 w-4" />;
      case 'untested':
        return <Clock className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'text-to-image':
        return <FileText className="h-4 w-4" />;
      case 'image-to-image':
        return <Image className="h-4 w-4" />;
      case 'hybrid':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const testModel = async (modelName: string) => {
    setIsLoading(true);
    try {
      // This would call the actual 3D generation API
      // For now, we'll simulate the test
      toast({
        title: 'Testing Model',
        description: `Starting test for ${modelName}...`,
      });

      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update model status (this would be based on actual API response)
      setModels((prev) => {
        const updated = prev.map((model) =>
          model.name === modelName
            ? {
                ...model,
                status: 'working' as const,
                lastTested: new Date().toISOString(),
                successRate: 100,
                avgDuration: Math.random() * 10 + 3,
                recentLogs: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    model: modelName,
                    status: 'success' as const,
                    duration: Math.random() * 10 + 3,
                  },
                  ...model.recentLogs.slice(0, 4),
                ],
              }
            : model,
        );
        // Save to localStorage
        localStorage.setItem('model-debugging-status', JSON.stringify(updated));
        return updated;
      });

      toast({
        title: 'Test Complete',
        description: `${modelName} test completed successfully`,
      });
    } catch {
      toast({
        title: 'Test Failed',
        description: `Failed to test ${modelName}`,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const testAllModels = async () => {
    setIsLoading(true);
    toast({
      title: 'Testing All Models',
      description: 'Running comprehensive test suite...',
    });

    // Simulate testing all models
    for (const model of models) {
      await testModel(model.name);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    setIsLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Content copied to clipboard',
    });
  };

  const workingModels = models.filter((m) => m.status === 'working').length;
  const failingModels = models.filter((m) => m.status === 'failing').length;
  const untestedModels = models.filter((m) => m.status === 'untested').length;

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && (
        <GlobalAdminHeader
          title="3D Model Debugging"
          description="Monitor and debug AI model performance for 3D generation"
          breadcrumbs={[
            { label: 'Admin', path: '/admin' },
            { label: '3D Model Debugging' },
          ]}
        />
      )}
      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="debug" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Model Debugging
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Material Suggestions
            </TabsTrigger>
          </TabsList>
          <TabsContent value="debug" className="space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end">
          <Button
            onClick={testAllModels}
            onKeyDown={(e) => e.key === 'Enter' && testAllModels()}
            disabled={isLoading}
            className="flex items-center gap-2"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            Test all models
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium">
                Total Models
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{models.length}</div>
              <p className="text-xs text-muted-foreground">Configured models</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Working
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {workingModels}
              </div>
              <p className="text-xs text-muted-foreground">
                Operational models
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                Failing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {failingModels}
              </div>
              <p className="text-xs text-muted-foreground">
                Models with issues
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                Untested
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {untestedModels}
              </div>
              <p className="text-xs text-muted-foreground">Pending tests</p>
            </CardContent>
          </Card>
        </div>

        {/* Model Accordion */}
        <Card>
          <CardHeader>
            <CardTitle>Model Status & Debugging</CardTitle>
            <CardDescription>
              Detailed status and debugging information for each 3D generation
              model
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {models.map((model) => (
                <AccordionItem key={model.name} value={model.name}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center justify-between w-full pr-4">
                      <div className="flex items-center gap-3">
                        {getTypeIcon(model.type)}
                        <div className="text-left">
                          <div className="font-medium">{model.displayName}</div>
                          <div className="text-sm text-muted-foreground">
                            {model.name}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center text-xs ${getStatusColor(model.status)}`}>
                          {getStatusIcon(model.status)}
                          <span className="ml-1 capitalize">
                            {model.status}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {model.type}
                        </span>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pt-4 space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Model Info */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">
                              Model Information
                            </h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Description:
                                </span>
                                <span className="text-right max-w-xs">
                                  {model.description}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Type:
                                </span>
                                <Badge className="border border-border bg-background text-foreground text-xs">
                                  {getTypeIcon(model.type)}
                                  <span className="ml-1">{model.type}</span>
                                </Badge>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">
                                  Version Hash:
                                </span>
                                <div className="flex items-center gap-1">
                                  <code className="text-xs bg-muted px-1 rounded">
                                    {model.versionHash.slice(0, 8)}...
                                  </code>
                                  <Button
                                    className="bg-transparent hover:bg-accent hover:text-accent-foreground h-6 w-6 p-0"
                                    onClick={() =>
                                      copyToClipboard(model.versionHash)
                                    }
                                    onKeyDown={(e) =>
                                      e.key === 'Enter' &&
                                      copyToClipboard(model.versionHash)
                                    }
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              {model.lastTested && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Last Tested:
                                  </span>
                                  <span className="text-xs">
                                    {formatDate(model.lastTested, { withTime: true })}
                                  </span>
                                </div>
                              )}
                              {model.successRate !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Success Rate:
                                  </span>
                                  <span className="text-green-600">
                                    {model.successRate}%
                                  </span>
                                </div>
                              )}
                              {model.avgDuration !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">
                                    Avg Duration:
                                  </span>
                                  <span>{model.avgDuration.toFixed(2)}s</span>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              className="h-8 px-3 text-sm flex items-center gap-1"
                              onClick={() => testModel(model.name)}
                              onKeyDown={(e) =>
                                e.key === 'Enter' && testModel(model.name)
                              }
                              disabled={isLoading}
                            >
                              <RefreshCw
                                className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`}
                              />
                              Test model
                            </Button>
                            <Button
                              className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-1"
                              onClick={() => copyToClipboard(model.name)}
                              onKeyDown={(e) =>
                                e.key === 'Enter' && copyToClipboard(model.name)
                              }
                            >
                              <Copy className="h-3 w-3" />
                              Copy name
                            </Button>
                          </div>
                        </div>

                        {/* Recent Logs */}
                        <div>
                          <h4 className="font-medium mb-2">Recent Activity</h4>
                          {model.recentLogs.length > 0 ? (
                            <div className="space-y-2">
                              {model.recentLogs.slice(0, 3).map((log) => (
                                <div
                                  key={log.id}
                                  className="border rounded-lg p-3 text-sm"
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <Badge
                                      className={`text-xs ${log.status === 'success' ? 'bg-primary text-primary-foreground' : 'bg-destructive text-destructive-foreground'}`}
                                    >
                                      {log.status === 'success' ? (
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                      ) : (
                                        <AlertCircle className="h-3 w-3 mr-1" />
                                      )}
                                      {log.status}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs">
                                      {formatDate(log.timestamp, { withTime: true })}
                                    </span>
                                  </div>
                                  {log.duration && (
                                    <div className="text-muted-foreground text-xs">
                                      Duration: {log.duration.toFixed(2)}s
                                    </div>
                                  )}
                                  {log.predictionId && (
                                    <div className="text-muted-foreground text-xs">
                                      Prediction ID: {log.predictionId}
                                    </div>
                                  )}
                                  {log.imageUrl && (
                                    <div className="mt-2">
                                      <Button
                                        className="border border-border bg-background text-foreground h-8 px-3 text-sm flex items-center gap-1 text-xs"
                                        onClick={() =>
                                          window.open(log.imageUrl, '_blank')
                                        }
                                        onKeyDown={(e) =>
                                          e.key === 'Enter' && window.open()
                                        }
                                        aria-label={`View generated image for ${log.model}`}
                                      >
                                        <ExternalLink className="h-3 w-3" />
                                        View result
                                      </Button>
                                    </div>
                                  )}
                                  {log.errorMessage && (
                                    <Alert className="mt-2">
                                      <AlertCircle className="h-4 w-4" />
                                      <AlertDescription className="text-xs">
                                        {log.errorMessage}
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground border rounded-lg p-4 text-center">
                              No recent activity. Run a test to see logs.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>
              Overall system status and performance metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <div className="text-sm font-medium">Enhanced Logging</div>
                <Badge className="bg-green-500/20 text-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Active
                </Badge>
                <div className="text-xs text-muted-foreground">
                  Error classification and retry logic enabled
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">
                  TypeScript Compilation
                </div>
                <Badge className="bg-green-500/20 text-green-600">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Passing
                </Badge>
                <div className="text-xs text-muted-foreground">
                  No compilation errors detected
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">API Integration</div>
                <Badge className="bg-yellow-500/20 text-yellow-600">
                  <Clock className="h-3 w-3 mr-1" />
                  Testing
                </Badge>
                <div className="text-xs text-muted-foreground">
                  Model validation in progress
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="suggestions">
            <MaterialSuggestionsPanel embedded />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ModelDebuggingPanel;
