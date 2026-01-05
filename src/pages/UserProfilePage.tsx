import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User, CreditCard, DollarSign, FileText, Activity } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ProfileTab } from '@/components/core/Profile/ProfileTab';
import { SubscriptionTab } from '@/components/core/Profile/SubscriptionTab';
import { CreditsTab } from '@/components/core/Profile/CreditsTab';
import { BillingHistoryTab } from '@/components/core/Profile/BillingHistoryTab';
import { UsageHistoryTab } from '@/components/core/Profile/UsageHistoryTab';

export const UserProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <div
        className="sticky top-0 z-50 m-4 rounded-3xl"
        style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => navigate('/')}
                variant="ghost"
                className="flex items-center gap-2 hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="h-6 w-px bg-white/20" />
              <h1 className="text-2xl font-bold">My Profile</h1>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Tab Navigation */}
          <TabsList className="grid w-full grid-cols-5 bg-white/80 backdrop-blur-sm rounded-2xl p-1 shadow-sm">
            <TabsTrigger
              value="profile"
              className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <User className="h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger
              value="subscription"
              className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <CreditCard className="h-4 w-4" />
              Subscription
            </TabsTrigger>
            <TabsTrigger
              value="credits"
              className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <DollarSign className="h-4 w-4" />
              Credits
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <FileText className="h-4 w-4" />
              Billing History
            </TabsTrigger>
            <TabsTrigger
              value="usage"
              className="flex items-center gap-2 rounded-xl data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <Activity className="h-4 w-4" />
              Usage History
            </TabsTrigger>
          </TabsList>

          {/* Tab Content */}
          <TabsContent value="profile" className="space-y-6">
            <ProfileTab />
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

          <TabsContent value="usage" className="space-y-6">
            <UsageHistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

