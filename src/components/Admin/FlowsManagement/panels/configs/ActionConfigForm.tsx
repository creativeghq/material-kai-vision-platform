import React from 'react';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import type {
  ActionNodeData,
  SendSmsConfig,
  SendWhatsAppConfig,
  SendCampaignConfig,
  SendPriceAlertConfig,
  SendEmailConfig,
  SendQuoteConfig,
  BuildQuoteConfig,
  HttpRequestConfig,
  CreateNotificationConfig,
  SendPushConfig,
  ApproveQuoteConfig,
  AssignUserConfig,
  AddTagConfig,
  AddNoteConfig,
  UpdateContactConfig,
  UpdateProductConfig,
  CreateTaskConfig,
  AdvanceDealStageConfig,
  CreatePlannedPaymentConfig,
  LinkDocumentConfig,
  RunEdgeFunctionConfig,
  LogEventConfig,
  SendAgentMessageConfig,
  CreateMoodboardConfig,
  AddToMoodboardConfig,
  WebSearchConfig,
  FirecrawlScrapeConfig,
  ApolloEnrichConfig,
  HunterFindContactsConfig,
  ZeroBounceValidateConfig,
} from '@/services/flows/types';
import { EntityPicker } from './EntityPicker';
import { EmailTemplateSelect } from './EmailTemplateSelect';

/**
 * A pre-save hint for the HTTP Request URL (#357 AE-10).
 *
 * Deliberately NOT the gate — `assertSafeUrl` in flow-engine is, and it resolves DNS, which a
 * form cannot. This catches the shapes a person can see they typed: a non-https scheme, and the
 * literal private/loopback/metadata hosts. Returns null when there is nothing useful to say,
 * including for a URL carrying a `{{template}}` whose real value is unknowable here.
 */
function httpUrlHint(url: string | undefined): string | null {
  const v = String(url ?? '').trim();
  if (!v) return null;
  if (v.includes('{{')) return null;
  if (!/^https:\/\//i.test(v)) {
    return /^https?:\/\//i.test(v)
      ? 'Only https:// is accepted — this will be refused when the flow runs.'
      : 'Enter a full https:// URL.';
  }
  const host = v.replace(/^https:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
  const privateHost = host === 'localhost'
    || host === '169.254.169.254'
    || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || host.endsWith('.internal') || host.endsWith('.local');
  return privateHost
    ? 'That looks like a private or internal address — it will be refused when the flow runs.'
    : null;
}

/** JSON editor for a `Record<string,string>` fields map. Keeps a free-text draft so typing invalid
 *  intermediate JSON doesn't reset the cursor; commits to onChange only when the draft parses to an
 *  object. Used by update_contact / update_product. */
function FieldsJsonEditor({ value, onChange, label, hint }: {
  value: Record<string, string> | undefined;
  onChange: (fields: Record<string, string>) => void;
  label: string;
  hint?: string;
}) {
  const [draft, setDraft] = React.useState(() => JSON.stringify(value ?? {}, null, 2));
  const [valid, setValid] = React.useState(true);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Textarea
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          try {
            const parsed = JSON.parse(next);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { setValid(true); onChange(parsed); }
            else setValid(false);
          } catch { setValid(false); }
        }}
        rows={4}
        className={`text-xs font-mono ${valid ? '' : 'border-destructive'}`}
        placeholder={'{\n  "status": "active"\n}'}
      />
      {!valid && <p className="text-[10px] text-destructive">Enter a valid JSON object.</p>}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface ActionConfigFormProps {
  data: ActionNodeData;
  onChange: (config: Record<string, unknown>) => void;
}

