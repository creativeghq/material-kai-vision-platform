import React, { useCallback } from 'react';
import { Copy, RefreshCw } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Button } from '@/components/core/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import type {
  TriggerNodeData,
  WebhookTriggerConfig,
  ScheduledTriggerConfig,
  UserSignupTriggerConfig,
  QuoteRequestedTriggerConfig,
  AgentSearchCompletedTriggerConfig,
  ProductAddedToQuoteTriggerConfig,
  MoodboardItemAddedTriggerConfig,
  MoodboardCommentedTriggerConfig,
  HireMeReceivedTriggerConfig,
  MaterialReviewedTriggerConfig,
} from '@/services/flows/types';
import { EntityPicker } from './EntityPicker';

interface TriggerConfigFormProps {
  data: TriggerNodeData;
  onChange: (config: Record<string, unknown>) => void;
  flowId?: string | null;
}

export function TriggerConfigForm({ data, onChange, flowId }: TriggerConfigFormProps) {
  const config = data.config;

  const generateSecret = useCallback(() => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const secret = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
    onChange({ ...config, secret });
  }, [config, onChange]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  switch (data.triggerType) {
    case 'manual':
      return (
        <div className="text-xs text-muted-foreground">
          Manual triggers are deprecated — you can remove this node. Every flow can be
          run on demand with the <strong>Run Now</strong> button on the Flows dashboard,
          regardless of its trigger.
        </div>
      );

    case 'webhook': {
      const webhookConfig = config as WebhookTriggerConfig;
      const supabaseUrl = process.env.SUPABASE_URL || '';
      const webhookUrl = flowId
        ? `${supabaseUrl}/functions/v1/flow-webhook?flow_id=${flowId}`
        : '';

      return (
        <div className="space-y-3">
          {/* Webhook URL (read-only) */}
          {flowId ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Webhook URL</Label>
              <div className="flex gap-1">
                <Input
                  value={webhookUrl}
                  readOnly
                  className="h-8 text-xs font-mono bg-muted"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={() => copyToClipboard(webhookUrl)}
                  title="Copy URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Send requests to this URL to trigger the flow.
              </p>
            </div>
          ) : (
            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-md p-2">
              Save the flow first to generate a webhook URL.
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">HTTP Method</Label>
            <Select
              value={webhookConfig.method || 'POST'}
              onValueChange={(val) => onChange({ ...config, method: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Secret with generate + copy */}
          <div className="space-y-1.5">
            <Label className="text-xs">Webhook Secret</Label>
            <div className="flex gap-1">
              <Input
                value={webhookConfig.secret || ''}
                onChange={(e) => onChange({ ...config, secret: e.target.value })}
                placeholder="Click generate or enter manually"
                className="h-8 text-xs font-mono"
                type="text"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 shrink-0"
                onClick={generateSecret}
                title="Generate secret"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {webhookConfig.secret && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 shrink-0"
                  onClick={() => copyToClipboard(webhookConfig.secret || '')}
                  title="Copy secret"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Pass via <code className="text-[10px]">X-Webhook-Secret</code> header to authenticate requests.
            </p>
          </div>
        </div>
      );
    }

    case 'scheduled':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cron Expression</Label>
            <Input
              value={(config as ScheduledTriggerConfig).cron || ''}
              onChange={(e) => onChange({ ...config, cron: e.target.value })}
              placeholder="0 9 * * *"
              className="h-8 text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              e.g., "0 9 * * *" = every day at 9am
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timezone</Label>
            <Input
              value={(config as ScheduledTriggerConfig).timezone || 'UTC'}
              onChange={(e) => onChange({ ...config, timezone: e.target.value })}
              placeholder="UTC"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );

    case 'user_signup':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Role (optional)</Label>
            <Input
              value={(config as UserSignupTriggerConfig).filter_role || ''}
              onChange={(e) => onChange({ ...config, filter_role: e.target.value })}
              placeholder="e.g., dealer"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );

    case 'user_login':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when any user logs in. Available data: user ID, email, login timestamp.
        </div>
      );

    case 'quote_requested':
      return (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Status (optional)</Label>
            <Input
              value={(config as QuoteRequestedTriggerConfig).filter_status || ''}
              onChange={(e) => onChange({ ...config, filter_status: e.target.value })}
              placeholder="e.g., pending"
              className="h-8 text-sm"
            />
          </div>
        </div>
      );

    case 'quote_approved':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a quote is approved. Available data: quote ID, approved by, timestamp.
        </div>
      );

    case 'quote_rejected':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a quote is rejected. Available data: quote ID, rejection reason.
        </div>
      );

    case 'search_executed':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when an agent search is performed. Available data: query, result count, search type, user ID.
        </div>
      );

    case 'model_3d_created':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when an AI agent generates a 3D model. Available data: job_id, model_count, prompt, user_id.
        </div>
      );

    case 'vr_world_created':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a VR world is generated. Available data: world ID, source image, quality tier.
        </div>
      );

    case 'agent_search_completed': {
      const cfg = config as AgentSearchCompletedTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when an agent search returns results. Available data: query, result_count, conversation_id, user_id.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Agent (optional)</Label>
            <Select
              value={cfg.filter_agent || ''}
              onValueChange={(val) => onChange({ ...cfg, filter_agent: val })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search">Search Agent</SelectItem>
                <SelectItem value="interior-designer">Interior Designer</SelectItem>
                <SelectItem value="insights">Insights Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case 'product_added_to_quote': {
      const cfg = config as ProductAddedToQuoteTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when a product is added to a quote. Available data: quote_id, product_id, quantity, added_from, user_id.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Source (optional)</Label>
            <Select
              value={cfg.filter_added_from || ''}
              onValueChange={(val) => onChange({ ...cfg, filter_added_from: val || undefined })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="search">Search Results</SelectItem>
                <SelectItem value="agent">Agent Recommendation</SelectItem>
                <SelectItem value="3d_generation">3D Generation</SelectItem>
                <SelectItem value="manual">Manual Entry</SelectItem>
                <SelectItem value="product_page">Product Page</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case 'moodboard_created':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a new moodboard is created. Available data: moodboard_id, title, user_id.
        </div>
      );

    case 'moodboard_item_added': {
      const cfg = config as MoodboardItemAddedTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when a material is added to a moodboard. Available data: moodboard_id, item_id, product_id, user_id.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Moodboard (optional)</Label>
            <EntityPicker
              entityType="moodboard"
              value={cfg.filter_moodboard_id || ''}
              onSelect={(id) => onChange({ ...cfg, filter_moodboard_id: id })}
              placeholder="Any moodboard"
              allowTemplateValue={false}
            />
          </div>
        </div>
      );
    }

    case 'moodboard_shared':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a moodboard is shared (made public). Available data: moodboard_id, title, shared_by.
        </div>
      );

    case 'moodboard_commented': {
      const cfg = config as MoodboardCommentedTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when someone posts a comment on a moodboard. Available data: moodboard_id, comment_id, commenter_id, owner_id, content_snippet.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by Moodboard (optional)</Label>
            <EntityPicker
              entityType="moodboard"
              value={cfg.filter_moodboard_id || ''}
              onSelect={(id) => onChange({ ...cfg, filter_moodboard_id: id })}
              placeholder="Any moodboard"
              allowTemplateValue={false}
            />
          </div>
        </div>
      );
    }

    case 'hire_me_received': {
      const cfg = config as HireMeReceivedTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when someone submits a Hire Me contact request. Available data: request_id, to_user_id, from_name, from_email, services_requested, sent_at.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Only when services selected (optional)</Label>
            <Select
              value={cfg.filter_has_services === true ? 'yes' : cfg.filter_has_services === false ? 'no' : ''}
              onValueChange={(val) =>
                onChange({ ...cfg, filter_has_services: val === 'yes' ? true : val === 'no' ? false : undefined })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any request" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Only with service selection</SelectItem>
                <SelectItem value="no">Only without service selection</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case 'profile_followed':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a user follows a public profile. Available data: follower_id, following_id, followed_at.
        </div>
      );

    case 'profile_published':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a user makes their profile public. Available data: user_id, published_at.
        </div>
      );

    case 'material_reviewed': {
      const cfg = config as MaterialReviewedTriggerConfig;
      return (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Fires when a user submits a material review. Available data: product_id, user_id, rating, review_id, has_text.
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Minimum rating (optional)</Label>
            <Select
              value={cfg.filter_min_rating?.toString() || ''}
              onValueChange={(val) =>
                onChange({ ...cfg, filter_min_rating: val ? Number(val) : undefined })
              }
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Any rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="4">4+ stars</SelectItem>
                <SelectItem value="5">5 stars only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );
    }

    case 'preferred_factory_added':
      return (
        <div className="text-xs text-muted-foreground">
          Fires when a user adds a factory to their preferred factories list. Available data: user_id, factory_name, added_at.
        </div>
      );

    // ── 2026-05-30 notification→flow migration events ──
    // These carry a standard notification payload so a Create Notification /
    // Send Email action can template them uniformly.
    case 'quote_pdf_generated':
    case 'factory_approved':
    case 'factory_rejected':
    case 'appointment_booked':
    case 'appointment_confirmed':
    case 'appointment_cancelled':
    case 'svbrdf_extraction_complete':
    case 'virtual_staging_completed':
    case 'vr_world_failed':
    case 'video_generation_completed':
    case 'video_generation_failed':
    case 'background_agent_failed':
    case 'role_upgrade_request_submitted':
    case 'role_upgrade_approved':
    case 'role_upgrade_rejected':
    case 'stripe_payment_succeeded':
    case 'stripe_payment_failed':
    case 'project_invitation_sent':
    case 'project_invitation_resent':
      return (
        <div className="text-xs text-muted-foreground">
          Fires on this platform event. Standard payload under <code>trigger.data</code>:
          {' '}<code>user_id</code> (recipient), <code>title</code>, <code>body</code>, <code>action_url</code>,
          plus event-specific fields. Use these in a Create Notification or Send Email action.
        </div>
      );

    default:
      return null;
  }
}
