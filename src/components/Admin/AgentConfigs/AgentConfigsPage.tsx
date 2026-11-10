import React, { useState, useEffect, useCallback } from 'react';
import { formatDate as formatDateValue } from '@/utils/datetime';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Save, X, History, FileText, Trash2, AlertTriangle, DollarSign, ListChecks, Boxes, RefreshCw, MessageSquare } from 'lucide-react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
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
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { humanizeLabel } from '@/utils/humanize';
import { formatNumber } from '@/utils/decimal';
import { AIModelPricingTab } from './AIModelPricingTab';
import { ChatStartersTab } from './ChatStartersTab';
import { WritingRulesTab } from './WritingRulesTab';
import { BackgroundAgentsPage } from '@/components/Admin/BackgroundAgents/BackgroundAgentsPage';

const TAB_VALUES = ['prompts', 'starters', 'writing-rules', 'pricing', 'background-agents'] as const;

const MOVED_TABS: Record<string, string> = {
  'ai-data': '/admin/materials-data?tab=ai-review',
  'api-gateway': '/admin/modules?tab=api-keys',
};

/** Mirrors `update_prompt_with_history`: these types are written to `system_prompt`, every other to `prompt_text`. */
const SYSTEM_PROMPT_TYPES = new Set(['agent', 'system']);

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
  industry: string | null;
  configuration: Record<string, unknown> | null;
  used_in: string[] | null;
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
  old_system_prompt: string | null;
  new_system_prompt: string | null;
  change_reason: string | null;
  changed_by: string | null;
  changed_at: string;
}

const writesSystemPrompt = (p: Prompt) => SYSTEM_PROMPT_TYPES.has(p.prompt_type);

const editableText = (p: Prompt) =>
  writesSystemPrompt(p) ? (p.system_prompt || p.prompt_text) : (p.prompt_text || p.system_prompt || '');

/** A non-agent row that also carries a system prompt the RPC does not write. */
const secondarySystemPrompt = (p: Prompt) =>
  !writesSystemPrompt(p) && p.prompt_text?.trim() && p.system_prompt?.trim() ? p.system_prompt : null;

const isUnreadableAtRuntime = (p: Prompt) => writesSystemPrompt(p) && !p.system_prompt?.trim();

