import React, { useEffect, useState } from 'react';
import { User, CreditCard, Coins, FileText, Inbox, CalendarCheck, CalendarDays, Star, Share2, ReceiptText, KeyRound, Truck, LayoutGrid, Globe, Users, Webhook } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ProfileTab } from '@/components/core/Profile/ProfileTab';
import { SubscriptionTab } from '@/components/core/Profile/SubscriptionTab';
import { CreditsTab } from '@/components/core/Profile/CreditsTab';
import { BillingHistoryTab } from '@/components/core/Profile/BillingHistoryTab';
import { MyDocumentsTab } from '@/components/core/Profile/MyDocumentsTab';
import { InboxTab } from '@/components/core/Profile/InboxTab';
import { SocialAccountsTab } from '@/modules/social-media/components/SocialAccountsTab';
import { WebsitesTab } from '@/components/core/Profile/WebsitesTab';
import { WorkspaceKeysTab } from '@/components/core/Profile/WorkspaceKeysTab';
import { WebhooksTab } from '@/components/core/Profile/WebhooksTab';
import { AccountStatusCard } from '@/components/core/Profile/AccountStatusCard';
import { ModulesActivationTab } from '@/components/core/Profile/ModulesActivationTab';
import { TeamPanel } from '@/components/core/Team/TeamPanel';
import SupplierPortalPage from './SupplierPortalPage';
import { AppointmentsPage } from './AppointmentsPage';
import { ProfileMeetingsTab } from '@/components/core/Profile/ProfileMeetingsTab';
import { ReviewsSection } from '@/components/features/profile/ReviewsSection';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';

export const UserProfilePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? 'profile');

  useEffect(() => {
    const tab = searchParams.get('tab') ?? 'profile';
    setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (tab: string) => {
    // Heavy tab trees (several cards, each with its own fetch) block the paint on first
    // activation — mark the switch as a transition so the click responds instantly and
    // the content streams in behind it.
    React.startTransition(() => {
      setActiveTab(tab);
      setSearchParams(tab === 'profile' ? {} : { tab });
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
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="profile" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-2">
            <CalendarCheck className="h-4 w-4" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Reviews
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="credits" className="flex items-center gap-2">
            <Coins className="h-4 w-4" />
            Credits
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" />
            My Account
          </TabsTrigger>
          <TabsTrigger value="social-accounts" className="flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Social Accounts
          </TabsTrigger>
          <TabsTrigger value="websites" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Websites
          </TabsTrigger>
          <TabsTrigger value="keys" className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            Keys
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="flex items-center gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
          {showTeam && (
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
          )}
          {showModules && (
            <TabsTrigger value="modules" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              Modules
            </TabsTrigger>
          )}
          {showSupplierPortal && (
            <TabsTrigger value="supplier-portal" className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Supplier Portal
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileTab />
          {/* Renders nothing unless the user has a workspace; shows a status card once disabled. */}
          <AccountStatusCard />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-6">
          <InboxTab />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentsPage embedded />
        </TabsContent>

        <TabsContent value="calendar">
          <ProfileMeetingsTab />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <SectionHeader icon={Star} title="Reviews from Clients" subtitle="Reviews left by people who have worked with you. You can reply to each one." />
          {user && (<ReviewsSection profileUserId={user.id} currentUserId={user.id} />)}
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
          <SocialAccountsTab />
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
            <SectionHeader
              icon={Users}
              title="Team & Portals"
              subtitle="Invite colleagues and decide which portal each of them lands on."
            />
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
      </Tabs>
      </div>
    </div>
  );
};
