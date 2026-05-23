import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Home, Loader2 } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
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
}

const formatMoney = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

export const RoomsTab: React.FC<RoomsTabProps> = ({ projectId, budgetCurrency }) => {
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ProjectRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<RoomType | ''>('');
  const [newBudget, setNewBudget] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await projectsService.listRooms(projectId);
      setRooms(data);
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      toast({ title: 'Failed to delete room', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardContent className="p-4 space-y-3">
          <Label className="text-sm">Add a room</Label>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            <Input
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="dashboard-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Home className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            No rooms yet. Single-space projects can skip this.
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
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {r.budget_amount && (
                    <span>{formatMoney(Number(r.budget_amount), budgetCurrency)}</span>
                  )}
                  {r.deadline && (
                    <span>Due {new Date(r.deadline).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
