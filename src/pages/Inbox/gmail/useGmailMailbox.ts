import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { gmailApi, type GmailLabel, type GmailMessage, type GmailThreadRow, type MailAccount } from '@/services/gmailApi';

const ACCOUNT_KEY = 'inbox.gmail.account';
export const SNOOZED_VIEW = '__snoozed';
export const REMINDERS_VIEW = '__reminders';

const CALLBACK_MESSAGES: Record<string, { title: string; description?: string; bad?: boolean }> = {
  connected: { title: 'Gmail connected' },
  denied: { title: 'Gmail was not connected', description: 'Access was declined on the Google screen.', bad: true },
  scope_missing: { title: 'Gmail was not connected', description: 'Tick "Read, compose and send" on the Google screen; without it the Inbox cannot read your mail.', bad: true },
  no_refresh_token: { title: 'Gmail was not connected', description: 'Google did not hand back a lasting grant. Try again.', bad: true },
  invalid_state: { title: 'Gmail was not connected', description: 'The sign-in link expired. Start again from Connect Gmail.', bad: true },
};

export function useGmailMailbox() {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const workspaceId = activeWorkspaceId ?? null;
  const [searchParams, setSearchParams] = useSearchParams();

  const [configured, setConfigured] = useState(true);
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [accountId, setAccountIdState] = useState<string | null>(() => {
    try { return localStorage.getItem(ACCOUNT_KEY); } catch { return null; }
  });
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [labelId, setLabelId] = useState('INBOX');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [threads, setThreads] = useState<GmailThreadRow[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMessages, setOpenMessages] = useState<GmailMessage[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const listSeq = useRef(0);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [assignFilter, setAssignFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null)); }, []);

  const account = useMemo(() => accounts?.find((a) => a.id === accountId) ?? accounts?.[0] ?? null, [accounts, accountId]);

  const setAccountId = useCallback((id: string) => {
    setAccountIdState(id);
    try { localStorage.setItem(ACCOUNT_KEY, id); } catch { return; }
  }, []);

  const loadAccounts = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const r = await gmailApi.status(workspaceId);
      setConfigured(r.configured);
      setAccounts(r.accounts);
    } catch (e) {
      setAccounts([]);
      toast({ title: 'Could not load your mailboxes', description: (e as Error).message, variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  useEffect(() => { void loadAccounts(); }, [loadAccounts]);

  useEffect(() => {
    const result = searchParams.get('gmail');
    if (!result) return;
    const msg = CALLBACK_MESSAGES[result] ?? { title: 'Gmail was not connected', description: `Google returned "${result}".`, bad: true };
    toast({ title: msg.title, description: msg.description, variant: msg.bad ? 'destructive' : undefined });
    setSearchParams((p) => { p.delete('gmail'); return p; }, { replace: true });
    if (result === 'connected') void loadAccounts();
  }, [searchParams, setSearchParams, toast, loadAccounts]);

  const connect = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const { auth_url } = await gmailApi.connect(workspaceId);
      window.location.assign(auth_url);
    } catch (e) {
      toast({ title: 'Could not start the Google sign-in', description: (e as Error).message, variant: 'destructive' });
    }
  }, [workspaceId, toast]);

  const disconnect = useCallback(async (id: string) => {
    try {
      await gmailApi.disconnect(id);
      toast({ title: 'Gmail disconnected' });
      setThreads([]);
      setOpenId(null);
      await loadAccounts();
    } catch (e) {
      toast({ title: 'Could not disconnect', description: (e as Error).message, variant: 'destructive' });
    }
  }, [toast, loadAccounts]);

  const loadLabels = useCallback(async () => {
    if (!account || account.status !== 'active') { setLabels([]); return; }
    try {
      setLabels((await gmailApi.labels(account.id)).labels);
    } catch (e) {
      toast({ title: 'Could not load Gmail labels', description: (e as Error).message, variant: 'destructive' });
    }
  }, [account, toast]);

  useEffect(() => { void loadLabels(); }, [loadLabels]);

  const loadThreads = useCallback(async () => {
    if (!account || account.status !== 'active') { setThreads([]); return; }
    const seq = ++listSeq.current;
    setLoadingList(true);
    setListError(null);
    try {
      const r = labelId === SNOOZED_VIEW && !appliedQuery
        ? await gmailApi.snoozed(account.id)
        : labelId === REMINDERS_VIEW && !appliedQuery
        ? await gmailApi.reminders(account.id)
        : await gmailApi.threads({ account_id: account.id, label_id: appliedQuery ? undefined : labelId, q: appliedQuery || undefined });
      if (seq !== listSeq.current) return;
      setThreads(r.threads);
      setNextPageToken(r.next_page_token);
    } catch (e) {
      if (seq !== listSeq.current) return;
      setThreads([]);
      setListError((e as Error).message);
      if (/reconnect/i.test((e as Error).message)) void loadAccounts();
    } finally {
      if (seq === listSeq.current) setLoadingList(false);
    }
  }, [account, labelId, appliedQuery, loadAccounts]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => {
    const t = setTimeout(() => setAppliedQuery(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const loadMore = useCallback(async () => {
    if (!account || !nextPageToken || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await gmailApi.threads({ account_id: account.id, label_id: appliedQuery ? undefined : labelId, q: appliedQuery || undefined, page_token: nextPageToken });
      setThreads((cur) => [...cur, ...r.threads.filter((t) => !cur.some((c) => c.id === t.id))]);
      setNextPageToken(r.next_page_token);
    } catch (e) {
      toast({ title: 'Could not load more', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoadingMore(false); }
  }, [account, nextPageToken, loadingMore, appliedQuery, labelId, toast]);

  const openThread = useCallback(async (id: string) => {
    if (!account) return;
    setOpenId(id);
    setOpenMessages(null);
    setLoadingThread(true);
    try {
      const r = await gmailApi.thread(account.id, id, true);
      setOpenMessages(r.messages);
      setThreads((cur) => cur.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    } catch (e) {
      toast({ title: 'Could not open the conversation', description: (e as Error).message, variant: 'destructive' });
      setOpenId(null);
    } finally { setLoadingThread(false); }
  }, [account, toast]);

  const modify = useCallback(async (threadId: string, change: { add?: string[]; remove?: string[]; trash?: boolean }, done: string) => {
    if (!account) return;
    try {
      const r = await gmailApi.modify({ account_id: account.id, thread_id: threadId, ...change });
      toast({ title: done, ...(r.detail ? { description: r.detail } : {}) });
      const leavesView = change.trash || (change.remove ?? []).includes(labelId);
      if (leavesView) {
        setThreads((cur) => cur.filter((t) => t.id !== threadId));
        if (openId === threadId) { setOpenId(null); setOpenMessages(null); }
      } else {
        setThreads((cur) => cur.map((t) => (t.id === threadId ? {
          ...t,
          label_ids: [...t.label_ids.filter((l) => !(change.remove ?? []).includes(l)), ...(change.add ?? [])],
          starred: change.add?.includes('STARRED') ? true : change.remove?.includes('STARRED') ? false : t.starred,
          unread: change.add?.includes('UNREAD') ? true : change.remove?.includes('UNREAD') ? false : t.unread,
        } : t)));
      }
      void loadLabels();
    } catch (e) {
      toast({ title: 'Gmail did not accept that', description: (e as Error).message, variant: 'destructive' });
    }
  }, [account, labelId, openId, toast, loadLabels]);

  const patchThread = useCallback((id: string, patch: Partial<GmailThreadRow>) => {
    setThreads((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);
  const dropThread = useCallback((id: string) => {
    setThreads((cur) => cur.filter((t) => t.id !== id));
    if (openId === id) { setOpenId(null); setOpenMessages(null); }
  }, [openId]);

  const assignCounts = useMemo(() => ({
    all: threads.length,
    mine: threads.filter((t) => t.assignee_user_id === myUserId).length,
    unassigned: threads.filter((t) => !t.assignee_user_id).length,
  }), [threads, myUserId]);

  const visibleThreads = useMemo(() => {
    if (!account?.is_shared || assignFilter === 'all') return threads;
    return threads.filter((t) => (assignFilter === 'mine' ? t.assignee_user_id === myUserId : !t.assignee_user_id));
  }, [threads, account, assignFilter, myUserId]);

  return {
    workspaceId, myUserId, reloadAccounts: loadAccounts, assignCounts, assignFilter, setAssignFilter, visibleThreads, patchThread, dropThread, configured, accounts, account, setAccountId, connect, disconnect,
    labels, labelId, setLabelId, query, setQuery, appliedQuery,
    threads, nextPageToken, loadingList, loadingMore, listError, loadThreads, loadMore,
    openId, setOpenId, openMessages, loadingThread, openThread, modify,
  };
}

export type GmailMailboxState = ReturnType<typeof useGmailMailbox>;
