import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  type LucideIcon,
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
  ShieldCheck,
  FileStack,
  MessageSquare,
  Layers,
  Gauge,
  PenTool,
  Ruler,
  Briefcase,
  HardHat,
  Users,
  BarChart3,
  MoreHorizontal,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService,
  type ProjectCoverCandidate,
  type ProjectMember,
  type ProjectWithClient,
  type ProjectStatus,
} from '../services/projectsService';
import { PROJECT_TABS, PROJECT_SECTION_LABELS, type ProjectTab } from '../projectSections';

import { OverviewTab } from '../components/tabs/OverviewTab';
import { RoomsTab } from '../components/tabs/RoomsTab';
import { MoodboardsTab } from '../components/tabs/MoodboardsTab';
import { QuotesTab } from '../components/tabs/QuotesTab';
import { BillingTab } from '../components/tabs/BillingTab';
import { TasksAndScheduleTab } from '../components/tabs/TasksAndScheduleTab';
import { SiteTab } from '../components/tabs/SiteTab';
import { DocumentsTab } from '../components/tabs/DocumentsTab';
import { RequestsTab } from '../components/tabs/RequestsTab';
import { AssessmentPanel } from '@/components/features/assessment/AssessmentPanel';
import { TimelineTab } from '../components/tabs/TimelineTab';
import { SheetsTab } from '../components/tabs/SheetsTab';
import { ClientViewTab } from '../components/tabs/ClientViewTab';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';
import { WarrantiesTab } from '@/components/business/crm/WarrantiesTab';
import { ProductsTab } from '../components/tabs/ProductsTab';
import { FinanceTab } from '../components/tabs/FinanceTab';
import { PlanTab } from '../components/tabs/PlanTab';
import { PurchaseItemsTab } from '../components/tabs/PurchaseItemsTab';
import { InviteCollaboratorsModal } from '../components/InviteCollaboratorsModal';
import { SaveAsTemplateDialog } from '@/components/features/templates/SaveAsTemplateDialog';
import { PROJECT_STATUS_BADGE, PROJECT_STATUS_LABELS } from '../projectStatus';
import { projectCoverSrc } from '../components/ProjectCard';
import { resolveProjectCover } from '../utils/projectCover';
import { projectCoverInput } from '../utils/projectPresentation';

/**
 * `PROJECT_TABS` (../projectSections) is every section this page can render, and the same file
 * holds each section's title, so a button elsewhere that links here reads exactly what the tab
 * reads. `availableTabs` below filters it by the SAME conditions the contents are written with,
 * so a `?tab=` naming a section this viewer cannot see falls back to Overview instead of rendering
 * a blank panel — the trap `PropertyWorkbench.availableTabs` exists to close, on the page that had
 * no equivalent.
 */

/** Tabs only the owner sees. `finance` needs `finance.manage` on top and is handled separately. */
const OWNER_ONLY_TABS = new Set<ProjectTab>([
  'products', 'plan', 'purchases', 'billing', 'client-view', 'contracts', 'handover', 'timeline',
  // An assessment names margin, uncosted labour and overdue invoices. It is an internal document
  // and a collaborator (the client) must never be handed one — which is also why the two tables
  // carry no collaborator read policy at all.
  'assessment',
]);

/**
 * The strip is ONE line. Nineteen sections wrapped onto two rows, and a second row of tabs is the
 * first row's problem twice over: nothing says which row is primary, and which section falls onto
 * the second row is a different one at every width. So the strip shows the STAGES of a project —
 * design it, specify it, sell it, build it, hand it over, review it — and the selected stage opens
 * its own sections in a side rail beside the content.
 */
type ProjectStage = 'overview' | 'design' | 'specification' | 'commercial' | 'delivery' | 'client' | 'review';
const TAB_GROUPS: ReadonlyArray<{ id: ProjectStage; label: string; icon: LucideIcon; tabs: readonly ProjectTab[] }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['overview'] },
  { id: 'design', label: 'Design', icon: PenTool, tabs: ['rooms', 'moodboards', 'sheets'] },
  { id: 'specification', label: 'Specification', icon: Ruler, tabs: ['products', 'plan', 'purchases'] },
  { id: 'commercial', label: 'Commercial', icon: Briefcase, tabs: ['quotes', 'contracts', 'billing', 'finance'] },
  { id: 'delivery', label: 'Delivery', icon: HardHat, tabs: ['tasks', 'site', 'documents'] },
  { id: 'client', label: 'Client', icon: Users, tabs: ['client-view', 'requests', 'handover'] },
  { id: 'review', label: 'Review', icon: BarChart3, tabs: ['assessment', 'timeline'] },
];

