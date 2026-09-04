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

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  completed: 'Completed',
  archived: 'Archived',
};

// A raw palette shade is a light/dark PAIR. The bare `-300` these carried is chosen for the
// plum-black dark theme and measures ~1.2:1 on the light themes' cream — the same defect the Inbox
// source chip had. Both halves are measured by tests/unit/inboxChipContrast.test.ts.
const STATUS_TONES: Record<ProjectStatus, string> = {
  planning: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  in_progress: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/30',
  on_hold: 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/30',
  completed: 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  archived: 'bg-muted text-muted-foreground border-border',
};

/**
 * `PROJECT_TABS` (../projectSections) is every section this page can render, and the same file
 * holds each section's title, so a button elsewhere that links here reads exactly what the tab
 * reads. `availableTabs` below filters it by the SAME conditions the contents are written with,
 * so a `?tab=` naming a section this viewer cannot see falls back to Overview instead of rendering
 * a blank panel — the trap `PropertyWorkbench.availableTabs` exists to close, on the page that had
 * no equivalent.
 *
 * Until this existed the page ignored `?tab=` entirely, so `BillingTab`'s own "Go to Quotes"
 * button and all four `project_request_*` notification `action_url`s
 * (`/projects/:id?tab=requests&request=…`) landed the reader on Overview with no hint of where to
 * go next. Guarded by tests/unit/projectTabLinks.test.ts.
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
 * its own sections in a smaller strip beneath.
 *
 * `?tab=` still names the SECTION, never the stage. The stage is derived from the section, so the
 * four `project_request_*` notifications, the sheet-share mail, `BillingTab`'s "see the quotes",
 * the construction tools' `?tab=finance` and every other deep link land exactly where they did.
 * A stage this viewer can see only ONE section of renders AS that section — a collaborator gets a
 * "Quotes" tab, not a "Commercial" tab with one thing under it.
 *
 * Every section belongs to exactly one stage — guarded by tests/unit/projectTabLinks.test.ts.
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

  // The tabs actually rendered for THIS viewer. Kept next to the value passed to <Tabs> so the two
  // cannot drift — a trigger added without an entry here reintroduces the blank-panel state.
  const availableTabs = PROJECT_TABS.filter((t) => {
    if (t === 'finance') return canFinance;
    return isOwner || !OWNER_ONLY_TABS.has(t);
  });
  // Validated against what THIS viewer gets, so `?tab=timeline` on a collaborator's link falls
  // back to Overview instead of rendering a blank panel. Safe to read `isOwner` here: the page
  // returns a loader above and only reaches the tabs once the project has resolved.
  const requested = sp.get('tab') as ProjectTab | null;
  const tab: ProjectTab = requested && availableTabs.includes(requested) ? requested : 'overview';
  const setTab = useCallback((next: string) => {
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'overview') p.delete('tab'); else p.set('tab', next);
      // The focused record belongs to the tab that was open; carrying it across is meaningless.
      p.delete('request');
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

  // The two counts the strip carries. `0` renders nothing — an empty count is noise.
  const sectionCount = (t: ProjectTab): number =>
    t === 'moodboards' ? project.moodboard_count : t === 'quotes' ? project.accepted_quote_count : 0;
  const countBadge = (t: ProjectTab) => {
    const n = sectionCount(t);
    return n > 0 ? <Badge variant="outline" className="ml-1 text-xs h-5">{n}</Badge> : null;
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={FolderKanban}
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <>
            {!isOwner && (
              <Badge variant="outline" className="hidden sm:inline-flex bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30">
                <Eye className="h-3 w-3 mr-1" />
                Shared with you
              </Badge>
            )}
            {project.category?.label && (
              <Badge variant="secondary" className="hidden sm:inline-flex">
                {project.category.label}
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
              <Button size="sm" onClick={() => setShowInvite(true)}>
                <UserPlus className="h-4 w-4 mr-1" />
                Invite client
              </Button>
            )}
            {/* Reuse this project's rooms + task tree on the next job (#322). */}
            {isOwner && (
              <Button variant="outline" size="sm" onClick={() => setSaveTemplateOpen(true)}>
                <Layers className="h-4 w-4 mr-1" />
                Save as template
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
            {/* Section strip: the stage's own sections, one size down. `?tab=` names one of these. */}
            <Tabs value={tab} onValueChange={setTab}>
              {stage.tabs.length > 1 && (
                <TabsList aria-label={`${stage.label} sections`} className="mt-4 h-8 w-auto gap-0 text-xs">
                  {stage.tabs.map((t) => {
                    const Icon = TAB_ICONS[t];
                    return (
                      <TabsTrigger key={t} value={t} className="min-h-8 gap-1.5 px-3 py-1 text-xs md:min-h-8">
                        <Icon className="h-3.5 w-3.5" />
                        {PROJECT_SECTION_LABELS[t]}
                        {countBadge(t)}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              )}

          <TabsContent value="overview"><OverviewTab project={project} isOwner={isOwner} onProjectPatched={(patch) => setProject(prev => prev ? { ...prev, ...patch } : null)} /></TabsContent>
          <TabsContent value="rooms"><RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} isOwner={isOwner} /></TabsContent>
          {isOwner && <TabsContent value="products"><ProductsTab projectId={project.id} workspaceId={project.workspace_id} /></TabsContent>}
          {isOwner && <TabsContent value="plan"><PlanTab projectId={project.id} workspaceId={project.workspace_id} currency={project.budget_currency} isOwner={isOwner} /></TabsContent>}
          {isOwner && <TabsContent value="purchases"><PurchaseItemsTab projectId={project.id} workspaceId={project.workspace_id} projectName={project.name} /></TabsContent>}
          <TabsContent value="moodboards"><MoodboardsTab projectId={project.id} /></TabsContent>
          <TabsContent value="quotes"><ModuleTabGate moduleSlug="quotes" moduleName="Quotes" blurb="Build and send client quotes for this project."><QuotesTab projectId={project.id} /></ModuleTabGate></TabsContent>
          {isOwner && <TabsContent value="billing"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Invoice and bill this project."><BillingTab projectId={project.id} /></ModuleTabGate></TabsContent>}
          {canFinance && <TabsContent value="finance"><ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Orders, invoices and payments for this project."><FinanceTab projectId={project.id} projectName={project.name} /></ModuleTabGate></TabsContent>}
          <TabsContent value="sheets"><SheetsTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          {isOwner && <TabsContent value="client-view"><ClientViewTab projectId={project.id} projectName={project.name} isOwner={isOwner} /></TabsContent>}
          {isOwner && <TabsContent value="contracts"><ModuleTabGate moduleSlug="contracts" moduleName="Contracts & e-Signature" blurb="Draft and e-sign contracts for this project."><ContractsSection workspaceId={project.workspace_id} context="project" subject={{ project_id: project.id }} heading="Project contracts" defaultCounterparty={{ name: project.client_contact?.name || project.client_company?.name, email: project.client_contact?.email }} /></ModuleTabGate></TabsContent>}
          {isOwner && (
            <TabsContent value="handover">
              <WarrantiesTab
                companyId={project.client_company_id ?? undefined}
                contactId={project.client_company_id ? undefined : (project.client_contact_id ?? undefined)}
                projectId={project.id}
              />
            </TabsContent>
          )}
          <TabsContent value="tasks"><TasksAndScheduleTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          <TabsContent value="site"><SiteTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          <TabsContent value="documents"><DocumentsTab projectId={project.id} isOwner={isOwner} /></TabsContent>
          <TabsContent value="requests"><RequestsTab projectId={project.id} isOwner={isOwner} focusRequestId={sp.get('request')} /></TabsContent>
          {isOwner && <TabsContent value="assessment"><ModuleTabGate moduleSlug="project-assessment" moduleName="AI Assessment" blurb="Ask whether this project is on track and what to fix first."><AssessmentPanel subject="project" subjectId={project.id} canRun={isOwner} subjectName={project.name} /></ModuleTabGate></TabsContent>}
          {isOwner && <TabsContent value="timeline"><TimelineTab projectId={project.id} /></TabsContent>}
            </Tabs>
          </TabsContent>
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

      {isOwner && (
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
