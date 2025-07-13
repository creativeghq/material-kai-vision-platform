import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Check, 
  X, 
  Edit3, 
  Send, 
  Image as ImageIcon, 
  Download, 
  Database, 
  Brain, 
  Search,
  Workflow,
  CheckCircle,
  XCircle,
  Clock,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PDFExportOptions } from './PDFExportOptions';

interface PDFTile {
  id: string;
  page_number: number;
  tile_index: number;
  extracted_text: string;
  ocr_confidence: number;
  material_detected: boolean;
  material_type: string;
  material_confidence: number;
  structured_data: any;
  metadata_extracted: any;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  image_url?: string;
}

interface ReviewedTile extends PDFTile {
  reviewed: boolean;
  approved: boolean;
  reviewer_notes?: string;
  corrected_material_type?: string;
  corrected_text?: string;
}

interface WorkflowAction {
  id: string;
  type: 'ai_analysis' | 'image_generation';
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface PDFReviewWorkflowProps {
  processingId: string;
  tiles: PDFTile[];
  onWorkflowComplete?: (results: any) => void;
}

export const PDFReviewWorkflow: React.FC<PDFReviewWorkflowProps> = ({ 
  processingId, 
  tiles, 
  onWorkflowComplete 
}) => {
  const { toast } = useToast();
  const [reviewedTiles, setReviewedTiles] = useState<ReviewedTile[]>(
    tiles.map(tile => ({ ...tile, reviewed: false, approved: false }))
  );
  const [selectedTiles, setSelectedTiles] = useState<Set<string>>(new Set());
  const [workflowActions, setWorkflowActions] = useState<Set<string>>(new Set());
  const [processingWorkflow, setProcessingWorkflow] = useState(false);
  const [workflowProgress, setWorkflowProgress] = useState(0);

  const availableWorkflows: WorkflowAction[] = [
    {
      id: 'ai_analysis',
      type: 'ai_analysis',
      label: 'AI Analysis',
      description: 'Deep analysis with AI models',
      icon: <Brain className="h-4 w-4" />
    },
    {
      id: 'image_generation',
      type: 'image_generation',
      label: 'Generate Images',
      description: 'Create visual representations of materials',
      icon: <ImageIcon className="h-4 w-4" />
    }
  ];

  const updateTileReview = (tileId: string, updates: Partial<ReviewedTile>) => {
    setReviewedTiles(prev => 
      prev.map(tile => 
        tile.id === tileId ? { ...tile, ...updates } : tile
      )
    );
  };

  const toggleTileSelection = (tileId: string) => {
    setSelectedTiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tileId)) {
        newSet.delete(tileId);
      } else {
        newSet.add(tileId);
      }
      return newSet;
    });
  };

  const selectAllApproved = () => {
    const approvedTileIds = reviewedTiles
      .filter(tile => tile.approved)
      .map(tile => tile.id);
    setSelectedTiles(new Set(approvedTileIds));
  };

  const toggleWorkflowAction = (actionId: string) => {
    setWorkflowActions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(actionId)) {
        newSet.delete(actionId);
      } else {
        newSet.add(actionId);
      }
      return newSet;
    });
  };

  const executeWorkflow = async () => {
    if (selectedTiles.size === 0 || workflowActions.size === 0) {
      toast({
        title: "Selection Required",
        description: "Please select tiles and workflow actions",
        variant: "destructive",
      });
      return;
    }

    setProcessingWorkflow(true);
    setWorkflowProgress(0);

    try {
      const selectedTileData = reviewedTiles.filter(tile => selectedTiles.has(tile.id));
      const workflowResults: any = {};

      let completed = 0;
      const totalSteps = workflowActions.size;

      // Execute each workflow action
      for (const actionId of workflowActions) {
        const action = availableWorkflows.find(a => a.id === actionId);
        if (!action) continue;

        console.log(`Executing workflow: ${action.label}`);
        
        try {
          switch (action.type) {
            case 'ai_analysis':
              workflowResults.ai_analysis = await performAIAnalysis(selectedTileData);
              break;
              
              
            case 'image_generation':
              workflowResults.image_generation = await generateMaterialImages(selectedTileData);
              break;
          }
        } catch (error) {
          console.error(`Error in ${action.label}:`, error);
          workflowResults[action.id] = { error: error.message };
        }

        completed++;
        setWorkflowProgress((completed / totalSteps) * 100);
      }

      toast({
        title: "Workflow Complete",
        description: `Successfully processed ${selectedTiles.size} tiles through ${workflowActions.size} workflows`,
      });

      onWorkflowComplete?.(workflowResults);

    } catch (error) {
      console.error('Workflow execution error:', error);
      toast({
        title: "Workflow Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setProcessingWorkflow(false);
      setWorkflowProgress(0);
    }
  };


  const performAIAnalysis = async (tiles: ReviewedTile[]) => {
    const { data, error } = await supabase.functions.invoke('hybrid-material-analysis', {
      body: {
        materials: tiles.map(tile => ({
          id: tile.id,
          text: tile.corrected_text || tile.extracted_text,
          material_type: tile.corrected_material_type || tile.material_type,
          structured_data: tile.structured_data,
          image_url: tile.image_url
        }))
      }
    });

    if (error) throw error;
    return data;
  };


  const generateMaterialImages = async (tiles: ReviewedTile[]) => {
    const images = [];
    
    for (const tile of tiles) {
      try {
        const prompt = `High-quality technical illustration of ${tile.corrected_material_type || tile.material_type} material. 
        Properties: ${JSON.stringify(tile.structured_data || {})}. 
        Clean, professional material sample visualization, white background, detailed texture.`;

        const { data, error } = await supabase.functions.invoke('generate-material-image', {
          body: { 
            prompt,
            material_type: tile.corrected_material_type || tile.material_type,
            tile_id: tile.id
          }
        });

        if (error) throw error;
        images.push({ tile_id: tile.id, image_url: data.image_url });
      } catch (error) {
        console.error(`Image generation failed for tile ${tile.id}:`, error);
      }
    }

    return { generated: images.length, images };
  };

  const getReviewStats = () => {
    const total = reviewedTiles.length;
    const reviewed = reviewedTiles.filter(t => t.reviewed).length;
    const approved = reviewedTiles.filter(t => t.approved).length;
    return { total, reviewed, approved };
  };

  const stats = getReviewStats();

  return (
    <div className="space-y-6">
      {/* Review Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Workflow className="h-5 w-5" />
              Review & Workflow Manager
            </span>
            <div className="flex gap-2">
              <Badge variant="outline">{stats.reviewed}/{stats.total} Reviewed</Badge>
              <Badge variant="default">{stats.approved} Approved</Badge>
            </div>
          </CardTitle>
          <CardDescription>
            Review extracted materials and route them through AI workflows
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <span className="text-sm">Review Progress</span>
            <span className="text-sm">{Math.round((stats.reviewed / stats.total) * 100)}%</span>
          </div>
          <Progress value={(stats.reviewed / stats.total) * 100} className="mt-2" />
        </CardContent>
      </Card>

      <Tabs defaultValue="review" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="review">Review Materials</TabsTrigger>
          <TabsTrigger value="workflow">Configure Workflow</TabsTrigger>
          <TabsTrigger value="execute">Execute Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Material Review</h3>
            <Button onClick={selectAllApproved} variant="outline" size="sm">
              Select All Approved
            </Button>
          </div>
          
          <div className="grid gap-4">
            {reviewedTiles.map((tile) => (
              <Card key={tile.id} className={`transition-colors ${tile.approved ? 'border-green-200 bg-green-50/50' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedTiles.has(tile.id)}
                        onCheckedChange={() => toggleTileSelection(tile.id)}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Page {tile.page_number}</Badge>
                          <Badge variant="outline">Tile {tile.tile_index + 1}</Badge>
                          <Badge className={tile.material_detected ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                            {tile.corrected_material_type || tile.material_type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Confidence: {Math.round((tile.material_confidence || 0) * 100)}%
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {tile.reviewed ? (
                        tile.approved ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-500" />
                        )
                      ) : (
                        <Clock className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium">Material Type</label>
                      <Select
                        value={tile.corrected_material_type || tile.material_type}
                        onValueChange={(value) => updateTileReview(tile.id, { corrected_material_type: value })}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ceramics">Ceramics</SelectItem>
                          <SelectItem value="metals">Metals</SelectItem>
                          <SelectItem value="wood">Wood</SelectItem>
                          <SelectItem value="concrete">Concrete</SelectItem>
                          <SelectItem value="plastics">Plastics</SelectItem>
                          <SelectItem value="glass">Glass</SelectItem>
                          <SelectItem value="textiles">Textiles</SelectItem>
                          <SelectItem value="composites">Composites</SelectItem>
                          <SelectItem value="rubber">Rubber</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium">Extracted Text</label>
                      <Textarea
                        value={tile.corrected_text || tile.extracted_text}
                        onChange={(e) => updateTileReview(tile.id, { corrected_text: e.target.value })}
                        className="mt-1"
                        rows={3}
                      />
                    </div>

                    {tile.structured_data && Object.keys(tile.structured_data).length > 0 && (
                      <div>
                        <label className="text-sm font-medium">Structured Data</label>
                        <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-32">
                          {JSON.stringify(tile.structured_data, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div>
                      <label className="text-sm font-medium">Review Notes</label>
                      <Textarea
                        value={tile.reviewer_notes || ''}
                        onChange={(e) => updateTileReview(tile.id, { reviewer_notes: e.target.value })}
                        placeholder="Add review comments..."
                        className="mt-1"
                        rows={2}
                      />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateTileReview(tile.id, { reviewed: true, approved: true })}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateTileReview(tile.id, { reviewed: true, approved: false })}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Select Workflow Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {availableWorkflows.map((workflow) => (
                <Card 
                  key={workflow.id}
                  className={`cursor-pointer transition-colors ${workflowActions.has(workflow.id) ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => toggleWorkflowAction(workflow.id)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={workflowActions.has(workflow.id)} />
                      {workflow.icon}
                      <div>
                        <h4 className="font-medium">{workflow.label}</h4>
                        <p className="text-sm text-muted-foreground">{workflow.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="execute" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Execute Workflow Pipeline</CardTitle>
              <CardDescription>
                Process selected materials through chosen workflows
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-medium">Selected Materials</p>
                  <p className="text-muted-foreground">{selectedTiles.size} tiles</p>
                </div>
                <div>
                  <p className="font-medium">Workflow Actions</p>
                  <p className="text-muted-foreground">{workflowActions.size} actions</p>
                </div>
              </div>

              {processingWorkflow && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing...</span>
                    <span>{Math.round(workflowProgress)}%</span>
                  </div>
                  <Progress value={workflowProgress} />
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={executeWorkflow} 
                  disabled={selectedTiles.size === 0 || workflowActions.size === 0 || processingWorkflow}
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Execute Pipeline
                </Button>
              </div>
              
              <PDFExportOptions 
                processingId={processingId}
                tiles={reviewedTiles}
                resultSummary={stats}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};