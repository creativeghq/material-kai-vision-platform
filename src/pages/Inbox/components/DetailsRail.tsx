import React, { useState } from 'react';
import { MessageSquare, Bot, Mail, Phone, Building2, MapPin, FileText, FolderKanban, Tag, Users, Globe, Hash, ChevronRight, BadgeCheck, User as UserIcon, MessagesSquare, Wallet, ShoppingCart } from 'lucide-react';
import { castSeedForSender } from '@/utils/characterAvatar';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { Separator } from '@/components/core/ui/separator';
import { inboxHireOrder, inboxRequestedServices, inboxThreadSource } from '../inboxSource';
import { formatDate } from '@/utils/datetime';
import type { InboxThread, InboxMessage, InboxParticipant, InboxThreadContext } from '@/services/inboxApi';
import { avatarTint, castAvatarSrc, initials, money } from '../inboxFormat';
import { ParticipantLabel, Row, SectionTitle, SourceTag, ThreadAvatar } from './InboxPrimitives';
import { KitchenEstimatePanel, OrderIntakePanel } from './OrderIntakePanel';
import { ConversationMoodPanel } from './ConversationMoodPanel';
import { ChannelIdentityPanel } from './ChannelIdentityPanel';

export const DetailsRail: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  participants: InboxParticipant[];
  labels: Map<string, ParticipantLabel>;
  isMember: boolean;
  messages?: InboxMessage[];
  onIntakeChanged?: () => void;
}> = ({ thread, context, participants, labels, isMember, messages = [], onIntakeChanged }) => {
  // A channel tab only where there IS a channel identity distinct from the CRM one. An internal
  // or email thread has nothing to put in it, and an empty tab is worse than no tab.
  const hasChannelIdentity = thread.channel === 'whatsapp' || thread.channel === 'social';
  const [tab, setTab] = useState<'profile' | 'channel' | 'mood'>('profile');
  const contact = context?.contact ?? null;
  const company = context?.company ?? null;
  const quotes = context?.quotes ?? [];
  const projects = context?.projects ?? [];
  const displayName = contact?.name || thread.subject || 'Conversation';
  const quotedTotal = quotes.reduce((s, q) => s + (q.grand_total || 0), 0);
  const subtitle = [contact?.position, company?.name].filter(Boolean).join(' · ');
  const metrics = context?.metrics ?? null;
  const invoices = context?.invoices ?? [];
  const orders = context?.orders ?? [];
  const requestedServices = inboxRequestedServices(thread);
  const hireOrder = inboxHireOrder(thread);

  // Information block: who's handling it + status (real data, no fabricated priority/response-rate).
  const agentActive = thread.agent_state === 'active';
  const firstMember = participants.find((p) => p.participant_type === 'member' && p.status === 'active');
  const assignee = agentActive ? 'AI Assistant' : (firstMember ? (labels.get(firstMember.id)?.label || 'Team') : 'Unassigned');
  const statusLabel = thread.status === 'snoozed' ? 'Follow-up' : thread.status === 'closed' ? 'Done' : 'Open';
  void subtitle;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-hairline bg-surface-sunken flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold">Customer profile</span>
      </div>
      {/* Underline tabs, per the design system — a filled pill here would carry the silhouette of
          a primary button on a panel whose only real action lives further down. */}
      {/* Mood is offered on EVERY thread, not just the channel ones — an email or an internal
          thread has a temperature too, and the reader is the same person. */}
      <div className="px-4 border-b border-hairline shrink-0">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'profile' | 'channel' | 'mood')}>
          <TabsList className="h-auto bg-transparent p-0 gap-4">
            <TabsTrigger value="profile" className="px-0 text-xs">Profile</TabsTrigger>
            {hasChannelIdentity && (
              <TabsTrigger value="channel" className="px-0 text-xs">
                {thread.channel === 'whatsapp' ? 'WhatsApp' : 'Social'}
              </TabsTrigger>
            )}
            <TabsTrigger value="mood" className="px-0 text-xs">Mood</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {hasChannelIdentity && tab === 'channel' && (
        <ChannelIdentityPanel
          thread={thread} context={context} messages={messages} isMember={isMember}
          // Filing a contact fills the Profile tab in, so re-read the thread rather than
          // leaving the other tab showing "nobody linked" until the next refresh.
          onContactLinked={() => onIntakeChanged?.()}
        />
      )}
      {tab === 'mood' && <ConversationMoodPanel thread={thread} isMember={isMember} />}
      {tab === 'profile' && (
    <div className="flex-1 overflow-y-auto">
      {/*
        Identity block. It used to open with a gradient cover banner and a gradient avatar
        floating on a coloured shadow — the marketing language, on the panel whose job is
        showing someone's phone number and what they owe. Flat, left-aligned and readable:
        the reader is scanning for a fact, not admiring a header.
      */}
      <div className="border-b border-hairline px-4 py-4 flex items-start gap-3">
        <ThreadAvatar
          thread={thread}
          name={displayName}
          className="h-12 w-12 shrink-0 rounded-sm"
          fallbackClassName={`text-sm rounded-sm ${avatarTint(displayName)}`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{displayName}</div>
          {contact?.position && <div className="text-xs text-muted-foreground truncate">{contact.position}</div>}
          {company?.name && (
            <div className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground min-w-0">
              <Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{company.name}</span>
            </div>
          )}
          {(contact?.city || contact?.country) && (
            <div className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />{[contact?.city, contact?.country].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {contact?.is_client && <Badge variant="success" className="text-[10px]"><BadgeCheck className="w-3 h-3" />Client</Badge>}
            {contact?.lead_status && <Badge variant="neutral" className="text-[10px] capitalize">{contact.lead_status}</Badge>}
          </div>
          {/* The two things you actually do from a contact card, per the reference layouts.
              Rendered only when there is something to act on — a dead mailto: button is
              worse than no button. */}
          {(contact?.email || contact?.phone || contact?.mobile) && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {contact?.email && (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <a href={`mailto:${contact.email}`}><Mail className="w-3 h-3 mr-1" />Email</a>
                </Button>
              )}
              {(contact?.phone || contact?.mobile) && (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <a href={`tel:${contact.phone || contact.mobile}`}><Phone className="w-3 h-3 mr-1" />Call</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Information — status + who's handling it */}
      <div className="p-5 border-b border-hairline space-y-2.5">
        <SectionTitle icon={<Hash className="h-4 w-4" />}>Information</SectionTitle>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline" className="text-[10px]">{statusLabel}</Badge>
        </div>
        <div className="flex items-center justify-between text-sm gap-2">
          <span className="text-muted-foreground shrink-0">Handled by</span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            {agentActive && <Bot className="w-3.5 h-3.5 text-primary shrink-0" />}
            <span className="truncate">{assignee}</span>
          </span>
        </div>
      </div>

      {/* Order intake (#342) — above Customer value, because an order waiting for approval is the
          most actionable thing on the thread. Renders nothing unless a proposal exists, and is
          members-only (inbox-api 404s the action for a customer participant). */}
      {isMember && <OrderIntakePanel thread={thread} context={context} onChanged={() => onIntakeChanged?.()} />}

      {/* Kitchen estimate from the public calculator — same placement rationale as order intake:
          an enquiry waiting to be turned into a plan is the most actionable thing on the thread. */}
      {isMember && <KitchenEstimatePanel thread={thread} />}

      {/* Customer value — lifetime value + open balance from the customer's invoices
          (via inbox-api). Falls back to quoted-total + project-count on older API
          responses / internal threads where finance metrics aren't returned. */}
      {(metrics || quotes.length > 0 || projects.length > 0) && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<Wallet className="h-4 w-4" />}>Customer value</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            {/* tabular-nums, not the display serif: these are money, and two figures side by
                side have to line up on the decimal to be comparable at a glance. */}
            <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
              <div className="text-lg font-semibold tabular-nums">
                {money(metrics ? metrics.lifetime_value : quotedTotal, metrics?.currency || quotes[0]?.currency)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Lifetime' : `Quoted · ${quotes.length}`}</div>
            </div>
            <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
              <div className={`text-lg font-semibold tabular-nums ${metrics && metrics.open_balance > 0 ? 'text-warning' : ''}`}>
                {metrics ? money(metrics.open_balance, metrics.currency) : projects.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Open balance' : `Project${projects.length === 1 ? '' : 's'}`}</div>
            </div>
          </div>
        </div>
      )}

      {/* Open invoices — the customer's unpaid invoices, soonest-due first. */}
      {invoices.length > 0 && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<FileText className="h-4 w-4" />} count={metrics?.open_count}>Open invoices</SectionTitle>
          <div className="space-y-0.5">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{inv.number || 'Invoice'}</div>
                  {inv.due_at && <div className="text-[11px] text-muted-foreground">Due {formatDate(inv.due_at)}</div>}
                </div>
                <span className="text-xs shrink-0 text-warning" style={{ fontWeight: 600 }}>{money(inv.amount_due, inv.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {contact ? (
        <>
          {/* Contact details */}
          <div className="p-5 space-y-2.5 border-b border-hairline">
            <SectionTitle icon={<UserIcon className="h-4 w-4" />}>Contact</SectionTitle>
            {contact.email && <Row icon={<Mail className="w-3.5 h-3.5" />}><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></Row>}
            {(contact.phone || contact.mobile) && <Row icon={<Phone className="w-3.5 h-3.5" />}>{contact.phone || contact.mobile}</Row>}
            {(contact.city || contact.country) && <Row icon={<MapPin className="w-3.5 h-3.5" />}>{[contact.city, contact.country].filter(Boolean).join(', ')}</Row>}
            {contact.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {contact.vat_number}</Row>}
            {contact.lead_source && <Row icon={<Tag className="w-3.5 h-3.5" />}><span className="capitalize">{contact.lead_source}</span></Row>}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {contact.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
            )}
          </div>

          {/* Company */}
          {company && (
            <div className="p-5 space-y-2.5 border-b border-hairline">
              <SectionTitle icon={<Building2 className="h-4 w-4" />}>Company</SectionTitle>
              <Row icon={<Building2 className="w-3.5 h-3.5" />}><span className="font-medium">{company.name}</span></Row>
              {company.industry && <Row icon={<Tag className="w-3.5 h-3.5" />}>{company.industry}</Row>}
              {company.website && <Row icon={<Globe className="w-3.5 h-3.5" />}><a href={company.website} target="_blank" rel="noreferrer" className="hover:underline truncate">{company.website}</a></Row>}
              {company.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {company.vat_number}</Row>}
            </div>
          )}

          {/* Orders — the customer's sales orders, newest first. Status is the order's; payment
              and what is still owed come from the ledger derivation, never a cached column. */}
          <div className="p-5 border-b border-hairline">
            <SectionTitle icon={<ShoppingCart className="h-4 w-4" />} count={orders.length}>Orders</SectionTitle>
            {orders.length === 0 ? (
              <div className="text-xs text-muted-foreground">Nothing ordered so far. An order approved from this conversation shows here.</div>
            ) : (
              <div className="space-y-0.5">
                {orders.map((o) => (
                  <a key={o.id} href={`/finance/orders/${o.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                    <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{o.order_number || 'Order'}</span>
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {formatDate(o.created_at)}
                        {o.payment_status ? ` · ${o.payment_status.replace(/_/g, ' ')}` : ''}
                        {o.outstanding != null && o.outstanding > 0 ? ` · owes ${money(o.outstanding, o.currency)}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">{money(o.total, o.currency)}</span>
                    {o.status && <span className={`text-[10px] capitalize shrink-0 ${statusTone(o.status)}`}>{o.status.replace(/_/g, ' ')}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Quotes */}
          <div className="p-5 border-b border-hairline">
            <SectionTitle icon={<FileText className="h-4 w-4" />} count={quotes.length}>Quotes</SectionTitle>
            {quotes.length === 0 ? (
              <div className="text-xs text-muted-foreground">No quotes for this contact yet.</div>
            ) : (
              <div className="space-y-0.5">
                {quotes.map((q) => (
                  <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{q.quote_number || q.name || 'Quote'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{money(q.grand_total, q.currency)}</span>
                    {q.status && <span className={`text-[10px] capitalize shrink-0 ${statusTone(q.status)}`}>{q.status}</span>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="p-5">
            <SectionTitle icon={<FolderKanban className="h-4 w-4" />} count={projects.length}>Projects</SectionTitle>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">No projects for this contact yet.</div>
            ) : (
              <div className="space-y-0.5">
                {projects.map((p) => (
                  <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                    <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{p.name || 'Project'}</span>
                    {p.status && <span className={`text-[10px] capitalize shrink-0 ${statusTone(p.status)}`}>{p.status}</span>}
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Internal thread (or no linked contact): show participants + thread meta. */
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<Users className="h-4 w-4" />} count={participants.filter((p) => p.status === 'active').length}>Participants</SectionTitle>
          <div className="space-y-1.5">
            {participants.filter((p) => p.status === 'active').map((p) => {
              const info = labels.get(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar className="h-7 w-7">
                    {p.participant_type !== 'agent' && (
                      <AvatarImage
                        src={info?.avatarUrl || castAvatarSrc(castSeedForSender({ sender_participant_id: p.id }, info?.label), info?.avatarSlot)}
                        alt={info?.label ?? ''}
                        className="object-cover"
                      />
                    )}
                    <AvatarFallback className={`text-[10px] ${avatarTint(info?.label)}`}>{initials(info?.label)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 min-w-0 truncate">{info?.label || 'Participant'}</span>
                  {p.thread_role === 'owner' && <span className="text-[10px] text-muted-foreground capitalize">owner</span>}
                  {p.participant_type === 'agent' && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">AI</Badge>}
                </div>
              );
            })}
          </div>
          {isMember && (
            <p className="text-[11px] text-muted-foreground pt-3">
              This is an internal team conversation. Customers can't see it.
            </p>
          )}
        </div>
      )}

      {/* Conversation meta — always shown at the bottom */}
      <Separator className="bg-hairline" />
      <div className="p-5 space-y-2.5">
        <SectionTitle icon={<MessageSquare className="h-4 w-4" />}>Conversation</SectionTitle>
        {/* SOURCE is the door it came through; CHANNEL is the transport a reply goes out on.
            Both are printed because they are different questions and a public-profile enquiry
            answers them differently — it arrived from a profile page and replies by email. */}
        <div className="flex items-start gap-2.5 text-sm">
          <span className="text-muted-foreground mt-0.5 shrink-0"><MessagesSquare className="w-3.5 h-3.5" /></span>
          <span className="flex items-center gap-1.5 flex-wrap min-w-0">
            <SourceTag source={inboxThreadSource(thread)} />
            <span className="text-xs text-muted-foreground">replies by <span className="capitalize">{thread.channel}</span></span>
          </span>
        </div>
        <Row icon={<Hash className="w-3.5 h-3.5" />}><span className="capitalize">{thread.status}</span></Row>
        {/* A priced hire opened a sales order with a draft pre-invoice; the same pay link the
            visitor got, so the member can hand it over again instead of asking Finance. */}
        {hireOrder && (
          <Row icon={<FileText className="w-3.5 h-3.5" />}>
            <span>
              Order {hireOrder.internal_number} · <span className="tabular-nums">{money(hireOrder.total, hireOrder.currency)}</span> ·{' '}
              <a href={`/pay/${hireOrder.pay_token}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pay link</a>
            </span>
          </Row>
        )}
        {/* The one thing a public-profile enquiry carries that no channel does: which services
            the visitor ticked. It used to be the only reason the separate profile inbox existed. */}
        {requestedServices.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="text-[11px] text-muted-foreground">Asked about</div>
            <div className="flex flex-wrap gap-1">
              {requestedServices.map((s) => (
                <Badge key={s} variant="neutral" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground pt-0.5">Started {formatDate(thread.created_at, { withTime: true })}</div>
      </div>
    </div>
      )}
    </div>
  );
};
