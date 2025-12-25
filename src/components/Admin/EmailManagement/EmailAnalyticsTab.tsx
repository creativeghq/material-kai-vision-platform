/**
 * Email Analytics Tab
 * Display email performance metrics and charts
 */

import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Mail, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { emailService } from '@/services/email/emailService';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export const EmailAnalyticsTab: React.FC = () => {
  const [analytics, setAnalytics] = useState({
    totalSent: 0,
    totalDelivered: 0,
    totalBounced: 0,
    totalComplained: 0,
    deliveryRate: 0,
    bounceRate: 0,
    complaintRate: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 30);
      
      const data = await emailService.getAnalytics(fromDate);
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const chartData = [
    { name: 'Sent', value: analytics.totalSent, color: '#3b82f6' },
    { name: 'Delivered', value: analytics.totalDelivered, color: '#10b981' },
    { name: 'Bounced', value: analytics.totalBounced, color: '#ef4444' },
    { name: 'Complained', value: analytics.totalComplained, color: '#f59e0b' },
  ];

  const rateData = [
    { name: 'Delivery Rate', value: analytics.deliveryRate, color: '#10b981' },
    { name: 'Bounce Rate', value: analytics.bounceRate, color: '#ef4444' },
    { name: 'Complaint Rate', value: analytics.complaintRate, color: '#f59e0b' },
  ];

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading analytics...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
            {analytics.deliveryRate >= 95 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.deliveryRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalDelivered.toLocaleString()} of {analytics.totalSent.toLocaleString()} emails
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bounce Rate</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.bounceRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalBounced.toLocaleString()} bounced emails
            </p>
            {analytics.bounceRate > 5 && (
              <p className="text-xs text-red-500 mt-1">⚠️ High bounce rate</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Complaint Rate</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.complaintRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">
              {analytics.totalComplained.toLocaleString()} complaints
            </p>
            {analytics.complaintRate > 0.1 && (
              <p className="text-xs text-red-500 mt-1">⚠️ High complaint rate</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Email Volume</CardTitle>
            <CardDescription>Total emails by status (Last 30 days)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Performance Rates</CardTitle>
            <CardDescription>Delivery, bounce, and complaint rates</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => `${value}%`} />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>Tips to improve your email deliverability</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {analytics.bounceRate > 5 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                <span>Your bounce rate is high. Consider cleaning your email list and removing invalid addresses.</span>
              </li>
            )}
            {analytics.complaintRate > 0.1 && (
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                <span>Your complaint rate is elevated. Review your email content and ensure recipients have opted in.</span>
              </li>
            )}
            {analytics.deliveryRate >= 95 && analytics.bounceRate < 5 && analytics.complaintRate < 0.1 && (
              <li className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-green-500 mt-0.5" />
                <span>Great job! Your email metrics are healthy. Keep maintaining good email practices.</span>
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailAnalyticsTab;

