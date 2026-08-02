/**
 * Email Domains Tab
 * Manage email domains for Resend
 */

import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/core/ui/dialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { emailService, EmailDomain } from '../services/emailService';
import { useToast } from '@/hooks/use-toast';

interface EmailDomainsTabProps {
  onDomainVerified?: () => void;
}

export const EmailDomainsTab: React.FC<EmailDomainsTabProps> = ({ onDomainVerified }) => {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [markingVerified, setMarkingVerified] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadDomains();
  }, []);

  const loadDomains = async () => {
    try {
      setLoading(true);
      const data = await emailService.getDomains();
      setDomains(data);
    } catch (error) {
      console.error('Error loading domains:', error);
      toast({ title: 'Error', description: 'Failed to load email domains', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain) return;

    try {
      setSaving(true);
      await emailService.addDomain(newDomain);

      toast({
        title: 'Domain Added',
        description: `${newDomain} has been added. Verify it in your Resend dashboard, then mark it verified here.`,
      });

      setShowAddDialog(false);
      setNewDomain('');
      loadDomains();
    } catch (error) {
      console.error('Error adding domain:', error);
      toast({ title: 'Error', description: 'Failed to add domain', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkVerified = async (domain: string) => {
    try {
      setMarkingVerified(domain);
      await emailService.markDomainVerified(domain);

      toast({ title: 'Domain Verified', description: `${domain} has been marked as verified.` });

      if (onDomainVerified) onDomainVerified();
      loadDomains();
    } catch (error) {
      console.error('Error marking domain verified:', error);
      toast({ title: 'Error', description: 'Failed to update domain status', variant: 'destructive' });
    } finally {
      setMarkingVerified(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified': return <Badge variant="default">Verified</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Email Domains"
        subtitle={
          <>
            Manage sending domains via{' '}
            <a
              href="https://resend.com/domains"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline underline-offset-2"
            >
              Resend <ExternalLink className="h-3 w-3" />
            </a>
          </>
        }
        actions={
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add domain
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Email Domain</DialogTitle>
                <DialogDescription>
                  Add a domain you've already added to your{' '}
                  <a
                    href="https://resend.com/domains"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    Resend dashboard
                  </a>
                  . After adding DNS records and verifying in Resend, mark it verified here.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name</Label>
                  <Input
                    id="domain"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddDomain} disabled={saving || !newDomain}>
                  {saving ? 'Adding...' : 'Add Domain'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Resend dashboard link banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Domain DNS verification is managed in the{' '}
        <a
          href="https://resend.com/domains"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
        >
          Resend Dashboard <ExternalLink className="h-3 w-3" />
        </a>
        . Once your domain is verified there, use the "Mark Verified" button below.
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">Loading domains...</div>
          </div>
        ) : domains.length === 0 ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              No domains configured. Add your first domain to start sending emails.
            </div>
          </div>
        ) : (
          domains.map((domain) => (
            <div key={domain.id} className="dashboard-card">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(domain.verification_status)}
                    <h4 className="text-lg font-semibold">{domain.domain}</h4>
                    {domain.is_default && <Badge variant="outline">Default</Badge>}
                  </div>
                  {getStatusBadge(domain.verification_status)}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Bounce Rate:</span>
                    <span className="ml-2 font-medium">{(domain.bounce_rate ?? 0).toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Complaint Rate:</span>
                    <span className="ml-2 font-medium">{(domain.complaint_rate ?? 0).toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reputation:</span>
                    <Badge
                      className="ml-2"
                      variant={(domain.reputation_score ?? 100) >= 50 ? 'default' : 'destructive'}
                    >
                      {(domain.reputation_score ?? 100) >= 80 ? 'Healthy' : (domain.reputation_score ?? 100) >= 50 ? 'Warning' : 'Critical'}
                    </Badge>
                  </div>
                </div>

                {domain.verification_status === 'pending' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkVerified(domain.domain)}
                      disabled={markingVerified === domain.domain}
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      {markingVerified === domain.domain ? 'Updating...' : 'Mark Verified'}
                    </Button>
                    <a
                      href="https://resend.com/domains"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button size="sm" variant="ghost">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Check in Resend
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EmailDomainsTab;
