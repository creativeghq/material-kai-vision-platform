import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Loader2, Plus, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { statusTone } from '@/utils/statusTone';
import { projectsService, type ProjectWithClient } from '../services/projectsService';
import { CreateProjectModal } from './CreateProjectModal';

/**
 * ONE projects element shared by the CRM contact record AND the company record — the same pattern
 * the record-activity element uses, so the two pages can never drift. The party is already known,
 * so "New project" opens the standard create modal with the client pre-bound.
 *
 * On a company this also folds in projects booked against that company's PEOPLE: a project attached
 * to an employee is still the company's work, and hiding it there is how it goes missing.
 */
export const PartyProjectsCard: React.FC<{
  companyId?: string | null;
  contactId?: string | null;
  /** A company's contact ids, so their projects roll up here too. */
  memberContactIds?: string[];
  /** Display name for the create modal's client line. */
  partyName?: string | null;
}> = ({ companyId, contactId, memberContactIds, partyName }) => {
  const [rows, setRows] = useState<ProjectWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const memberKey = (memberContactIds ?? []).join(',');
  const reload = useCallback(async () => {
    if (!companyId && !contactId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    try {
      setRows(await projectsService.listProjectsForClient({
        companyId, contactId, alsoContactIds: memberContactIds,
      }));
    } catch { setRows([]); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId, memberKey]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { setPage(1); }, [companyId, contactId]);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);

  const money = (n: number | null | undefined, ccy: string) =>
    n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(Number(n));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><FolderKanban className="h-4 w-4" /> Projects</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {companyId ? 'Work booked against this company or its people.' : 'Work booked against this person.'}
          </p>
        </div>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" /> New project
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No projects attached yet. Use “New project” to open one for this {companyId ? 'company' : 'person'} —
            moodboards, quotes and orders can then all hang off it.
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Project</th>
                  <th className="px-4 py-2 text-left">Client</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Deadline</th>
                  <th className="px-4 py-2 text-right">Budget</th>
                  <th className="px-4 py-2 text-right">Spent</th>
                  <th className="px-4 py-2 text-right">Last activity</th>
                  <th className="px-4 py-2 text-right w-14"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {paginate(rows, page).map((p) => (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <Link to={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      {p.description && <div className="truncate text-xs text-muted-foreground">{p.description}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {p.client_company?.name ?? p.client_contact?.name ?? '—'}
                    </td>
                    <td className={`px-4 py-2 capitalize ${statusTone(p.status)}`}>{p.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.deadline ? new Date(p.deadline).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.budget_amount, p.budget_currency)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(p.actual_amount, p.budget_currency)}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{new Date(p.last_activity_at).toLocaleDateString()}</td>
                    <td className="px-4 py-2 text-right">
                      <Link to={`/projects/${p.id}`} title="Open project">
                        <Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination page={page} total={rows.length} onPageChange={setPage} label="projects" />
          </>
        )}
      </CardContent>

      <CreateProjectModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => { setCreateOpen(false); void reload(); }}
        initialClient={{
          client_company_id: companyId ?? null,
          // A project takes a company OR a contact, never both — a contact under a company books
          // to the company so the money and the work land on the same record.
          client_contact_id: companyId ? null : (contactId ?? null),
          name: partyName ?? null,
        }}
      />
    </Card>
  );
};
