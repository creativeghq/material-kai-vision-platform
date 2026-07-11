import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, Trash2, Network, Pencil } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type Department, type Employee } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const empName = (e: Employee) => e.contact?.name || [e.contact?.first_name, e.contact?.last_name].filter(Boolean).join(' ') || 'Unnamed';

export function DepartmentsSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Department | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { setDepartments((await hrService.listDepartments(workspaceId)).departments); }
    catch (e) { toast({ title: 'Failed to load departments', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const remove = async (d: Department) => {
    if (!workspaceId) return;
    try { await hrService.deleteDepartment(workspaceId, d.id); toast({ title: 'Department deleted' }); load(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Departments" subtitle={`${departments.length} departments`} actions={canManage && workspaceId ? <AddDepartmentDialog workspaceId={workspaceId} onDone={load} /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {departments.length === 0 ? <EmptyState icon={Network} title="No departments yet" hint={canManage ? 'Create departments to organise your team.' : undefined} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Description</TableHead><TableHead>Head</TableHead><TableHead className="text-right">People</TableHead>{canManage && <TableHead />}</TableRow></TableHeader>
              <TableBody>
                {departments.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell className="text-muted-foreground">{d.description || '—'}</TableCell>
                    <TableCell>{d.head?.name || '—'}</TableCell>
                    <TableCell className="text-right">{d.employee_count}</TableCell>
                    {canManage && <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(d)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(d)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {editing && workspaceId && (
        <EditDepartmentDialog workspaceId={workspaceId} department={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function EditDepartmentDialog({ workspaceId, department, onClose, onDone }: { workspaceId: string; department: Department; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description ?? '');
  const [headContactId, setHeadContactId] = useState(department.head_contact_id ?? '');
  const [employees, setEmployees] = useState<Employee[]>([]);

  useEffect(() => {
    hrService.listEmployees(workspaceId).then((r) => setEmployees(r.employees)).catch(() => setEmployees([]));
  }, [workspaceId]);

  const submit = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.updateDepartment(workspaceId, department.id, {
        name: name.trim(), description: description.trim() || undefined,
        head_contact_id: headContactId || null,
      });
      toast({ title: 'Department updated' }); onDone();
    } catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit department</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Department head</Label>
            <Select value={headContactId || 'none'} onValueChange={(v) => setHeadContactId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {employees.map((e) => <SelectItem key={e.id} value={e.crm_contact_id}>{empName(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDepartmentDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try { await hrService.createDepartment(workspaceId, { name: name.trim(), description: description.trim() || undefined }); toast({ title: 'Department created' }); setOpen(false); setName(''); setDescription(''); onDone(); }
    catch (e) { toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New department</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New department</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering" /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
