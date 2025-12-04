import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit,
  History,
  RefreshCw,
  ArrowLeft,
  Sparkles,
  Save,
  X,
  Eye,
  Code,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ExtractionPrompt {
  id: string;
  workspace_id: string;
  stage: string;
  category: string;
  prompt_template: string;
  system_prompt: string | null;
  is_custom: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PromptHistory {
  id: string;
  prompt_id: string;
  version: number;
  prompt_template: string;
  system_prompt: string | null;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
}

export const ExtractionPromptsPage: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prompts, setPrompts] = useState<ExtractionPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingPrompt, setEditingPrompt] = useState<ExtractionPrompt | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [promptHistory, setPromptHistory] = useState<PromptHistory[]>([]);
  const [editedTemplate, setEditedTemplate] = useState('');
  const [editedSystemPrompt, setEditedSystemPrompt] = useState('');
  const [saving, setSaving] = useState(false);

  // Default workspace ID (should come from auth context)
  const workspaceId = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

  useEffect(() => {
    loadPrompts();
  }, [selectedStage, selectedCategory]);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (selectedStage !== 'all') params.append('stage', selectedStage);
      if (selectedCategory !== 'all') params.append('category', selectedCategory);

      const response = await fetch(
        `https://v1api.materialshub.gr/admin/extraction-prompts?${params}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load prompts');

      const data = await response.json();
      setPrompts(data);
    } catch (error) {
      console.error('Error loading prompts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load extraction prompts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEditPrompt = (prompt: ExtractionPrompt) => {
    setEditingPrompt(prompt);
    setEditedTemplate(prompt.prompt_template);
    setEditedSystemPrompt(prompt.system_prompt || '');
    setShowEditDialog(true);
  };

  const handleSavePrompt = async () => {
    if (!editingPrompt) return;

    try {
      setSaving(true);
      const response = await fetch(
        `https://v1api.materialshub.gr/admin/extraction-prompts/${editingPrompt.stage}/${editingPrompt.category}?workspace_id=${workspaceId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({
            prompt_template: editedTemplate,
            system_prompt: editedSystemPrompt || null,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to save prompt');

      toast({
        title: 'Success',
        description: 'Prompt updated successfully',
      });

      setShowEditDialog(false);
      loadPrompts();
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({
        title: 'Error',
        description: 'Failed to save prompt',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleViewHistory = async (prompt: ExtractionPrompt) => {
    try {
      const response = await fetch(
        `https://v1api.materialshub.gr/admin/extraction-prompts/history/${prompt.id}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to load history');

      const data = await response.json();
      setPromptHistory(data);
      setEditingPrompt(prompt);
      setShowHistoryDialog(true);
    } catch (error) {
      console.error('Error loading history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load prompt history',
        variant: 'destructive',
      });
    }
  };

  const getStageBadge = (stage: string) => {
    const colors: Record<string, string> = {
      discovery: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      entity_creation: 'bg-green-500/20 text-green-300 border-green-500/30',
      image_analysis: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      chunking: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
    };

    return (
      <Badge className={colors[stage] || 'bg-gray-500/20 text-gray-300'}>
        {stage.replace('_', ' ')}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
      material_properties: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      certificates: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      logos: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    };

    return (
      <Badge className={colors[category] || 'bg-gray-500/20 text-gray-300'}>
        {category.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={() => navigate('/admin')}
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-8 w-8 text-purple-400" />
              Extraction Prompts Management
            </h1>
            <p className="text-white/60 mt-1">
              Manage AI prompts for PDF extraction pipeline
            </p>
          </div>
        </div>
        <Button
          onClick={loadPrompts}
          variant="outline"
          size="sm"
          className="border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card className="mb-6 bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-white/80">Stage</Label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="discovery">Discovery</SelectItem>
                  <SelectItem value="entity_creation">Entity Creation</SelectItem>
                  <SelectItem value="image_analysis">Image Analysis</SelectItem>
                  <SelectItem value="chunking">Chunking</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-white/80">Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="material_properties">Material Properties</SelectItem>
                  <SelectItem value="certificates">Certificates</SelectItem>
                  <SelectItem value="logos">Logos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompts Table */}
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Extraction Prompts ({prompts.length})</CardTitle>
          <CardDescription className="text-white/60">
            Configure AI prompts for each stage of the PDF extraction pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-white/60">Loading prompts...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-8 text-white/60">No prompts found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/10">
                  <TableHead className="text-white/80">Stage</TableHead>
                  <TableHead className="text-white/80">Category</TableHead>
                  <TableHead className="text-white/80">Version</TableHead>
                  <TableHead className="text-white/80">Custom</TableHead>
                  <TableHead className="text-white/80">Updated</TableHead>
                  <TableHead className="text-white/80 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id} className="border-white/10">
                    <TableCell>{getStageBadge(prompt.stage)}</TableCell>
                    <TableCell>{getCategoryBadge(prompt.category)}</TableCell>
                    <TableCell className="text-white/80">v{prompt.version}</TableCell>
                    <TableCell>
                      {prompt.is_custom ? (
                        <Badge className="bg-purple-500/20 text-purple-300">Custom</Badge>
                      ) : (
                        <Badge className="bg-gray-500/20 text-gray-300">Default</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-white/60 text-sm">
                      {new Date(prompt.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => handleEditPrompt(prompt)}
                          variant="ghost"
                          size="sm"
                          className="text-white/70 hover:text-white hover:bg-white/10"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleViewHistory(prompt)}
                          variant="ghost"
                          size="sm"
                          className="text-white/70 hover:text-white hover:bg-white/10"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl bg-[#1a1a1a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              Edit Prompt: {editingPrompt?.stage} - {editingPrompt?.category}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Customize the AI prompt template for this extraction stage
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="template" className="w-full">
            <TabsList className="bg-white/5">
              <TabsTrigger value="template">Prompt Template</TabsTrigger>
              <TabsTrigger value="system">System Prompt</TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-4">
              <div>
                <Label className="text-white/80">Prompt Template</Label>
                <Textarea
                  value={editedTemplate}
                  onChange={(e) => setEditedTemplate(e.target.value)}
                  className="min-h-[300px] bg-white/5 border-white/10 text-white font-mono text-sm"
                  placeholder="Enter prompt template..."
                />
                <p className="text-xs text-white/50 mt-2">
                  Use placeholders like {'{product_name}'}, {'{page_content}'}, etc.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="system" className="space-y-4">
              <div>
                <Label className="text-white/80">System Prompt (Optional)</Label>
                <Textarea
                  value={editedSystemPrompt}
                  onChange={(e) => setEditedSystemPrompt(e.target.value)}
                  className="min-h-[300px] bg-white/5 border-white/10 text-white font-mono text-sm"
                  placeholder="Enter system prompt..."
                />
                <p className="text-xs text-white/50 mt-2">
                  System-level instructions for the AI model
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              onClick={() => setShowEditDialog(false)}
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSavePrompt}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-4xl bg-[#1a1a1a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">
              Version History: {editingPrompt?.stage} - {editingPrompt?.category}
            </DialogTitle>
            <DialogDescription className="text-white/60">
              View all previous versions of this prompt
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[500px] overflow-y-auto">
            {promptHistory.length === 0 ? (
              <div className="text-center py-8 text-white/60">No history available</div>
            ) : (
              <div className="space-y-4">
                {promptHistory.map((history) => (
                  <Card key={history.id} className="bg-white/5 border-white/10">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm text-white">
                          Version {history.version}
                        </CardTitle>
                        <span className="text-xs text-white/60">
                          {new Date(history.created_at).toLocaleString()}
                        </span>
                      </div>
                      {history.change_reason && (
                        <CardDescription className="text-white/60 text-xs">
                          {history.change_reason}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="bg-black/30 p-3 rounded text-xs font-mono text-white/80 max-h-[200px] overflow-y-auto">
                        {history.prompt_template}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setShowHistoryDialog(false)}
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

