/**
 * Email Domains Tab
 * Manage email domains for Resend
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, CheckCircle, XCircle, Clock, ExternalLink, Globe, RefreshCw, HelpCircle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/core/ui/dialog';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { emailService, EmailDomain } from '../services/emailService';
import { useToast } from '@/hooks/use-toast';
import { HubEmptyState } from '@/components/core/hub';
import { formatDate } from '@/utils/datetime';

interface EmailDomainsTabProps {
  onDomainVerified?: () => void;
}

export const EmailDomainsTab: React.FC<EmailDomainsTabProps> = ({ onDomainVerified }) => {
  const [domains, setDomains] = useState<EmailDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [saving, setSaving] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState<string | null>(null);
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

  /**
   * Synchronous in-flight latches (#357 AE-17).
   *
   * `saving` / `checkingDomain` are React state and cannot stop a submit that is already
   * queued — the second click fires before the first `setSaving(true)` has rendered, and the
   * button's `disabled` is that same state one render behind. Adding a domain twice is noise;
   * checking one twice races the read-back that `onDomainVerified` triggers, and spends two
   * Resend calls to learn the same thing.
   *
   * A ref is set and read in the same synchronous turn. State is not.
   */
  const addingDomain = useRef(false);
  const verifyingDomains = useRef<Set<string>>(new Set());

  const handleAddDomain = async () => {
    if (!newDomain || addingDomain.current) return;

    addingDomain.current = true;
    try {
      setSaving(true);
      await emailService.addDomain(newDomain);

      toast({
        title: 'Domain Added',
        description: `${newDomain} has been added. Publish the DNS records at resend.com/domains, then use Check verification — the status is read from Resend, never asserted here.`,
      });

      setShowAddDialog(false);
      setNewDomain('');
      loadDomains();
    } catch (error) {
      console.error('Error adding domain:', error);
      toast({ title: 'Error', description: 'Failed to add domain', variant: 'destructive' });
    } finally {
      addingDomain.current = false;
      setSaving(false);
    }
  };

  /**
   * Ask Resend, and report exactly what it said (#357 AE-11).
   *
   * The button used to be "Mark Verified" and wrote the flag on the operator's word. It never made
   * an unverified domain deliverable — Resend enforces that at send time — but it let this screen
   * claim Verified while every send failed upstream with an opaque error.
   *
   * A "still pending" answer is a SUCCESS here, not an error: the check ran and returned the truth.
   * Only an unreachable provider is a failure, and in that case nothing is written.
   */
  const handleCheckVerification = async (domain: string) => {
    // Keyed per domain: two different domains may legitimately be checked at once, the SAME one
    // twice may not.
    if (verifyingDomains.current.has(domain)) return;
    verifyingDomains.current.add(domain);
    try {
      setCheckingDomain(domain);
      const result = await emailService.verifyDomainWithProvider(domain);

      toast({
        title: result.verified ? 'Verified by Resend' : 'Not verified yet',
        description: result.message,
        variant: result.verified ? undefined : 'destructive',
      });

      if (result.verified && onDomainVerified) onDomainVerified();
      loadDomains();
    } catch (error) {
      console.error('Error checking domain verification:', error);
      toast({
        title: 'Could not reach Resend',
        description: 'The domain status is unchanged — nothing was written. Try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      verifyingDomains.current.delete(domain);
      setCheckingDomain(null);
    }
  };

  const getStatusIcon = (domain: EmailDomain) => {
    if (!domain.provider_checked_at) return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
    switch (domain.verification_status) {
      case 'verified': return <CheckCircle className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
      case 'failed': return <XCircle className="h-4 w-4 text-red-700 dark:text-red-400" />;
      default: return <Clock className="h-4 w-4 text-amber-800 dark:text-amber-300" />;
    }
  };

  /**
   * A status is a VALUE or a stated reason there is no value (anti-regression rule 3).
   *
   * `provider_checked_at` NULL means nobody has ever asked Resend. Rendering that as "Pending" —
   * which is what it did — makes "we asked and the DNS is not live yet" and "we have never looked"
   * pixel-identical, and only one of those is something the operator can act on.
   */
  const getStatusBadge = (domain: EmailDomain) => {
    if (!domain.provider_checked_at) return <Badge variant="neutral">Not checked yet</Badge>;
    switch (domain.verification_status) {
      case 'verified': return <Badge variant="success">Verified by Resend</Badge>;
      case 'failed': return <Badge variant="error">Failed at Resend</Badge>;
      default:
        return (
          <Badge variant="warning">
            {domain.provider_status === 'not_found' ? 'Not added in Resend' : 'Pending at Resend'}
          </Badge>
        );
    }
  };

  /** When we last asked — so a green badge cannot be mistaken for a live reading. */
  const checkedHint = (domain: EmailDomain) =>
    domain.provider_checked_at
      ? `Checked ${formatDate(domain.provider_checked_at, { withTime: true })}`
      : 'Resend has never been asked about this domain.';

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
                  . Publish the DNS records it shows, then use Check verification here — the
                  status is read back from Resend, never asserted.
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
        . Publish the DNS records there, then use <strong>Check verification</strong> below — the
        status shown here is read back from Resend, never asserted.
      </div>

      <div className="grid gap-4">
        {loading ? (
          <div className="dashboard-card">
            <div className="py-8 text-center text-muted-foreground">Loading domains...</div>
          </div>
        ) : domains.length === 0 ? (
          <div className="dashboard-card p-0">
            <HubEmptyState
              icon={Globe}
              title="No domains configured"
              description="Email sent from a domain you have verified lands in the inbox; email sent from an unverified one lands in spam. Add yours and follow the DNS records shown."
              action={<Button size="sm" onClick={() => setShowAddDialog(true)}><Plus /> Add domain</Button>}
            />
          </div>
        ) : (
          domains.map((domain) => (
            <div key={domain.id} className="dashboard-card">
              <div className="mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(domain)}
                    <h4 className="text-lg font-semibold">{domain.domain}</h4>
                    {domain.is_default && <Badge variant="outline">Default</Badge>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getStatusBadge(domain)}
                    <span className="text-xs text-muted-foreground">{checkedHint(domain)}</span>
                  </div>
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

                {domain.verification_status !== 'verified' && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCheckVerification(domain.domain)}
                      disabled={checkingDomain === domain.domain}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      {checkingDomain === domain.domain ? 'Asking Resend...' : 'Check verification'}
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