export function ActionConfigForm({ data, onChange }: ActionConfigFormProps) {
  const config = data.config;

  switch (data.actionType) {
    case 'send_sms': {
      const cfg = config as SendSmsConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">To (phone number)</Label>
            <Input
              value={cfg.to || ''}
              onChange={(e) => onChange({ ...cfg, to: e.target.value })}
              placeholder="{{trigger.data.phone}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={cfg.message || ''}
              onChange={(e) => onChange({ ...cfg, message: e.target.value })}
              placeholder="Hello {{trigger.data.name}}!"
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
      );
    }

    case 'send_whatsapp': {
      const cfg = config as SendWhatsAppConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Sends via your connected WhatsApp number (Zernio). Cold/marketing sends outside the
            24h window require a Meta-approved template name.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To (phone number)</Label>
            <Input
              value={cfg.to || ''}
              onChange={(e) => onChange({ ...cfg, to: e.target.value })}
              placeholder="{{trigger.data.phone}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={cfg.message || ''}
              onChange={(e) => onChange({ ...cfg, message: e.target.value })}
              placeholder="Hi {{trigger.data.name}}, ..."
              rows={3}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Template name (optional)</Label>
            <Input
              value={cfg.template_id || ''}
              onChange={(e) => onChange({ ...cfg, template_id: e.target.value })}
              placeholder="order_update"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'send_email': {
      const cfg = config as SendEmailConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">To (email)</Label>
            <Input
              value={cfg.to || ''}
              onChange={(e) => onChange({ ...cfg, to: e.target.value })}
              placeholder="{{trigger.data.email}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From (optional)</Label>
            <Input
              value={cfg.from || ''}
              onChange={(e) => onChange({ ...cfg, from: e.target.value })}
              placeholder="noreply@example.com"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={cfg.subject || ''}
              onChange={(e) => onChange({ ...cfg, subject: e.target.value })}
              placeholder="Welcome to our platform!"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={cfg.body || ''}
              onChange={(e) => onChange({ ...cfg, body: e.target.value })}
              placeholder="Hello {{trigger.data.name}}..."
              rows={4}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Template (optional)</Label>
            <EmailTemplateSelect
              value={cfg.template_id || ''}
              onChange={(slug) => onChange({ ...cfg, template_id: slug })}
            />
            <p className="text-[10px] text-muted-foreground">
              Pick a template you designed in Email Marketing, or a platform one. Its {'{{tag}}'}
              placeholders are filled from the variables below, and Subject/Body above are ignored.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Template variables (JSON, optional)</Label>
            <Textarea
              value={cfg.variables || ''}
              onChange={(e) => onChange({ ...cfg, variables: e.target.value })}
              placeholder={'{ "firstName": "{{trigger.data.client_name}}" }'}
              rows={3}
              className="text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Maps the template's {'{{tag}}'} names to values. Values can use {'{{trigger.data.*}}'} —
              see Available variables above.
            </p>
          </div>
        </div>
      );
    }

    case 'send_push': {
      const cfg = config as SendPushConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">User</Label>
            <EntityPicker
              entityType="user"
              value={cfg.user_id || ''}
              onSelect={(id) => onChange({ ...cfg, user_id: id })}
              placeholder="Select user..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="New update!"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={cfg.body || ''}
              onChange={(e) => onChange({ ...cfg, body: e.target.value })}
              placeholder="Push notification message..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>
      );
    }

    case 'send_quote': {
      const cfg = config as SendQuoteConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Quote</Label>
            <EntityPicker
              entityType="quote"
              value={cfg.quote_id || ''}
              onSelect={(id) => onChange({ ...cfg, quote_id: id })}
              placeholder="Select quote..."
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Send via Email</Label>
            <Switch
              checked={cfg.send_email ?? true}
              onCheckedChange={(val) => onChange({ ...cfg, send_email: val })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Send via SMS</Label>
            <Switch
              checked={cfg.send_sms ?? false}
              onCheckedChange={(val) => onChange({ ...cfg, send_sms: val })}
            />
          </div>
        </div>
      );
    }

    case 'build_quote': {
      const cfg = config as BuildQuoteConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">User</Label>
            <EntityPicker
              entityType="user"
              value={cfg.user_id || ''}
              onSelect={(id) => onChange({ ...cfg, user_id: id })}
              placeholder="Select user..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Quote Name</Label>
            <Input
              value={cfg.name || ''}
              onChange={(e) => onChange({ ...cfg, name: e.target.value })}
              placeholder="Auto-generated Quote"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Items (JSON path)</Label>
            <Input
              value={cfg.items || ''}
              onChange={(e) => onChange({ ...cfg, items: e.target.value })}
              placeholder="{{trigger.data.items}}"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    case 'approve_quote': {
      const cfg = config as ApproveQuoteConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Quote</Label>
            <EntityPicker
              entityType="quote"
              value={cfg.quote_id || ''}
              onSelect={(id) => onChange({ ...cfg, quote_id: id })}
              placeholder="Select quote..."
            />
          </div>
        </div>
      );
    }

    case 'http_request': {
      const cfg = config as HttpRequestConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">URL</Label>
            <Input
              value={cfg.url || ''}
              onChange={(e) => onChange({ ...cfg, url: e.target.value })}
              placeholder="https://api.example.com/webhook"
              className="h-8 text-sm"
            />
            {/*
              #357 AE-10. The engine refuses a non-public or non-https URL through the shared
              SSRF guard, and that is the enforcement. This says so BEFORE saving, because the
              alternative is a flow that looks fine, saves fine, and fails at run time inside a
              run log — the point at which nobody is watching. It is a hint, never the gate.
            */}
            {httpUrlHint(cfg.url) && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">{httpUrlHint(cfg.url)}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Must be a public <code>https://</code> address. Internal and private addresses are
              refused when the flow runs.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Method</Label>
            <Select
              value={cfg.method || 'POST'}
              onValueChange={(val) => onChange({ ...cfg, method: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body (JSON)</Label>
            <Textarea
              value={cfg.body || ''}
              onChange={(e) => onChange({ ...cfg, body: e.target.value })}
              placeholder='{"key": "{{trigger.data.value}}"}'
              rows={3}
              className="text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timeout (ms)</Label>
            <Input
              type="number"
              value={cfg.timeout_ms || 30000}
              onChange={(e) => onChange({ ...cfg, timeout_ms: parseInt(e.target.value) || 30000 })}
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'create_notification': {
      const cfg = config as CreateNotificationConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">User</Label>
            <EntityPicker
              entityType="user"
              value={cfg.user_id || ''}
              onSelect={(id) => onChange({ ...cfg, user_id: id })}
              placeholder="Select user..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="Notification title"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={cfg.body || ''}
              onChange={(e) => onChange({ ...cfg, body: e.target.value })}
              placeholder="Notification message..."
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select
              value={cfg.type || 'info'}
              onValueChange={(val) => onChange({ ...cfg, type: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case 'assign_user': {
      const cfg = config as AssignUserConfig;
      const entityPickerType = cfg.entity_type === 'quote' ? 'quote' as const
        : cfg.entity_type === 'contact' ? 'contact' as const
        : 'product' as const;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type</Label>
            <Select
              value={cfg.entity_type || 'contact'}
              onValueChange={(val) => onChange({ ...cfg, entity_type: val, entity_id: '' })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
                <SelectItem value="product">Product</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <EntityPicker
              entityType={entityPickerType}
              value={cfg.entity_id || ''}
              onSelect={(id) => onChange({ ...cfg, entity_id: id })}
              placeholder={`Select ${cfg.entity_type || 'contact'}...`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Assign To (Team Member)</Label>
            <EntityPicker
              entityType="user"
              value={cfg.assign_to || ''}
              onSelect={(id) => onChange({ ...cfg, assign_to: id })}
              placeholder="Select team member..."
            />
          </div>
        </div>
      );
    }

    case 'add_tag': {
      const cfg = config as AddTagConfig;
      const tagEntityType = cfg.entity_type === 'product' ? 'product' as const
        : cfg.entity_type === 'quote' ? 'quote' as const
        : 'contact' as const;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type</Label>
            <Select
              value={cfg.entity_type || 'contact'}
              onValueChange={(val) => onChange({ ...cfg, entity_type: val, entity_id: '' })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="product">Product</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <EntityPicker
              entityType={tagEntityType}
              value={cfg.entity_id || ''}
              onSelect={(id) => onChange({ ...cfg, entity_id: id })}
              placeholder={`Select ${cfg.entity_type || 'contact'}...`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tag</Label>
            <Input
              value={cfg.tag || ''}
              onChange={(e) => onChange({ ...cfg, tag: e.target.value })}
              placeholder="e.g., vip, priority"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'add_note': {
      const cfg = config as AddNoteConfig;
      const noteEntityType = cfg.entity_type === 'quote' ? 'quote' as const
        : 'contact' as const;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Entity Type</Label>
            <Select
              value={cfg.entity_type || 'contact'}
              onValueChange={(val) => onChange({ ...cfg, entity_type: val, entity_id: '' })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contact">Contact</SelectItem>
                <SelectItem value="quote">Quote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Entity</Label>
            <EntityPicker
              entityType={noteEntityType}
              value={cfg.entity_id || ''}
              onSelect={(id) => onChange({ ...cfg, entity_id: id })}
              placeholder={`Select ${cfg.entity_type || 'contact'}...`}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea
              value={cfg.note || ''}
              onChange={(e) => onChange({ ...cfg, note: e.target.value })}
              placeholder="Auto-generated note..."
              rows={3}
              className="text-sm"
            />
          </div>
        </div>
      );
    }

    case 'update_contact': {
      const cfg = config as UpdateContactConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Contact</Label>
            <EntityPicker
              entityType="contact"
              value={cfg.contact_id || ''}
              onSelect={(id) => onChange({ ...cfg, contact_id: id })}
              placeholder="Select contact..."
            />
          </div>
          <FieldsJsonEditor
            label="Fields to update (JSON)"
            value={cfg.fields}
            onChange={(fields) => onChange({ ...cfg, fields })}
            hint="Allowlisted contact fields only (name, email, phone, status, lead_status…). Values may use {{trigger.data.x}}."
          />
        </div>
      );
    }

    case 'link_document': {
      const cfg = config as LinkDocumentConfig;
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Document</Label>
              <Select
                value={cfg.document_kind || 'invoice'}
                onValueChange={(v) => onChange({ ...cfg, document_kind: v as LinkDocumentConfig['document_kind'] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">Invoice</SelectItem>
                  <SelectItem value="order">Order</SelectItem>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Attach to</Label>
              <Select
                value={cfg.target_kind || 'deal'}
                onValueChange={(v) => onChange({ ...cfg, target_kind: v as LinkDocumentConfig['target_kind'] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="deal">A deal</SelectItem>
                  <SelectItem value="project">A project</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Document id</Label>
            <Input
              value={cfg.document_id || ''}
              onChange={(e) => onChange({ ...cfg, document_id: e.target.value })}
              placeholder="{{trigger.data.invoice_id}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Target id</Label>
            <Input
              value={cfg.target_id || ''}
              onChange={(e) => onChange({ ...cfg, target_id: e.target.value })}
              placeholder="{{trigger.data.deal_id}} — leave blank to detach"
            />
            <p className="text-[11px] text-muted-foreground">
              Attaching to a PROJECT is usually unnecessary: the document chain already carries the
              job down from its parent. This is mainly for the deal, which nothing derives.
            </p>
          </div>
        </div>
      );
    }

    case 'create_planned_payment': {
      const cfg = config as CreatePlannedPaymentConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">What it is for</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="e.g. Chase {{trigger.data.invoice_number}}"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Amount</Label>
              <Input
                inputMode="decimal"
                value={String(cfg.amount ?? '')}
                onChange={(e) => onChange({ ...cfg, amount: Number(e.target.value) })}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Direction</Label>
              <Select
                value={cfg.direction || 'out'}
                onValueChange={(v) => onChange({ ...cfg, direction: v as 'in' | 'out' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Money in</SelectItem>
                  <SelectItem value="out">Money out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Currency</Label>
              <Input
                value={cfg.currency || ''}
                onChange={(e) => onChange({ ...cfg, currency: e.target.value })}
                placeholder="EUR"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Scheduled for</Label>
            <Input
              type="date"
              value={cfg.scheduled_for || ''}
              onChange={(e) => onChange({ ...cfg, scheduled_for: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              Required. Nothing here derives &quot;today&quot; — a schedule with no date is not a schedule.
            </p>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This adds a forecast entry and moves no money. Settling it is still a recorded payment.
          </p>
        </div>
      );
    }

    case 'advance_deal_stage': {
      const cfg = config as AdvanceDealStageConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Deal</Label>
            <Input
              value={cfg.deal_id || ''}
              onChange={(e) => onChange({ ...cfg, deal_id: e.target.value })}
              placeholder="Deal id, or {{trigger.data.deal_id}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Move to stage</Label>
            <Input
              value={cfg.stage || ''}
              onChange={(e) => onChange({ ...cfg, stage: e.target.value })}
              placeholder="Stage key, e.g. won"
            />
            <p className="text-[11px] text-muted-foreground">
              Stages belong to the deal&apos;s TYPE. A stage from another pipeline is refused by the
              database, so the run log will say so rather than moving it somewhere impossible.
            </p>
          </div>
        </div>
      );
    }

    case 'create_task': {
      const cfg = config as CreateTaskConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <Input
              value={cfg.project_id || ''}
              onChange={(e) => onChange({ ...cfg, project_id: e.target.value })}
              placeholder="Project id, or {{trigger.data.project_id}}"
            />
            <p className="text-[11px] text-muted-foreground">
              Checked against this workspace before anything is written — a flow naming another
              tenant&apos;s project creates nothing and says so in the run log.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="What needs doing. May use {{trigger.data.x}}."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={cfg.description || ''}
              onChange={(e) => onChange({ ...cfg, description: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Due date</Label>
              <Input
                type="date"
                value={cfg.due_date || ''}
                onChange={(e) => onChange({ ...cfg, due_date: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">Left blank = no due date.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Visible to</Label>
              <Select
                value={cfg.visibility || 'internal'}
                onValueChange={(v) => onChange({ ...cfg, visibility: v as 'internal' | 'client_visible' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">The team only</SelectItem>
                  <SelectItem value="client_visible">The client too</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      );
    }

    case 'update_product': {
      const cfg = config as UpdateProductConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Product</Label>
            <EntityPicker
              entityType="product"
              value={cfg.product_id || ''}
              onSelect={(id) => onChange({ ...cfg, product_id: id })}
              placeholder="Select product..."
            />
          </div>
          <FieldsJsonEditor
            label="Fields to update (JSON)"
            value={cfg.fields}
            onChange={(fields) => onChange({ ...cfg, fields })}
            hint="Allowlisted product fields only (name, description, status, sku, category…). Values may use {{trigger.data.x}}."
          />
        </div>
      );
    }

    case 'run_edge_function': {
      const cfg = config as RunEdgeFunctionConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Function</Label>
            <EntityPicker
              entityType="edge_function"
              value={cfg.function_name || ''}
              onSelect={(id) => onChange({ ...cfg, function_name: id })}
              placeholder="Select edge function..."
              allowTemplateValue={false}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Payload (JSON)</Label>
            <Textarea
              value={cfg.payload || '{}'}
              onChange={(e) => onChange({ ...cfg, payload: e.target.value })}
              placeholder='{"key": "value"}'
              rows={3}
              className="text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    case 'log_event': {
      const cfg = config as LogEventConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Table</Label>
            <Input
              value={cfg.table || ''}
              onChange={(e) => onChange({ ...cfg, table: e.target.value })}
              placeholder="e.g., quote_activities"
              className="h-8 text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Writes an audit / dedup-marker row. Pair with an If/Else + Stop to de-duplicate recurring flows.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Row (JSON)</Label>
            <Textarea
              value={cfg.row || ''}
              onChange={(e) => onChange({ ...cfg, row: e.target.value })}
              placeholder='{"quote_id": "{{trigger.data.quote_id}}", "type": "reminder_sent"}'
              rows={3}
              className="text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    case 'send_agent_message': {
      const cfg = config as SendAgentMessageConfig;
      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Use Active Conversation</Label>
            <Switch
              checked={cfg.use_active_conversation ?? false}
              onCheckedChange={(val) => onChange({ ...cfg, use_active_conversation: val, conversation_id: '', target_user_id: '' })}
            />
          </div>
          {cfg.use_active_conversation ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Target User</Label>
              <EntityPicker
                entityType="user"
                value={cfg.target_user_id || ''}
                onSelect={(id) => onChange({ ...cfg, target_user_id: id })}
                placeholder="Select user..."
              />
              <p className="text-[10px] text-muted-foreground">
                Will use this user's most recent conversation
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Conversation</Label>
              <EntityPicker
                entityType="conversation"
                value={cfg.conversation_id || ''}
                onSelect={(id) => onChange({ ...cfg, conversation_id: id })}
                placeholder="Select conversation..."
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Message Role</Label>
            <Select
              value={cfg.role || 'user'}
              onValueChange={(val) => onChange({ ...cfg, role: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Message</Label>
            <Textarea
              value={cfg.message || ''}
              onChange={(e) => onChange({ ...cfg, message: e.target.value })}
              placeholder="Message to inject into the conversation..."
              rows={3}
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Agent</Label>
            <Select
              value={cfg.agent_id || ''}
              onValueChange={(val) => onChange({ ...cfg, agent_id: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select agent (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search">Search Agent</SelectItem>
                <SelectItem value="interior-designer">Interior Designer</SelectItem>
                <SelectItem value="insights">Insights Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Trigger Agent Response</Label>
            <Switch
              checked={cfg.trigger_agent_response ?? false}
              onCheckedChange={(val) => onChange({ ...cfg, trigger_agent_response: val })}
            />
          </div>
        </div>
      );
    }

    case 'create_moodboard': {
      const cfg = config as CreateMoodboardConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="My Moodboard"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Input
              value={cfg.description || ''}
              onChange={(e) => onChange({ ...cfg, description: e.target.value })}
              placeholder="Collection of materials..."
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Owner</Label>
            <EntityPicker
              entityType="user"
              value={cfg.user_id || ''}
              onSelect={(id) => onChange({ ...cfg, user_id: id })}
              placeholder="Select owner..."
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">Public</Label>
            <Switch
              checked={cfg.is_public ?? false}
              onCheckedChange={(val) => onChange({ ...cfg, is_public: val })}
            />
          </div>
        </div>
      );
    }

    case 'add_to_moodboard': {
      const cfg = config as AddToMoodboardConfig;
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Moodboard</Label>
            <EntityPicker
              entityType="moodboard"
              value={cfg.moodboard_id || ''}
              onSelect={(id) => onChange({ ...cfg, moodboard_id: id })}
              placeholder="Select moodboard..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Product</Label>
            <EntityPicker
              entityType="product"
              value={cfg.product_id || ''}
              onSelect={(id) => onChange({ ...cfg, product_id: id })}
              placeholder="Select product..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={cfg.notes || ''}
              onChange={(e) => onChange({ ...cfg, notes: e.target.value })}
              placeholder="Material notes..."
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'web_search': {
      const cfg = config as WebSearchConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            AI-powered B2B manufacturer search using Claude web search. Specify a country for focused results or leave blank for a broad global search.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Product Category</Label>
            <Input
              value={cfg.category || ''}
              onChange={(e) => onChange({ ...cfg, category: e.target.value })}
              placeholder="e.g., ceramic tiles, bathroom furniture"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Region (optional)</Label>
            <Select
              value={cfg.region || ''}
              onValueChange={(val) => onChange({ ...cfg, region: val || undefined, country: val ? undefined : cfg.country })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="All Markets (30 countries)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Markets (30 countries)</SelectItem>
                <SelectItem value="cee">Central & Eastern Europe</SelectItem>
                <SelectItem value="balkans">Balkans & Turkey</SelectItem>
                <SelectItem value="baltic_nordic">Baltic & Nordic</SelectItem>
                <SelectItem value="western_southern">Western & Southern Europe</SelectItem>
                <SelectItem value="global">Global Manufacturing Hubs</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Leave empty for broad global search
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Country (optional)</Label>
            <Input
              value={cfg.country || ''}
              onChange={(e) => onChange({ ...cfg, country: e.target.value, region: e.target.value ? undefined : cfg.region })}
              placeholder="Leave empty for all markets"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Overrides region. Use for focused single-country results.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max Results</Label>
            <Input
              type="number"
              value={cfg.limit ?? 30}
              onChange={(e) => onChange({ ...cfg, limit: parseInt(e.target.value) || 30 })}
              className="h-8 text-sm"
              min={1}
              max={50}
            />
          </div>
        </div>
      );
    }

    case 'firecrawl_scrape': {
      const cfg = config as FirecrawlScrapeConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Scrape a company website and extract structured data (about, products, contact info, certifications).
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Website URL</Label>
            <Input
              value={cfg.url || ''}
              onChange={(e) => onChange({ ...cfg, url: e.target.value })}
              placeholder="https://company-website.com"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Sections to Extract (optional)</Label>
            <Input
              value={cfg.extract || ''}
              onChange={(e) => onChange({ ...cfg, extract: e.target.value })}
              placeholder="about, products, contact, certifications"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Comma-separated. Leave empty to extract all sections.
            </p>
          </div>
        </div>
      );
    }

    case 'apollo_enrich': {
      const cfg = config as ApolloEnrichConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Enrich company data via Apollo.io. Returns industry, employee count, HQ, technologies, revenue, and more.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company Name</Label>
            <Input
              value={cfg.company_name || ''}
              onChange={(e) => onChange({ ...cfg, company_name: e.target.value })}
              placeholder="{{trigger.data.company_name}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Domain (optional)</Label>
            <Input
              value={cfg.domain || ''}
              onChange={(e) => onChange({ ...cfg, domain: e.target.value })}
              placeholder="e.g., paradyz.com"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Country (optional)</Label>
            <Input
              value={cfg.country || ''}
              onChange={(e) => onChange({ ...cfg, country: e.target.value })}
              placeholder="e.g., Poland"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );
    }

    case 'hunter_find_contacts': {
      const cfg = config as HunterFindContactsConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Find email contacts via Hunter.io with Apollo.io fallback and ZeroBounce validation.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Domain</Label>
            <Input
              value={cfg.domain || ''}
              onChange={(e) => onChange({ ...cfg, domain: e.target.value })}
              placeholder="e.g., company.com"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Company Name (if no domain)</Label>
            <Input
              value={cfg.company_name || ''}
              onChange={(e) => onChange({ ...cfg, company_name: e.target.value })}
              placeholder="{{trigger.data.company_name}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">First Name (optional, for specific person)</Label>
            <Input
              value={cfg.first_name || ''}
              onChange={(e) => onChange({ ...cfg, first_name: e.target.value })}
              placeholder="John"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Last Name (optional)</Label>
            <Input
              value={cfg.last_name || ''}
              onChange={(e) => onChange({ ...cfg, last_name: e.target.value })}
              placeholder="Smith"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Priority Roles (optional)</Label>
            <Input
              value={cfg.roles || ''}
              onChange={(e) => onChange({ ...cfg, roles: e.target.value })}
              placeholder="export, sales, director, manager"
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              Comma-separated. Results prioritized by role match.
            </p>
          </div>
        </div>
      );
    }

    case 'zerobounce_validate': {
      const cfg = config as ZeroBounceValidateConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Validate an email address via ZeroBounce. Returns validity status, free email check, MX record info.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Email Address</Label>
            <Input
              value={cfg.email || ''}
              onChange={(e) => onChange({ ...cfg, email: e.target.value })}
              placeholder="{{trigger.data.email}}"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    case 'send_campaign': {
      const cfg = config as SendCampaignConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Flips an existing Email-Marketing campaign (draft / paused / scheduled) owned by this
            flow's workspace to <em>sending</em>. Tenant-scoped flows only.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Campaign id</Label>
            <Input
              value={cfg.campaign_id || ''}
              onChange={(e) => onChange({ ...cfg, campaign_id: e.target.value })}
              placeholder="UUID of an existing email campaign"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    case 'send_price_alert': {
      const cfg = config as SendPriceAlertConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Module-gated (<code>price-monitoring-notifications</code>). Writes a bell notification +
            <code>price_alert_log</code> audit row. Identify the subject with a product or tracked-query id.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Recipient user id</Label>
            <Input
              value={cfg.user_id || ''}
              onChange={(e) => onChange({ ...cfg, user_id: e.target.value })}
              placeholder="{{trigger.data.user_id}}"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Alert type</Label>
            <Select
              value={cfg.alert_type || 'price_drop'}
              onValueChange={(v) => onChange({ ...cfg, alert_type: v })}
            >
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="price_drop">Price drop</SelectItem>
                <SelectItem value="new_retailer">New retailer</SelectItem>
                <SelectItem value="promo_started">Promo started</SelectItem>
                <SelectItem value="anomaly_detected">Anomaly detected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={cfg.title || ''}
              onChange={(e) => onChange({ ...cfg, title: e.target.value })}
              placeholder="Price dropped on {{trigger.data.product_name}}"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            <Textarea
              value={cfg.body || ''}
              onChange={(e) => onChange({ ...cfg, body: e.target.value })}
              placeholder="Now {{trigger.data.new_price}} at {{trigger.data.retailer_name}}"
              rows={2}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Product id (optional)</Label>
              <Input
                value={cfg.product_id || ''}
                onChange={(e) => onChange({ ...cfg, product_id: e.target.value })}
                placeholder="{{trigger.data.product_id}}"
                className="h-8 text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tracked-query id (optional)</Label>
              <Input
                value={cfg.tracked_query_id || ''}
                onChange={(e) => onChange({ ...cfg, tracked_query_id: e.target.value })}
                placeholder="{{trigger.data.tracked_query_id}}"
                className="h-8 text-sm font-mono"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Action URL (optional)</Label>
            <Input
              value={cfg.action_url || ''}
              onChange={(e) => onChange({ ...cfg, action_url: e.target.value })}
              placeholder="/monitoring/{{trigger.data.product_id}}"
              className="h-8 text-sm font-mono"
            />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}
