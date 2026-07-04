import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  FolderKanban,
  ListChecks,
  Inbox as InboxIcon,
  ArrowRight,
  AlertTriangle,
  CircleDot,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { inboxApi } from '@/services/inboxApi';

// ── helpers ─────────────────────────────────────────────────────────────────
function money(n: number, currency = 'EUR'): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `;
  return `${sym}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isPast(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < new Date(new Date().toISOString().slice(0, 10)).getTime();
}

// ── card shell ──────────────────────────────────────────────────────────────
function OverviewCard({
  icon: Icon,
  title,
  viewAllLink,
  loading,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  viewAllLink: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-card flex flex-col gap-3 p-5 h-full">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm flex items-center gap-2" style={{ fontWeight: 600 }}>
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </h3>
        <Link
          to={viewAllLink}
          className="flex items-center gap-1 text-xs text-primary hover:underline transition-colors"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {loading ? (
        <div className="flex-1 animate-pulse space-y-2 pt-1">
          <div className="h-7 bg-primary/10 rounded w-1/2" />
          <div className="h-2.5 bg-primary/10 rounded w-3/4" />
          <div className="h-2.5 bg-primary/10 rounded w-2/3" />
        </div>
      ) : (
        <div className="flex flex-col flex-1">{children}</div>
      )}
    </div>
  );
}

const Metric: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <div>
    <p className="text-3xl font-display leading-none tracking-tight tabular-nums" style={{ fontWeight: 700 }}>{value}</p>
    <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <p className="text-xs text-muted-foreground py-2">{text}</p>
);

