import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, Loader2, ArrowRight, Plus } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../../services/projectsService';
import { moodboardAPI } from '@/services/moodboardAPI';

interface MoodboardsTabProps {
  projectId: string;
}

interface MoodboardRow {
  id: string;
  title: string;
  description: string | null;
  room_id: string | null;
  updated_at: string;
  view_count: number | null;
}

export const MoodboardsTab: React.FC<MoodboardsTabProps> = ({ projectId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [moodboards, setMoodboards] = useState<MoodboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Create a moodboard already linked to THIS project (+ open it) — the project page is the one
  // place project context is known, so it shouldn't send the user to /moodboard to re-pick it.
  const handleCreate = async () => {
    const title = window.prompt('Name this moodboard')?.trim();
    if (!title) return;
    setCreating(true);
    try {
      const mb = await moodboardAPI.createMoodBoard({ title, project_id: projectId });
      navigate(`/moodboard/${mb.id}`);
    } catch {
      toast({ title: 'Could not create moodboard', variant: 'destructive' });
    } finally { setCreating(false); }
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listProjectMoodboards(projectId);
      setMoodboards(data as MoodboardRow[]);
    } catch (_err) {
      toast({ title: 'Failed to load moodboards', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (moodboards.length === 0) {
    return (
      <Card className="dashboard-card p-0">
        <HubEmptyState
          icon={Palette}
          title="No moodboards attached to this project yet"
          description="A moodboard collects the materials and references for a room; presentation sheets and the client view are built from it."
          action={(
            <>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} New moodboard
              </Button>
              <Button variant="outline" onClick={() => navigate('/moodboard')}>Go to Moodboards</Button>
            </>
          )}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={handleCreate} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} New moodboard
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {moodboards.map(mb => (
        <Card
          key={mb.id}
          className="dashboard-card cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => navigate(`/moodboard/${mb.id}`)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Palette className="h-4 w-4 text-primary" />
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="font-medium truncate">{mb.title}</p>
            {mb.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{mb.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Updated {new Date(mb.updated_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            </p>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  );
};
