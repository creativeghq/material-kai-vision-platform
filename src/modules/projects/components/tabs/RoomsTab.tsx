import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Home, Loader2, Ruler, Grid3x3 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, CardContent } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  projectsService,
  type ProjectRoom,
  type RoomType,
} from '../../services/projectsService';

const ROOM_TYPE_OPTIONS: Array<{ value: RoomType; label: string }> = [
  { value: 'living', label: 'Living' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'dining', label: 'Dining' },
  { value: 'office', label: 'Office' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'hallway', label: 'Hallway' },
  { value: 'other', label: 'Other' },
];

interface RoomsTabProps {
  projectId: string;
  budgetCurrency: string;
  /** Collaborators see the room list but can't add/delete rooms. */
  isOwner?: boolean;
  /** A room's budget is money -- shown only to whoever already sees project finance. */
  showBudget?: boolean;
}

import { formatMoney } from '@/utils/decimal';
import { RoomGeometryModal, roomGeometrySummary } from '../RoomGeometryModal';

export const RoomsTab: React.FC<RoomsTabProps> = ({ projectId, budgetCurrency, isOwner = true, showBudget = isOwner }) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  // The add form sits above the list, so the empty state's job is to point at it rather than
  // open anything — focusing the field is the whole action.
  const nameRef = useRef<HTMLInputElement>(null);
  const [newType, setNewType] = useState<RoomType | ''>('');
  const [newBudget, setNewBudget] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [creating, setCreating] = useState(false);
  const [geometryRoom, setGeometryRoom] = useState<ProjectRoom | null>(null);
  // Room views saved on this project's moodboards, by the room they were saved for (#560).
  const [roomViews, setRoomViews] = useState<Map<string, Array<{ id: string; title: string | null; moodboard_id: string | null }>>>(new Map());

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [data, sheets] = await Promise.all([
        projectsService.listRooms(projectId),
        projectsService.listProjectSheets(projectId).catch(() => []),
      ]);
      setRooms(data);
      const byRoom = new Map<string, Array<{ id: string; title: string | null; moodboard_id: string | null }>>();
      for (const s of sheets) {
        if (s.sheet_type !== 'room_view' || !s.room_id) continue;
        byRoom.set(s.room_id, [...(byRoom.get(s.room_id) ?? []), { id: s.id, title: s.title, moodboard_id: s.moodboard_id }]);
      }
      setRoomViews(byRoom);
    } catch (_err) {
      toast({ title: 'Failed to load rooms', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      setCreating(true);
      await projectsService.createRoom({
        project_id: projectId,
        name: newName.trim(),
        room_type: newType || null,
        budget_amount: newBudget ? parseFloat(newBudget) : null,
        deadline: newDeadline || null,
        sort_order: rooms.length,
      });
      setNewName('');
      setNewType('');
      setNewBudget('');
      setNewDeadline('');
      await load();
    } catch (_err) {
      toast({ title: 'Failed to add room', variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this room? Linked moodboards/tasks will keep their other links but lose the room reference.')) return;
    try {
      await projectsService.deleteRoom(id);
      await load();
    } catch (_err) {
      toast({ title: 'Failed to delete room', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {isOwner && (
      <Card className="dashboard-card">
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm">Add a room</Label>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <Input
              ref={nameRef}
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Room name (e.g., Master Bath)"
              disabled={creating}
              className="md:col-span-4"
            />
            <Select value={newType} onValueChange={v => setNewType(v as RoomType)} disabled={creating}>
              <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {ROOM_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min="0"
              value={newBudget}
              onChange={e => setNewBudget(e.target.value)}
              placeholder="Budget"
              disabled={creating}
              className="md:col-span-2"
            />
            <Input
              type="date"
              value={newDeadline}
              onChange={e => setNewDeadline(e.target.value)}
              disabled={creating}
              className="md:col-span-3"
            />
            <Button onClick={handleAdd} disabled={creating || !newName.trim()} className="md:col-span-1">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="p-0">
            <HubEmptyState
              icon={Home}
              title="No rooms yet"
              description="Split the project by space — each room carries its own budget and deadline, and products can be assigned to one. A single-space project can skip this."
              action={isOwner ? (
                <Button size="sm" onClick={() => nameRef.current?.focus()}><Plus className="h-4 w-4 mr-2" />Add a room</Button>
              ) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rooms.map(r => (
            <Card key={r.id} className="dashboard-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    {r.room_type && (
                      <p className="text-xs text-muted-foreground capitalize">{r.room_type}</p>
                    )}
                  </div>
                  {isOwner && (
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {showBudget && r.budget_amount && (
                    <span>{formatMoney(Number(r.budget_amount), budgetCurrency)}</span>
                  )}
                  {r.deadline && (
                    <span>Due {new Date(r.deadline).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}</span>
                  )}
                </div>
                {(roomViews.get(r.id) ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(roomViews.get(r.id) ?? []).map((v) => (
                      <Link
                        key={v.id}
                        to={v.moodboard_id ? `/moodboard/${v.moodboard_id}?tab=room-views&view=${v.id}` : '#'}
                        className="inline-flex items-center gap-1 rounded-sm border border-hairline px-1.5 py-0.5 text-[11px] hover:bg-surface-hover"
                      >
                        <Grid3x3 className="h-3 w-3" />{v.title || 'Room View'}
                      </Link>
                    ))}
                  </div>
                )}
                {(() => {
                  const summary = roomGeometrySummary(r);
                  return (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                      <span className={`text-xs ${summary.calibrated ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
                        {summary.text}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => setGeometryRoom(r)}
                      >
                        <Ruler className="h-3.5 w-3.5" />
                        Size & plan
                      </Button>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <RoomGeometryModal
        room={geometryRoom}
        open={!!geometryRoom}
        onOpenChange={(o) => { if (!o) setGeometryRoom(null); }}
        onSaved={load}
        readOnly={!isOwner}
      />
    </div>
  );
};
