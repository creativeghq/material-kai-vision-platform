import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  MessageSquare, Mail, PlusCircle, Globe, Bell, Zap,
  Smartphone, Send, CheckCircle2, UserCog, Tag, StickyNote,
  UserPen, PackageCheck, ScrollText, CheckSquare, Kanban,
  BotMessageSquare, LayoutGrid, ImagePlus,
  Compass, FileSearch, Building2, UserSearch, MailCheck,
  MessageCircle, Megaphone, TrendingDown,
} from 'lucide-react';
import type {
  ActionNodeData, ActionType,
  SendSmsConfig, SendWhatsAppConfig, SendCampaignConfig, SendPriceAlertConfig,
  SendEmailConfig, HttpRequestConfig,
  SendAgentMessageConfig, CreateMoodboardConfig, AddToMoodboardConfig,
  WebSearchConfig, FirecrawlScrapeConfig, ApolloEnrichConfig,
  HunterFindContactsConfig, ZeroBounceValidateConfig,
} from '@/services/flows/types';

const actionIcons: Record<ActionType, React.ElementType> = {
  send_sms: MessageSquare,
  send_whatsapp: MessageCircle,
  send_email: Mail,
  send_campaign: Megaphone,
  send_price_alert: TrendingDown,
  send_push: Smartphone,
  create_notification: Bell,
  send_quote: Send,
  build_quote: PlusCircle,
  approve_quote: CheckCircle2,
  assign_user: UserCog,
  add_tag: Tag,
  add_note: StickyNote,
  update_contact: UserPen,
  update_product: PackageCheck,
  create_task: CheckSquare,
  advance_deal_stage: Kanban,
  log_event: ScrollText,
  http_request: Globe,
  run_edge_function: Zap,
  send_agent_message: BotMessageSquare,
  create_moodboard: LayoutGrid,
  add_to_moodboard: ImagePlus,
  web_search: Compass,
  firecrawl_scrape: FileSearch,
  apollo_enrich: Building2,
  hunter_find_contacts: UserSearch,
  zerobounce_validate: MailCheck,
};

function getActionSummary(data: ActionNodeData): string {
  switch (data.actionType) {
    case 'send_sms': {
      const cfg = data.config as SendSmsConfig;
      return cfg.to ? `To: ${cfg.to}` : 'Configure SMS...';
    }
    case 'send_whatsapp': {
      const cfg = data.config as SendWhatsAppConfig;
      return cfg.to ? `WhatsApp → ${cfg.to}` : 'Configure WhatsApp...';
    }
    case 'send_email': {
      const cfg = data.config as SendEmailConfig;
      return cfg.to ? `To: ${cfg.to}` : 'Configure email...';
    }
    case 'send_campaign': {
      const cfg = data.config as SendCampaignConfig;
      return cfg.campaign_id ? `Dispatch campaign ${cfg.campaign_id.slice(0, 8)}…` : 'Configure campaign...';
    }
    case 'send_price_alert': {
      const cfg = data.config as SendPriceAlertConfig;
      return cfg.alert_type ? `Price alert: ${cfg.alert_type}` : 'Configure price alert...';
    }
    case 'http_request': {
      const cfg = data.config as HttpRequestConfig;
      return cfg.url ? `${cfg.method} ${cfg.url}` : 'Configure request...';
    }
    case 'send_agent_message': {
      const cfg = data.config as SendAgentMessageConfig;
      return cfg.message ? `"${cfg.message.slice(0, 40)}..."` : 'Configure message...';
    }
    case 'create_moodboard': {
      const cfg = data.config as CreateMoodboardConfig;
      return cfg.title ? `Create: ${cfg.title}` : 'Configure moodboard...';
    }
    case 'add_to_moodboard': {
      const cfg = data.config as AddToMoodboardConfig;
      return cfg.moodboard_id ? 'Add product to moodboard' : 'Configure...';
    }
    case 'web_search': {
      const cfg = data.config as WebSearchConfig;
      return cfg.country && cfg.category ? `${cfg.category} in ${cfg.country}` : 'Configure search...';
    }
    case 'firecrawl_scrape': {
      const cfg = data.config as FirecrawlScrapeConfig;
      return cfg.url ? `Scrape: ${cfg.url.slice(0, 35)}...` : 'Configure URL...';
    }
    case 'apollo_enrich': {
      const cfg = data.config as ApolloEnrichConfig;
      return cfg.company_name ? `Enrich: ${cfg.company_name}` : 'Configure company...';
    }
    case 'hunter_find_contacts': {
      const cfg = data.config as HunterFindContactsConfig;
      return cfg.domain || cfg.company_name ? `Find: ${cfg.domain || cfg.company_name}` : 'Configure...';
    }
    case 'zerobounce_validate': {
      const cfg = data.config as ZeroBounceValidateConfig;
      return cfg.email ? `Validate: ${cfg.email}` : 'Configure email...';
    }
    default:
      return data.description || `Action: ${data.actionType}`;
  }
}

function ActionNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;
  const Icon = actionIcons[nodeData.actionType] || Zap;
  const summary = getActionSummary(nodeData);

  return (
    <div
      className={`min-w-[200px] rounded-lg border-2 bg-background shadow-sm transition-colors ${
        selected ? 'border-blue-500 shadow-blue-500/20' : 'border-blue-500/30'
      }`}
    >
      {/* Input handle */}
      <Handle
        type="target"
        position={Position.Top}
        id="input"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-t-lg border-b border-blue-500/20">
        <Icon className="h-4 w-4 text-blue-600" />
        <span className="text-sm font-medium text-blue-700 dark:text-blue-400 truncate">
          {nodeData.label}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground truncate">{summary}</p>
      </div>

      {/* Output handle (for chaining) */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="output"
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