// ── Finance ───────────────────────────────────────────────────────────────────
function FinanceCard({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState({ total: 0, count: 0, overdue: 0, currency: 'EUR' });

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('invoices')
        .select('amount_due, due_at, status, currency')
        .eq('workspace_id', workspaceId)
        .in('status', ['issued', 'partially_paid', 'overdue'])
        .limit(1000);
      if (!alive) return;
      const rows = data ?? [];
      const now = Date.now();
      let total = 0;
      let overdue = 0;
      let currency = 'EUR';
      for (const r of rows as Array<{ amount_due: number | null; due_at: string | null; status: string; currency: string }>) {
        total += Number(r.amount_due ?? 0);
        if (r.status === 'overdue' || (r.due_at && new Date(r.due_at).getTime() < now)) overdue++;
        if (r.currency) currency = r.currency;
      }
      setState({ total: Math.round(total), count: rows.length, overdue, currency });
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  return (
    <OverviewCard icon={Wallet} title="Finance" viewAllLink="/finance" loading={loading}>
      {state.count === 0 ? (
        <EmptyState text="No outstanding invoices. You're all settled." />
      ) : (
        <>
          <Metric
            value={money(state.total, state.currency)}
            label={`outstanding · ${state.count} invoice${state.count !== 1 ? 's' : ''}`}
          />
          {state.overdue > 0 && (
            <div className="mt-auto pt-3 flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              {state.overdue} overdue
            </div>
          )}
        </>
      )}
    </OverviewCard>
  );
}

// ── Projects ────────────────────────────────────────────────────────────────
interface ProjRow {
  id: string;
  name: string;
  status: string;
  deadline: string | null;
}
function ProjectsCard({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ProjRow[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, count } = await supabase
        .from('projects')
        .select('id, name, status, deadline', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .in('status', ['planning', 'in_progress', 'on_hold'])
        .order('deadline', { ascending: true, nullsFirst: false })
        .limit(4);
      if (!alive) return;
      setRows((data ?? []) as ProjRow[]);
      setTotal(count ?? (data ?? []).length);
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  return (
    <OverviewCard icon={FolderKanban} title="Active Projects" viewAllLink="/projects" loading={loading}>
      {rows.length === 0 ? (
        <EmptyState text="No active projects yet." />
      ) : (
        <>
          <Metric value={total} label={`active project${total !== 1 ? 's' : ''}`} />
          <ul className="mt-3 space-y-1.5">
            {rows.slice(0, 3).map((p) => (
              <li key={p.id}>
                <Link
                  to={`/projects/${p.id}`}
                  className="flex items-center justify-between gap-2 text-xs hover:text-primary transition-colors"
                >
                  <span className="truncate">{p.name}</span>
                  {p.deadline && (
                    <span className={`shrink-0 ${isPast(p.deadline) ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {shortDate(p.deadline)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </OverviewCard>
  );
}

// ── Tasks ─────────────────────────────────────────────────────────────────────
interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string;
}
function TasksCard({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TaskRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('project_tasks')
        .select('id, title, due_date, status, project_id')
        .eq('assignee_id', userId)
        .in('status', ['todo', 'in_progress', 'blocked'])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(20);
      if (!alive) return;
      setRows((data ?? []) as TaskRow[]);
      setLoading(false);
    })().catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [userId]);

  const overdue = rows.filter((t) => isPast(t.due_date)).length;

  return (
    <OverviewCard icon={ListChecks} title="My Tasks" viewAllLink="/projects" loading={loading}>
      {rows.length === 0 ? (
        <EmptyState text="No open tasks assigned to you." />
      ) : (
        <>
          <Metric value={rows.length} label={`open task${rows.length !== 1 ? 's' : ''}${overdue > 0 ? ` · ${overdue} overdue` : ''}`} />
          <ul className="mt-3 space-y-1.5">
            {rows.slice(0, 3).map((t) => (
              <li key={t.id}>
                <Link
                  to={`/projects/${t.project_id}`}
                  className="flex items-center justify-between gap-2 text-xs hover:text-primary transition-colors"
                >
                  <span className="truncate">{t.title}</span>
                  {t.due_date && (
                    <span className={`shrink-0 ${isPast(t.due_date) ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {shortDate(t.due_date)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </OverviewCard>
  );
}

// ── Inbox ───────────────────────────────────────────────────────────────────
interface ThreadRow {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  unread?: boolean;
}
function InboxCard() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ThreadRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await inboxApi.listThreads({ status: 'open' });
        if (!alive) return;
        const threads = (res?.threads ?? []) as ThreadRow[];
        threads.sort((a, b) => (b.last_message_at || '').localeCompare(a.last_message_at || ''));
        setRows(threads);
      } catch {
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const unread = rows.filter((t) => t.unread).length;

  return (
    <OverviewCard icon={InboxIcon} title="Inbox" viewAllLink="/inbox" loading={loading}>
      {rows.length === 0 ? (
        <EmptyState text="No open conversations." />
      ) : (
        <>
          <Metric
            value={rows.length}
            label={`open conversation${rows.length !== 1 ? 's' : ''}${unread > 0 ? ` · ${unread} unread` : ''}`}
          />
          <ul className="mt-3 space-y-1.5">
            {rows.slice(0, 3).map((t) => (
              <li key={t.id}>
                <Link
                  to="/inbox"
                  className="flex items-center gap-2 text-xs hover:text-primary transition-colors"
                >
                  {t.unread && <CircleDot className="h-3 w-3 shrink-0 text-primary" />}
                  <span className="truncate">{t.subject || 'Conversation'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </OverviewCard>
  );
}

// ── Export ────────────────────────────────────────────────────────────────────
const _MyOverview: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  if (!activeWorkspaceId) return null;

  return (
    <div>
      <h2 className="text-xl font-light tracking-tight mb-4">My Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <FinanceCard workspaceId={activeWorkspaceId} />
        <ProjectsCard workspaceId={activeWorkspaceId} />
        {userId ? (
          <TasksCard userId={userId} />
        ) : (
          <OverviewCard icon={ListChecks} title="My Tasks" viewAllLink="/projects" loading>
            <span />
          </OverviewCard>
        )}
        <InboxCard />
      </div>
    </div>
  );
};
export const MyOverview = React.memo(_MyOverview);
