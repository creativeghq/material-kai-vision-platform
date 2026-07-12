/**
 * FlowFormModal — inline modal triggered by the agent's `flow_form_open` chunk (#256).
 * Lets a workspace owner assemble a simple automation (one trigger + one action) without
 * learning the flow schema, then submits it as a follow-up agent message that re-invokes
 * the `manage_flows` tool with `action: "create"` and concrete fields.
 *
 * Mirrors JobSitesFormModal's round-trip: the modal does NOT write to the DB directly — it
 * composes a structured prose message the agent re-parses, so the create still runs through
 * the workspace-scoped, allowlist-enforcing create_simple_flow RPC.
 */

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';

// Curated tenant-safe vocabulary — mirrors create_simple_flow's server-side allowlist.
const TRIGGERS: { value: string; label: string; hint: string }[] = [
  { value: 'invoice_paid', label: 'Invoice paid', hint: 'When a customer invoice is marked paid' },
  { value: 'payment_received', label: 'Payment received', hint: 'When a payment is recorded' },
  { value: 'quote_approved', label: 'Quote approved', hint: 'When a customer approves a quote' },
  { value: 'inbox.message_received', label: 'Inbox message received', hint: 'When a customer message arrives' },
  { value: 'scheduled', label: 'On a schedule (cron)', hint: 'Run repeatedly on a cron schedule' },
];

const ACTIONS: { value: string; label: string; hint: string }[] = [
  { value: 'create_notification', label: 'In-app notification', hint: 'Bell notification to a user' },
  { value: 'send_email', label: 'Send email', hint: 'Sent from your workspace’s Resend sender (BYOK)' },
  { value: 'send_whatsapp', label: 'Send WhatsApp', hint: 'Via your connected WhatsApp number' },
  { value: 'send_agent_message', label: 'Post an agent message', hint: 'Drop a message into a chat thread' },
  { value: 'send_campaign', label: 'Dispatch email campaign', hint: 'Start an existing Email-Marketing campaign' },
];

export type FlowFormState = {
  default_trigger_type?: string;
  prefill?: {
    name?: string;
    trigger_config?: Record<string, unknown>;
    actions?: Array<{ action_type?: string; config?: Record<string, unknown> }>;
  };
} | null;

/** The structured shape create_simple_flow expects — used by the direct (manual) create path. */
export interface SimpleFlowPayload {
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  actions: Array<{ action_type: string; config: Record<string, unknown> }>;
}

interface Props {
  state: FlowFormState;
  onClose: () => void;
  /** Agent round-trip: called with a follow-up user message that re-invokes manage_flows(create).
   *  Used when the modal is opened from chat (AgentHub). */
  onSubmit?: (followupMessage: string) => void;
  /** Direct create: called with the structured payload. Used when the modal is opened from the
   *  Automations page — it calls create_simple_flow itself and refreshes. Takes precedence over
   *  onSubmit when provided. */
  onCreate?: (payload: SimpleFlowPayload) => Promise<void> | void;
}

