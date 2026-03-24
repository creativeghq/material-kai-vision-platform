import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit,
  History,
  RefreshCw,
  Sparkles,
  Save,
  X,
  Code,
} from 'lucide-react';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';

interface ExtractionPrompt {
  id: string;
  workspace_id: string;
  stage: string;
  category: string;
  prompt_template: string;
  system_prompt: string | null;
  prompt_type: string;
  name: string;
  is_custom: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  used_in: string[] | null;
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
        },
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
        },
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
        },
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
      discovery: 'bg-blue-100 text-blue-700 border-blue-200',
      entity_creation: 'bg-green-100 text-green-700 border-green-200',
      image_analysis: 'bg-purple-100 text-purple-700 border-purple-200',
      chunking: 'bg-pink-100 text-pink-700 border-pink-200',
      scraping: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    };

    return (
      <Badge className={colors[stage] || 'bg-gray-100 text-gray-700'}>
        {stage.replace('_', ' ')}
      </Badge>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      products: 'bg-orange-100 text-orange-700 border-orange-200',
      material_properties: 'bg-teal-100 text-teal-700 border-teal-200',
      certificates: 'bg-yellow-100 text-yellow-700 border-yellow-200',
      logos: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      materials: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };

    return (
      <Badge className={colors[category] || 'bg-gray-100 text-gray-700'}>
        {category.replace('_', ' ')}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Extraction Prompts Management"
        description="Manage AI prompts for PDF extraction pipeline"
        badge="AI Prompts"
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex justify-end">
          <Button
            onClick={loadPrompts}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Stage</Label>
              <Select value={selectedStage} onValueChange={setSelectedStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stages</SelectItem>
                  <SelectItem value="discovery">Discovery</SelectItem>
                  <SelectItem value="entity_creation">Entity Creation</SelectItem>
                  <SelectItem value="image_analysis">Image Analysis</SelectItem>
                  <SelectItem value="chunking">Chunking</SelectItem>
                  <SelectItem value="scraping">Scraping</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="products">Products</SelectItem>
                  <SelectItem value="material_properties">Material Properties</SelectItem>
                  <SelectItem value="certificates">Certificates</SelectItem>
                  <SelectItem value="logos">Logos</SelectItem>
                  <SelectItem value="materials">Materials (Web Scraping)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Extraction Prompts ({prompts.length})</CardTitle>
          <CardDescription>
            Configure AI prompts for each stage of the PDF extraction pipeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading prompts...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No prompts found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Used In</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prompts.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell className="font-medium">
                      {prompt.name || `${prompt.stage} - ${prompt.category}`}
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        prompt.prompt_type === 'agent' ? 'bg-blue-100 text-blue-700' :
                        prompt.prompt_type === 'extraction' ? 'bg-green-100 text-green-700' :
                        prompt.prompt_type === 'template' ? 'bg-purple-100 text-purple-700' :
                        prompt.prompt_type === 'search' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }>
                        {prompt.prompt_type || 'extraction'}
                      </Badge>
                    </TableCell>
                    <TableCell>{getStageBadge(prompt.stage)}</TableCell>
                    <TableCell>{getCategoryBadge(prompt.category)}</TableCell>
                    <TableCell className="text-muted-foreground">v{prompt.version}</TableCell>
                    <TableCell className="max-w-[200px]">
                      {prompt.used_in && prompt.used_in.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {prompt.used_in.slice(0, 2).map((location, idx) => (
                            <Badge
                              key={idx}
                              variant="outline"
                              className="text-xs truncate max-w-[150px]"
                              title={location}
                            >
                              <Code className="h-3 w-3 mr-1" />
                              {location.split('::')[0]}
                            </Badge>
                          ))}
                          {prompt.used_in.length > 2 && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              +{prompt.used_in.length - 2} more
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not specified</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(prompt.updated_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          onClick={() => handleEditPrompt(prompt)}
                          variant="ghost"
                          size="sm"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={() => handleViewHistory(prompt)}
                          variant="ghost"
                          size="sm"
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
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Edit Prompt: {editingPrompt?.stage} - {editingPrompt?.category}
            </DialogTitle>
            <DialogDescription>
              Customize the AI prompt template for this extraction stage
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="template" className="w-full">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
              <TabsTrigger value="template" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Prompt Template
              </TabsTrigger>
              <TabsTrigger value="system" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                System Prompt
              </TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-4">
              <div>
                <Label>Prompt Template</Label>
                <Textarea
                  value={editedTemplate}
                  onChange={(e) => setEditedTemplate(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Enter prompt template..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Use placeholders like {'{product_name}'}, {'{page_content}'}, etc.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="system" className="space-y-4">
              <div>
                <Label>System Prompt (Optional)</Label>
                <Textarea
                  value={editedSystemPrompt}
                  onChange={(e) => setEditedSystemPrompt(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="Enter system prompt..."
                />
                <p className="text-xs text-muted-foreground mt-2">
                  System-level instructions for the AI model
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button
              onClick={() => setShowEditDialog(false)}
              variant="ghost"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSavePrompt}
              disabled={saving}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Version History: {editingPrompt?.stage} - {editingPrompt?.category}
            </DialogTitle>
            <DialogDescription>
              View all previous versions of this prompt
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[500px] overflow-y-auto">
            {promptHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No history available</div>
            ) : (
              <div className="space-y-4">
                {promptHistory.map((history) => (
                  <Card key={history.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">
                          Version {history.version}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {new Date(history.created_at).toLocaleString()}
                        </span>
                      </div>
                      {history.change_reason && (
                        <CardDescription className="text-xs">
                          {history.change_reason}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="bg-muted p-3 rounded text-xs font-mono max-h-[200px] overflow-y-auto">
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
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

