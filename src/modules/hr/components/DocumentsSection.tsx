import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Loader2, FolderOpen, FileText, Download, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type HrDocument, type Employee, type DocType, DOC_TYPE_LABELS } from '../services/hrService';
import { SectionHeader, EmptyState, fileToBase64 } from './_shared';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { HUB_FILTER_ALL, HubCellEmpty, HubCellLink, HubFilterSelect, HubResetFilters, HubSortButton, HubToolbar, useHubTable, type HubTableField } from '@/components/core/hub';

const DOCUMENT_FIELDS: HubTableField<HrDocument>[] = [
  { id: 'name', sortValue: (d) => d.name, searchText: (d) => d.name },
  { id: 'type', sortValue: (d) => DOC_TYPE_LABELS[d.doc_type], filterValue: (d) => d.doc_type, filterLabel: 'Type', filterOptionLabel: (v) => DOC_TYPE_LABELS[v as DocType] ?? v },
  { id: 'employee', sortValue: (d) => d.employee?.contact?.name, searchText: (d) => d.employee?.contact?.name, filterValue: (d) => d.employee?.contact?.name, filterLabel: 'Employee' },
  { id: 'added', sortValue: (d) => d.created_at },
];

const empName = (e: Employee) => e.contact?.name || 'Unnamed';

export function DocumentsSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<HrDocument[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const t = useHubTable(docs, DOCUMENT_FIELDS);
  useEffect(() => { setPage(1); }, [t.search, t.filters]);
  const sortHead = (id: string, label: string, align?: 'right') => (
    <HubSortButton active={t.sort?.columnId === id ? t.sort.direction : undefined} align={align} onClick={() => t.toggleSort(id)}>{label}</HubSortButton>
  );
  const ariaSort = (id: string) => (t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    // Deleting the last document on a page would otherwise leave the table blank.
    try { const [d, e] = await Promise.all([hrService.listDocuments(workspaceId), hrService.listEmployees(workspaceId)]); setDocs(d.documents); setEmployees(e.employees); setPage((p) => clampPage(p, d.documents.length)); }
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
          {docs.length > 8 && (
            <HubToolbar
              search={t.search}
              onSearchChange={t.setSearch}
              searchPlaceholder="Search documents"
              filters={<>
                <HubFilterSelect label="Type" value={t.filters.type ?? HUB_FILTER_ALL} options={t.filterOptions.type} onChange={(v) => t.setFilter('type', v)} />
                <HubFilterSelect label="Employee" value={t.filters.employee ?? HUB_FILTER_ALL} options={t.filterOptions.employee} onChange={(v) => t.setFilter('employee', v)} />
                <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
              </>}
            />
          )}
          {docs.length > 0 && t.rows.length === 0 ? (
            <EmptyState icon={FolderOpen} variant="filtered" title="No documents match your filters" action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>} />
          ) : docs.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="No documents yet"
              hint={canManage ? 'Contracts, IDs, certificates and payslips — filed against the person they belong to.' : undefined}
              action={canManage && workspaceId ? <UploadDialog workspaceId={workspaceId} employees={employees} onDone={load} /> : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead aria-sort={ariaSort('name')}>{sortHead('name', 'Name')}</TableHead>
                <TableHead className="hidden sm:table-cell" aria-sort={ariaSort('type')}>{sortHead('type', 'Type')}</TableHead>
                <TableHead className="hidden md:table-cell" aria-sort={ariaSort('employee')}>{sortHead('employee', 'Employee')}</TableHead>
                <TableHead className="hidden md:table-cell" aria-sort={ariaSort('added')}>{sortHead('added', 'Added')}</TableHead>
                <TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {paginate(t.rows, page).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <button type="button" disabled={busy === d.id} onClick={() => view(d)} className="block max-w-[18rem] truncate text-left font-semibold text-primary hover:underline disabled:opacity-60" title={d.name}>{d.name}</button>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><span className="text-sm text-muted-foreground">{DOC_TYPE_LABELS[d.doc_type]}</span></TableCell>
                    <TableCell className="hidden md:table-cell">{d.employee?.contact ? <HubCellLink to={`/crm/contacts/${d.employee.contact.id}`} className="font-normal">{d.employee.contact.name}</HubCellLink> : <HubCellEmpty />}</TableCell>
                    <TableCell className="hidden md:table-cell whitespace-nowrap text-muted-foreground tabular-nums">{d.created_at?.slice(0, 10) || <HubCellEmpty />}</TableCell>
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
          <TablePagination page={page} total={t.rows.length} onPageChange={setPage} label="documents" />
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
      const b64 = await fileToBase64(file);
      await hrService.uploadDocument(workspaceId, { name: file.name, doc_type: docType, content_base64: b64, content_type: file.type || undefined, employee_id: employeeId || undefined });
      toast({ title: 'Document uploaded' }); setOpen(false); reset(); onDone();
    } catch (e) { toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />Upload</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Upload Document</DialogTitle></DialogHeader>
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
