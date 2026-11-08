import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, Loader2, ArrowRight, Plus } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { FormField } from '@/components/core/ui/form-layout';
import { formatDate } from '@/utils/datetime';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../../services/projectsService';
import { moodboardAPI } from '@/services/moodboardAPI';

interface MoodboardsTabProps {
  projectId: string;
  /** A collaborator browses the boards; only the team creates them. */
  canCreate: boolean;
}

interface MoodboardRow {
  id: string;
  title: string;
  description: string | null;
  room_id: string | null;
  updated_at: string;
  view_count: number | null;
}

export const MoodboardsTab: React.FC<MoodboardsTabProps> = ({ projectId, canCreate }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [moodboards, setMoodboards] = useState<MoodboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState('');

  // Create a moodboard already linked to THIS project (+ open it) — the project page is the one
  // place project context is known, so it shouldn't send the user to /moodboard to re-pick it.
  const handleCreate = async () => {
    const name = title.trim();
    if (!name) return;
    setCreating(true);
    try {
      const mb = await moodboardAPI.createMoodBoard({ title: name, project_id: projectId });
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

  const nameDialog = (
    <Dialog open={naming} onOpenChange={(o) => { if (!creating) { setNaming(o); if (!o) setTitle(''); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Moodboard</DialogTitle>
          <DialogDescription>It is attached to this project and opens straight away.</DialogDescription>
        </DialogHeader>
        <FormField label="Moodboard Name">
          <Input
            value={title}
            autoFocus
            disabled={creating}
            placeholder="e.g., Master Bath Materials"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
          />
        </FormField>
        <DialogFooter>
          <Button variant="outline" onClick={() => setNaming(false)} disabled={creating}>Cancel</Button>
          <Button onClick={() => void handleCreate()} disabled={creating || !title.trim()}>
            {creating && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create and open
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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
          action={canCreate ? (
            <>
              <Button onClick={() => setNaming(true)}><Plus className="h-4 w-4 mr-1" /> New moodboard</Button>
              <Button variant="outline" onClick={() => navigate('/moodboard')}>Go to Moodboards</Button>
            </>
          ) : undefined}
        />
        {nameDialog}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setNaming(true)}><Plus className="h-4 w-4 mr-1" /> New moodboard</Button>
        </div>
      )}
      {nameDialog}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {moodboards.map(mb => (
        <Card
          key={mb.id}
          className="dashboard-card panel-interactive cursor-pointer"
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
              Updated {formatDate(mb.updated_at)}
            </p>
          </CardContent>
        </Card>
      ))}
      </div>
    </div>
  );
};
