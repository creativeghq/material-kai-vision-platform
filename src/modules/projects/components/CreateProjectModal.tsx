import React, { useState } from 'react';
import { Plus, Loader2, X, Home } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import {
  projectsService,
  type RoomType,
} from '../services/projectsService';
import { ClientPicker, type ClientPickerValue } from './ClientPicker';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (projectId: string, projectName: string) => void;
}

interface RoomDraft {
  name: string;
  room_type: RoomType | '';
}

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

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [processing, setProcessing] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState<ClientPickerValue>({
    client_company_id: null,
    client_contact_id: null,
  });
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType | ''>('');
  const [deadline, setDeadline] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('EUR');

  const reset = () => {
    setName('');
    setDescription('');
    setClient({ client_company_id: null, client_contact_id: null });
    setRooms([]);
    setNewRoomName('');
    setNewRoomType('');
    setDeadline('');
    setBudgetAmount('');
    setBudgetCurrency('EUR');
  };

  const handleAddRoom = () => {
    if (!newRoomName.trim()) return;
    setRooms(prev => [...prev, { name: newRoomName.trim(), room_type: newRoomType }]);
    setNewRoomName('');
    setNewRoomType('');
  };

  const handleRemoveRoom = (idx: number) => {
    setRooms(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Project name required', variant: 'destructive' });
      return;
    }
    // Non-admins must attach a client (admins can defer it).
    if (!isAdmin && !client.client_company_id && !client.client_contact_id) {
      toast({ title: 'Pick or add a client to continue', variant: 'destructive' });
      return;
    }

    try {
      setProcessing(true);
      const project = await projectsService.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        client_company_id: client.client_company_id,
        client_contact_id: client.client_contact_id,
        deadline: deadline || null,
        budget_amount: budgetAmount ? parseFloat(budgetAmount) : null,
        budget_currency: budgetCurrency,
        rooms: rooms.map(r => ({ name: r.name, room_type: r.room_type || null })),
      });
      toast({ title: 'Project created', description: project.name });
      reset();
      onSuccess(project.id, project.name);
      onClose();
    } catch (err) {
      console.error('Error creating project:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create project',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Create a project container. You can attach moodboards, quotes, and tasks afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {/* Basics */}
          <div className="space-y-3">
            <div>
              <Label>Project Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g., Kavouri Villa Renovation"
                className="mt-1"
                disabled={processing}
                autoFocus
              />
            </div>
            <div>
              <Label>Description (Optional)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Scope, briefing notes, anything you want to remember..."
                className="mt-1"
                rows={2}
                disabled={processing}
              />
            </div>
          </div>

          {/* Client — admins get the full CRM (B2B + B2C tabs); non-admins get a
              contact-only picker scoped to their own contacts, with inline add-new. */}
          <div className="space-y-2">
            <Label>{isAdmin ? 'Client (Optional)' : 'Client'}</Label>
            <ClientPicker
              value={client}
              onChange={setClient}
              disabled={processing}
              mode={isAdmin ? 'admin' : 'simple'}
            />
          </div>

          {/* Rooms */}
          <div className="space-y-2">
            <Label>Rooms (Optional)</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              Single-space projects can skip this. You can add rooms later.
            </p>
            <div className="flex gap-2">
              <Input
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRoom(); } }}
                placeholder="Room name (e.g. Master Bath)"
                disabled={processing}
                className="flex-1"
              />
              <Select
                value={newRoomType}
                onValueChange={(v) => setNewRoomType(v as RoomType)}
                disabled={processing}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  {ROOM_TYPE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={handleAddRoom}
                disabled={processing || !newRoomName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {rooms.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {rooms.map((r, idx) => (
                  <div
                    key={idx}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-primary/15 text-sm"
                  >
                    <Home className="h-3 w-3" />
                    <span>{r.name}</span>
                    {r.room_type && (
                      <span className="text-xs text-muted-foreground capitalize">· {r.room_type}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveRoom(idx)}
                      className="ml-1 hover:bg-primary/20 rounded-full p-0.5"
                      disabled={processing}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Deadline + Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Deadline (Optional)</Label>
              <Input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="mt-1"
                disabled={processing}
              />
            </div>
            <div>
              <Label>Budget (Optional)</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  min="0"
                  step="100"
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0"
                  disabled={processing}
                  className="flex-1"
                />
                <Select
                  value={budgetCurrency}
                  onValueChange={setBudgetCurrency}
                  disabled={processing}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} disabled={processing} className="flex-1">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={processing} className="flex-1">
              {processing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
              ) : (
                <><Plus className="h-4 w-4 mr-2" />Create Project</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