export function FlowFormModal({ state, onClose, onSubmit, onCreate }: Props) {
  const open = !!state;

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState('invoice_paid');
  const [cron, setCron] = useState('0 9 * * *');
  const [actionType, setActionType] = useState('create_notification');
  const [submitting, setSubmitting] = useState(false);

  // Generic single-action config fields (only the relevant ones render per action).
  const [to, setTo] = useState('{{trigger.data.email}}');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [title, setTitle] = useState('');
  const [userIdField, setUserIdField] = useState('{{trigger.data.user_id}}');
  const [message, setMessage] = useState('');
  const [campaignId, setCampaignId] = useState('');

  useEffect(() => {
    if (state) {
      setName(state.prefill?.name || '');
      setTriggerType(state.default_trigger_type && TRIGGERS.some(t => t.value === state.default_trigger_type)
        ? state.default_trigger_type : 'invoice_paid');
      const firstAction = state.prefill?.actions?.[0]?.action_type;
      if (firstAction && ACTIONS.some(a => a.value === firstAction)) setActionType(firstAction);
    }
  }, [state]);

  const buildPayload = (): SimpleFlowPayload => {
    const flowName = name.trim() || `${TRIGGERS.find(t => t.value === triggerType)?.label} → ${ACTIONS.find(a => a.value === actionType)?.label}`;

    let config: Record<string, unknown> = {};
    if (actionType === 'send_email') config = { to: to.trim(), subject: subject.trim(), body: body.trim() };
    else if (actionType === 'create_notification') config = { user_id: userIdField.trim(), title: title.trim(), body: body.trim(), type: 'info' };
    else if (actionType === 'send_whatsapp') config = { to: to.trim(), message: message.trim() };
    // target_user_id is REQUIRED for the engine to resolve a conversation (else it throws at runtime);
    // default it to the user the trigger is about so the message posts to their active thread.
    else if (actionType === 'send_agent_message') config = { use_active_conversation: true, target_user_id: '{{trigger.data.user_id}}', message: message.trim(), role: 'system' };
    else if (actionType === 'send_campaign') config = { campaign_id: campaignId.trim() };

    const triggerConfig = triggerType === 'scheduled' ? { cron: cron.trim(), timezone: 'UTC' } : {};

    return { name: flowName, trigger_type: triggerType, trigger_config: triggerConfig, actions: [{ action_type: actionType, config }] };
  };

  const handleSubmit = async () => {
    const payload = buildPayload();

    // Direct (manual) create — the caller writes it via create_simple_flow and refreshes.
    if (onCreate) {
      setSubmitting(true);
      try {
        await onCreate(payload);
        onClose();
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Agent round-trip — compose a message the KAI agent re-parses into manage_flows(create).
    const parts: string[] = [];
    parts.push('Please create this automation using manage_flows with action: "create".');
    parts.push(`- name: ${payload.name}`);
    parts.push(`- trigger_type: \`${payload.trigger_type}\``);
    if (payload.trigger_type === 'scheduled') parts.push(`- trigger_config: \`${JSON.stringify(payload.trigger_config)}\``);
    parts.push(`- actions: \`${JSON.stringify(payload.actions)}\``);
    parts.push('Activate it immediately. Confirm back to me once it’s created.');

    onSubmit?.(parts.join('\n'));
    onClose();
  };

  const submitDisabled =
    (actionType === 'send_email' && (!to.trim() || (!subject.trim() && !body.trim()))) ||
    (actionType === 'create_notification' && (!userIdField.trim() || !title.trim())) ||
    (actionType === 'send_whatsapp' && (!to.trim() || !message.trim())) ||
    (actionType === 'send_agent_message' && !message.trim()) ||
    (actionType === 'send_campaign' && !campaignId.trim());

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New automation</DialogTitle>
          <DialogDescription>
            Pick what starts it and what happens. It runs only for your workspace. Each run costs
            20 credits ($0.20) from your workspace pool, plus any per-action cost.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Thank a customer when they pay" />
          </div>

          <div className="space-y-1.5">
            <Label>When this happens (trigger)</Label>
            <Select value={triggerType} onValueChange={setTriggerType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGERS.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{TRIGGERS.find(t => t.value === triggerType)?.hint}</p>
          </div>

          {triggerType === 'scheduled' && (
            <div className="space-y-1.5">
              <Label>Cron schedule (UTC)</Label>
              <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 9 * * *" />
              <p className="text-xs text-muted-foreground">Standard cron. Default is 09:00 UTC daily.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Then do this (action)</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIONS.map(a => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{ACTIONS.find(a => a.value === actionType)?.hint}</p>
          </div>

          {/* Per-action config. {{trigger.data.*}} templates are allowed and resolved at run time. */}
          {actionType === 'send_email' && (
            <>
              <div className="space-y-1.5"><Label>To</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="{{trigger.data.email}}" /></div>
              <div className="space-y-1.5"><Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Thanks for your payment" /></div>
              <div className="space-y-1.5"><Label>Body (HTML allowed)</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Hi, we’ve received your payment…" /></div>
            </>
          )}
          {actionType === 'create_notification' && (
            <>
              <div className="space-y-1.5"><Label>Recipient user id</Label>
                <Input value={userIdField} onChange={(e) => setUserIdField(e.target.value)} placeholder="{{trigger.data.user_id}}" /></div>
              <div className="space-y-1.5"><Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Invoice paid" /></div>
              <div className="space-y-1.5"><Label>Body</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Invoice {{trigger.data.invoice_id}} was paid" /></div>
            </>
          )}
          {actionType === 'send_whatsapp' && (
            <>
              <div className="space-y-1.5"><Label>To (phone)</Label>
                <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="{{trigger.data.phone}}" /></div>
              <div className="space-y-1.5"><Label>Message</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} /></div>
            </>
          )}
          {actionType === 'send_agent_message' && (
            <div className="space-y-1.5"><Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Posts into the active conversation" /></div>
          )}
          {actionType === 'send_campaign' && (
            <div className="space-y-1.5"><Label>Campaign id</Label>
              <Input value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="UUID of an existing email campaign" /></div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitDisabled || submitting}>
            {submitting ? 'Creating…' : onCreate ? 'Create automation' : 'Send to agent'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
