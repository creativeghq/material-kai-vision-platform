import React, { useState, useCallback } from 'react';
import {
  Upload, Camera, Brain, Sparkles, Target, CheckCircle, Clock,
  Layers, Users, BarChart3, Lightbulb, Home, Ruler, Palette,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ThreeJsViewer } from '@/components/3D/ThreeJsViewer';
import { IntegratedAIService } from '@/services/integratedAIService';

interface UserPreferences {
  priorities?: Record<string, boolean>;
}

interface LayoutSuggestion {
  item_type: string;
  confidence: number;
}

interface SVBRDFExtraction {
  albedo_map_url?: string;
}

interface MaterialPlacement {
  zone: string;
  cost_range: string;
  reasoning: string;
}

interface AgentExecution {
  agent_name: string;
  confidence: number;
  reasoning: string;
}

interface SpatialAnalysis {
  layout_suggestions?: LayoutSuggestion[];
  material_placements?: MaterialPlacement[];
  spatial_features?: unknown[];
  confidence_score: number;
  reasoning_explanation?: string;
}

interface CrewAICoordination {
  overall_confidence: number;
  coordination_summary: string;
  agent_executions?: AgentExecution[];
}

interface NeRFReconstruction {
  model_file_url?: string;
}

interface AIStudioResults {
  nerfReconstruction?: NeRFReconstruction | null;
  svbrdfExtractions: SVBRDFExtraction[];
  spatialAnalysis?: SpatialAnalysis | null;
  crewaiCoordination?: CrewAICoordination | null;
}

