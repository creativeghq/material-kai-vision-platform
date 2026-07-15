/**
 * ConversationManagerModal — the Agent Studio conversation manager (issue #253).
 *
 * Replaces the persistent left `w-72` conversation sidebar + the mobile Sheet
 * drawer with a single ⌘K modal: pinned group, date-grouped history, search,
 * inline rename, pin/unpin, delete, and per-conversation toolkit (module) tags.
 *
 * Persistence is delegated to the parent (which owns the `conversations` state
 * and refetch) so this component stays presentational.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  MessageSquare,
  Pencil,
  Trash2,
  Pin,
  PinOff,
  Layers,
  Check,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import type { ChatConversation } from '@/services/agents/agentChatHistoryService';
import { TOOLKITS, ALWAYS_ON_TOOLKIT_IDS } from './agentToolsCatalog';

interface ConversationManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: ChatConversation[];
  currentConversationId: string | null;
  agentName?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}

type Group = { key: string; label: string; items: ChatConversation[] };

const startOfToday = (): number => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

const dateGroup = (iso: string): { order: number; label: string } => {
  const t = new Date(iso).getTime();
  const s = startOfToday();
  if (t >= s) return { order: 1, label: 'Today' };
  if (t >= s - 86_400_000) return { order: 2, label: 'Yesterday' };
  if (t >= s - 7 * 86_400_000) return { order: 3, label: 'Previous 7 days' };
  return { order: 4, label: 'Older' };
};

const ConversationTags: React.FC<{ toolkits: string[] }> = ({ toolkits }) => {
  const relevant = (toolkits || []).filter((id) => !ALWAYS_ON_TOOLKIT_IDS.includes(id));
  if (relevant.length === 0) return null;
  const shown = relevant.slice(0, 3);
  const extra = relevant.length - shown.length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {shown.map((id) => {
        const tk = TOOLKITS.find((t) => t.id === id);
        if (!tk) return null;
        return (
          <span
            key={id}
            className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-1.5 py-px text-[10px] leading-relaxed text-primary"
            title={tk.name}
          >
            <Layers className="h-2.5 w-2.5" /> {tk.name}
          </span>
        );
      })}
      {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
    </div>
  );
};

export const ConversationManagerModal: React.FC<ConversationManagerModalProps> = ({
  open,
  onOpenChange,
  conversations,
  currentConversationId,
  agentName,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onTogglePin,
}) => {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Reset transient state whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setQuery('');
      setEditingId(null);
    }
  }, [open]);

  const groups = useMemo<Group[]>(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? conversations.filter((c) => c.title.toLowerCase().includes(q))
      : conversations;

    const pinned = filtered.filter((c) => c.pinnedAt);
    const rest = filtered.filter((c) => !c.pinnedAt);

    const byDate = new Map<number, Group>();
    for (const c of rest) {
      const g = dateGroup(c.lastMessageAt);
      if (!byDate.has(g.order)) byDate.set(g.order, { key: `d${g.order}`, label: g.label, items: [] });
      byDate.get(g.order)!.items.push(c);
    }

    const out: Group[] = [];
    if (pinned.length) out.push({ key: 'pinned', label: 'Pinned', items: pinned });
    for (const order of [1, 2, 3, 4]) {
      const g = byDate.get(order);
      if (g) out.push(g);
    }
    return out;
  }, [conversations, query]);

  const total = conversations.length;

  const startRename = useCallback((c: ChatConversation) => {
    setEditingId(c.id);
    setEditingTitle(c.title);
  }, []);

  const commitRename = useCallback(
    (id: string) => {
      const next = editingTitle.trim();
      if (next) onRename(id, next);
      setEditingId(null);
    },
    [editingTitle, onRename],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="flex flex-row items-center gap-4 space-y-0 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg tracking-tight">Conversations</DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {agentName ? `${agentName} · ` : ''}
              {total} {total === 1 ? 'conversation' : 'conversations'}
            </p>
          </div>
          <div className="ml-auto mr-8 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations…"
              className="w-40 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-56"
            />
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] min-h-[240px] overflow-y-auto p-2 custom-scrollbar">
          {groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                {query ? 'No conversations match your search.' : 'No conversations yet.'}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className="mb-1">
                <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </div>
                {group.items.map((c) => {
                  const active = currentConversationId === c.id;
                  const editing = editingId === c.id;
                  return (
                    <div
                      key={c.id}
                      onClick={() => {
                        if (editing) return;
                        onSelect(c.id);
                        onOpenChange(false);
                      }}
                      className={cn(
                        'group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors',
                        active ? 'bg-primary/10' : 'hover:bg-muted/60',
                      )}
                    >
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                          active
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border/60 bg-muted/50 text-muted-foreground',
                        )}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        {editing ? (
                          <input
                            autoFocus
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => commitRename(c.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(c.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="w-full rounded-md border border-primary/40 bg-background px-1.5 py-0.5 text-sm font-medium outline-none focus:ring-1 focus:ring-primary"
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {c.pinnedAt && <Pin className="h-3 w-3 shrink-0 text-primary" />}
                            <span className="truncate text-sm font-medium">{c.title}</span>
                          </div>
                        )}
                        <div className="truncate text-xs text-muted-foreground">
                          {c.messageCount} {c.messageCount === 1 ? 'message' : 'messages'} ·{' '}
                          {new Date(c.lastMessageAt).toLocaleDateString()}
                        </div>
                        <ConversationTags toolkits={c.toolkits} />
                      </div>

                      {editing ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            commitRename(c.id);
                          }}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Save"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      ) : (
                        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTogglePin(c.id, !c.pinnedAt);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={c.pinnedAt ? 'Unpin' : 'Pin'}
                          >
                            {c.pinnedAt ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRename(c);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Rename"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(c.id);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">⌘K</kbd>{' '}
            to open ·{' '}
            <kbd className="rounded border border-border/60 bg-muted/50 px-1.5 py-0.5 font-mono text-[11px]">Esc</kbd>{' '}
            to close
          </span>
          <Button
            onClick={() => {
              onNew();
              onOpenChange(false);
            }}
            className="ml-auto gap-2 rounded-full"
          >
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConversationManagerModal;
