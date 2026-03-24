import React, { useState, useEffect } from 'react';
import { Bot, Edit, Save, X, History, Clock, Sparkles, FileText, Search as SearchIcon, Cpu, Layers, Wrench, ChevronRight, Info, Trash2, AlertTriangle, DollarSign } from 'lucide-react';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/core/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AIModelPricingTab } from './AIModelPricingTab';

interface Prompt {
  id: string;
  prompt_type: string;
  category: string;
  subcategory: string | null;
  name: string;
  description: string | null;
  prompt_text: string;
  system_prompt: string | null;
  stage: string | null;
  configuration: any;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PromptHistory {
  id: string;
  prompt_id: string;
  old_prompt_text: string;
  new_prompt_text: string;
  change_reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

// Type-specific icons
const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  agent: Bot,
  extraction: FileText,
  template: Layers,
  search: SearchIcon,
  classification: Cpu,
  tool: Wrench,
  generation: Layers,
};

// Type-specific colors
const TYPE_COLORS: Record<string, string> = {
  agent: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  extraction: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  template: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  search: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  generation: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  classification: 'bg-rose-500/10 text-rose-600 border-rose-500/20',
  tool: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

// Stage badge colors
const STAGE_COLORS: Record<string, string> = {
  discovery: 'bg-cyan-100 text-cyan-700',
  chunking: 'bg-purple-100 text-purple-700',
  entity_creation: 'bg-green-100 text-green-700',
  image_analysis: 'bg-orange-100 text-orange-700',
  scraping: 'bg-pink-100 text-pink-700',
};

export const AgentConfigsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editedText, setEditedText] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<PromptHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [deletingPrompt, setDeletingPrompt] = useState<Prompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('is_active', true)
        .order('prompt_type', { ascending: true })
        .order('stage', { ascending: true })
        .order('category', { ascending: true });

      if (error) throw error;

