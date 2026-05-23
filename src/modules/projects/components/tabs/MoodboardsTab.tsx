import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Palette, Loader2, ArrowRight } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../../services/projectsService';

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listProjectMoodboards(projectId);
      setMoodboards(data as MoodboardRow[]);
    } catch (err) {
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
      <Card className="dashboard-card">
        <CardContent className="py-12 text-center">
          <Palette className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No moodboards attached to this project yet.</p>
          <p className="text-xs text-muted-foreground mb-4">
            When you create a new moodboard, pick this project in the "Add to Moodboard" modal.
          </p>
          <Button variant="outline" onClick={() => navigate('/moodboard')}>
            Go to Moodboards
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
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
              Updated {new Date(mb.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
