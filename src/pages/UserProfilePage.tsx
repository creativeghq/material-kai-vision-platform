import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { filterUrl } from '@/components/core/filters';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { HubRailSectionLabel } from '@/components/core/hub';
import { ProfileTab } from '@/components/core/Profile/ProfileTab';
import { AmbassadorTab } from '@/components/core/Profile/AmbassadorTab';
import { SubscriptionTab } from '@/components/core/Profile/SubscriptionTab';
import { CreditsTab } from '@/components/core/Profile/CreditsTab';
import { BillingHistoryTab } from '@/components/core/Profile/BillingHistoryTab';
import { MyDocumentsTab } from '@/components/core/Profile/MyDocumentsTab';
import { SocialHubPanel } from '@/modules/social-media/components/SocialHubPanel';
import { WebsitesTab } from '@/components/core/Profile/WebsitesTab';
import { WorkspaceKeysTab } from '@/components/core/Profile/WorkspaceKeysTab';
import { WebhooksTab } from '@/components/core/Profile/WebhooksTab';
import { AccountStatusCard } from '@/components/core/Profile/AccountStatusCard';
import { ModulesActivationTab } from '@/components/core/Profile/ModulesActivationTab';
import { TeamPanel } from '@/components/core/Team/TeamPanel';
import SupplierPortalPage from './SupplierPortalPage';
import { SchedulePanel } from '@/components/core/Profile/SchedulePanel';
import { ReviewsSection } from '@/components/features/profile/ReviewsSection';
import { DEFAULT_PROFILE_TAB, profileRailRows } from '@/components/core/Profile/sections';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';

/**
 * Where `?tab=inbox` goes now. Messages sent through a public profile stopped being their own
 * store and their own screen — they are ordinary Inbox conversations tagged `Public profile`, so
 * this tab is that Inbox with the Source filter already set. Bookmarks, the notification bell and
 * every `hire_me` flow emitted before the change all keep working through this redirect.
 */
const PROFILE_INBOX_URL = filterUrl('/inbox', 'f', { source: 'public_profile' });

/**
 * Tabs that became SECTIONS of another tab, and the section each one is now.
 *
 * A stored `action_url` outlives the screen it was written for: notification rows, the CRM
 * meeting-reminder edge function and anyone's bookmarks all still spell these. An unknown `?tab=`
 * renders the strip with nothing selected and an EMPTY body — the route resolves, the page loads,
 * and the reader is looking at a blank panel — so a retired tab redirects rather than 404s
 * quietly. Source call sites are updated too; this covers what we cannot reach.
 */
const RETIRED_TABS: Record<string, string> = {
  appointments: '/profile?tab=schedule&section=appointments',
  calendar: '/profile?tab=schedule&section=calendar',
  inbox: PROFILE_INBOX_URL,
};

export const UserProfilePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const { workspaceRole, isPlatformOperator, activeWorkspaceId, activeWorkspace } = useWorkspace();
  // Team & Portals: only the people who can actually invite (owner/admin of this workspace) —
  // the write RPCs re-check the same thing server-side.
  const showTeam = workspaceRole === 'owner' || workspaceRole === 'admin' || isPlatformOperator;
  // Modules tab is visible to every workspace member: owners activate/purchase; non-owners
  // see the catalog and can request activation from the owner.
  const showModules = !!workspaceRole || isPlatformOperator;
  // Supplier-only participation: a workspace can claim a (VAT, country) supplier identity
  // and receive purchase orders WITHOUT enabling the Finance module. Finance-enabled workspaces
  // reach the Supplier Portal under Finance → Payables instead, so we only surface it here for
  // marketplace business users who are not finance-managed.
  const showSupplierPortal = can('marketplace.browse') && !can('finance.manage');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? DEFAULT_PROFILE_TAB);

  const railRows = profileRailRows({
    team: showTeam,
    modules: showModules,
    supplierPortal: showSupplierPortal,
  });

  useEffect(() => {
    const tab = searchParams.get('tab') ?? DEFAULT_PROFILE_TAB;
    const retired = RETIRED_TABS[tab];
    if (retired) { navigate(retired, { replace: true }); return; }
    setActiveTab(tab);
  }, [searchParams, navigate]);

  const handleTabChange = (tab: string) => {
    // Heavy tab trees (several cards, each with its own fetch) block the paint on first
    // activation — mark the switch as a transition so the click responds instantly and
    // the content streams in behind it.
    React.startTransition(() => {
      setActiveTab(tab);
      // Only the tab survives: `?section=`/`?website=` address a pane inside the tab being left.
      setSearchParams(tab === DEFAULT_PROFILE_TAB ? {} : { tab });
    });
  };

  return (
    <div>
      <PageHeader
        icon={User}
        title="My Profile"
        subtitle="Manage your account, credits, and billing"
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        orientation="vertical"
        className="flex flex-col gap-4 lg:flex-row lg:items-start"
      >
        {/* From `PROFILE_SECTIONS`; `.section-rail` collapses it to a strip below `lg`. */}
        <TabsList className="section-rail flex h-auto w-full shrink-0 flex-row gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
          {railRows.map((row) => (row.kind === 'heading' ? (
            <HubRailSectionLabel key={`group:${row.label}`}>{row.label}</HubRailSectionLabel>
          ) : (
            <TabsTrigger key={row.section.value} value={row.section.value} className="w-full justify-start gap-2">
              <row.section.icon className="h-4 w-4 shrink-0" /> {row.section.label}
            </TabsTrigger>
          )))}
        </TabsList>

        <div className="min-w-0 flex-1 space-y-6">
        <TabsContent value="profile" className="space-y-6">
          <ProfileTab />
          {/* Renders nothing unless the user has a workspace; shows a status card once disabled. */}
          <AccountStatusCard />
        </TabsContent>

        <TabsContent value="ambassador" className="space-y-6">
          <AmbassadorTab />
        </TabsContent>

        <TabsContent value="schedule">
          <SchedulePanel />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          {user && (<ReviewsSection profileUserId={user.id} currentUserId={user.id} hideHeader />)}
        </TabsContent>

        <TabsContent value="subscription" className="space-y-6">
          <SubscriptionTab />
        </TabsContent>

        <TabsContent value="credits" className="space-y-6">
          <CreditsTab />
        </TabsContent>

        <TabsContent value="billing" className="space-y-6">
          <BillingHistoryTab />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <MyDocumentsTab />
        </TabsContent>

        <TabsContent value="social-accounts" className="space-y-6">
          <SocialHubPanel />
        </TabsContent>

        <TabsContent value="websites" className="space-y-6">
          <WebsitesTab />
        </TabsContent>

        <TabsContent value="keys" className="space-y-6">
          <WorkspaceKeysTab />
        </TabsContent>

        <TabsContent value="webhooks" className="space-y-6">
          <WebhooksTab />
        </TabsContent>

        {showTeam && activeWorkspaceId && (
          <TabsContent value="team" className="space-y-6">
            <TeamPanel workspaceId={activeWorkspaceId} workspaceName={activeWorkspace?.name} />
          </TabsContent>
        )}

        {showModules && (
          <TabsContent value="modules" className="space-y-6">
            <ModulesActivationTab />
          </TabsContent>
        )}

        {showSupplierPortal && (
          <TabsContent value="supplier-portal" className="space-y-6">
            <SupplierPortalPage embedded />
          </TabsContent>
        )}
        </div>
      </Tabs>
      </div>
    </div>
  );
};