      console.log('[AI Configs] Loaded prompts:', data?.length || 0);
      setPrompts(data || []);
    } catch (error) {
      console.error('Error loading prompts:', error);
      toast({ title: 'Error', description: 'Failed to load prompts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    const textToEdit = (prompt.prompt_type === 'agent' || prompt.prompt_type === 'tool')
      ? (prompt.system_prompt || prompt.prompt_text)
      : (prompt.prompt_text || prompt.system_prompt);
    setEditedText(textToEdit);
    setEditedDescription(prompt.description || '');
    setChangeReason('');
  };

  const handleViewHistory = async (prompt: Prompt) => {
    try {
      setLoadingHistory(true);
      setShowHistory(true);
      const { data, error } = await supabase
        .from('prompt_history')
        .select('*')
        .eq('prompt_id', prompt.id)
        .order('changed_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setHistoryData(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryData([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSave = async () => {
    if (!editingPrompt) return;
    if (!changeReason.trim()) {
      toast({ title: 'Error', description: 'Please provide a reason for this change', variant: 'destructive' });
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const usesSystemPrompt = editingPrompt.prompt_type === 'agent' || editingPrompt.prompt_type === 'tool';

      // Save to history
      await supabase.from('prompt_history').insert({
        prompt_id: editingPrompt.id,
        old_prompt_text: editingPrompt.prompt_text,
        new_prompt_text: usesSystemPrompt ? editingPrompt.prompt_text : editedText,
        old_system_prompt: editingPrompt.system_prompt,
        new_system_prompt: usesSystemPrompt ? editedText : editingPrompt.system_prompt,
        old_configuration: editingPrompt.configuration,
        new_configuration: editingPrompt.configuration,
        change_reason: changeReason,
        changed_by: user.id,
      });

      // Update prompt
      const updateData = usesSystemPrompt
        ? { system_prompt: editedText, description: editedDescription }
        : { prompt_text: editedText, description: editedDescription };

      await supabase.from('prompts').update(updateData).eq('id', editingPrompt.id);

      toast({ title: 'Success', description: `${editingPrompt.name} updated successfully` });
      setEditingPrompt(null);
      setEditedText('');
      setEditedDescription('');
      setChangeReason('');
      loadPrompts();
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({ title: 'Error', description: 'Failed to save prompt', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (hardDelete: boolean = false) => {
    if (!deletingPrompt) return;

    try {
      setDeleting(true);

      if (hardDelete) {
        // Permanently delete from database
        const { error } = await supabase
          .from('prompts')
          .delete()
          .eq('id', deletingPrompt.id);

        if (error) throw error;
        toast({ title: 'Success', description: `${deletingPrompt.name} permanently deleted` });
      } else {
        // Soft delete - set is_active to false
        const { error } = await supabase
          .from('prompts')
          .update({ is_active: false })
          .eq('id', deletingPrompt.id);

        if (error) throw error;
        toast({ title: 'Success', description: `${deletingPrompt.name} deactivated` });
      }

      setDeletingPrompt(null);
      loadPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast({ title: 'Error', description: 'Failed to delete prompt', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getPromptTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      agent: 'Agent',
      extraction: 'Extraction',
      template: 'Template',
      search: 'Search',
      classification: 'Classification',
    };
    return labels[type] || type;
  };

  const getPromptLength = (prompt: Prompt) => {
    const text = (prompt.prompt_type === 'agent' || prompt.prompt_type === 'tool')
      ? (prompt.system_prompt || prompt.prompt_text)
      : (prompt.prompt_text || prompt.system_prompt);
    return text?.length || 0;
  };

  const filteredPrompts = selectedType === 'all'
    ? prompts
    : prompts.filter(p => p.prompt_type === selectedType);

  const promptTypes = ['all', ...Array.from(new Set(prompts.map(p => p.prompt_type)))];

  // Group prompts by type and stage for better organization
  const groupedPrompts = filteredPrompts.reduce((acc, prompt) => {
    const key = prompt.stage || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(prompt);
    return acc;
  }, {} as Record<string, Prompt[]>);

  const stageOrder = ['discovery', 'chunking', 'entity_creation', 'image_analysis', 'scraping', 'general'];
  const sortedStages = Object.keys(groupedPrompts).sort((a, b) => {
    const aIndex = stageOrder.indexOf(a);
    const bIndex = stageOrder.indexOf(b);
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });

  return (
    <TooltipProvider>
      <div className="min-h-screen p-6 bg-gradient-to-br from-background via-background to-muted/20">
        <GlobalAdminHeader
          title="AI Configurations"
          description="Manage all AI prompts, model pricing, and system configurations. Changes are tracked and versioned."
        />

        {/* Main Tabs */}
        <Tabs defaultValue="prompts" className="mt-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-6">
            <TabsTrigger value="prompts" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Bot className="h-4 w-4" />
              AI Prompts
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="h-4 w-4" />
              Model Pricing
            </TabsTrigger>
          </TabsList>

          {/* Prompts Tab Content */}
          <TabsContent value="prompts">
        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {promptTypes.filter(t => t !== 'all').map((type) => {
            const count = prompts.filter(p => p.prompt_type === type).length;
            const TypeIcon = TYPE_ICONS[type] || Sparkles;
            return (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  selectedType === type
                    ? 'ring-2 ring-primary shadow-lg scale-[1.02]'
                    : 'hover:shadow-md hover:scale-[1.01]'
                } ${TYPE_COLORS[type] || 'bg-muted'}`}
              >
                <div className="flex items-center gap-3">
                  <TypeIcon className="h-5 w-5" />
                  <div className="text-left">
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs opacity-80">{getPromptTypeLabel(type)}</div>
                  </div>
                </div>
              </button>
            );
          })}
          <button
            onClick={() => setSelectedType('all')}
            className={`p-4 rounded-xl border transition-all duration-200 ${
              selectedType === 'all'
                ? 'ring-2 ring-primary shadow-lg scale-[1.02] bg-primary/10'
                : 'hover:shadow-md hover:scale-[1.01] bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5" />
              <div className="text-left">
                <div className="text-2xl font-bold">{prompts.length}</div>
                <div className="text-xs opacity-80">All Prompts</div>
              </div>
            </div>
          </button>
        </div>

        {/* Main Content */}
        <div className="mt-8">
          {loading ? (
            <div className="text-center py-16">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading prompts...</p>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No prompts found</p>
            </div>
          ) : (
            <div className="space-y-8">
              {sortedStages.map((stage) => (
                <div key={stage} className="space-y-4">
                  {/* Stage Header */}
                  {selectedType !== 'agent' && stage !== 'general' && (
                    <div className="flex items-center gap-3">
                      <Badge className={`${STAGE_COLORS[stage] || 'bg-gray-100 text-gray-700'} px-3 py-1 text-sm font-medium`}>
                        {stage.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </Badge>
                      <div className="flex-1 h-px bg-border"></div>
                      <span className="text-sm text-muted-foreground">{groupedPrompts[stage].length} prompts</span>
                    </div>
                  )}

                  {/* Prompts Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {groupedPrompts[stage].map((prompt) => {
                      const TypeIcon = TYPE_ICONS[prompt.prompt_type] || Sparkles;
                      const isExpanded = expandedPrompt === prompt.id;

                      return (
                        <Card
                          key={prompt.id}
                          className={`group hover:shadow-lg transition-all duration-200 cursor-pointer border-l-4 ${
                            TYPE_COLORS[prompt.prompt_type]?.includes('violet') ? 'border-l-violet-500' :
                            TYPE_COLORS[prompt.prompt_type]?.includes('blue') ? 'border-l-blue-500' :
                            TYPE_COLORS[prompt.prompt_type]?.includes('amber') ? 'border-l-amber-500' :
                            TYPE_COLORS[prompt.prompt_type]?.includes('emerald') ? 'border-l-emerald-500' :
                            TYPE_COLORS[prompt.prompt_type]?.includes('rose') ? 'border-l-rose-500' :
                            'border-l-gray-500'
                          }`}
                          onClick={() => setExpandedPrompt(isExpanded ? null : prompt.id)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className={`p-2 rounded-lg ${TYPE_COLORS[prompt.prompt_type] || 'bg-muted'}`}>
                                  <TypeIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <CardTitle className="text-base font-semibold truncate">{prompt.name}</CardTitle>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">{prompt.category}</Badge>
                                    <Badge variant="outline" className="text-xs">v{prompt.version}</Badge>
                                  </div>
                                </div>
                              </div>
                              <ChevronRight className={`h-5 w-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                            </div>
                          </CardHeader>

                          <CardContent className="pt-0">
                            {/* Description */}
                            {prompt.description ? (
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                                {prompt.description}
                              </p>
                            ) : (
                              <p className="text-sm text-muted-foreground/50 italic mb-3">
                                No description available
                              </p>
                            )}

                            {/* Metadata Row */}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    <span>{getPromptLength(prompt).toLocaleString()} chars</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Prompt length</TooltipContent>
                              </Tooltip>

                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{new Date(prompt.updated_at).toLocaleDateString()}</span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>Last updated</TooltipContent>
                              </Tooltip>

                              {prompt.stage && (
                                <Badge className={`text-xs ${STAGE_COLORS[prompt.stage] || 'bg-gray-100 text-gray-700'}`}>
                                  {prompt.stage.replace('_', ' ')}
                                </Badge>
                              )}
                            </div>

                            {/* Expanded Actions */}
                            {isExpanded && (
                              <div className="mt-4 pt-4 border-t flex gap-2" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  onClick={() => handleEdit(prompt)}
                                  variant="default"
                                  size="sm"
                                  className="flex-1"
                                >
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit Prompt
                                </Button>
                                <Button
                                  onClick={() => handleViewHistory(prompt)}
                                  variant="outline"
                                  size="sm"
                                >
                                  <History className="h-4 w-4 mr-2" />
                                  History
                                </Button>
                                <Button
                                  onClick={() => setDeletingPrompt(prompt)}
                                  variant="destructive"
                                  size="sm"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingPrompt} onOpenChange={() => setEditingPrompt(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                {editingPrompt && (
                  <div className={`p-2 rounded-lg ${TYPE_COLORS[editingPrompt.prompt_type] || 'bg-muted'}`}>
                    {(() => {
                      const TypeIcon = TYPE_ICONS[editingPrompt.prompt_type] || Sparkles;
                      return <TypeIcon className="h-5 w-5" />;
                    })()}
                  </div>
                )}
                <div>
                  <DialogTitle>{editingPrompt?.name}</DialogTitle>
                  <DialogDescription>
                    {(editingPrompt?.prompt_type === 'agent' || editingPrompt?.prompt_type === 'tool') ? 'System Prompt' : 'Extraction Prompt'} •
                    Category: {editingPrompt?.category} •
                    {editingPrompt?.stage && ` Stage: ${editingPrompt.stage} •`}
                    Version {editingPrompt?.version}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Description Field */}
              <div>
                <Label htmlFor="description" className="flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Description
                </Label>
                <Input
                  id="description"
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  placeholder="Brief description of what this prompt does..."
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Helps identify the purpose of this prompt in the admin panel
                </p>
              </div>

              {/* Prompt Text */}
              <div>
                <Label htmlFor="prompt" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  {(editingPrompt?.prompt_type === 'agent' || editingPrompt?.prompt_type === 'tool') ? 'System Prompt' : 'Prompt Text'}
                </Label>
                <Textarea
                  id="prompt"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="min-h-[400px] font-mono text-sm mt-2"
                  placeholder="Enter prompt text..."
                />
                <p className="text-sm text-muted-foreground mt-2">{editedText.length.toLocaleString()} characters</p>
              </div>

              {/* Change Reason */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
                <Label htmlFor="reason" className="text-amber-700 dark:text-amber-400 font-medium">
                  Change Reason (Required)
                </Label>
                <Input
                  id="reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g., Improved extraction accuracy for product dimensions"
                  className="mt-2"
                />
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                  This will be recorded in the change history for auditing
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingPrompt(null)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !changeReason.trim()}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={showHistory} onOpenChange={setShowHistory}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Change History</DialogTitle>
              <DialogDescription>Last 5 changes to this prompt</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {loadingHistory ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : historyData.length === 0 ? (
                <div className="text-center py-8">
                  <History className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No history available</p>
                </div>
              ) : (
                historyData.map((entry, index) => (
                  <Card key={entry.id} className="border-l-4 border-l-blue-500">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Badge variant="outline">#{historyData.length - index}</Badge>
                          {entry.change_reason || 'No reason provided'}
                        </CardTitle>
                        <span className="text-sm text-muted-foreground">{formatDate(entry.changed_at)}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">Previous</Label>
                          <div className="mt-1 p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs font-mono line-clamp-3 border border-red-200 dark:border-red-800">
                            {entry.old_prompt_text}
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Updated</Label>
                          <div className="mt-1 p-2 bg-green-50 dark:bg-green-900/20 rounded text-xs font-mono line-clamp-3 border border-green-200 dark:border-green-800">
                            {entry.new_prompt_text}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingPrompt} onOpenChange={() => setDeletingPrompt(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <DialogTitle>Delete Prompt</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete "{deletingPrompt?.name}"?
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>Type:</strong> {deletingPrompt?.prompt_type}<br />
                  <strong>Category:</strong> {deletingPrompt?.category}<br />
                  {deletingPrompt?.stage && <><strong>Stage:</strong> {deletingPrompt.stage}<br /></>}
                  <strong>Version:</strong> {deletingPrompt?.version}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                <p className="mb-2"><strong>Deactivate (Soft Delete):</strong> Hides the prompt but keeps it in the database. Can be restored later.</p>
                <p><strong>Permanently Delete:</strong> Removes the prompt from the database completely. This cannot be undone.</p>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setDeletingPrompt(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleDelete(false)}
                disabled={deleting}
              >
                {deleting ? 'Processing...' : 'Deactivate'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleDelete(true)}
                disabled={deleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {deleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
          </TabsContent>

          {/* Model Pricing Tab Content */}
          <TabsContent value="pricing">
            <AIModelPricingTab />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};
