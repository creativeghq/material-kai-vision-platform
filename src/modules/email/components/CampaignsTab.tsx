/**
 * Campaigns Tab
 * Manage email marketing campaigns
 */

import React, { useState, useEffect } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import {
  HubCellEmpty, HubDataTable, HubEmptyState, HubFilterSelect, HubResetFilters, HubToolbar, HUB_FILTER_ALL,
  useHubTable, type HubColumn, type HubTableField,
} from '@/components/core/hub';
import { statusBadgeVariant } from '@/utils/recordDisplay';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CreateCampaignModal } from './CreateCampaignModal';
import { CampaignDetailsModal } from './CampaignDetailsModal';
import { format } from 'date-fns';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  scheduled_at?: string;
  sent_at?: string;
  recipient_count: number;
  subject_line?: string;
  preview_text?: string;
  from_name?: string;
  from_email?: string;
  reply_to?: string;
  track_opens: boolean;
  track_clicks: boolean;
  template?: {
    id: string;
    name: string;
  };
  created_at: string;
}

const statusLabels = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  paused: 'Paused',
  cancelled: 'Cancelled',
};

const CAMPAIGN_FIELDS: HubTableField<Campaign>[] = [
  { id: 'name', sortValue: (c) => c.name, searchText: (c) => `${c.name} ${c.subject_line ?? ''}` },
  {
    id: 'status',
    sortValue: (c) => c.status,
    filterValue: (c) => c.status,
    filterLabel: 'Status',
    filterOptionLabel: (v) => statusLabels[v as Campaign['status']] ?? v,
  },
  {
    id: 'template',
    sortValue: (c) => c.template?.name,
    filterValue: (c) => c.template?.name,
    filterLabel: 'Template',
  },
  { id: 'recipients', sortValue: (c) => c.recipient_count },
  { id: 'scheduled', sortValue: (c) => c.scheduled_at },
];

export const CampaignsTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [page, setPage] = useState(1);
  const { toast } = useToast();
  const t = useHubTable(campaigns, CAMPAIGN_FIELDS);

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    setPage((p) => clampPage(p, t.rows.length));
  }, [t.rows.length]);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('campaigns')
        .select(`
          *,
          template:email_templates(id, name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
      // Deleting a draft can shrink the list — don't strand the user on a now-empty page.
      setPage((p) => clampPage(p, (data || []).length));
    } catch (error) {
      console.error('Error loading campaigns:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaigns',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Campaign deleted successfully',
      });

      loadCampaigns();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete campaign. Only draft campaigns can be deleted.',
        variant: 'destructive',
      });
    }
  };

  const handleViewCampaign = (campaign: Campaign) => {
    setSelectedCampaign(campaign);
  };

  const columns: HubColumn<Campaign>[] = [
    {
      id: 'name',
      header: 'Campaign',
      sortable: true,
      cell: (campaign) => (
        <div className="min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleViewCampaign(campaign); }}
            className="text-left font-semibold text-primary hover:underline rounded-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {campaign.name}
          </button>
          {campaign.subject_line && (
            <div className="max-w-[20rem] truncate text-xs text-muted-foreground" title={campaign.subject_line}>
              {campaign.subject_line}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: (campaign) => (
        <Badge variant={statusBadgeVariant(campaign.status)}>{statusLabels[campaign.status] ?? campaign.status}</Badge>
      ),
    },
    {
      id: 'template',
      header: 'Template',
      sortable: true,
      hideBelow: 'md',
      cell: (campaign) => campaign.template?.name ?? <HubCellEmpty />,
    },
    {
      id: 'recipients',
      header: 'Recipients',
      sortable: true,
      align: 'right',
      hideBelow: 'sm',
      cell: (campaign) => campaign.recipient_count,
    },
    {
      id: 'scheduled',
      header: 'Scheduled',
      sortable: true,
      hideBelow: 'md',
      cell: (campaign) =>
        campaign.scheduled_at ? (
          <span className="whitespace-nowrap">{format(new Date(campaign.scheduled_at), 'MMM d, yyyy HH:mm')}</span>
        ) : (
          <span className="text-muted-foreground">Not scheduled</span>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      cell: (campaign) =>
        campaign.status === 'draft' ? (
          <Button
            variant="ghost"
            size="sm"
            aria-label="Delete campaign"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteCampaign(campaign.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        ) : null,
    },
  ];

  if (loading) {
    return (
      <div className="dashboard-card">
        <div className="py-8 text-center text-muted-foreground">
          Loading campaigns...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <SectionHeader
        title="Email Campaigns"
        subtitle="Create and manage email marketing campaigns"
        actions={
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create campaign
          </Button>
        }
      />

      {campaigns.length === 0 ? (
        <div className="dashboard-card p-0">
          <HubEmptyState
            icon={Send}
            title="No campaigns yet"
            description="Create your first email campaign to get started."
            action={
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create campaign
              </Button>
            }
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-hairline bg-card">
          <HubToolbar
            search={t.search}
            onSearchChange={t.setSearch}
            searchPlaceholder="Search campaigns"
            filters={<>
              <HubFilterSelect label="Status" value={t.filters.status ?? HUB_FILTER_ALL} options={t.filterOptions.status ?? []} onChange={(v) => t.setFilter('status', v)} />
              <HubFilterSelect label="Template" value={t.filters.template ?? HUB_FILTER_ALL} options={t.filterOptions.template ?? []} onChange={(v) => t.setFilter('template', v)} />
              <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
            </>}
          />
          <HubDataTable
            className="rounded-none border-0"
            rows={paginate(t.rows, page)}
            columns={columns}
            rowId={(c) => c.id}
            onRowClick={handleViewCampaign}
            sort={t.sort}
            onSortChange={t.setSort}
            empty={
              <HubEmptyState
                variant="filtered"
                title="No campaigns match"
                action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
              />
            }
          />
          <TablePagination
            page={page}
            total={t.rows.length}
            onPageChange={setPage}
            label="campaigns"
          />
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadCampaigns();
            setShowCreateModal(false);
          }}
        />
      )}

      {selectedCampaign && (
        <CampaignDetailsModal
          campaign={selectedCampaign}
          onClose={() => setSelectedCampaign(null)}
          onUpdate={() => {
            loadCampaigns();
            setSelectedCampaign(null);
          }}
        />
      )}
    </div>
  );
};

export default CampaignsTab;

