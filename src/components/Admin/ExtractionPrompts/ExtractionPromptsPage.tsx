import React, { useState, useEffect } from 'react';
import {
  Edit,
  History,
  RefreshCw,
  Save,
  X,
  Code,
} from 'lucide-react';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { supabase } from '@/integrations/supabase/client';

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
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { formatDate } from '@/utils/datetime';
import { cn } from '@/lib/utils';
import {
  HubEmptyState,
  HubFilterSelect,
  HubResetFilters,
  HubSortButton,
  HubToolbar,
  HUB_FILTER_ALL,
  useHubTable,
  type HubSort,
  type HubTableField,
} from '@/components/core/hub';

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

const promptLabel = (p: ExtractionPrompt) => p.name || `${p.stage} - ${p.category}`;

const PROMPT_FIELDS: HubTableField<ExtractionPrompt>[] = [
  { id: 'name', sortValue: promptLabel, searchText: (p) => `${promptLabel(p)} ${(p.used_in ?? []).join(' ')}` },
  {
    id: 'type',
    sortValue: (p) => p.prompt_type || 'extraction',
    filterValue: (p) => p.prompt_type || 'extraction',
    filterLabel: 'Type',
    filterOptionLabel: (v) => v.charAt(0).toUpperCase() + v.slice(1),
  },
  { id: 'stage', sortValue: (p) => p.stage },
  { id: 'category', sortValue: (p) => p.category },
  { id: 'version', sortValue: (p) => p.version },
  { id: 'updated', sortValue: (p) => p.updated_at },
];

const SortHead: React.FC<{
  id: string;
  sort?: HubSort;
  onSort: (id: string) => void;
  align?: 'left' | 'right';
  className?: string;
  children: React.ReactNode;
}> = ({ id, sort, onSort, align, className, children }) => {
  const active = sort?.columnId === id ? sort.direction : undefined;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton active={active} align={align} onClick={() => onSort(id)}>
        {children}
      </HubSortButton>
    </TableHead>
  );
};

export const ExtractionPromptsPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
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
  const promptTable = useHubTable(prompts, PROMPT_FIELDS);

  // Default workspace ID (should come from auth context)
  const workspaceId = 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e';

  useEffect(() => {
    loadPrompts();
  }, [selectedStage, selectedCategory]);

  const loadPrompts = async () => {
    setLoading(true);
    const params = new URLSearchParams({ workspace_id: workspaceId });
    if (selectedStage !== 'all') params.append('stage', selectedStage);
    if (selectedCategory !== 'all') params.append('category', selectedCategory);

    // Hits the MIVAA backend (v1api.materialshub.gr), which can fail on the first
    // request after an idle period (cold worker) or before the Supabase session
    // token is warm. Retry once silently before surfacing a destructive toast so a
    // transient first-hit failure doesn't flash a red error on page load.
    const attempt = async () => {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) throw new Error('No auth session');
      const response = await fetch(
        `https://v1api.materialshub.gr/admin/extraction-prompts?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error(`Failed to load prompts (${response.status})`);
      return response.json();
    };

    try {
      let data;
      try {
        data = await attempt();
      } catch (firstError) {
        console.warn('Extraction prompts: first load failed, retrying once…', firstError);
        await new Promise((r) => setTimeout(r, 800));
        data = await attempt();
      }
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
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
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
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
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
      discovery: 'text-blue-600 dark:text-blue-400',
      entity_creation: 'text-green-600 dark:text-green-400',
      image_analysis: 'text-purple-600 dark:text-purple-400',
      chunking: 'text-pink-600 dark:text-pink-400',
      scraping: 'text-cyan-600 dark:text-cyan-400',
    };

    return (
      <span className={`text-xs capitalize ${colors[stage] || 'text-muted-foreground'}`}>
        {stage.replace('_', ' ')}
      </span>
    );
  };

  const getCategoryBadge = (category: string) => {
    const colors: Record<string, string> = {
      products: 'text-orange-600 dark:text-orange-400',
      material_properties: 'text-teal-600 dark:text-teal-400',
      certificates: 'text-yellow-600 dark:text-yellow-400',
      logos: 'text-indigo-600 dark:text-indigo-400',
      materials: 'text-emerald-600 dark:text-emerald-400',
    };

    return (
      <span className={`text-xs capitalize ${colors[category] || 'text-muted-foreground'}`}>
        {category.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className={embedded ? '' : 'min-h-screen'}>
      {!embedded && (
        <GlobalAdminHeader
          title="Extraction Prompts Management"
          description="Manage AI prompts for PDF extraction pipeline"
          badge="AI Prompts"
        />
      )}

      <div className={embedded ? 'space-y-6' : 'p-3 sm:p-6 space-y-6'}>
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
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading prompts...</div>
          ) : prompts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No prompts found</div>
          ) : (
            <>
            <HubToolbar
              search={promptTable.search}
              onSearchChange={promptTable.setSearch}
              searchPlaceholder="Search prompts"
              filters={
                <>
                  <HubFilterSelect
                    label="Type"
                    value={promptTable.filters.type ?? HUB_FILTER_ALL}
                    options={promptTable.filterOptions.type}
                    onChange={(v) => promptTable.setFilter('type', v)}
                  />
                  <HubResetFilters count={promptTable.activeFilterCount} onReset={promptTable.reset} />
                </>
              }
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead id="name" sort={promptTable.sort} onSort={promptTable.toggleSort}>Name</SortHead>
                  <SortHead id="type" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden md:table-cell">Type</SortHead>
                  <SortHead id="stage" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden sm:table-cell">Stage</SortHead>
                  <SortHead id="category" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden sm:table-cell">Category</SortHead>
                  <SortHead id="version" sort={promptTable.sort} onSort={promptTable.toggleSort} align="right" className="hidden md:table-cell">Version</SortHead>
                  <TableHead className="hidden xl:table-cell">Used In</TableHead>
                  <SortHead id="updated" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden lg:table-cell">Updated</SortHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promptTable.rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="p-0">
                      <HubEmptyState
                        variant="filtered"
                        title="No prompts match these filters"
                        action={<Button variant="outline" size="sm" onClick={promptTable.reset}>Clear filters</Button>}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {promptTable.rows.map((prompt) => (
                  <TableRow key={prompt.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => handleEditPrompt(prompt)}
                        className="block max-w-[18rem] truncate text-left font-semibold text-primary hover:underline"
                        title={promptLabel(prompt)}
                      >
                        {promptLabel(prompt)}
                      </button>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className={`text-xs capitalize ${
                        prompt.prompt_type === 'agent' ? 'text-blue-600 dark:text-blue-400' :
                        prompt.prompt_type === 'extraction' ? 'text-green-600 dark:text-green-400' :
                        prompt.prompt_type === 'template' ? 'text-purple-600 dark:text-purple-400' :
                        prompt.prompt_type === 'search' ? 'text-orange-600 dark:text-orange-400' :
                        'text-muted-foreground'
                      }`}>
                        {prompt.prompt_type || 'extraction'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{getStageBadge(prompt.stage)}</TableCell>
                    <TableCell className="hidden sm:table-cell">{getCategoryBadge(prompt.category)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">v{prompt.version}</TableCell>
                    <TableCell className="hidden max-w-[200px] xl:table-cell">
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
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground text-sm lg:table-cell">
                      {formatDate(prompt.updated_at)}
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
            </>
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
              <TabsTrigger value="template">
                Prompt Template
              </TabsTrigger>
              <TabsTrigger value="system">
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
                        <CardTitle>
                          Version {history.version}
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(history.created_at, { withTime: true })}
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

