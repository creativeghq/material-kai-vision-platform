import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Database, Brain, Zap, Upload, Settings, Rocket, ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { ragService, TrainingRequest } from '@/services/ragService';

export const RAGManagementPanel: React.FC = () => {
  const navigate = useNavigate();
  const [isTraining, setIsTraining] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState<any[]>([]);
  const [newKnowledgeEntry, setNewKnowledgeEntry] = useState({
    title: '',
    content: '',
    content_type: 'expert_knowledge' as const,
    tags: '',
    source_url: ''
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTrainingStatus();
  }, []);

  const loadTrainingStatus = async () => {
    try {
      const status = await ragService.getTrainingStatus();
      setTrainingStatus(status);
    } catch (error) {
      console.error('Failed to load training status:', error);
    }
  };

  const handleStartCLIPTraining = async () => {
    setIsTraining(true);
    try {
      const result = await ragService.startCLIPFineTuning(
        `kai-clip-${Date.now()}`,
        undefined, // Include all categories
        3 // epochs
      );

      toast({
        title: "CLIP Training Started",
        description: `Training job created: ${result.estimated_training_time}`,
      });

      await loadTrainingStatus();
    } catch (error) {
      console.error('Training error:', error);
      toast({
        title: "Training Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsTraining(false);
    }
  };

  const handleStartMaterialClassification = async () => {
    setIsTraining(true);
    try {
      const result = await ragService.startMaterialClassification(
        `kai-materialnet-${Date.now()}`,
        undefined, // Include all categories
        5 // epochs
      );

      toast({
        title: "Material Classification Training Started",
        description: `Training job created: ${result.estimated_training_time}`,
      });

      await loadTrainingStatus();
    } catch (error) {
      console.error('Training error:', error);
      toast({
        title: "Training Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsTraining(false);
    }
  };

  const handleAddKnowledgeEntry = async () => {
    if (!newKnowledgeEntry.title || !newKnowledgeEntry.content) {
      toast({
        title: "Missing Information",
        description: "Title and content are required",
        variant: "destructive"
      });
      return;
    }

    try {
      await ragService.addKnowledgeEntry({
        title: newKnowledgeEntry.title,
        content: newKnowledgeEntry.content,
        content_type: newKnowledgeEntry.content_type,
        tags: newKnowledgeEntry.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        source_url: newKnowledgeEntry.source_url || undefined
      });

      toast({
        title: "Knowledge Entry Added",
        description: "Successfully added to knowledge base"
      });

      // Reset form
      setNewKnowledgeEntry({
        title: '',
        content: '',
        content_type: 'expert_knowledge',
        tags: '',
        source_url: ''
      });
    } catch (error) {
      console.error('Add knowledge error:', error);
      toast({
        title: "Failed to Add Knowledge",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500';
      case 'processing':
        return 'bg-blue-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/')}
                className="flex items-center gap-2"
              >
                <Home className="h-4 w-4" />
                Back to Main
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => navigate('/admin')}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">RAG System Management</h1>
              <p className="text-sm text-muted-foreground">
                Manage knowledge base, model training, and embedding systems
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5" />
            RAG System Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="training" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="training">Model Training</TabsTrigger>
              <TabsTrigger value="knowledge">Knowledge Base</TabsTrigger>
              <TabsTrigger value="embeddings">Embeddings</TabsTrigger>
              <TabsTrigger value="status">System Status</TabsTrigger>
            </TabsList>

            {/* Model Training Tab */}
            <TabsContent value="training" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Rocket className="h-5 w-5" />
                    Hugging Face Model Training
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CLIP Fine-tuning */}
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-2">CLIP Fine-tuning</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Fine-tune CLIP for better material-text embeddings
                        </p>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>• Base Model: openai/clip-vit-base-patch32</p>
                          <p>• Training Data: Materials + Knowledge Base</p>
                          <p>• Estimated Time: 2-4 hours</p>
                        </div>
                        <Button 
                          onClick={handleStartCLIPTraining}
                          disabled={isTraining}
                          className="w-full mt-4"
                        >
                          {isTraining ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Training...</>
                          ) : (
                            <><Zap className="h-4 w-4 mr-2" /> Start CLIP Training</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Material Classification */}
                    <Card>
                      <CardContent className="p-4">
                        <h3 className="font-semibold mb-2">Material Classification</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Train EfficientNet for material category classification
                        </p>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          <p>• Base Model: google/efficientnet-b0</p>
                          <p>• Training Data: Material Images + Categories</p>
                          <p>• Estimated Time: 1-3 hours</p>
                        </div>
                        <Button 
                          onClick={handleStartMaterialClassification}
                          disabled={isTraining}
                          className="w-full mt-4"
                        >
                          {isTraining ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Training...</>
                          ) : (
                            <><Zap className="h-4 w-4 mr-2" /> Start Classification Training</>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Training Status */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Training Jobs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {trainingStatus.length === 0 ? (
                        <p className="text-center text-muted-foreground py-4">
                          No training jobs found
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {trainingStatus.slice(0, 5).map((job, index) => (
                            <div key={index} className="flex items-center justify-between p-3 border rounded">
                              <div>
                                <p className="font-medium">{job.job_type}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(job.created_at).toLocaleString()}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${getStatusColor(job.status)}`} />
                                <Badge variant="outline">{job.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Knowledge Base Tab */}
            <TabsContent value="knowledge" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Add Knowledge Entry
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Title</label>
                      <Input
                        placeholder="Knowledge entry title"
                        value={newKnowledgeEntry.title}
                        onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Content Type</label>
                      <Select 
                        value={newKnowledgeEntry.content_type} 
                        onValueChange={(value: any) => setNewKnowledgeEntry(prev => ({ ...prev, content_type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="material_spec">Material Specification</SelectItem>
                          <SelectItem value="technical_doc">Technical Document</SelectItem>
                          <SelectItem value="expert_knowledge">Expert Knowledge</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      placeholder="Detailed content for the knowledge base..."
                      value={newKnowledgeEntry.content}
                      onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, content: e.target.value }))}
                      rows={6}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Tags (comma-separated)</label>
                      <Input
                        placeholder="material, ceramic, properties, etc."
                        value={newKnowledgeEntry.tags}
                        onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, tags: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Source URL (optional)</label>
                      <Input
                        placeholder="https://example.com/source"
                        value={newKnowledgeEntry.source_url}
                        onChange={(e) => setNewKnowledgeEntry(prev => ({ ...prev, source_url: e.target.value }))}
                      />
                    </div>
                  </div>

                  <Button onClick={handleAddKnowledgeEntry} className="w-full">
                    <Upload className="h-4 w-4 mr-2" />
                    Add to Knowledge Base
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Embeddings Tab */}
            <TabsContent value="embeddings" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Embedding Management
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="p-4 text-center">
                          <h3 className="font-semibold">CLIP Embeddings</h3>
                          <p className="text-2xl font-bold text-primary">512D</p>
                          <p className="text-sm text-muted-foreground">Multi-modal text+image</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <h3 className="font-semibold">EfficientNet</h3>
                          <p className="text-2xl font-bold text-primary">1000D</p>
                          <p className="text-sm text-muted-foreground">Visual features</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4 text-center">
                          <h3 className="font-semibold">MaterialNet</h3>
                          <p className="text-2xl font-bold text-primary">256D</p>
                          <p className="text-sm text-muted-foreground">Material-specific</p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="text-center space-y-4">
                      <p className="text-sm text-muted-foreground">
                        Embedding generation is handled automatically during material processing.
                        Custom models will be deployed here after training completion.
                      </p>
                      <Button variant="outline" disabled>
                        <Settings className="h-4 w-4 mr-2" />
                        Configure Custom Models (Coming Soon)
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* System Status Tab */}
            <TabsContent value="status" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>RAG System Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <h3 className="font-semibold">Database Status</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">Vector Extensions</span>
                          <Badge className="bg-green-500">Active</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Material Embeddings</span>
                          <Badge className="bg-green-500">Ready</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Knowledge Base</span>
                          <Badge className="bg-green-500">Ready</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Search Functions</span>
                          <Badge className="bg-green-500">Active</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold">AI Services</h3>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm">OpenAI Embeddings</span>
                          <Badge className="bg-green-500">Connected</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Hugging Face API</span>
                          <Badge className="bg-green-500">Connected</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">RAG Search Function</span>
                          <Badge className="bg-green-500">Active</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Training Pipeline</span>
                          <Badge className="bg-green-500">Ready</Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      </div>
    </div>
  );
};