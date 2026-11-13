import React from 'react';
import { Bell } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';

import { PushBroadcastPanel } from './PushBroadcastPanel';

const PushNotificationsPage: React.FC = () => (
  <div>
    <PageHeader
      icon={Bell}
      title="Push Notifications"
      subtitle="Broadcast a push notification to platform users and review what was sent."
    />
    <div className="space-y-4 p-3 sm:p-6">
      <PushBroadcastPanel />
    </div>
  </div>
);

export default PushNotificationsPage;
