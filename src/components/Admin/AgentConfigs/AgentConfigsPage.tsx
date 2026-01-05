import React, { useState, useEffect } from 'react';
import { Bot, Edit, Save, X, History, Clock, Sparkles } from 'lucide-react';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export const AgentConfigsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editedText, setEditedText] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<PromptHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');
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
        .order('category', { ascending: true });

      if (error) throw error;

      console.log('[AI Configs] Loaded prompts:', data?.length || 0);
      console.log('[AI Configs] Prompt types:', [...new Set(data?.map(p => p.prompt_type))]);
      console.log('[AI Configs] Extraction prompts:', data?.filter(p => p.prompt_type === 'extraction').map(p => p.name));

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
    // For extraction/template/search prompts, use prompt_text (the detailed instructions)
    // For agent prompts, use system_prompt (the conversational system message)
    const textToEdit = prompt.prompt_type === 'agent'
      ? (prompt.system_prompt || prompt.prompt_text)
      : (prompt.prompt_text || prompt.system_prompt);
    setEditedText(textToEdit);
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

      // Determine which field to update based on prompt type
      const isAgentPrompt = editingPrompt.prompt_type === 'agent';

      // Save to history
      await supabase.from('prompt_history').insert({
        prompt_id: editingPrompt.id,
        old_prompt_text: editingPrompt.prompt_text,
        new_prompt_text: isAgentPrompt ? editingPrompt.prompt_text : editedText,
        old_system_prompt: editingPrompt.system_prompt,
        new_system_prompt: isAgentPrompt ? editedText : editingPrompt.system_prompt,
        old_configuration: editingPrompt.configuration,
        new_configuration: editingPrompt.configuration,
        change_reason: changeReason,
        changed_by: user.id,
      });

      // Update the appropriate field based on prompt type
      const updateData = isAgentPrompt
        ? { system_prompt: editedText }  // Agent prompts use system_prompt
        : { prompt_text: editedText };   // Extraction/template/search prompts use prompt_text

      await supabase.from('prompts').update(updateData).eq('id', editingPrompt.id);

      toast({ title: 'Success', description: `${editingPrompt.name} updated successfully` });
      setEditingPrompt(null);
      setEditedText('');
      setChangeReason('');
      loadPrompts();
    } catch (error) {
      console.error('Error saving prompt:', error);
      toast({ title: 'Error', description: 'Failed to save prompt', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getPromptIcon = (promptType: string, category: string) => {
    // Prompt type icons
    if (promptType === 'agent') {
      const agentIcons: Record<string, string> = {
        'pdf-processor': '📄', 'search': '🔍', 'product': '📦', 'interior-designer': '🎨',
      };
      return agentIcons[category] || '🤖';
    }
    if (promptType === 'extraction') return '🔬';
    if (promptType === 'template') return '📋';
    if (promptType === 'search') return '🔎';
    return '✨';
  };

  const getPromptTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'agent': 'Agent',
      'extraction': 'Extraction',
      'template': 'Template',
      'search': 'Search',
    };
    return labels[type] || type;
  };

  const filteredPrompts = selectedType === 'all'
    ? prompts
    : prompts.filter(p => p.prompt_type === selectedType);

  const promptTypes = ['all', ...Array.from(new Set(prompts.map(p => p.prompt_type)))];

  return (
    <div className="min-h-screen p-6">
      <GlobalAdminHeader title="AI Configurations" description="Manage all AI prompts and configurations across the platform" />

      {/* Filter Tabs */}
      <div className="mt-6 flex gap-2 border-b border-gray-200">
        {promptTypes.map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-4 py-2 font-medium transition-colors ${
              selectedType === type
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {type === 'all' ? 'All Prompts' : `${getPromptTypeLabel(type)} (${prompts.filter(p => p.prompt_type === type).length})`}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading prompts...</p>
          </div>
        ) : filteredPrompts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No prompts found</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredPrompts.map((prompt) => (
              <Card key={prompt.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-4xl">{getPromptIcon(prompt.prompt_type, prompt.category)}</div>
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {prompt.name}
                          <Badge variant="outline" className="ml-2">{getPromptTypeLabel(prompt.prompt_type)}</Badge>
                          <Badge variant="outline" className="ml-2">v{prompt.version}</Badge>
                          {prompt.status === 'active' && <Badge className="bg-green-100 text-green-800">Active</Badge>}
                        </CardTitle>
                        <CardDescription>
                          {prompt.description || `${prompt.category} - ${prompt.subcategory || 'General'}`}
                          {prompt.stage && <span className="ml-2 text-xs">• Stage: {prompt.stage}</span>}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={() => handleViewHistory(prompt)} variant="outline" size="sm">
                        <History className="h-4 w-4 mr-2" />History
                      </Button>
                      <Button onClick={() => handleEdit(prompt)} variant="default" size="sm">
                        <Edit className="h-4 w-4 mr-2" />Edit Prompt
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium text-muted-foreground">Prompt Preview</Label>
                      <div className="mt-2 p-4 bg-muted rounded-lg">
                        <p className="text-sm font-mono line-clamp-3">
                          {prompt.prompt_type === 'agent'
                            ? (prompt.system_prompt || prompt.prompt_text)
                            : (prompt.prompt_text || prompt.system_prompt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />Updated {formatDate(prompt.updated_at)}
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />{prompt.configuration?.model || 'Default Model'}
                      </div>
                      <div>{(prompt.system_prompt || prompt.prompt_text).length.toLocaleString()} characters</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Dialog open={!!editingPrompt} onOpenChange={() => setEditingPrompt(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editingPrompt?.name}</DialogTitle>
            <DialogDescription>Update the system prompt for this agent. Changes will be tracked in history.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="prompt">System Prompt</Label>
              <Textarea id="prompt" value={editedText} onChange={(e) => setEditedText(e.target.value)}
                className="min-h-[400px] font-mono text-sm mt-2" placeholder="Enter system prompt..." />
              <p className="text-sm text-muted-foreground mt-2">{editedText.length.toLocaleString()} characters</p>
            </div>
            <div>
              <Label htmlFor="reason">Change Reason *</Label>
              <Input id="reason" value={changeReason} onChange={(e) => setChangeReason(e.target.value)}
                placeholder="e.g., Improved product detection accuracy" className="mt-2" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPrompt(null)}><X className="h-4 w-4 mr-2" />Cancel</Button>
            <Button onClick={handleSave} disabled={saving}><Save className="h-4 w-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prompt History</DialogTitle>
            <DialogDescription>Last 5 changes to this prompt</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {loadingHistory ? (
              <div className="text-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>
            ) : historyData.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No history available</p>
            ) : (
              historyData.map((entry, index) => (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Change #{historyData.length - index}</CardTitle>
                      <span className="text-sm text-muted-foreground">{formatDate(entry.changed_at)}</span>
                    </div>
                    {entry.change_reason && <CardDescription>{entry.change_reason}</CardDescription>}
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Old Prompt</Label>
                        <div className="mt-1 p-2 bg-red-50 rounded text-xs font-mono line-clamp-2">{entry.old_prompt_text}</div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">New Prompt</Label>
                        <div className="mt-1 p-2 bg-green-50 rounded text-xs font-mono line-clamp-2">{entry.new_prompt_text}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

