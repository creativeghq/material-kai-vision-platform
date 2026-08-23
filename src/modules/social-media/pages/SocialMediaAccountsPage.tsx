/**
 * SocialMediaAccountsPage — the standalone route for the workspace-wide account roster.
 *
 * The table itself is WorkspaceSocialAccounts, shared with Profile → Social Accounts → Workspace
 * accounts, so the two surfaces cannot drift. This page is the PageHeader around it plus the
 * pointer to where a connection actually happens.
 */
import React from 'react';
import { Share2, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { WorkspaceSocialAccounts } from '../components/WorkspaceSocialAccounts';

export const SocialMediaAccountsPage: React.FC = () => (
  <div>
    <PageHeader
      icon={Share2}
      title="Social Media Accounts"
      subtitle="Overview of all social accounts connected by team members"
    />

    <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
      <div className="dashboard-card flex items-start gap-3 text-sm">
        <ExternalLink className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div>
          <p className="font-medium">Personal account connections</p>
          <p className="text-muted-foreground mt-0.5">
            Each team member connects their own social accounts from{' '}
            <Link to="/profile?tab=social-accounts&section=accounts" className="underline text-primary hover:text-primary/80">
              My Profile → Social Accounts
            </Link>
            , where the WhatsApp channel and post analytics live too. This page shows a
            workspace-wide overview.
          </p>
        </div>
      </div>

      <WorkspaceSocialAccounts />
    </div>
  </div>
);

export default SocialMediaAccountsPage;
