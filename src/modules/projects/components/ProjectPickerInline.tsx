import React, { useEffect, useState } from 'react';
import { FolderKanban, Check, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';
import { projectsService, type ProjectWithClient, type ProjectRoom } from '../services/projectsService';

interface ProjectPickerInlineProps {
  /** Currently selected project_id (null = unassigned) */
  projectId: string | null;
  /** Currently selected room_id (only meaningful when project is set + has rooms) */
  roomId?: string | null;
  onChange: (next: { project_id: string | null; room_id: string | null }) => void;
  /** Hide room picker even when project has rooms (use for quote create where rooms live at line level) */
  hideRoomPicker?: boolean;
  disabled?: boolean;
  label?: string;
}

export const ProjectPickerInline: React.FC<ProjectPickerInlineProps> = ({
  projectId,
  roomId = null,
  onChange,
  hideRoomPicker,
  disabled,
  label = 'Project (Optional)',
}) => {
  const [projects, setProjects] = useState<ProjectWithClient[]>([]);
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    projectsService.listProjects({ status: 'active' })
      .then(p => { if (!cancelled) setProjects(p); })
      .catch(err => console.warn('[ProjectPickerInline] load projects:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!projectId || hideRoomPicker) {
      setRooms([]);
      return;
    }
    projectsService.listRooms(projectId)
      .then(r => { if (!cancelled) setRooms(r); })
      .catch(err => console.warn('[ProjectPickerInline] load rooms:', err));
    return () => { cancelled = true; };
  }, [projectId, hideRoomPicker]);

  const selected = projects.find(p => p.id === projectId);

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-start text-left font-normal h-auto py-2.5"
          >
            <FolderKanban className="h-4 w-4 mr-2 text-muted-foreground shrink-0" />
            {selected ? (
              <span className="truncate">{selected.name}</span>
            ) : (
              <span className="text-muted-foreground">No project — standalone</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-2 w-72" align="start">
          <div className="space-y-1 max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange({ project_id: null, room_id: null }); setOpen(false); }}
              className="w-full text-left p-2 rounded-md hover:bg-muted/60 flex items-center gap-2 text-sm"
            >
              <X className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">No project</span>
              {!projectId && <Check className="h-3.5 w-3.5 ml-auto text-primary" />}
            </button>
            {loading && <div className="text-xs text-muted-foreground p-2">Loading...</div>}
            {!loading && projects.length === 0 && (
              <div className="text-xs text-muted-foreground p-2">No active projects yet.</div>
            )}
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => { onChange({ project_id: p.id, room_id: null }); setOpen(false); }}
                className="w-full text-left p-2 rounded-md hover:bg-muted/60 flex items-center gap-2 text-sm"
              >
                <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{p.name}</div>
                  {(p.client_company?.name || p.client_contact?.name) && (
                    <div className="text-xs text-muted-foreground truncate">
                      {p.client_company?.name || p.client_contact?.name}
                    </div>
                  )}
                </div>
                {projectId === p.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {!hideRoomPicker && projectId && rooms.length > 0 && (
        <div className="pl-4 border-l-2 border-primary/30">
          <Label className="text-xs text-muted-foreground">Room (Optional)</Label>
          <select
            value={roomId || ''}
            onChange={e => onChange({ project_id: projectId, room_id: e.target.value || null })}
            disabled={disabled}
            className="mt-1 w-full text-sm rounded-md border border-input bg-background px-3 py-2"
          >
            <option value="">Whole project</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
