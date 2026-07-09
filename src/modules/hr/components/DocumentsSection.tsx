import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Loader2, FolderOpen, FileText, Download, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type HrDocument, type Employee, type DocType, DOC_TYPE_LABELS } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const empName = (e: Employee) => e.contact?.name || 'Unnamed';

export function DocumentsSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const [d, e] = await Promise.all([hrService.listDocuments(workspaceId), hrService.listEmployees(workspaceId)]); setDocs(d.documents); setEmployees(e.employees); }
    catch (err) { toast({ title: 'Failed to load documents', description: (err as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const view = async (doc: HrDocument) => {
    if (!workspaceId) return;
    setBusy(doc.id);
    try { const { url } = await hrService.signDocument(workspaceId, doc.id); window.open(url, '_blank'); }
    catch (e) { toast({ title: 'Could not open', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const del = async (doc: HrDocument) => {
    if (!workspaceId) return;
    try { await hrService.deleteDocument(workspaceId, doc.id); toast({ title: 'Document deleted' }); load(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Documents" subtitle={`${docs.length} files`} actions={canManage && workspaceId ? <UploadDialog workspaceId={workspaceId} employees={employees} onDone={load} /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {docs.length === 0 ? <EmptyState icon={FolderOpen} title="No documents yet" hint={canManage ? 'Upload contracts, IDs, certificates and more.' : undefined} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Employee</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{d.name}</TableCell>
                    <TableCell><Badge variant="outline">{DOC_TYPE_LABELS[d.doc_type]}</Badge></TableCell>
                    <TableCell>{d.employee?.contact?.name || '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{d.created_at?.slice(0, 10)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" disabled={busy === d.id} onClick={() => view(d)} title="Download"><Download className="h-4 w-4" /></Button>
                        {canManage && <Button variant="ghost" size="sm" onClick={() => del(d)} title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UploadDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [docType, setDocType] = useState<DocType>('contract');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = () => { setEmployeeId(''); setDocType('contract'); setFile(null); if (fileRef.current) fileRef.current.value = ''; };

  const submit = async () => {
    if (!file) { toast({ title: 'Choose a file', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const { bucket, path } = await hrService.documentUploadPath(workspaceId, { filename: file.name, employee_id: employeeId || undefined });
      const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      await hrService.recordDocument(workspaceId, { name: file.name, doc_type: docType, storage_bucket: bucket, storage_object_path: path, size_bytes: file.size, employee_id: employeeId || undefined });
      toast({ title: 'Document uploaded' }); setOpen(false); reset(); onDone();
    } catch (e) { toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Upload</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Employee</Label>
              <Select value={employeeId || 'none'} onValueChange={(v) => setEmployeeId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="General" /></SelectTrigger>
                <SelectContent><SelectItem value="none">General (no employee)</SelectItem>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((t) => <SelectItem key={t} value={t}>{DOC_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>File *</Label><input ref={fileRef} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground file:cursor-pointer" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
