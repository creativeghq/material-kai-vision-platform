import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, ChevronsUpDown, Plus, Loader2, Network } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { workspaceManagementService } from '@/services/workspaceManagementService';

export const WorkspaceSwitcher: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    memberships, activeWorkspace, activeWorkspaceId, workspaceRole, rank,
    switchWorkspace, refresh,
  } = useWorkspace();

  const [createOpen, setCreateOpen] = useState(false);

  const canManage = (workspaceRole === 'owner' || workspaceRole === 'admin') && (rank === 'operator' || rank === 'dealer');
  // Hide entirely for ordinary single-workspace users with nothing to manage.
  if (memberships.length <= 1 && !canManage) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 max-w-[220px]">
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="truncate font-light">{activeWorkspace?.name ?? 'Workspace'}</span>
            {rank && <Badge variant="outline" className="text-[10px] uppercase hidden md:inline-flex">{rank}</Badge>}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem key={m.workspaceId} onClick={() => switchWorkspace(m.workspaceId)} className="gap-2">
              <Check className={`h-4 w-4 ${m.workspaceId === activeWorkspaceId ? 'opacity-100' : 'opacity-0'}`} />
              <span className="truncate flex-1">{m.workspace.name}</span>
              {m.workspace.isRoot && <Badge variant="secondary" className="text-[10px]">root</Badge>}
            </DropdownMenuItem>
          ))}
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setCreateOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" /> New workspace…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate('/network')} className="gap-2">
                <Network className="h-4 w-4" /> Manage network
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentId={activeWorkspaceId}
        parentRank={rank}
        onCreated={async () => { setCreateOpen(false); await refresh(); toast({ title: 'Workspace created' }); }}
      />
    </>
  );
};

const CreateWorkspaceDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentId: string | null;
  parentRank: string | null;
  onCreated: () => void;
}> = ({ open, onOpenChange, parentId, parentRank, onCreated }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  // A dealer can only create architects; an operator can create either.
  const [type, setType] = useState<'dealer' | 'architect'>(parentRank === 'operator' ? 'dealer' : 'architect');
  const [catalogAccess, setCatalogAccess] = useState<'operator_catalog' | 'own_products_only'>('operator_catalog');
  const [commissionPct, setCommissionPct] = useState('5');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!parentId || !name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      await workspaceManagementService.createChild({
        name: name.trim(),
        parentId,
        canSupplyProducts: type === 'dealer',
        catalogAccess,
        commissionPct: parseFloat(commissionPct) || 0,
      });
      setName('');
      onCreated();
    } catch (err: any) {
      toast({ title: 'Create failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New workspace</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Tiles (dealer)" />
          </div>
          {parentRank === 'operator' && (
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v: any) => setType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dealer">Dealer / Supplier (can add own products)</SelectItem>
                  <SelectItem value="architect">Architect (catalog only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Catalog access</Label>
              <Select value={catalogAccess} onValueChange={(v: any) => setCatalogAccess(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator_catalog">Full operator catalog</SelectItem>
                  <SelectItem value="own_products_only">Own products only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Commission %</Label>
              <Input type="number" step="0.5" min="0" max="100" value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Commission is your cut on this workspace's sales from the operator catalog. They add their own margin on top.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
