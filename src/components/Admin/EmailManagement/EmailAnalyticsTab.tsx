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
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading analytics...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Delivery Rate Card */}
        <div className="dashboard-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: analytics.deliveryRate >= 95 ? 'hsl(142 71% 45% / 0.1)' : 'hsl(var(--destructive) / 0.1)'
                }}
              >
                {analytics.deliveryRate >= 95 ? (
                  <TrendingUp className="h-5 w-5" style={{ color: 'hsl(142 71% 45%)' }} />
                ) : (
                  <TrendingDown className="h-5 w-5" style={{ color: 'hsl(var(--destructive))' }} />
                )}
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Delivery Rate</p>
            <p className="text-2xl font-bold">{analytics.deliveryRate.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">
              {analytics.totalDelivered.toLocaleString()} of {analytics.totalSent.toLocaleString()} emails
            </p>
          </div>
        </div>

        {/* Bounce Rate Card */}
        <div className="dashboard-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: analytics.bounceRate > 5 ? 'hsl(var(--destructive) / 0.1)' : 'hsl(var(--muted) / 0.5)'
                }}
              >
                <Mail className="h-5 w-5" style={{ color: analytics.bounceRate > 5 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' }} />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Bounce Rate</p>
            <p className="text-2xl font-bold">{analytics.bounceRate.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">
              {analytics.totalBounced.toLocaleString()} bounced emails
            </p>
            {analytics.bounceRate > 5 && (
              <p className="text-xs text-red-500 mt-1">⚠️ High bounce rate</p>
            )}
          </div>
        </div>

        {/* Complaint Rate Card */}
        <div className="dashboard-card">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: analytics.complaintRate > 0.1 ? 'hsl(var(--warning) / 0.1)' : 'hsl(var(--muted) / 0.5)'
                }}
              >
                <AlertTriangle className="h-5 w-5" style={{ color: analytics.complaintRate > 0.1 ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))' }} />
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Complaint Rate</p>
            <p className="text-2xl font-bold">{analytics.complaintRate.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground">
              {analytics.totalComplained.toLocaleString()} complaints
            </p>
            {analytics.complaintRate > 0.1 && (
              <p className="text-xs text-red-500 mt-1">⚠️ High complaint rate</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Email Volume Chart */}
        <div className="dashboard-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Email Volume</h3>
            <p className="text-sm text-muted-foreground">Total emails by status (Last 30 days)</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)'
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Rates Chart */}
        <div className="dashboard-card">
          <div className="mb-4">
            <h3 className="text-lg font-semibold">Performance Rates</h3>
            <p className="text-sm text-muted-foreground">Delivery, bounce, and complaint rates</p>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={rateData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
              <YAxis stroke="hsl(var(--muted-foreground))" />
              <Tooltip
                formatter={(value) => `${value}%`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)'
                }}
              />
              <Bar dataKey="value" fill="hsl(142 71% 45%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recommendations */}
      <div className="dashboard-card">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Recommendations</h3>
          <p className="text-sm text-muted-foreground">Tips to improve your email deliverability</p>
        </div>
        <ul className="space-y-3 text-sm">
          {analytics.bounceRate > 5 && (
            <li className="flex items-start gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <span className="text-yellow-900">Your bounce rate is high. Consider cleaning your email list and removing invalid addresses.</span>
            </li>
          )}
          {analytics.complaintRate > 0.1 && (
            <li className="flex items-start gap-3 p-3 rounded-lg bg-red-50 border border-red-200">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
              <span className="text-red-900">Your complaint rate is elevated. Review your email content and ensure recipients have opted in.</span>
            </li>
          )}
          {analytics.deliveryRate >= 95 && analytics.bounceRate < 5 && analytics.complaintRate < 0.1 && (
            <li className="flex items-start gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
              <TrendingUp className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
              <span className="text-green-900">Great job! Your email metrics are healthy. Keep maintaining good email practices.</span>
            </li>
          )}
          {analytics.deliveryRate < 95 && analytics.bounceRate <= 5 && analytics.complaintRate <= 0.1 && (
            <li className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
              <Mail className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <span className="text-blue-900">Your metrics are good. Continue monitoring and optimizing your email campaigns.</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default EmailAnalyticsTab;

