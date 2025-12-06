import React, { useState, useEffect } from 'react';
import { Bot, Edit, Save, X, RefreshCw, Users, Shield, Brain } from 'lucide-react';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { agentAccessControl, type AgentAccessConfig } from '@/agents/config';

interface AgentPrompt {
  id: string;
  agent_type: string;
  prompt_text: string;
  created_at: string;
  updated_at: string;
}

export const AgentConfigsPage: React.FC = () => {
  const [agentPrompts, setAgentPrompts] = useState<Record<string, AgentPrompt>>({});
  const [loading, setLoading] = useState(true);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Get all agents from config
  const allAgents = Object.values(agentAccessControl);
  const publicAgents = allAgents.filter(a => a.allowedRoles.includes('viewer') || a.allowedRoles.includes('member'));
  const adminAgents = allAgents.filter(a => !a.allowedRoles.includes('viewer') && !a.allowedRoles.includes('member'));

  useEffect(() => {
    loadAgentPrompts();
  }, []);

  const loadAgentPrompts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('agent_chat_prompts')
        .select('*');

      // ✅ FIX (KAI-1H): Handle missing table gracefully
      if (error) {
        if (error.code === '42P01') {
          // Table doesn't exist - use empty prompts
          console.warn('agent_chat_prompts table does not exist yet');
          setAgentPrompts({});
          return;
        }
        throw error;
      }

      // Convert array to record keyed by agent_type
      const promptsMap: Record<string, AgentPrompt> = {};
      (data || []).forEach((prompt: AgentPrompt) => {
        promptsMap[prompt.agent_type] = prompt;
      });
      setAgentPrompts(promptsMap);
    } catch (error) {
      console.error('Error loading agent prompts:', error);
      toast({
        title: 'Error',
        description: 'Failed to load agent prompts',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (agentId: string) => {
    setEditingAgentId(agentId);
    const existingPrompt = agentPrompts[agentId];
    setEditedPrompt(existingPrompt?.prompt_text || '');
  };

  const handleSave = async () => {
    if (!editingAgentId) return;

    try {
      setSaving(true);
      const existingPrompt = agentPrompts[editingAgentId];

      if (existingPrompt) {
        // Update existing prompt
        const { error } = await supabase
          .from('agent_chat_prompts')
          .update({
            prompt_text: editedPrompt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPrompt.id);

        if (error) throw error;
      } else {
        // Insert new prompt
        const { error } = await supabase
          .from('agent_chat_prompts')
          .insert({
            agent_type: editingAgentId,
            prompt_text: editedPrompt,
          });

        if (error) throw error;
      }

      const agentConfig = agentAccessControl[editingAgentId];
      toast({
        title: 'Success',
        description: `${agentConfig?.name || editingAgentId} prompt updated successfully`,
      });

      setEditingAgentId(null);
      setEditedPrompt('');
      await loadAgentPrompts();
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

  const handleCancel = () => {
    setEditingAgentId(null);
    setEditedPrompt('');
  };

  const getRoleBadge = (roles: string[]) => {
    const isPublic = roles.includes('viewer') || roles.includes('member');
    return (
      <Badge className={isPublic ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}>
        {isPublic ? 'Public' : 'Admin Only'}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderAgentTable = (agents: AgentAccessConfig[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead>Access Level</TableHead>
          <TableHead>Allowed Roles</TableHead>
          <TableHead>Prompt Status</TableHead>
          <TableHead>Last Updated</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((agent) => {
          const prompt = agentPrompts[agent.id];
          return (
            <TableRow key={agent.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <div>
                    <div className="font-medium">{agent.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {agent.description}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>{getRoleBadge(agent.allowedRoles)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {agent.allowedRoles.map((role) => (
                    <Badge key={role} variant="outline" className="text-xs">
                      {role}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {prompt ? (
                  <div className="text-sm">
                    <Badge className="bg-green-100 text-green-800">Configured</Badge>
                    <div className="text-xs text-muted-foreground mt-1">
                      {prompt.prompt_text.length.toLocaleString()} chars
                    </div>
                  </div>
                ) : (
                  <Badge variant="outline">Default</Badge>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {prompt ? formatDate(prompt.updated_at) : 'N/A'}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  onClick={() => handleEdit(agent.id)}
                  variant="ghost"
                  size="sm"
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Agent Configurations"
        description="Manage AI agent system prompts and access control"
        badge="AI System"
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Brain className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">{allAgents.length}</div>
            <div className="text-sm text-muted-foreground">Total Agents</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Users className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">{publicAgents.length}</div>
            <div className="text-sm text-muted-foreground">Public Agents</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Shield className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">{adminAgents.length}</div>
            <div className="text-sm text-muted-foreground">Admin Only</div>
          </div>

          <div className="dashboard-card transition-all duration-200 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'hsl(var(--primary) / 0.1)'
                }}
              >
                <Edit className="h-5 w-5" style={{ color: 'hsl(var(--primary))' }} />
              </div>
            </div>
            <div className="text-2xl font-semibold mb-1">
              {Object.keys(agentPrompts).length}
            </div>
            <div className="text-sm text-muted-foreground">Custom Prompts</div>
          </div>
        </div>

        {/* Agents Tabs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Agents</CardTitle>
                <CardDescription>
                  Edit system prompts and manage access control for each agent
                </CardDescription>
              </div>
              <Button
                onClick={loadAgentPrompts}
                variant="outline"
                size="sm"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading agents...
              </div>
            ) : (
              <Tabs defaultValue="public" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="public">
                    <Users className="h-4 w-4 mr-2" />
                    Public Agents ({publicAgents.length})
                  </TabsTrigger>
                  <TabsTrigger value="admin">
                    <Shield className="h-4 w-4 mr-2" />
                    Admin Only ({adminAgents.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="public" className="mt-4">
                  {renderAgentTable(publicAgents)}
                </TabsContent>

                <TabsContent value="admin" className="mt-4">
                  {renderAgentTable(adminAgents)}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingAgentId} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Edit Agent Prompt: {editingAgentId && agentAccessControl[editingAgentId]?.name}
            </DialogTitle>
            <DialogDescription>
              Customize the system prompt for this agent. Changes take effect immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4">
            {editingAgentId && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Agent ID:</span>{' '}
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      {editingAgentId}
                    </code>
                  </div>
                  <div>
                    <span className="font-medium">Access Level:</span>{' '}
                    {getRoleBadge(agentAccessControl[editingAgentId].allowedRoles)}
                  </div>
                  <div>
                    <span className="font-medium">Allowed Roles:</span>{' '}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agentAccessControl[editingAgentId].allowedRoles.map((role) => (
                        <Badge key={role} variant="outline" className="text-xs">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="font-medium">Current Length:</span>{' '}
                    {editedPrompt.length.toLocaleString()} characters
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prompt">System Prompt</Label>
                  <Textarea
                    id="prompt"
                    value={editedPrompt}
                    onChange={(e) => setEditedPrompt(e.target.value)}
                    placeholder="Enter system prompt for this agent..."
                    className="min-h-[400px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    This prompt defines the agent's behavior, capabilities, and response style.
                    Leave empty to use the default hardcoded prompt.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleCancel} variant="outline" disabled={saving}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


