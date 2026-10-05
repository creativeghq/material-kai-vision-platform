import React, { useMemo, useState } from 'react';
import { Loader2, UserPlus, Phone, Building2, Hash, ChevronRight, User as UserIcon, MessagesSquare, ExternalLink, Briefcase } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { formatDate } from '@/utils/datetime';
import { IdentifyBusinessDialog } from '@/components/business/crm/IdentifyBusinessDialog';
import { inboxApi, type InboxThread, type InboxMessage, type InboxThreadContext } from '@/services/inboxApi';
import { avatarTint } from '../inboxFormat';
import { SectionTitle, ThreadAvatar } from './InboxPrimitives';
import { PromoteThreadDialog } from './PromoteThreadDialog';

export const ChannelIdentityPanel: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  messages: InboxMessage[];
  isMember: boolean;
  /** Re-read the thread context after a contact is filed, so the Profile tab fills in. */
  onContactLinked?: () => void;
}> = ({ thread, context, messages, isMember, onContactLinked }) => {
  const meta = (thread.metadata || {}) as Record<string, unknown>;
  const phone = String(meta.contact_phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  const contact = context?.contact ?? null;
  const isWhatsApp = thread.channel === 'whatsapp';
  const { toast } = useToast();

  // What WhatsApp itself reports about them, fetched by the webhook onto the thread. A business
  // account publishes a great deal — trading name, category, description, address, email, site,
  // opening hours, logo — and none of it used to reach this panel.
  const wa = (meta.wa_profile ?? null) as Record<string, unknown> | null;
  const waChecked = typeof meta.wa_profile_checked_at === 'string';
  const waStr = (k: string): string | null => (typeof wa?.[k] === 'string' && wa[k] ? String(wa[k]) : null);
  const waSites = Array.isArray(wa?.websites) ? (wa.websites as unknown[]).filter((w): w is string => typeof w === 'string') : [];

  // The picture itself is resolved by ThreadAvatar — one signer for all five places the inbox
  // draws this face, rather than a bespoke effect here and initials everywhere else.

  const [linking, setLinking] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const company = context?.company ?? null;

  // What THEY said, oldest first — the strongest identification signal we have, because WhatsApp
  // publishes a display name and nothing else. Incoming only: 43% of stored messages are ours,
  // and including them fences our own words as the counterparty's and hands the research OUR
  // domain as its best lead.
  const transcript = messages
    .filter((m) => ((m.metadata as Record<string, unknown> | undefined)?.direction) === 'incoming'
      && typeof m.body === 'string' && m.body.trim())
    .slice(-25)
    .map((m) => m.body as string)
    .join('\n');

  const addToCrm = async () => {
    setLinking(true);
    try {
      const r = await inboxApi.createContactFromThread(thread.id);
      toast({
        title: r.created ? 'Added to CRM' : 'Already in the CRM',
        description: r.created
          ? 'The conversation is now linked to that contact.'
          : 'This number was already on file — the conversation is linked to it.',
      });
      onContactLinked?.();
    } catch (e) {
      toast({ title: 'Could not add to CRM', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  };

  // The name WhatsApp itself reports, which is NOT the CRM name and is worth showing separately:
  // the CRM row is ours to edit and drifts, this is what the person calls themselves on WhatsApp.
  const waName = (thread.subject || '').trim();
  const waNameIsJustTheNumber = !waName || waName.replace(/\D/g, '') === digits;

  // A CRM row auto-created from the phone number and never named. It is not a customer record,
  // it is a placeholder, and showing it as though somebody filed it is how the CRM fills up with
  // 8 contacts called by their own phone number.
  const crmIsPlaceholder = !!contact
    && (!contact.name || contact.name.replace(/\D/g, '') === digits)
    && !contact.email;

  // Last INBOUND customer message — the clock Meta runs. Free-form replies are refused outside
  // 24 hours of it, which is why all 22 auto-replies to imported history failed delivery.
  const lastInbound = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const dir = (m.metadata as Record<string, unknown> | null)?.direction;
      if (m.message_type === 'text' && dir === 'incoming') return m.created_at;
    }
    return null;
  }, [messages]);

  const windowState = useMemo(() => {
    if (!lastInbound) return null;
    const hrs = (Date.now() - new Date(lastInbound).getTime()) / 3_600_000;
    if (hrs >= 24) return { open: false, label: 'Closed', detail: 'Only an approved template can be sent.' };
    const left = 24 - hrs;
    return {
      open: true,
      label: left >= 1 ? `${Math.floor(left)}h left` : `${Math.max(1, Math.round(left * 60))}m left`,
      detail: 'You can reply freely until it closes.',
    };
  }, [lastInbound]);

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-hairline px-4 py-4 flex items-start gap-3">
        <ThreadAvatar
          thread={thread}
          name={waNameIsJustTheNumber ? (phone || '?') : waName}
          className="h-12 w-12 shrink-0 rounded-sm"
          fallbackClassName={`text-sm rounded-sm ${avatarTint(waName || phone)}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">
            {waStr('name') || (waNameIsJustTheNumber ? (phone || 'Unknown number') : waName)}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {isWhatsApp ? 'WhatsApp' : 'Social'} · {phone || 'no number on file'}
          </div>
          {(waStr('category') || wa?.is_business === true) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {wa?.is_business === true && (
                <Badge variant="info" className="text-[10px]"><Building2 className="w-2.5 h-2.5" />Business</Badge>
              )}
              {waStr('category') && <span className="text-[11px] text-muted-foreground">{waStr('category')}</span>}
            </div>
          )}
          {isWhatsApp && phone && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                {/* wa.me, not our relay: this opens the chat on the operator's OWN phone, which is
                    the point of a coexistence number — some conversations are handled there. */}
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />Open in WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <a href={`tel:${phone}`}><Phone className="w-3 h-3 mr-1" />Call</a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* The 24-hour service window. It decides whether the composer below will actually deliver,
          and until now nothing in the UI said so — a message typed outside it is accepted, gets a
          message id, and is refused by Meta a second later. */}
      {isWhatsApp && windowState && (
        <div className="p-5 border-b border-hairline space-y-2.5">
          <SectionTitle icon={<MessagesSquare className="h-4 w-4" />}>Service window</SectionTitle>
          <Row label="Free-form replies">
            <Badge variant={windowState.open ? 'success' : 'warning'} className="text-[10px]">
              {windowState.label}
            </Badge>
          </Row>
          <p className="text-[11px] text-muted-foreground">
            {windowState.detail} WhatsApp allows free replies for 24 hours after the customer’s last
            message; after that Meta accepts the send and then fails delivery.
          </p>
        </div>
      )}

      {/* The business card WhatsApp publishes. Only rendered for what it actually returned — an
          empty row here would read as "this business has no address", not as "not provided". */}
      {isWhatsApp && (
        <div className="p-5 border-b border-hairline space-y-2.5">
          <SectionTitle icon={<UserIcon className="h-4 w-4" />}>WhatsApp profile</SectionTitle>
          <Row label="Number"><span className="tabular-nums">{phone || '—'}</span></Row>
          {waStr('name') && <Row label="Name"><span className="truncate">{waStr('name')}</span></Row>}
          {waStr('about') && <Row label="About"><span className="text-right">{waStr('about')}</span></Row>}
          {waStr('description') && (
            <Row label="Description"><span className="text-right">{waStr('description')}</span></Row>
          )}
          {waStr('address') && <Row label="Address"><span className="text-right">{waStr('address')}</span></Row>}
          {waStr('hours') && <Row label="Hours"><span className="text-right">{waStr('hours')}</span></Row>}
          {waStr('email') && (
            <Row label="Email">
              <a href={`mailto:${waStr('email')}`} className="text-primary hover:underline truncate">{waStr('email')}</a>
            </Row>
          )}
          {waSites.map((site) => (
            <Row key={site} label="Website">
              <a href={site} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">
                {site.replace(/^https?:\/\//, '')}
              </a>
            </Row>
          ))}
          {!wa && (
            <p className="text-[11px] text-muted-foreground">
              {waChecked
                ? 'WhatsApp returned no profile for this number. Personal accounts publish far less than business ones.'
                : 'Not fetched yet — it is read when the next message arrives on this conversation.'}
            </p>
          )}
        </div>
      )}

      {/* Where it came in. Matters the moment there is more than one number, and it is the first
          thing support asks for. */}
      <div className="p-5 border-b border-hairline space-y-2.5">
        <SectionTitle icon={<Hash className="h-4 w-4" />}>Connection</SectionTitle>
        <Row label="Messages">{messages.length}</Row>
        {lastInbound && (
          <Row label="Last from them"><span className="tabular-nums">{formatDate(lastInbound)}</span></Row>
        )}
        {isMember && !!meta.zernio_conversation_id && (
          <Row label="Conversation id">
            <span className="text-[11px] font-mono text-muted-foreground break-all">
              {String(meta.zernio_conversation_id)}
            </span>
          </Row>
        )}
      </div>

      {/* CRM. The action the user asked for, and it is deliberately phrased by STATE: a contact
          auto-created from a phone number is not "linked", it is unfiled, and offering "View in
          CRM" for it sends someone to a record with nothing in it. */}
      <div className="p-5 space-y-2.5">
        <SectionTitle icon={<UserPlus className="h-4 w-4" />}>CRM</SectionTitle>
        {/* The counterparty on a trade channel is usually a COMPANY, and filing them as a person
            named after their WhatsApp handle loses the one fact worth keeping. Offered whether or
            not a contact exists: a person already on file still works somewhere. */}
        {isMember && !company && (
          <>
            <Button size="sm" variant="secondary" className="w-full" onClick={() => setIdentifying(true)}>
              <Building2 className="w-3.5 h-3.5 mr-1.5" />
              Find the business
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Searches the web from their name{phone ? ', number' : ''} and what they have written here,
              then shows you what it found before anything is filed.
            </p>
          </>
        )}
        {company && (
          <Row label="Business">
            <a href={`/crm/companies/${company.id}`} className="truncate hover:underline">
              {company.name || '—'}
            </a>
          </Row>
        )}
        {!contact && (
          <>
            <p className="text-xs text-muted-foreground">
              Nobody in the CRM is linked to this conversation. Nothing is filed automatically —
              a message arriving is not a decision to keep someone's details.
            </p>
            {/* A real action, not a link out. It checks the number against the CRM first and links
                an existing record rather than making a second one — which is the entire reason
                this moved behind a button. */}
            {isMember && (
              <Button size="sm" variant="secondary" className="w-full" disabled={linking} onClick={addToCrm}>
                {linking
                  ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  : <UserPlus className="w-3.5 h-3.5 mr-1.5" />}
                Add {waStr('name') || (waNameIsJustTheNumber ? 'this number' : waName)} to CRM
              </Button>
            )}
            {/* Filing the person is the smaller half. This is the one that puts the conversation
                in the pipeline, and it files the contact on the way past. */}
            {isMember && (
              <Button size="sm" className="w-full" onClick={() => setPromoting(true)}>
                <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                Open a deal from this
              </Button>
            )}
            {wa && (
              <p className="text-[11px] text-muted-foreground">
                Their WhatsApp name{waStr('email') ? ', email' : ''}{waSites.length ? ' and website' : ''}{' '}
                will be filled in from the profile above.
              </p>
            )}
          </>
        )}
        {contact && crmIsPlaceholder && (
          <>
            <p className="text-xs text-muted-foreground">
              This contact has only a number on it — no name, no email. It will read as
              “{contact.name}” everywhere in the CRM until somebody fills it in.
            </p>
            <Button asChild size="sm" variant="secondary" className="w-full">
              <a href={`/crm/contacts/${contact.id}`}>
                <UserIcon className="w-3.5 h-3.5 mr-1.5" />Complete this contact
              </a>
            </Button>
          </>
        )}
        {contact && !crmIsPlaceholder && (
          <>
            <Row label="Contact"><span className="truncate">{contact.name || '—'}</span></Row>
            {contact.email && <Row label="Email"><span className="truncate">{contact.email}</span></Row>}
            {isMember && (
              <Button size="sm" className="w-full mt-1" onClick={() => setPromoting(true)}>
                <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                Open a deal from this
              </Button>
            )}
            <Button asChild size="sm" variant="outline" className="w-full mt-1">
              <a href={`/crm/contacts/${contact.id}`}>
                <ChevronRight className="w-3.5 h-3.5 mr-1.5" />Open in CRM
              </a>
            </Button>
          </>
        )}
      </div>
      <PromoteThreadDialog
        thread={thread}
        open={promoting}
        onOpenChange={setPromoting}
        hasContact={!!contact}
        suggestedContactName={waStr('name') || (waNameIsJustTheNumber ? '' : waName)}
        onDone={onContactLinked}
      />
      {identifying && (
        <IdentifyBusinessDialog
          open={identifying}
          onOpenChange={setIdentifying}
          workspaceId={thread.workspace_id}
          threadId={thread.id}
          displayName={waStr('name') || waName || phone}
          phone={phone || null}
          transcript={transcript}
          onLinked={() => onContactLinked?.()}
        />
      )}
    </div>
  );
};
