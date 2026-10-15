import React from 'react';

import { PageHeader, type PageHeaderCrumb } from '@/components/shared/PageHeader';
import { HubRecordLayout } from './HubRecordLayout';

interface HubRecordPageProps {
  icon: React.ComponentType<{ className?: string }>;
  /** The record's own stored name — always rendered in the sans face. */
  title: string;
  subtitle?: string;
  breadcrumbs: PageHeaderCrumb[];
  actions?: React.ReactNode;
  left: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Dialogs and other overlays that belong to the page but not to a column. */
  overlays?: React.ReactNode;
}

/** RECORD PAGE — PageHeader + HubRecordLayout, the whole §7 record archetype in one component. */
export const HubRecordPage: React.FC<HubRecordPageProps> = ({
  icon, title, subtitle, breadcrumbs, actions, left, right, children, overlays,
}) => (
  <div className="min-h-screen bg-background">
    <PageHeader icon={icon} recordTitle title={title} subtitle={subtitle} breadcrumbs={breadcrumbs} actions={actions} />
    <HubRecordLayout className="sm:p-6" left={left} right={right}>{children}</HubRecordLayout>
    {overlays}
  </div>
);