const PROMPT_FIELDS: HubTableField<Prompt>[] = [
  {
    id: 'name',
    sortValue: (p) => p.name,
    searchText: (p) => `${p.name} ${p.description ?? ''} ${p.category} ${(p.used_in ?? []).join(' ')}`,
  },
  { id: 'type', sortValue: (p) => p.prompt_type, filterValue: (p) => p.prompt_type, filterLabel: 'Type', filterOptionLabel: humanizeLabel },
  { id: 'stage', sortValue: (p) => p.stage, filterValue: (p) => p.stage, filterLabel: 'Stage', filterOptionLabel: humanizeLabel },
  { id: 'category', sortValue: (p) => p.category, filterValue: (p) => p.category, filterLabel: 'Category', filterOptionLabel: humanizeLabel },
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

type RpcCall = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

export const AgentConfigsPage: React.FC = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [editedText, setEditedText] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState<Prompt | null>(null);
  const [historyData, setHistoryData] = useState<PromptHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingPrompt, setDeletingPrompt] = useState<Prompt | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const promptTable = useHubTable(prompts, PROMPT_FIELDS, { columnId: 'type', direction: 'asc' });

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab') || '';
  const activeTab = (TAB_VALUES as readonly string[]).includes(requestedTab) ? requestedTab : 'prompts';

  useEffect(() => {
    if (!requestedTab || (TAB_VALUES as readonly string[]).includes(requestedTab)) return;
    const moved = MOVED_TABS[requestedTab];
    if (moved) {
      navigate(moved, { replace: true });
      return;
    }
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    setSearchParams(params, { replace: true });
  }, [requestedTab, navigate, searchParams, setSearchParams]);

  const handleTabChange = (val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val === 'prompts') params.delete('tab');
    else params.set('tab', val);
    setSearchParams(params, { replace: true });
  };

  const loadPrompts = useCallback(async () => {
    try {
      setLoading(true);
      // chat_starter rows have their own structured editor in the Chat Starters tab.
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('is_active', true)
        .neq('prompt_type', 'chat_starter');
      if (error) throw error;
      setPrompts((data || []) as unknown as Prompt[]);
    } catch (error) {
      console.error('Error loading prompts:', error);
      toast({ title: 'Error', description: 'Failed to load prompts', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadPrompts();
  }, [loadPrompts]);

  const handleEdit = (prompt: Prompt) => {
    setEditingPrompt(prompt);
    setEditedText(editableText(prompt));
    setEditedDescription(prompt.description || '');
    setChangeReason('');
  };

  const handleViewHistory = async (prompt: Prompt) => {
    try {
      setLoadingHistory(true);
      setHistoryFor(prompt);
      const { data, error } = await supabase
        .from('prompt_history')
        .select('*')
        .eq('prompt_id', prompt.id)
        .order('changed_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      setHistoryData((data || []) as unknown as PromptHistory[]);
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
      const { error: rpcErr } = await (supabase.rpc as unknown as RpcCall)('update_prompt_with_history', {
        p_prompt_id: editingPrompt.id,
        p_new_text: editedText,
        p_new_description: editedDescription,
        p_change_reason: changeReason,
      });
      if (rpcErr) throw rpcErr;

      toast({ title: 'Success', description: `${editingPrompt.name} updated successfully` });
      setEditingPrompt(null);
      void loadPrompts();
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
      const reason = window.prompt(
        hardDelete
          ? 'Why is this prompt being permanently deleted? (recorded in prompt_history)'
          : 'Why is this prompt being deactivated? (recorded in prompt_history)',
      );
      if (reason === null) return;
      if (!reason.trim()) {
        toast({ title: 'A reason is required', description: 'Removing a prompt is recorded, so it needs one.', variant: 'destructive' });
        return;
      }

      const { error } = await (supabase.rpc as unknown as RpcCall)('delete_prompt_with_audit', {
        p_prompt_id: deletingPrompt.id,
        p_hard: hardDelete,
        p_change_reason: reason,
      });
      if (error) throw error;
      toast({
        title: 'Success',
        description: hardDelete
          ? `${deletingPrompt.name} permanently deleted`
          : `${deletingPrompt.name} deactivated`,
      });

      setDeletingPrompt(null);
      void loadPrompts();
    } catch (error) {
      console.error('Error deleting prompt:', error);
      toast({ title: 'Error', description: 'Failed to delete prompt', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateString: string) => formatDateValue(dateString, { withTime: true });
  const editingSecondary = editingPrompt ? secondarySystemPrompt(editingPrompt) : null;
  const editingConfig = editingPrompt?.configuration && Object.keys(editingPrompt.configuration).length > 0
    ? editingPrompt.configuration
    : null;

  return (
    <TooltipProvider>
      <div className="min-h-screen p-6 bg-background">
        <GlobalAdminHeader
          title="AI Configurations"
          description="Manage AI prompts, chat starters, writing rules, model pricing and background agents. Prompt changes are tracked and versioned."
        />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-6">
            <TabsTrigger value="prompts" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="starters" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Chat Starters
            </TabsTrigger>
            <TabsTrigger value="writing-rules" className="flex items-center gap-2">
              <ListChecks className="h-4 w-4" />
              Writing Rules
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Model Pricing
            </TabsTrigger>
            <TabsTrigger value="background-agents" className="flex items-center gap-2">
              <Boxes className="h-4 w-4" />
              Background Agents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="prompts">
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Prompts</CardTitle>
                  <CardDescription>
                    Every active prompt the agents, the PDF pipeline and the templates load at runtime — {formatNumber(prompts.length)} in total.
                  </CardDescription>
                </div>
                <Button onClick={() => void loadPrompts()} variant="outline" size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-12 text-center text-muted-foreground">Loading prompts...</div>
                ) : prompts.length === 0 ? (
                  <HubEmptyState
                    icon={FileText}
                    title="No active prompts"
                    description="Prompts are seeded by migration; once a row in prompts is active it appears here to edit."
                    action={<Button variant="outline" size="sm" onClick={() => void loadPrompts()}>Refresh</Button>}
                  />
                ) : (
                  <>
                    <HubToolbar
                      search={promptTable.search}
                      onSearchChange={promptTable.setSearch}
                      searchPlaceholder="Search prompts"
                      filters={
                        <>
                          {(['type', 'stage', 'category'] as const).map((id) => (
                            <HubFilterSelect
                              key={id}
                              label={humanizeLabel(id)}
                              value={promptTable.filters[id] ?? HUB_FILTER_ALL}
                              options={promptTable.filterOptions[id]}
                              onChange={(v) => promptTable.setFilter(id, v)}
                            />
                          ))}
                          <HubResetFilters count={promptTable.activeFilterCount} onReset={promptTable.reset} />
                        </>
                      }
                    />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortHead id="name" sort={promptTable.sort} onSort={promptTable.toggleSort}>Name</SortHead>
                          <SortHead id="type" sort={promptTable.sort} onSort={promptTable.toggleSort}>Type</SortHead>
                          <SortHead id="stage" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden sm:table-cell">Stage</SortHead>
                          <SortHead id="category" sort={promptTable.sort} onSort={promptTable.toggleSort} className="hidden md:table-cell">Category</SortHead>
                          <SortHead id="version" sort={promptTable.sort} onSort={promptTable.toggleSort} align="right" className="hidden md:table-cell">Version</SortHead>
                          <TableHead className="hidden xl:table-cell text-right">Used In</TableHead>
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
                                onClick={() => handleEdit(prompt)}
                                className="block max-w-[20rem] truncate text-left font-semibold text-primary hover:underline"
                                title={prompt.description || prompt.name}
                              >
                                {prompt.name}
                              </button>
                              {isUnreadableAtRuntime(prompt) && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="error" className="mt-1 text-xs">Not Live</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs">
                                    This prompt has no <code>system_prompt</code>, which is the only column its loader
                                    reads. Save an edit here to write it to the right column.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-sm">{humanizeLabel(prompt.prompt_type)}</TableCell>
                            <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                              {prompt.stage ? humanizeLabel(prompt.stage) : '—'}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                              {humanizeLabel(prompt.category)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-right tabular-nums text-muted-foreground">v{prompt.version}</TableCell>
                            <TableCell className="hidden xl:table-cell text-right tabular-nums text-muted-foreground">
                              {prompt.used_in?.length ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{formatNumber(prompt.used_in.length)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-sm">
                                    <ul className="space-y-0.5 font-mono text-xs">
                                      {prompt.used_in.map((loc) => <li key={loc}>{loc}</li>)}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell whitespace-nowrap text-sm text-muted-foreground">
                              {formatDate(prompt.updated_at)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button onClick={() => void handleViewHistory(prompt)} variant="ghost" size="sm" aria-label="History">
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button onClick={() => setDeletingPrompt(prompt)} variant="ghost" size="sm" aria-label="Delete">
                                  <Trash2 className="h-4 w-4" />
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

            <Dialog open={!!editingPrompt} onOpenChange={(open) => { if (!open) setEditingPrompt(null); }}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingPrompt?.name}</DialogTitle>
                  <DialogDescription>
                    {editingPrompt && [
                      humanizeLabel(editingPrompt.prompt_type),
                      humanizeLabel(editingPrompt.category),
                      editingPrompt.stage ? humanizeLabel(editingPrompt.stage) : null,
                      editingPrompt.industry ? humanizeLabel(editingPrompt.industry) : null,
                      `Version ${editingPrompt.version}`,
                    ].filter(Boolean).join(' · ')}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div>
                    <Label htmlFor="description">Description</Label>
                    <Input
                      id="description"
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      placeholder="Brief description of what this prompt does..."
                      className="mt-2"
                    />
                  </div>

                  <div>
                    <Label htmlFor="prompt">
                      {editingPrompt && writesSystemPrompt(editingPrompt) ? 'System Prompt' : 'Prompt Text'}
                    </Label>
                    <Textarea
                      id="prompt"
                      value={editedText}
                      onChange={(e) => setEditedText(e.target.value)}
                      className="min-h-[360px] font-mono text-sm mt-2"
                      placeholder="Enter prompt text..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">{formatNumber(editedText.length)} characters</p>
                  </div>

                  {editingSecondary && (
                    <div>
                      <Label>System Prompt</Label>
                      <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-sm border border-hairline bg-surface-sunken p-3 font-mono text-xs">
                        {editingSecondary}
                      </pre>
                      <p className="text-xs text-muted-foreground mt-1">
                        Read-only here: saving writes the Prompt Text only and keeps this system prompt as it is.
                      </p>
                    </div>
                  )}

                  {editingConfig && (
                    <div>
                      <Label>Configuration</Label>
                      <pre className="mt-2 max-h-40 overflow-y-auto rounded-sm border border-hairline bg-surface-sunken p-3 font-mono text-xs">
                        {JSON.stringify(editingConfig, null, 2)}
                      </pre>
                      <p className="text-xs text-muted-foreground mt-1">Read-only here.</p>
                    </div>
                  )}

                  {editingPrompt?.used_in?.length ? (
                    <div>
                      <Label>Used In</Label>
                      <ul className="mt-2 space-y-0.5 font-mono text-xs text-muted-foreground">
                        {editingPrompt.used_in.map((loc) => <li key={loc}>{loc}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor="reason">Change Reason</Label>
                    <Input
                      id="reason"
                      value={changeReason}
                      onChange={(e) => setChangeReason(e.target.value)}
                      placeholder="e.g., Improved extraction accuracy for product dimensions"
                      className="mt-2"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Required — recorded in the prompt's change history.</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingPrompt(null)}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button onClick={() => void handleSave()} disabled={saving || !changeReason.trim()}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save changes'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!historyFor} onOpenChange={(open) => { if (!open) setHistoryFor(null); }}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Change History</DialogTitle>
                  <DialogDescription>Last 5 changes to {historyFor?.name}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  {loadingHistory ? (
                    <div className="py-8 text-center text-muted-foreground">Loading history...</div>
                  ) : historyData.length === 0 ? (
                    <HubEmptyState
                      icon={History}
                      title="No changes recorded"
                      description="This prompt has not been edited since it was seeded."
                      action={historyFor ? (
                        <Button size="sm" variant="outline" onClick={() => { const p = historyFor; setHistoryFor(null); handleEdit(p); }}>
                          Edit prompt
                        </Button>
                      ) : undefined}
                    />
                  ) : (
                    historyData.map((entry, index) => {
                      const systemChanged = (entry.old_system_prompt ?? '') !== (entry.new_system_prompt ?? '');
                      const before = systemChanged ? entry.old_system_prompt : entry.old_prompt_text;
                      const after = systemChanged ? entry.new_system_prompt : entry.new_prompt_text;
                      return (
                        <Card key={entry.id}>
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="flex items-center gap-2">
                                <Badge variant="neutral">#{historyData.length - index}</Badge>
                                {entry.change_reason || 'No reason provided'}
                              </CardTitle>
                              <span className="text-sm text-muted-foreground">{formatDate(entry.changed_at)}</span>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-xs text-muted-foreground">Previous</Label>
                                <div className="mt-1 p-2 rounded-sm border border-hairline bg-surface-sunken text-xs font-mono line-clamp-4">
                                  {before || '—'}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Updated</Label>
                                <div className="mt-1 p-2 rounded-sm border border-hairline bg-surface-sunken text-xs font-mono line-clamp-4">
                                  {after || '—'}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={!!deletingPrompt} onOpenChange={(open) => { if (!open) setDeletingPrompt(null); }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div>
                      <DialogTitle>Delete Prompt</DialogTitle>
                      <DialogDescription>
                        Are you sure you want to delete "{deletingPrompt?.name}"?
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>

                <div className="py-2 space-y-3 text-sm text-muted-foreground">
                  <p><strong>Deactivate:</strong> hides the prompt but keeps it in the database, so it can be restored later.</p>
                  <p><strong>Delete permanently:</strong> removes the prompt from the database. This cannot be undone.</p>
                </div>

                <DialogFooter className="flex gap-2">
                  <Button variant="outline" onClick={() => setDeletingPrompt(null)} disabled={deleting}>
                    Cancel
                  </Button>
                  <Button variant="secondary" onClick={() => void handleDelete(false)} disabled={deleting}>
                    {deleting ? 'Processing...' : 'Deactivate'}
                  </Button>
                  <Button variant="destructive" onClick={() => void handleDelete(true)} disabled={deleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {deleting ? 'Deleting...' : 'Delete permanently'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="starters">
            <ChatStartersTab />
          </TabsContent>

          <TabsContent value="writing-rules">
            <WritingRulesTab />
          </TabsContent>

          <TabsContent value="pricing">
            <AIModelPricingTab />
          </TabsContent>

          <TabsContent value="background-agents">
            <BackgroundAgentsPage />
          </TabsContent>
        </Tabs>
      </div>
    </TooltipProvider>
  );
};
