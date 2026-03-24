import React, { useState } from 'react';
import { User, CreditCard, Coins, FileText, Inbox, CalendarCheck, Star, Share2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ProfileTab } from '@/components/core/Profile/ProfileTab';
import { SubscriptionTab } from '@/components/core/Profile/SubscriptionTab';
import { CreditsTab } from '@/components/core/Profile/CreditsTab';
import { BillingHistoryTab } from '@/components/core/Profile/BillingHistoryTab';
import { InboxTab } from '@/components/core/Profile/InboxTab';
import { SocialAccountsTab } from '@/components/core/Profile/SocialAccountsTab';
import { AppointmentsPage } from './AppointmentsPage';
import { ReviewsSection } from '@/components/features/profile/ReviewsSection';
import { useAuth } from '@/contexts/AuthContext';

export const UserProfilePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const initialTab = searchParams.get('tab') ?? 'profile';
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setSearchParams(tab === 'profile' ? {} : { tab });
  };

  return (
    <div>
      <PageHeader
        icon={User}
        title="My Profile"
        subtitle="Manage your account, credits, and billing"
      />

      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="profile" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Inbox className="h-4 w-4" />
            Inbox
          </TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CalendarCheck className="h-4 w-4" />
            Appointments
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Star className="h-4 w-4" />
            Reviews
          </TabsTrigger>
          <TabsTrigger value="subscription" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <CreditCard className="h-4 w-4" />
            Subscription
          </TabsTrigger>
          <TabsTrigger value="credits" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Coins className="h-4 w-4" />
            Credits
          </TabsTrigger>
          <TabsTrigger value="billing" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4" />
            Billing
          </TabsTrigger>
          <TabsTrigger value="social-accounts" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Share2 className="h-4 w-4" />
            Social Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-6">
          <InboxTab />
        </TabsContent>

        <TabsContent value="appointments">
          <AppointmentsPage embedded />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Reviews from clients</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Reviews left by people who have worked with you. You can reply to each one.
            </p>
            {user && (
              <ReviewsSection
                profileUserId={user.id}
                currentUserId={user.id}
              />
            )}
          </div>
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

        <TabsContent value="social-accounts" className="space-y-6">
          <SocialAccountsTab />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};
