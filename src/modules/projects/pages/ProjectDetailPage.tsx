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
  UserPlus,
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
  MoreHorizontal,
  GitCompareArrows,
  SlidersHorizontal,
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
  type CollaboratorRole,
  type ProjectCoverCandidate,
  type ProjectMember,
  type ProjectWithClient,
  type ProjectStatus,
  type ProjectSetup,
} from '../services/projectsService';
import { PROJECT_TABS, PROJECT_SECTION_LABELS, resolveProjectTab, type ProjectTab } from '../projectSections';
import { projectParts, type ProjectPart } from '../projectKinds';

import { OverviewTab } from '../components/tabs/OverviewTab';
import { RoomsTab } from '../components/tabs/RoomsTab';
import { MoodboardsTab } from '../components/tabs/MoodboardsTab';
import { EstimateTab } from '../components/tabs/EstimateTab';
import { ChangesTab } from '../components/tabs/ChangesTab';
import { SelectionsTab } from '../components/tabs/SelectionsTab';
import { PresentationsTab } from '../components/tabs/PresentationsTab';
import { ClientProjectHome } from '../components/ClientProjectHome';
import { ProjectSectionsDialog } from '../components/ProjectSectionsDialog';
import { QuotesTab } from '../components/tabs/QuotesTab';
import { InvoicingTab } from '../components/tabs/InvoicingTab';
import { TasksAndScheduleTab } from '../components/tabs/TasksAndScheduleTab';
import { SiteTab } from '../components/tabs/SiteTab';
import { DocumentsTab } from '../components/tabs/DocumentsTab';
import { RequestsTab } from '../components/tabs/RequestsTab';
import { AssessmentPanel } from '@/components/features/assessment/AssessmentPanel';
import { TimelineTab } from '../components/tabs/TimelineTab';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';
import { WarrantiesTab } from '@/components/business/crm/WarrantiesTab';
import { CostReportTab } from '../components/tabs/CostReportTab';
import { PurchasesTab } from '../components/tabs/PurchasesTab';
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

/**
 * The strip shows the STAGES of a job and the selected stage opens its sections in a rail. Which
 * sections exist is the project's kind (or its own list), widened by any section holding records.
 */
type ProjectStage = 'overview' | 'design' | 'specification' | 'commercial' | 'delivery' | 'client';
const TAB_GROUPS: ReadonlyArray<{ id: ProjectStage; label: string; icon: LucideIcon; tabs: readonly ProjectTab[] }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, tabs: ['overview', 'timeline', 'assessment'] },
  { id: 'design', label: 'Design', icon: PenTool, tabs: ['rooms', 'moodboards', 'sheets'] },
  { id: 'specification', label: 'Specification', icon: Ruler, tabs: ['products', 'plan'] },
  { id: 'commercial', label: 'Commercial', icon: Briefcase, tabs: ['quotes', 'changes', 'contracts', 'billing', 'purchases', 'finance'] },
  { id: 'delivery', label: 'Delivery', icon: HardHat, tabs: ['tasks', 'site', 'documents', 'handover'] },
  { id: 'client', label: 'Client', icon: Users, tabs: ['requests'] },
];

