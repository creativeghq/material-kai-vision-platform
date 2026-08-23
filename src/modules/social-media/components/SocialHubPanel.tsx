/**
 * Channels, in one place — Profile → Social Accounts.
 *
 * Social publishing and WhatsApp are the same Zernio account and the same mental model ("channels
 * we talk to customers on"), but they were two unrelated surfaces: connect lived on this profile
 * tab, while everything operational — the number, Meta templates, campaigns, the message log, the
 * opt-out register — lived on /messaging, an admin-shaped page the app launcher never linked. And
 * social analytics lived nowhere at all.
 *
 * One side-rail now covers all three, grouped the way an operator asks for them. The rail is
 * HubSideNav (the settings archetype) rather than a third row of tabs: eleven sections in a tab
 * strip wraps to three lines and stops telling you where you are.
 *
 * `?section=` is a real deep-link — nav items and the launcher point straight at a section — and
 * it round-trips through the URL so a reload keeps its place.
 */
import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Share2, BarChart3, Settings, FileText, Send, MessageCircle, Users, Bell, Building2,
} from 'lucide-react';
import { HubSideNav, type HubNavGroup } from '@/components/core/hub/HubSideNav';
import { useEntitlements } from '@/hooks/useEntitlements';
import { usePermissions } from '@/hooks/usePermissions';
import { SocialAccountsTab } from './SocialAccountsTab';
import { SocialAnalyticsPanel } from './SocialAnalyticsPanel';
import { WorkspaceSocialAccounts } from './WorkspaceSocialAccounts';
import { MessagingChannelsTab } from '@/modules/messaging/components/MessagingChannelsTab';
import { MessagingTemplatesTab } from '@/modules/messaging/components/MessagingTemplatesTab';
import { MessagingCampaignsTab } from '@/modules/messaging/components/MessagingCampaignsTab';
import { MessagingLogsTab } from '@/modules/messaging/components/MessagingLogsTab';
import { MessagingAnalyticsTab } from '@/modules/messaging/components/MessagingAnalyticsTab';
import { MessagingOptoutsTab } from '@/modules/messaging/components/MessagingOptoutsTab';
import { PushNotificationsTab } from '@/modules/messaging/components/PushNotificationsTab';

type SectionId =
  | 'accounts' | 'workspace-accounts' | 'analytics'
  | 'whatsapp' | 'wa-templates' | 'wa-campaigns' | 'wa-logs' | 'wa-analytics' | 'wa-optouts' | 'wa-push';

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
  'wa-templates': MessagingTemplatesTab,
  'wa-campaigns': MessagingCampaignsTab,
  'wa-logs': MessagingLogsTab,
  'wa-analytics': MessagingAnalyticsTab,
  'wa-optouts': MessagingOptoutsTab,
  'wa-push': PushNotificationsTab,
};

export const SocialHubPanel: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { isModuleAvailable } = useEntitlements();
  const { isWorkspaceManager } = usePermissions();

  const hasMessaging = isModuleAvailable('messaging');
  const raw = params.get('section') as SectionId | null;

  const groups = useMemo<HubNavGroup[]>(() => {
    const social = [
      { id: 'accounts', label: 'My accounts', icon: Share2 },
      // The workspace-wide roster is the same read /social-media/accounts does, and it carries the
      // same workspace-admin gate the route does — an ordinary member seeing every colleague's
      // connected handles is a disclosure, not a convenience.
      ...(isWorkspaceManager ? [{ id: 'workspace-accounts', label: 'Workspace accounts', icon: Building2 }] : []),
      { id: 'analytics', label: 'Post analytics', icon: BarChart3 },
    ];
    const out: HubNavGroup[] = [{ label: 'Social', items: social }];
    if (hasMessaging && isWorkspaceManager) {
      out.push({
        label: 'WhatsApp',
        items: [
          { id: 'whatsapp', label: 'Number & channel', icon: Settings },
          { id: 'wa-templates', label: 'Templates', icon: FileText },
          { id: 'wa-campaigns', label: 'Campaigns', icon: Send },
          { id: 'wa-logs', label: 'Message log', icon: MessageCircle },
          { id: 'wa-analytics', label: 'Analytics', icon: BarChart3 },
          { id: 'wa-optouts', label: 'Opt-outs', icon: Users },
          { id: 'wa-push', label: 'Push notifications', icon: Bell },
        ],
      });
    }
    return out;
  }, [hasMessaging, isWorkspaceManager]);

  // Only ids the rail actually offers are reachable. A stale/hand-typed `?section=` — or a
  // WhatsApp link followed by someone without the module — falls back rather than rendering a
  // pane the person is not entitled to see.
  const offered = useMemo(
    () => new Set(groups.flatMap(g => g.items.map(i => i.id))),
    [groups],
  );
  const active: SectionId = raw && offered.has(raw) ? raw : DEFAULT_SECTION;

  // Normalise the URL when it named something unreachable, so a bookmark stops lying.
  useEffect(() => {
    if (raw && raw !== active) {
      const next = new URLSearchParams(params);
      next.set('section', active);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, active]);

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('section', id);
    setParams(next, { replace: true });
  };

  const Section = SECTIONS[active];

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <HubSideNav
        groups={groups}
        activeId={active}
        onSelect={select}
        aria-label="Channel sections"
      />
      <div className="min-w-0 flex-1">
        <Section />
      </div>
    </div>
  );
};

export default SocialHubPanel;
