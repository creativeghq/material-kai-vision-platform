/** Channels, in one place — Profile → Social Accounts. */
import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Share2, BarChart3, Settings, FileText, Send, MessageCircle, Users, Bell, Building2, Phone,
} from 'lucide-react';
import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePermissions } from '@/hooks/usePermissions';
import { SocialAccountsTab } from './SocialAccountsTab';
import { SocialAnalyticsPanel } from './SocialAnalyticsPanel';
import { WorkspaceSocialAccounts } from './WorkspaceSocialAccounts';
import { MessagingChannelsTab } from '@/modules/messaging/components/MessagingChannelsTab';
import { PhoneNumbersTab } from '@/modules/messaging/components/PhoneNumbersTab';
import { MessagingTemplatesTab } from '@/modules/messaging/components/MessagingTemplatesTab';
import { MessagingCampaignsTab } from '@/modules/messaging/components/MessagingCampaignsTab';
import { MessagingLogsTab } from '@/modules/messaging/components/MessagingLogsTab';
import { MessagingAnalyticsTab } from '@/modules/messaging/components/MessagingAnalyticsTab';
import { MessagingOptoutsTab } from '@/modules/messaging/components/MessagingOptoutsTab';
import { PushNotificationsTab } from '@/modules/messaging/components/PushNotificationsTab';

type SectionId =
  | 'accounts' | 'workspace-accounts' | 'analytics'
  | 'whatsapp' | 'wa-numbers' | 'wa-templates' | 'wa-campaigns' | 'wa-logs' | 'wa-analytics'
  | 'wa-optouts' | 'wa-push';

const DEFAULT_SECTION: SectionId = 'accounts';

/**
 * `whatsapp` is the WhatsApp group's landing id so an external link can say `?section=whatsapp`
 * without knowing the rail's internal section names.
 */
const SECTIONS: Record<SectionId, React.ComponentType> = {
  'accounts': SocialAccountsTab,
  'workspace-accounts': WorkspaceSocialAccounts,
  'analytics': SocialAnalyticsPanel,
  'whatsapp': MessagingChannelsTab,
  'wa-numbers': PhoneNumbersTab,
  'wa-templates': MessagingTemplatesTab,
  'wa-campaigns': MessagingCampaignsTab,
  'wa-logs': MessagingLogsTab,
  'wa-analytics': MessagingAnalyticsTab,
  'wa-optouts': MessagingOptoutsTab,
  'wa-push': PushNotificationsTab,
};

export const SocialHubPanel: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { isModuleAvailable, loading: entLoading } = useEntitlements();
  const { isWorkspaceManager, loading: permLoading } = usePermissions();

  const hasMessaging = isModuleAvailable('messaging');
  const raw = params.get('section') as SectionId | null;

  const tabs = useMemo<HubTabItem[]>(() => {
    const out: HubTabItem[] = [
      { id: 'accounts', label: 'My accounts', icon: Share2 },
      // The workspace-wide roster is the same read /social-media/accounts does, and it carries the
      // same workspace-admin gate the route does — an ordinary member seeing every colleague's
      // connected handles is a disclosure, not a convenience.
      ...(isWorkspaceManager ? [{ id: 'workspace-accounts', label: 'Workspace accounts', icon: Building2 }] : []),
      { id: 'analytics', label: 'Post analytics', icon: BarChart3 },
    ];
    if (hasMessaging && isWorkspaceManager) {
      out.push(
        { id: 'whatsapp', label: 'WhatsApp channel', icon: Settings },
        // First in the order a workspace without WhatsApp actually needs: get a number,
        // then everything else. It used to be the one step the product did not offer.
        { id: 'wa-numbers', label: 'Get a number', icon: Phone },
        { id: 'wa-templates', label: 'WhatsApp templates', icon: FileText },
        { id: 'wa-campaigns', label: 'WhatsApp campaigns', icon: Send },
        { id: 'wa-logs', label: 'Message log', icon: MessageCircle },
        { id: 'wa-analytics', label: 'WhatsApp analytics', icon: BarChart3 },
        { id: 'wa-optouts', label: 'Opt-outs', icon: Users },
        { id: 'wa-push', label: 'Push notifications', icon: Bell },
      );
    }
    return out;
  }, [hasMessaging, isWorkspaceManager]);

  // Only ids the strip actually offers are reachable. A stale/hand-typed `?section=` — or a
  // WhatsApp link followed by someone without the module — falls back rather than rendering a
  // pane the person is not entitled to see.
  const offered = useMemo(() => new Set(tabs.map(t => t.id)), [tabs]);
  const active: SectionId = raw && offered.has(raw) ? raw : DEFAULT_SECTION;

  // Not while the gates load: every WhatsApp id is unoffered until then, and `replace` would destroy the link.
  useEffect(() => {
    if (!entLoading && !permLoading && raw && raw !== active) {
      const next = new URLSearchParams(params);
      next.set('section', active);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, active, entLoading, permLoading]);

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('section', id);
    setParams(next, { replace: true });
  };

  const Section = SECTIONS[active];

  return (
    <div className="space-y-6">
      <HubTabNav items={tabs} activeId={active} onSelect={select} aria-label="Channel sections" />
      <div className="min-w-0">
        <Section />
      </div>
    </div>
  );
};

export default SocialHubPanel;
