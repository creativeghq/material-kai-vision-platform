import React, { useState } from 'react';
import { User, CreditCard, Coins, FileText, Inbox } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ProfileTab } from '@/components/core/Profile/ProfileTab';
import { SubscriptionTab } from '@/components/core/Profile/SubscriptionTab';
import { CreditsTab } from '@/components/core/Profile/CreditsTab';
import { BillingHistoryTab } from '@/components/core/Profile/BillingHistoryTab';
import { InboxTab } from '@/components/core/Profile/InboxTab';

export const UserProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account, credits, and billing</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="profile" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Inbox className="h-4 w-4" />
            Inbox
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
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="inbox" className="space-y-6">
          <InboxTab />
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
      </Tabs>
    </div>
  );
};
