import React, { useCallback, useEffect, useState } from 'react';
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
} from 'lucide-react';

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
import { TasksTab } from '../components/tabs/TasksTab';

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
  const [project, setProject] = useState<ProjectWithClient | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'rooms' | 'moodboards' | 'quotes' | 'tasks'>('overview');

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
    } catch (err) {
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
    } catch (err) {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleArchive = async () => {
    if (!project) return;
    if (!confirm('Archive this project? It will be hidden from the active list. You can still find it via "Show archived".')) return;
    await handleStatusChange('archived');
    navigate('/projects');
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
            <Badge variant="outline" className={`hidden sm:inline-flex ${STATUS_TONES[project.status]}`}>
              {STATUS_LABELS[project.status]}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              All Projects
            </Button>
            {project.status !== 'archived' && (
              <Button variant="outline" size="sm" onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-1" />
                Archive
              </Button>
            )}
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-5">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="rooms" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Home className="h-3.5 w-3.5" />
              Rooms
            </TabsTrigger>
            <TabsTrigger value="moodboards" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Palette className="h-3.5 w-3.5" />
              Moodboards
              {project.moodboard_count > 0 && (
                <Badge variant="outline" className="ml-1 text-xs h-5">{project.moodboard_count}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="quotes" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FileText className="h-3.5 w-3.5" />
              Quotes
              {project.accepted_quote_count > 0 && (
                <Badge variant="outline" className="ml-1 text-xs h-5">{project.accepted_quote_count}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <CheckSquare className="h-3.5 w-3.5" />
              Tasks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab project={project} /></TabsContent>
          <TabsContent value="rooms"><RoomsTab projectId={project.id} budgetCurrency={project.budget_currency} /></TabsContent>
          <TabsContent value="moodboards"><MoodboardsTab projectId={project.id} /></TabsContent>
          <TabsContent value="quotes"><QuotesTab projectId={project.id} /></TabsContent>
          <TabsContent value="tasks"><TasksTab projectId={project.id} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};