export const AIStudioPage: React.FC = () => {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [roomType, setRoomType] = useState<string>('');
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({});
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AIStudioResults | null>(null);
  const [activeTab, setActiveTab] = useState('upload');

  const roomTypes = [
    'bedroom', 'living_room', 'kitchen', 'bathroom', 'office', 'dining_room',
  ];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const imageFiles = acceptedFiles.filter(file =>
      file.type.startsWith('image/') && file.size <= 10 * 1024 * 1024,
    );

    if (imageFiles.length !== acceptedFiles.length) {
      toast({
        title: 'Some files rejected',
        description: 'Only images under 10MB are allowed.',
        variant: 'destructive',
      });
    }

    setUploadedFiles(prev => [...prev, ...imageFiles]);
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: true,
  });

  const handleCompleteDesign = async () => {
    if (uploadedFiles.length === 0 || !roomType) {
      toast({
        title: 'Missing requirements',
        description: 'Please upload images and select a room type.',
        variant: 'destructive',
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setActiveTab('processing');

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 5;
        });
      }, 2000);

      toast({
        title: 'Starting AI Studio',
        description: 'Coordinating all AI systems for comprehensive design analysis...',
      });

      const designResults = await IntegratedAIService.generateCompleteDesign(
        uploadedFiles,
        roomType,
        userPreferences as Record<string, unknown>,
      );

      clearInterval(progressInterval);
      setProgress(100);
      setResults(designResults);
      setActiveTab('results');

      toast({
        title: 'AI Studio Complete',
        description: 'All AI systems have analyzed your space and generated recommendations.',
      });

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('AI Studio error:', error);
      toast({
        title: 'Processing failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
      setActiveTab('upload');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const renderProcessingStatus = () => {
    const stages = [
      { name: 'NeRF Reconstruction', icon: Layers, status: progress > 20 ? 'completed' : progress > 0 ? 'processing' : 'pending' },
      { name: 'SVBRDF Extraction', icon: Palette, status: progress > 40 ? 'completed' : progress > 20 ? 'processing' : 'pending' },
      { name: 'Spatial Analysis', icon: Ruler, status: progress > 70 ? 'completed' : progress > 40 ? 'processing' : 'pending' },
      { name: 'CrewAI Coordination', icon: Users, status: progress > 90 ? 'completed' : progress > 70 ? 'processing' : 'pending' },
    ];

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-2">AI Studio Processing</h3>
          <p className="text-muted-foreground">Coordinating multiple AI systems for comprehensive analysis</p>
        </div>

        <Progress value={progress} className="w-full h-3" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stages.map((stage) => (
            <Card key={stage.name} className={`transition-all ${
              stage.status === 'completed' ? 'border-green-500 bg-green-50 dark:bg-green-950' :
              stage.status === 'processing' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' :
              'border-muted'
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <stage.icon className={`w-6 h-6 ${
                    stage.status === 'completed' ? 'text-green-600' :
                    stage.status === 'processing' ? 'text-blue-600' :
                    'text-muted-foreground'
                  }`} />
                  <div className="flex-1">
                    <p className="font-medium">{stage.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {stage.status === 'completed' && <CheckCircle className="w-4 h-4 text-green-600" />}
                      {stage.status === 'processing' && <Clock className="w-4 h-4 text-blue-600 animate-spin" />}
                      <span className="text-sm text-muted-foreground capitalize">{stage.status}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Alert>
          <Brain className="h-4 w-4" />
          <AlertDescription>
            Our AI systems are working together to analyze your space from multiple perspectives.
            This comprehensive approach ensures optimal design recommendations.
          </AlertDescription>
        </Alert>
      </div>
    );
  };

  const renderResults = () => {
    if (!results) return null;

    const { nerfReconstruction, svbrdfExtractions, spatialAnalysis, crewaiCoordination } = results;

    return (
      <div className="space-y-6">
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-2">AI Studio Results</h3>
          <p className="text-muted-foreground">Comprehensive analysis from all AI systems</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 3D Visualization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                3D Reconstruction & Layout
              </CardTitle>
            </CardHeader><CardContent>
              <ThreeJsViewer
                imageUrl={uploadedFiles[0] ? URL.createObjectURL(uploadedFiles[0]) : undefined}
                modelUrl={nerfReconstruction?.model_file_url}
                className="h-64 w-full mb-4"
              />
              {spatialAnalysis?.layout_suggestions && (
                <div className="space-y-2">
                  <h4 className="font-medium">Layout Suggestions</h4>
                  <div className="space-y-1">
                    {spatialAnalysis.layout_suggestions.slice(0, 3).map((suggestion: LayoutSuggestion, index: number) => (
                      <div key={index} className="text-sm p-2 bg-muted rounded">
                        <span className="font-medium">{suggestion.item_type}</span>
                        <span className="text-muted-foreground ml-2">
                          Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Material Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="w-5 h-5" />
                Material Analysis
              </CardTitle>
            </CardHeader><CardContent>
              {svbrdfExtractions.length > 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    {svbrdfExtractions.slice(0, 3).map((extraction: SVBRDFExtraction, index: number) => (
                      <div key={index} className="aspect-square bg-muted rounded overflow-hidden">
                        {extraction.albedo_map_url && (
                          <img
                            src={extraction.albedo_map_url}
                            alt="Material preview"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {spatialAnalysis?.material_placements && (
                    <div>
                      <h4 className="font-medium mb-2">Recommended Materials</h4>
                      <div className="space-y-2">
                        {spatialAnalysis.material_placements.slice(0, 3).map((placement: MaterialPlacement, index: number) => (
                          <div key={index} className="p-3 border rounded">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium">{placement.zone}</span>
                              <Badge className="border border-border bg-background text-foreground">{placement.cost_range}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{placement.reasoning}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* CrewAI Insights */}
        {crewaiCoordination && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                AI Agent Insights
              </CardTitle>
            </CardHeader><CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Overall Confidence</span>
                  <Badge className="bg-primary text-primary-foreground">
                    {(crewaiCoordination.overall_confidence * 100).toFixed(0)}%
                  </Badge>
                </div>

                <div>
                  <h4 className="font-medium mb-2">Agent Recommendations</h4>
                  <p className="text-sm text-muted-foreground">
                    {crewaiCoordination.coordination_summary}
                  </p>
                </div>

                {crewaiCoordination.agent_executions && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Agent Contributions</h4>
                    {crewaiCoordination.agent_executions.map((execution: AgentExecution, index: number) => (
                      <div key={index} className="p-2 border rounded">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{execution.agent_name}</span>
                          <Badge className="border border-border bg-background text-foreground">
                            {(execution.confidence * 100).toFixed(0)}%
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {execution.reasoning}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Spatial Intelligence */}
        {spatialAnalysis && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Spatial Intelligence Report
              </CardTitle>
            </CardHeader><CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {spatialAnalysis.spatial_features?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Features Analyzed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {spatialAnalysis.layout_suggestions?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Layout Options</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {spatialAnalysis.material_placements?.length || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Material Zones</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">
                      {(spatialAnalysis.confidence_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Confidence</div>
                  </div>
                </div>

                {spatialAnalysis.reasoning_explanation && (
                  <div>
                    <h4 className="font-medium mb-2">Spatial Reasoning</h4>
                    <p className="text-sm text-muted-foreground">
                      {spatialAnalysis.reasoning_explanation}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => setActiveTab('upload')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setActiveTab('upload');
              }
            }}
            className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            Start New Analysis
          </Button>
          <Button>
            Export Results
          </Button>
          <Button className="border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground">
            Share Design
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
          AI Design Studio
        </h1>
        <p className="text-muted-foreground max-w-3xl mx-auto">
          Experience the future of interior design with our integrated AI systems.
          Upload images to get comprehensive analysis using NeRF 3D reconstruction,
          SVBRDF material extraction, SpaceFormer spatial reasoning, and CrewAI agent coordination.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload" className="flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Upload & Setup
          </TabsTrigger>
          <TabsTrigger value="processing" disabled={!isProcessing}>
            <Brain className="w-4 h-4" />
            AI Processing
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!results}>
            <BarChart3 className="w-4 h-4" />
            Results
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Camera className="w-5 h-5" />
                  Upload Images
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Camera className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  {isDragActive ? (
                    <p>Drop the images here...</p>
                  ) : (
                    <div>
                      <p className="text-lg font-medium">Drag & drop images here</p>
                      <p className="text-muted-foreground">or click to select files</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Multiple images enable 3D reconstruction • Max 10MB each
                      </p>
                    </div>
                  )}
                </div>

                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="font-medium">{uploadedFiles.length} images uploaded:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {uploadedFiles.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <span className="text-sm truncate">{file.name}</span>
                          <Button
                            className="bg-transparent hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm"
                            onClick={() => removeFile(index)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                removeFile(index);
                              }
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Configuration Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Home className="w-5 h-5" />
                  Room Configuration
                </CardTitle>
              </CardHeader><CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Room Type</label>
                  <Select value={roomType} onValueChange={setRoomType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent>
                      {roomTypes.map(type => (
                        <SelectItem key={type} value={type}>
                          {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Design Priorities</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Functionality', 'Aesthetics', 'Budget', 'Sustainability'].map(priority => (
                      <Button
                        key={priority}
                        className={`border border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground h-8 px-3 text-sm ${userPreferences.priorities?.[priority.toLowerCase()] ? 'bg-primary text-primary-foreground' : ''}`}
                        onClick={() => {
                          setUserPreferences((prev: UserPreferences) => ({
                            ...prev,
                            priorities: {
                              ...prev.priorities,
                              [priority.toLowerCase()]: !prev.priorities?.[priority.toLowerCase()],
                            },
                          }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setUserPreferences((prev: UserPreferences) => ({
                              ...prev,
                              priorities: {
                                ...prev.priorities,
                                [priority.toLowerCase()]: !prev.priorities?.[priority.toLowerCase()],
                              },
                            }));
                          }
                        }}
                      >
                        {priority}
                      </Button>
                    ))}
                  </div>
                </div>

                {uploadedFiles.length > 0 && roomType && (
                  <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertDescription>
                      Ready for AI Studio analysis Our systems will coordinate to provide
                      comprehensive design insights.
                    </AlertDescription>
                  </Alert>
                )}

                <Button
                  onClick={handleCompleteDesign}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCompleteDesign();
                    }
                  }}
                  disabled={uploadedFiles.length === 0 || !roomType || isProcessing}
                  className="w-full h-11 px-8"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Start AI Studio Analysis
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="processing">
          {renderProcessingStatus()}
        </TabsContent>

        <TabsContent value="results">
          {renderResults()}
        </TabsContent>
      </Tabs>
    </div>
  );
};
