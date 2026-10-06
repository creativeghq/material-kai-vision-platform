import React from 'react';
import { UserPlus, Bot, CheckCircle2, ArchiveRestore, Trash2, Sparkles, Link2 } from 'lucide-react';
import { marketplaceService } from '@/services/marketplaceService';
import { Button } from '@/components/core/ui/button';
import { inboxApi, type InboxThread } from '@/services/inboxApi';
import { askJarvisAboutThreadPrompt } from '../inboxFormat';
import { InboxAgentSettingsButton } from './InboxAgentSettings';
import { LabelAssignButton } from './InboxLabels';
import { FollowUpButton } from './FollowUpButton';
import { AssigneePicker } from './AssigneePicker';
import type { InboxPageState } from '../useInboxPage';


export const ConversationActions: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    toast,
    wsLabels,
    canManageLabels,
    activeThread,
    setActiveThread,
    setShowAdd,
    isMember,
    loadThreads,
    loadLabels,
    openThread,
    archiveActive,
    restoreActive,
    activeThreadLabels,
    myUserId,
  } = s;
  return isMember && activeThread ? (
    <>
      {(activeThread.metadata as any)?.marketplace_inquiry_id && (
        <Button
          variant="default" size="sm"
          title="Accept this surplus inquiry — creates a draft purchase order in the buyer's workspace"
          onClick={async () => {
            try {
              const res = await marketplaceService.acceptInquiry(String((activeThread.metadata as any).marketplace_inquiry_id));
              toast({ title: res.already ? 'Already accepted' : 'Inquiry accepted', description: 'A draft purchase order was created for the buyer.' });
            } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
          }}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Accept inquiry
        </Button>
      )}
      {/* Three settings, cycled in order of how much the assistant is trusted with: nothing,
          draft-for-review, answer-directly. `suggesting` is the one that was documented and never
          built — without it the only way to get help was to open each thread and press Draft. */}
      <Button
        variant={activeThread.agent_state === 'active' ? 'default'
          : activeThread.agent_state === 'suggesting' ? 'secondary' : 'outline'}
        size="icon" className="h-9 w-9"
        title={
          activeThread.agent_state === 'active'
            ? 'The AI answers this conversation directly — click to stop it entirely'
            : activeThread.agent_state === 'suggesting'
              ? 'The AI drafts replies here for you to review — click to let it answer directly'
              : activeThread.agent_state === 'paused'
                ? 'You took over — click to have the AI draft replies for you again'
                : 'Have the AI draft replies here for you to review before sending'
        }
        onClick={async () => {
          const next = activeThread.agent_state === 'suggesting' ? 'active'
            : activeThread.agent_state === 'active' ? 'off' : 'suggesting';
          try {
            await inboxApi.setAgent(activeThread.id, next);
            setActiveThread({ ...activeThread, agent_state: next });
            toast({
              title: next === 'off' ? 'Assistant off for this conversation'
                : next === 'suggesting' ? 'The AI will draft replies here'
                  : 'The AI will answer this conversation directly',
              description: next === 'suggesting'
                ? 'You will find a reply waiting to edit and send. Nothing goes out without you.'
                : next === 'active'
                  ? 'Replies are sent to the customer without review.'
                  : undefined,
            });
          } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
        }}
      >
        <Bot className="w-4 h-4" />
      </Button>
      <InboxAgentSettingsButton workspaceId={activeThread.workspace_id} />
      {/* JARVIS reads the thread itself (manage_inbox action:"read" — transcript + the customer's
          orders, quotes and open invoices), so the prompt names the conversation and nothing
          else. Sent as a real operator turn in the Agent Hub, not as a customer-audience draft. */}
      <Button variant="outline" size="icon" className="h-9 w-9" title="Ask JARVIS about this conversation" asChild>
        <a href={`/agent-hub?agent=kai&prompt=${encodeURIComponent(askJarvisAboutThreadPrompt(activeThread))}`}>
          <Sparkles className="w-4 h-4" />
        </a>
      </Button>
      <LabelAssignButton
        workspaceId={activeThread.workspace_id}
        threadId={activeThread.id}
        labels={wsLabels}
        assigned={activeThreadLabels}
        canManage={canManageLabels}
        onChanged={() => { loadThreads(); loadLabels(); }}
      />
      <FollowUpButton
        thread={activeThread}
        onChanged={() => { void openThread(activeThread.id); loadThreads({ silent: true }); }}
      />
      {activeThread.thread_type !== 'internal' && (
        <Button
          variant="outline" size="icon" className="h-9 w-9"
          title="Copy a private share link for the customer"
          onClick={async () => {
            try {
              const { url } = await inboxApi.createShareLink(activeThread.id);
              await navigator.clipboard.writeText(url);
              toast({ title: 'Share link copied', description: url });
            } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
          }}
        >
          <Link2 className="w-4 h-4" />
        </Button>
      )}
      <AssigneePicker
        threadId={activeThread.id}
        workspaceId={activeThread.workspace_id}
        assignedUserId={activeThread.assigned_user_id}
        myUserId={myUserId}
        onAssigned={(uid) => {
          setActiveThread({ ...activeThread, assigned_user_id: uid });
          void openThread(activeThread.id);
          loadThreads({ silent: true });
        }}
      />
      <Button variant="outline" size="icon" className="h-9 w-9" title="Add a teammate" onClick={() => setShowAdd(true)}>
        <UserPlus className="w-4 h-4" />
      </Button>
      {activeThread.archived_at ? (
        <Button variant="outline" size="sm" title="Restore this conversation" onClick={restoreActive}>
          <ArchiveRestore className="w-4 h-4 mr-1.5" /> Restore
        </Button>
      ) : (
        <Button
          variant="outline" size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          title="Delete — moves to Archived for 30 days, then permanently removed"
          onClick={archiveActive}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
      <select
        className="bg-card border border-hairline rounded-sm px-3 py-1.5 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-ring"
        value={activeThread.status}
        onChange={async (e) => {
          const status = e.target.value as InboxThread['status'];
          await inboxApi.setStatus(activeThread.id, status).catch((err) => toast({ title: 'Failed', description: (err as Error).message, variant: 'destructive' }));
          setActiveThread({ ...activeThread, status });
        }}
      >
        {/* The words the TABS use, because they are the same three values and a control that
            names them differently from the thing you filter by is two vocabularies for one
            enum. "Snoozed" also promised something that did not exist until follow-ups had a
            date: a thread that comes back on its own. */}
        <option value="open">Open</option>
        <option value="snoozed">Follow-up</option>
        <option value="closed">Done</option>
      </select>
    </>
  ) : null;
};
