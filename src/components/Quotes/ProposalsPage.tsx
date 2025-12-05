import React, { useState, useEffect } from 'react';
import { FileCheck, Loader2, Eye, CheckCircle, XCircle, Send, FileText } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { quotesService, Proposal } from '@/services/quotes.service';
import { ProposalDetailModal } from './ProposalDetailModal';

export const ProposalsPage: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadProposals();
  }, []);

  const loadProposals = async () => {
    try {
      setLoading(true);
      const data = await quotesService.getProposals();
      setProposals(data);
    } catch (error) {
      console.error('Error loading proposals:', error);
      toast({
        title: 'Error',
        description: 'Failed to load proposals',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleViewProposal = async (proposalId: string) => {
    try {
      const proposal = await quotesService.getProposal(proposalId);
      setSelectedProposal(proposal);
      setShowModal(true);
    } catch (error) {
      console.error('Error loading proposal details:', error);
      toast({
        title: 'Error',
        description: 'Failed to load proposal details',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: {
        color: 'bg-[hsl(var(--badge-draft-bg))] text-[hsl(var(--badge-draft-text))] border-[hsl(var(--badge-draft-border))]',
        icon: FileText
      },
      sent: {
        color: 'bg-[hsl(var(--badge-sent-bg))] text-[hsl(var(--badge-sent-text))] border-[hsl(var(--badge-sent-border))]',
        icon: Send
      },
      accepted: {
        color: 'bg-[hsl(var(--badge-approved-bg))] text-[hsl(var(--badge-approved-text))] border-[hsl(var(--badge-approved-border))]',
        icon: CheckCircle
      },
      rejected: {
        color: 'bg-[hsl(var(--badge-rejected-bg))] text-[hsl(var(--badge-rejected-text))] border-[hsl(var(--badge-rejected-border))]',
        icon: XCircle
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge variant="secondary" className={config.color}>
        <Icon className="h-3 w-3 mr-1" />
        {status}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card" style={{ paddingTop: 'var(--space-xl)', paddingBottom: 'var(--space-xl)' }}>
        <div className="page-container">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <FileCheck className="h-8 w-8 text-primary" />
                Proposals
              </h1>
              <p className="text-muted-foreground mt-2">
                Review and manage supplier proposals
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Proposals Table */}
      <div className="page-container" style={{ marginTop: 'var(--space-xl)' }}>
        {proposals.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileCheck className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-lg">No proposals yet</p>
              <p className="text-muted-foreground/60 text-sm mt-2">
                Proposals will appear here once suppliers respond to your quote requests
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-card-foreground">All Proposals</CardTitle>
              <CardDescription className="text-muted-foreground">
                {proposals.length} total proposal{proposals.length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-muted-foreground">ID</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                      <TableHead className="text-muted-foreground">Total</TableHead>
                      <TableHead className="text-muted-foreground">Created</TableHead>
                      <TableHead className="text-muted-foreground">Sent</TableHead>
                      <TableHead className="text-muted-foreground text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proposals.map((proposal) => (
                      <TableRow key={proposal.id} className="border-border">
                        <TableCell className="text-card-foreground font-mono text-sm">
                          {proposal.id.substring(0, 8)}...
                        </TableCell>
                        <TableCell>{getStatusBadge(proposal.status)}</TableCell>
                        <TableCell className="text-card-foreground font-semibold">
                          {formatPrice(proposal.total)}
                        </TableCell>
                        <TableCell className="text-card-foreground">
                          {formatDate(proposal.created_at)}
                        </TableCell>
                        <TableCell className="text-card-foreground">
                          {proposal.sent_at ? formatDate(proposal.sent_at) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            onClick={() => handleViewProposal(proposal.id)}
                            variant="outline"
                            size="sm"
                            className="border-border text-primary hover:bg-accent"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Proposal Detail Modal */}
      {showModal && selectedProposal && (
        <ProposalDetailModal
          proposal={selectedProposal}
          onClose={() => {
            setShowModal(false);
            setSelectedProposal(null);
          }}
          onUpdate={loadProposals}
        />
      )}
    </div>
  );
};