/** Glyph per section. The LABEL is `PROJECT_SECTION_LABELS`, shared with every link that points here. */
const TAB_ICONS: Record<ProjectTab, LucideIcon> = {
  overview: LayoutDashboard,
  rooms: Home,
  products: Package,
  moodboards: Palette,
  plan: ClipboardList,
  purchases: Hammer,
  quotes: FileText,
  billing: Receipt,
  finance: Wallet,
  sheets: FileImage,
  'client-view': Presentation,
  contracts: FileSignature,
  // What was INSTALLED here, and what it is still covered by (#378 C5). customer_assets.project_id
  // and register_customer_asset have carried a project since the installed base shipped, and the
  // panel has always taken a projectId. It was mounted on the CRM company and contact only, so the
  // place equipment is actually fitted had no way to record it, and asset.service_due /
  // warranty_expiring fired on assets nobody registered.
  handover: ShieldCheck,
  tasks: CheckSquare,
  // Snags + site log. Client-visible snags surface on the client view at handover.
  site: ClipboardList,
  documents: FileStack,
  // Requests are client-facing by design, so collaborators get this section too.
  requests: MessageSquare,
  assessment: Gauge,
  // Timeline is owner-only — it would expose internal task + status churn to clients.
  timeline: Activity,
};

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { can, persona } = usePermissions();
  const [project, setProject] = useState<ProjectWithClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [sp, setSp] = useSearchParams();
  const [showInvite, setShowInvite] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  // The newest moodboard image, fetched ONCE here so the header thumbnail and the Overview's
  // cover panel resolve the same picture. Re-read when a board is added or removed.
  const [coverCandidate, setCoverCandidate] = useState<ProjectCoverCandidate | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);

  // Three viewers: the owner, a teammate (project_members), and a client (project_collaborators,
  // read-only). The team gets the working surface; transfer and delete stay with the owner.
  const isOwner = !!user && !!project && project.user_id === user.id;
  const myMembership = members.find((m) => m.user_id === user?.id) ?? null;
  const isTeam = isOwner || !!myMembership;
  const isManager = isOwner || myMembership?.role === 'manager';
  const canFinance = isManager && can('finance.manage');
  // Hard-delete is a principal action: the owner, and only the business personas
  // (operator / dealer / architect) — not project-client end-users or staff.
  const canDeleteProject = isOwner && ['operator', 'dealer', 'architect'].includes(persona);

  // The tabs actually rendered for THIS viewer. Kept next to the value passed to <Tabs> so the two
  // cannot drift — a trigger added without an entry here reintroduces the blank-panel state.
  const availableTabs = PROJECT_TABS.filter((t) => {
    if (t === 'finance') return canFinance;
    if (t === 'billing') return isManager;
    return isTeam || !OWNER_ONLY_TABS.has(t);
  });
  // Validated against what THIS viewer gets, so `?tab=timeline` on a collaborator's link falls
  // back to Overview instead of rendering a blank panel. Safe to read `isTeam` here: the page
  // returns a loader above and only reaches the tabs once the project has resolved.
  const requested = sp.get('tab') as ProjectTab | null;
  const tab: ProjectTab = requested && availableTabs.includes(requested) ? requested : 'overview';
  const setTab = useCallback((next: string) => {
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab'); else p.set('tab', next);
      // The focused record belongs to the tab that was open; carrying it across is meaningless.
      p.delete('request');
      p.delete('task');
      return p;
    }, { replace: true });
  }, [setSp]);

  // The stage strip is DERIVED from the section, never stored: a `?tab=` deep link picks its stage
  // by itself, and a stage this viewer can see nothing of is not offered at all.
  const stages = TAB_GROUPS
    .map((g) => ({ ...g, tabs: g.tabs.filter((t) => availableTabs.includes(t)) }))
    .filter((g) => g.tabs.length > 0);
  const stage = stages.find((g) => g.tabs.includes(tab)) ?? stages[0];
  // Coming back to a stage reopens the section you left it on — Commercial returns to Finance if
  // that is where you were, not to Quotes every time.
  const lastSection = useRef<Partial<Record<ProjectStage, ProjectTab>>>({});
  useEffect(() => { lastSection.current[stage.id] = tab; }, [stage.id, tab]);
  const selectStage = (id: string) => {
    const next = stages.find((g) => g.id === id);
    if (!next) return;
    const remembered = lastSection.current[next.id];
    setTab(remembered && next.tabs.includes(remembered) ? remembered : next.tabs[0]);
  };

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [data, team] = await Promise.all([
        projectsService.getProject(id),
        projectsService.listProjectMembers(id).catch(() => {
          toast({ title: 'Could not load the project team', description: 'You may see a read-only view until you reload.', variant: 'destructive' });
          return [] as ProjectMember[];
        }),
      ]);
      setMembers(team);
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

  const projectId = project?.id;
  const moodboardCount = project?.moodboard_count;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    projectsService.coverCandidates([projectId], 1)
      .then((m) => { if (!cancelled) setCoverCandidate(m.get(projectId)?.[0] ?? null); })
      .catch(() => { if (!cancelled) setCoverCandidate(null); });
    return () => { cancelled = true; };
  }, [projectId, moodboardCount]);

  const handleStatusChange = async (status: ProjectStatus) => {
    if (!project) return;
    try {
      const updated = await projectsService.updateProject(project.id, { status });
      setProject(prev => prev ? { ...prev, status: updated.status } : null);
      toast({ title: `Status set to ${PROJECT_STATUS_LABELS[status]}` });
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

  // The two counts the strip carries. `0` renders nothing — an empty count is noise.
  const sectionCount = (t: ProjectTab): number =>
    t === 'moodboards' ? project.moodboard_count : t === 'quotes' ? project.accepted_quote_count : 0;
  const countBadge = (t: ProjectTab) => {
    const n = sectionCount(t);
    return n > 0 ? <Badge variant="outline" className="ml-1 text-xs h-5">{n}</Badge> : null;
  };

  const cover = resolveProjectCover(projectCoverInput(project), coverCandidate);

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        thumbnailUrl={projectCoverSrc(cover, 200)}
        recordTitle
        title={project.name}
        subtitle={tab === 'overview' ? undefined : project.description || undefined}
        actions={
          <>
            {!isTeam && (
              <Badge variant="outline" className="hidden sm:inline-flex bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                <Eye className="h-3 w-3 mr-1" />
                Shared with you
              </Badge>
            )}
            {myMembership && (
              <Badge variant="info" className="hidden sm:inline-flex">
                {myMembership.role === 'manager' ? 'Project manager' : 'Team member'}
              </Badge>
            )}
            {project.category?.label && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {project.category.label}
              </Badge>
            )}
            <Badge variant={PROJECT_STATUS_BADGE[project.status]} className="hidden sm:inline-flex">
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            {isTeam && (
              <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                All projects
              </Button>
            )}
            {isManager && (
              <Button size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                Invite client
              </Button>
            )}
            {isTeam && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" aria-label="More actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {/* Reuse this project's rooms + task tree on the next job (#322). */}
                  <DropdownMenuItem onSelect={() => setSaveTemplateOpen(true)}>
                    <Layers className="h-4 w-4 mr-2" />
                    Save as template
                  </DropdownMenuItem>
                  {isManager && project.status !== 'archived' && (
                    <DropdownMenuItem onSelect={() => void handleArchive()}>
                      <Archive className="h-4 w-4 mr-2" />
                      Archive
                    </DropdownMenuItem>
                  )}
                  {canDeleteProject && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => void handleDelete()} className="text-destructive focus:text-destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6">
        {/* Stage strip: one line at every width — it scrolls on a narrow screen rather than wrapping. */}
        <Tabs value={stage.id} onValueChange={selectStage}>
          <TabsList
            aria-label="Project stages"
            className="w-full justify-start gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {stages.map((g) => {
              // A stage with one visible section IS that section.
              const solo = g.tabs.length === 1 ? g.tabs[0] : null;
              const Icon = solo ? TAB_ICONS[solo] : g.icon;
              return (
                <TabsTrigger key={g.id} value={g.id} className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5" />
                  {solo ? PROJECT_SECTION_LABELS[solo] : g.label}
                  {solo && countBadge(solo)}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={stage.id} className="mt-0">
            {/* Section rail: the stage's own sections beside the content. `?tab=` names one of these. */}
            <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
              {stage.tabs.length > 1 && (
                <TabsList aria-label={`${stage.label} sections`} className="section-rail flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
                  {stage.tabs.map((t) => {
                    const Icon = TAB_ICONS[t];
                    return (
                      <TabsTrigger key={t} value={t} className="w-full justify-start">
                        <Icon className="h-4 w-4 mr-2" />
                        {PROJECT_SECTION_LABELS[t]}
                        {countBadge(t)}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              )}

              <div className="min-w-0 flex-1">

          <TabsContent value="overview"><OverviewTab project={project} isOwner={isTeam} canEditProject={isManager} canFinance={canFinance} onOpenSection={setTab} coverCandidate={coverCandidate}
            team={isTeam ? {
              members,
              canManage: isManager,
              onChanged: () => {
                projectsService.listProjectMembers(project.id).then((rows) => {
                  if (!isOwner && !rows.some((m) => m.user_id === user?.id)) { navigate('/projects'); return; }
                  setMembers(rows);
                }).catch(() => {});
              },
            } : undefined}
            onProjectPatched={(patch) => setProject(prev => prev ? { ...prev, ...patch } : null)} /></TabsContent>
          <TabsContent value="rooms"><RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} isOwner={isTeam} /></TabsContent>
          {isTeam && <TabsContent value="products"><ProductsTab projectId={project.id} workspaceId={project.workspace_id} /></TabsContent>}
          {isTeam && <TabsContent value="plan"><PlanTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} isOwner={isTeam} /></TabsContent>}
          {isTeam && <TabsContent value="purchases"><PurchaseItemsTab projectId={project.id} workspaceId={project.workspace_id} projectName={project.name} /></TabsContent>}
          <TabsContent value="moodboards"><MoodboardsTab projectId={project.id} /></TabsContent>
          <TabsContent value="quotes"><ModuleTabGate moduleSlug="quotes" moduleName="Quotes" blurb="Build and send client quotes for this project."><QuotesTab projectId={project.id} /></ModuleTabGate></TabsContent>
          {isManager && <TabsContent value="billing"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Invoice and bill this project."><BillingTab projectId={project.id} /></ModuleTabGate></TabsContent>}
          {canFinance && <TabsContent value="finance"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Orders, invoices and payments for this project."><FinanceTab projectId={project.id} projectName={project.name} /></ModuleTabGate></TabsContent>}
          <TabsContent value="sheets"><SheetsTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          {isTeam && <TabsContent value="client-view"><ClientViewTab projectId={project.id} projectName={project.name} isOwner={isTeam} /></TabsContent>}
          {isTeam && <TabsContent value="contracts"><ModuleTabGate moduleSlug="contracts" moduleName="Contracts & e-Signature" blurb="Draft and e-sign contracts for this project."><ContractsSection workspaceId={project.workspace_id} context="project" subject={{ project_id: project.id }} heading="Project contracts" defaultCounterparty={{ name: project.client_contact?.name || project.client_company?.name, email: project.client_contact?.email }} /></ModuleTabGate></TabsContent>}
          {isTeam && (
            <TabsContent value="handover">
              <WarrantiesTab
                companyId={project.client_company_id ?? undefined}
                contactId={project.client_company_id ? undefined : (project.client_contact_id ?? undefined)}
                projectId={project.id}
              />
            </TabsContent>
          )}
          <TabsContent value="tasks"><TasksAndScheduleTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="site"><SiteTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="requests"><RequestsTab projectId={project.id} isOwner={isTeam} focusRequestId={sp.get('request')} /></TabsContent>
          {isTeam && <TabsContent value="assessment"><ModuleTabGate moduleSlug="project-assessment" moduleName="AI Assessment" blurb="Ask whether this project is on track and what to fix first."><AssessmentPanel subject="project" subjectId={project.id} canRun={isTeam} subjectName={project.name} /></ModuleTabGate></TabsContent>}
          {isTeam && <TabsContent value="timeline"><TimelineTab projectId={project.id} /></TabsContent>}
              </div>
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>

      {isManager && (
        <InviteCollaboratorsModal
          projectId={project.id}
          projectName={project.name}
          open={showInvite}
          onClose={() => setShowInvite(false)}
        />
      )}

      {isTeam && (
        <SaveAsTemplateDialog
          entityType="project"
          sourceId={project.id}
          open={saveTemplateOpen}
          onOpenChange={setSaveTemplateOpen}
          defaultTitle={project.name}
        />
      )}
    </div>
  );
};
