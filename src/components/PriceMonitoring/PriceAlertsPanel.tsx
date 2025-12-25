/**
 * Price Alerts Panel
 * Manage price alert configurations
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';

interface PriceAlertsPanelProps {
  onRefresh: () => void;
}

export const PriceAlertsPanel: React.FC<PriceAlertsPanelProps> = ({ onRefresh }) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Price Alerts</CardTitle>
          <Button size="sm">
            <Bell className="h-4 w-4 mr-2" />
            New Alert
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No price alerts configured yet
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Create alerts to get notified when prices change
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default PriceAlertsPanel;

