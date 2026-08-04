import React, { useCallback, useEffect, useState } from 'react';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FolderKanban,
  Loader2,
  ChevronLeft,
  Archive,
  Home,
  Palette,
  FileText,
  CheckSquare,
  LayoutDashboard,
  Activity,
  FileImage,
  UserPlus,
  Eye,
  Presentation,
  Receipt,
  Package,
  Wallet,
  Trash2,
  ClipboardList,
  Hammer,
  FileSignature,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService,
  type ProjectWithClient,
  type ProjectStatus,
} from '../services/projectsService';

import { OverviewTab } from '../components/tabs/OverviewTab';
import { RoomsTab } from '../components/tabs/RoomsTab';
import { MoodboardsTab } from '../components/tabs/MoodboardsTab';
import { QuotesTab } from '../components/tabs/QuotesTab';
import { BillingTab } from '../components/tabs/BillingTab';
import { TasksTab } from '../components/tabs/TasksTab';
import { TimelineTab } from '../components/tabs/TimelineTab';
import { SheetsTab } from '../components/tabs/SheetsTab';
import { ClientViewTab } from '../components/tabs/ClientViewTab';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';
import { ProductsTab } from '../components/tabs/ProductsTab';
import { FinanceTab } from '../components/tabs/FinanceTab';
import { PlanTab } from '../components/tabs/PlanTab';
import { PurchaseItemsTab } from '../components/tabs/PurchaseItemsTab';
import { InviteCollaboratorsModal } from '../components/InviteCollaboratorsModal';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_TONES: Record<ProjectStatus, string> = {
  planning: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  in_progress: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  on_hold: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  completed: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { can, persona } = usePermissions();
  const [project, setProject] = useState<ProjectWithClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'rooms' | 'products' | 'purchases' | 'plan' | 'moodboards' | 'quotes' | 'finance' | 'sheets' | 'client-view' | 'contracts' | 'tasks' | 'timeline'>('overview');
  const [showInvite, setShowInvite] = useState(false);

  // Ownership: project.user_id is the creator. Anyone else who can read the project
  // got here via a project_collaborators row (RLS guarantees this). Owner gets the
  // management surface; collaborator gets a read-only view with budget + timeline hidden.
  const isOwner = !!user && !!project && project.user_id === user.id;
  // Finance + Products are professional surfaces (operator/dealer/architect), never the
  // end customer. Gated identically to Billing: owner + finance.manage capability.
  const canFinance = isOwner && can('finance.manage');
  // Hard-delete is a principal action: the owner, and only the business personas
  // (operator / dealer / architect) — not project-client end-users or staff.
  const canDeleteProject = isOwner && ['operator', 'dealer', 'architect'].includes(persona);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const data = await projectsService.getProject(id);
      if (!data) {
        toast({ title: 'Project not found', variant: 'destructive' });
        navigate('/projects');
        return;
      }
      setProject(data);
    } catch (_err) {
      toast({ title: 'Failed to load project', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (status: ProjectStatus) => {
    if (!project) return;
    try {
      const updated = await projectsService.updateProject(project.id, { status });
      setProject(prev => prev ? { ...prev, status: updated.status } : null);
      toast({ title: `Status set to ${STATUS_LABELS[status]}` });
    } catch (_err) {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleArchive = async () => {
    if (!project) return;
    if (!confirm('Archive this project? It will be hidden from the active list. You can still find it via "Show archived".')) return;
    await handleStatusChange('archived');
    navigate('/projects');
  };

  const handleDelete = async () => {
    if (!project) return;
    if (!confirm(
      'Delete this project permanently?\n\n' +
      'Its rooms, tasks, product lines, client views and collaborators will be deleted. ' +
      'Linked moodboards, quotes and invoices are kept but unlinked from the project.\n\n' +
      'This cannot be undone.',
    )) return;
    try {
      await projectsService.deleteProject(project.id);
      toast({ title: 'Project deleted' });
      navigate('/projects');
    } catch (_err) {
      toast({ title: 'Failed to delete project', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <>
            {!isOwner && (
              <Badge variant="outline" className="hidden sm:inline-flex bg-blue-500/15 text-blue-300 border-blue-500/30">
                <Eye className="h-3 w-3 mr-1" />
                Shared with you
              </Badge>
            )}
            <Badge variant="outline" className={`hidden sm:inline-flex ${STATUS_TONES[project.status]}`}>
              {STATUS_LABELS[project.status]}
            </Badge>
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                All projects
              </Button>
            )}
            {isOwner && (
              <Button size="sm" onClick={() => setShowInvite(true)} className="rounded-full">
                <UserPlus className="h-4 w-4 mr-1" />
                Invite client
              </Button>
            )}
            {isOwner && project.status !== 'archived' && (
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
            {canDeleteProject && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-5">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="rooms" className="flex items-center gap-2">
              <Home className="h-3.5 w-3.5" />
              Rooms
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="products" className="flex items-center gap-2">
                <Package className="h-3.5 w-3.5" />
                Products
              </TabsTrigger>
            )}
            <TabsTrigger value="moodboards" className="flex items-center gap-2">
              <Palette className="h-3.5 w-3.5" />
              Moodboards
              {project.moodboard_count > 0 && (
                <Badge variant="outline" className="ml-1 text-xs h-5">{project.moodboard_count}</Badge>
              )}
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="plan" className="flex items-center gap-2">
                <ClipboardList className="h-3.5 w-3.5" />
                Plan
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="purchases" className="flex items-center gap-2">
                <Hammer className="h-3.5 w-3.5" />
                Purchases
              </TabsTrigger>
            )}
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" />
              Quotes
              {project.accepted_quote_count > 0 && (
                <Badge variant="outline" className="ml-1 text-xs h-5">{project.accepted_quote_count}</Badge>
              )}
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="billing" className="flex items-center gap-2">
                <Receipt className="h-3.5 w-3.5" />
                Billing
              </TabsTrigger>
            )}
            {canFinance && (
              <TabsTrigger value="finance" className="flex items-center gap-2">
                <Wallet className="h-3.5 w-3.5" />
                Finance
              </TabsTrigger>
            )}
            <TabsTrigger value="sheets" className="flex items-center gap-2">
              <FileImage className="h-3.5 w-3.5" />
              Sheets
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="client-view" className="flex items-center gap-2">
                <Presentation className="h-3.5 w-3.5" />
                Client View
              </TabsTrigger>
            )}
            {isOwner && (
              <TabsTrigger value="contracts" className="flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Contracts
              </TabsTrigger>
            )}
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CheckSquare className="h-3.5 w-3.5" />
              Tasks
            </TabsTrigger>
            {/* Timeline is owner-only — it would expose internal task + status churn to clients. */}
            {isOwner && (
              <TabsTrigger value="timeline" className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                Timeline
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview"><OverviewTab project={project} isOwner={isOwner} /></TabsContent>
          <TabsContent value="rooms"><RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} isOwner={isOwner} /></TabsContent>
          {isOwner && <TabsContent value="products"><ProductsTab projectId={project.id} workspaceId={project.workspace_id} /></TabsContent>}
          {isOwner && <TabsContent value="plan"><PlanTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} isOwner={isOwner} /></TabsContent>}
          {isOwner && <TabsContent value="purchases"><PurchaseItemsTab projectId={project.id} workspaceId={project.workspace_id} projectName={project.name} /></TabsContent>}
          <TabsContent value="moodboards"><MoodboardsTab projectId={project.id} /></TabsContent>
          <TabsContent value="quotes"><ModuleTabGate moduleSlug="quotes" moduleName="Quotes" blurb="Build and send client quotes for this project."><QuotesTab projectId={project.id} /></ModuleTabGate></TabsContent>
          {isOwner && <TabsContent value="billing"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Invoice and bill this project."><BillingTab projectId={project.id} /></ModuleTabGate></TabsContent>}
          {canFinance && <TabsContent value="finance"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Orders, invoices and payments for this project."><FinanceTab projectId={project.id} /></ModuleTabGate></TabsContent>}
          <TabsContent value="sheets"><SheetsTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          {isOwner && <TabsContent value="client-view"><ClientViewTab projectId={project.id} projectName={project.name} isOwner={isOwner} /></TabsContent>}
          {isOwner && <TabsContent value="contracts"><ModuleTabGate moduleSlug="contracts" moduleName="Contracts & e-Signature" blurb="Draft and e-sign contracts for this project."><ContractsSection workspaceId={project.workspace_id} context="project" subject={{ project_id: project.id }} heading="Project contracts" defaultCounterparty={{ name: project.client_contact?.name || project.client_company?.name, email: project.client_contact?.email }} /></ModuleTabGate></TabsContent>}
          <TabsContent value="tasks"><TasksTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          {isOwner && <TabsContent value="timeline"><TimelineTab projectId={project.id} /></TabsContent>}
        </Tabs>
      </main>

      {isOwner && (
        <InviteCollaboratorsModal
          projectId={project.id}
          projectName={project.name}
          open={showInvite}
          onClose={() => setShowInvite(false)}
        />
      )}
    </div>
  );
};
