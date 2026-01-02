/**
 * Email Domains Tab
 * Manage and verify email domains for SES
 */

import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle, XCircle, Clock, Copy, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { emailService, EmailDomain } from '@/services/email/emailService';
import { useToast } from '@/hooks/use-toast';

interface EmailDomainsTabProps {
  onDomainVerified?: () => void;
}

export const EmailDomainsTab: React.FC<EmailDomainsTabProps> = ({ onDomainVerified }) => {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [verifying, setVerifying] = useState(false);
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
      toast({
        title: 'Error',
        description: 'Failed to load email domains',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDomain = async () => {
    if (!newDomain) return;

    try {
      setVerifying(true);
      const result = await emailService.verifyDomain(newDomain);

      toast({
        title: 'Domain Added',
        description: `Verification token: ${result.verificationToken}`,
      });

      setShowAddDialog(false);
      setNewDomain('');
      loadDomains();
    } catch (error) {
      console.error('Error adding domain:', error);
      toast({
        title: 'Error',
        description: 'Failed to add domain',
        variant: 'destructive',
      });
    } finally {
      setVerifying(false);
    }
  };

  const handleCheckVerification = async (domain: string) => {
    try {
      const status = await emailService.checkDomainVerification(domain);

      toast({
        title: 'Verification Status',
        description: `Domain is ${status}`,
      });

      if (status === 'verified' && onDomainVerified) {
        onDomainVerified();
      }

      loadDomains();
    } catch (error) {
      console.error('Error checking verification:', error);
      toast({
        title: 'Error',
        description: 'Failed to check verification status',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Copied to clipboard',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return <Badge variant="default">Verified</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Email Domains</h3>
          <p className="text-sm text-muted-foreground">
            Manage verified domains for sending emails via Amazon SES
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Domain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Email Domain</DialogTitle>
              <DialogDescription>
                Add a new domain to verify with Amazon SES. You'll need to add DNS records to verify ownership.
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
              <Button onClick={handleAddDomain} disabled={verifying || !newDomain}>
                {verifying ? 'Adding...' : 'Add Domain'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">
              Loading domains...
            </div>
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
                {domain.verification_token && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Verification Token (TXT Record)</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
                        {domain.verification_token}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard(domain.verification_token!)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Bounce Rate:</span>
                    <span className="ml-2 font-medium">{domain.bounce_rate.toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Complaint Rate:</span>
                    <span className="ml-2 font-medium">{domain.complaint_rate.toFixed(2)}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Daily Quota:</span>
                    <span className="ml-2 font-medium">{domain.daily_quota.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Reputation:</span>
                    <Badge variant={domain.reputation_status === 'healthy' ? 'default' : 'destructive'}>
                      {domain.reputation_status}
                    </Badge>
                  </div>
                </div>

                {domain.verification_status === 'pending' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCheckVerification(domain.domain)}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Check Verification Status
                  </Button>
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