const TAB_ICONS: Record<ProjectTab, LucideIcon> = {
  overview: LayoutDashboard,
  timeline: Activity,
  assessment: Gauge,
  rooms: Home,
  moodboards: Palette,
  sheets: Presentation,
  products: Package,
  plan: ClipboardList,
  quotes: FileText,
  changes: GitCompareArrows,
  contracts: FileSignature,
  billing: Receipt,
  purchases: Hammer,
  finance: Wallet,
  tasks: CheckSquare,
  site: ClipboardList,
  documents: FileStack,
  handover: ShieldCheck,
  requests: MessageSquare,
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
  const [collabRole, setCollabRole] = useState<CollaboratorRole | null>(null);
  const [sectionsOpen, setSectionsOpen] = useState(false);
  /** Parts holding records — shown whatever the kind says, so hiding a section never hides data. */
  const [setup, setSetup] = useState<ProjectSetup | null>(null);
  /** Which sections hold records is UNKNOWN after a failed read, so every section stays offered. */
  const [setupFailed, setSetupFailed] = useState(false);
  const withData = React.useMemo<ReadonlySet<string>>(() => new Set(setup?.sections_with_data ?? []), [setup]);

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

  const parts = project ? projectParts(project) : new Set<ProjectPart>();
  const offers = (p: ProjectPart) => setupFailed || parts.has(p) || withData.has(p);
  const availableTabs = PROJECT_TABS.filter((t) => {
    if (!isTeam) return false;
    if (t === 'finance' || t === 'billing') return canFinance && offers(t);
    return offers(t);
  });
  const { tab: requested, alias } = resolveProjectTab(sp.get('tab'));
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
  const stage = stages.find((g) => g.tabs.includes(tab)) ?? stages[0] ?? TAB_GROUPS[0];
  // Coming back to a stage reopens the section you left it on — Commercial returns to the Cost report if
  // that is where you were, not to Quotes every time.
  const lastSection = useRef<Partial<Record<ProjectStage, ProjectTab>>>({});
  useEffect(() => { lastSection.current[stage.id] = tab; }, [stage.id, tab]);
  const selectStage = (id: string) => {
    const next = stages.find((g) => g.id === id);
    if (!next) return;
    const remembered = lastSection.current[next.id];
    setTab(remembered && next.tabs.includes(remembered) ? remembered : next.tabs[0]);
  };

  const loadSetup = useCallback(() => {
    if (!id) return;
    projectsService.getProjectSetup(id)
      .then((s) => { setSetup(s); setSetupFailed(false); })
      .catch(() => { setSetup(null); setSetupFailed(true); });
  }, [id]);
  // Re-read on section change: adding the first room or quote ticks its step and pins its section.
  useEffect(() => { loadSetup(); }, [loadSetup, sp]);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [data, team, role] = await Promise.all([
        projectsService.getProject(id),
        projectsService.listProjectMembers(id).catch(() => {
          toast({ title: 'Could not load the project team', description: 'You may see a read-only view until you reload.', variant: 'destructive' });
          return [] as ProjectMember[];
        }),
        projectsService.myCollaboratorRole(id).catch(() => null),
      ]);
      setMembers(team);
      setCollabRole(role);
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

  if (!isTeam) return <ClientProjectHome project={project} collabRole={collabRole} />;

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
            {myMembership && (
              <Badge variant="info" className="hidden sm:inline-flex">
                {myMembership.role === 'manager' ? 'Project manager' : 'Team Member'}
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
                  {isManager && (
                    <DropdownMenuItem onSelect={() => setSectionsOpen(true)}>
                      <SlidersHorizontal className="h-4 w-4 mr-2" />
                      Sections
                    </DropdownMenuItem>
                  )}
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
            setup={isManager ? setup : null} onInvite={() => setShowInvite(true)}
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
          <TabsContent value="timeline"><TimelineTab projectId={project.id} /></TabsContent>
          <TabsContent value="assessment"><ModuleTabGate moduleSlug="project-assessment" moduleName="AI Assessment" blurb="Ask whether this project is on track and what to fix first."><AssessmentPanel subject="project" subjectId={project.id} canRun={isManager} subjectName={project.name} /></ModuleTabGate></TabsContent>
          <TabsContent value="rooms"><RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} isOwner={isTeam} showBudget={canFinance} /></TabsContent>
          <TabsContent value="moodboards"><MoodboardsTab projectId={project.id} canCreate={isTeam} /></TabsContent>
          <TabsContent value="sheets"><PresentationsTab projectId={project.id} projectName={project.name} isOwner={isTeam} initialView={alias === 'client-view' ? 'client-views' : undefined} /></TabsContent>
          <TabsContent value="products"><SelectionsTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} canFinance={canFinance} /></TabsContent>
          <TabsContent value="plan"><EstimateTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} showTakeoff={offers('takeoff')} initialView={alias === 'takeoff' ? 'drawings' : undefined} /></TabsContent>
          <TabsContent value="quotes"><ModuleTabGate moduleSlug="quotes" moduleName="Quotes" blurb="Build and send client quotes for this project."><QuotesTab projectId={project.id} canManage={isTeam} /></ModuleTabGate></TabsContent>
          <TabsContent value="changes"><ChangesTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} canFinance={canFinance} /></TabsContent>
          <TabsContent value="contracts"><ModuleTabGate moduleSlug="contracts" moduleName="Contracts & e-Signature" blurb="Draft and e-sign contracts for this project."><ContractsSection workspaceId={project.workspace_id} context="project" subject={{ project_id: project.id }} heading="Project contracts" defaultCounterparty={{ name: project.client_contact?.name || project.client_company?.name, email: project.client_contact?.email }} /></ModuleTabGate></TabsContent>
          {canFinance && <TabsContent value="billing"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Invoice and bill this project."><InvoicingTab projectId={project.id} projectName={project.name} workspaceId={project.workspace_id} canManage={isManager} showApplications={offers('applications')} /></ModuleTabGate></TabsContent>}
          <TabsContent value="purchases"><PurchasesTab projectId={project.id} workspaceId={project.workspace_id} projectName={project.name} currency={project.budget_currency} canFinance={canFinance} showTenders={offers('tenders')} /></TabsContent>
          {canFinance && <TabsContent value="finance"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Cost, margin and budget for this project."><CostReportTab projectId={project.id} onOpenSection={setTab} showCvr={offers('cvr')} /></ModuleTabGate></TabsContent>}
          <TabsContent value="tasks"><TasksAndScheduleTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="site"><SiteTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab projectId={project.id} isOwner={isTeam} /></TabsContent>
          <TabsContent value="handover">
            <WarrantiesTab
              companyId={project.client_company_id ?? undefined}
              contactId={project.client_company_id ? undefined : (project.client_contact_id ?? undefined)}
              projectId={project.id}
            />
          </TabsContent>
          <TabsContent value="requests"><RequestsTab projectId={project.id} isOwner={isTeam} collabRole={collabRole} focusRequestId={sp.get('request')} showUpdates={false} /></TabsContent>
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

      {isManager && (
        <ProjectSectionsDialog
          open={sectionsOpen}
          onOpenChange={setSectionsOpen}
          project={project}
          withData={withData}
          onSaved={(patch) => setProject(prev => prev ? { ...prev, ...patch } : null)}
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
