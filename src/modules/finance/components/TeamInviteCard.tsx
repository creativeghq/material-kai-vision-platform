/**
 * #201/#202 — invite a team member into this workspace with a role. Reuses the referral
 * link pattern (?invite=CODE): owner picks a role, copies the link, the invitee signs up
 * and is auto-joined with that role. Accountant = read-only finance; Sales = sales portal.
 */
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Users, Copy, Link2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { workspaceManagementService } from '@/services/workspaceManagementService';
import { useModule } from '@/modules/_core';

type Role = 'accountant' | 'sales' | 'member' | 'realestate_agent';

const ROLE_HINT: Record<Role, string> = {
  accountant: 'Finance only: view invoices/bills/reports, record payments, submit to myDATA. No settings, pricing, CRM, or new documents.',
  sales: 'Sales portal — create quotes/orders for customers. No finance or settings.',
  member: 'Standard member access to this workspace.',
  realestate_agent: 'Estate agent — Real Estate only: their own listings + leads, plus any listing marked “open for all”. No finance, pricing, or settings.',
};

export const TeamInviteCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const { enabled: realEstateEnabled } = useModule('real-estate');
  const [role, setRole] = useState<Role>('accountant');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const code = await workspaceManagementService.createInvite(workspaceId, role);
      const url = `${window.location.origin}/auth?mode=signup&invite=${code}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'Invite link created', description: 'Copied to clipboard.' });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Invite Team Member</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <div className="space-y-1">
          <Label>Role</Label>
          <Select value={role} onValueChange={(v: Role) => { setRole(v); setLink(null); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accountant">Accountant (finance ops, no settings)</SelectItem>
              <SelectItem value="sales">Sales rep</SelectItem>
              {realEstateEnabled && <SelectItem value="realestate_agent">Estate Agent</SelectItem>}
              <SelectItem value="member">Member</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{ROLE_HINT[role]}</p>
        </div>

        <div>
          <Button size="sm" onClick={generate} disabled={busy} className="rounded-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />} Generate invite link
          </Button>
        </div>

        {link && (
          <div className="space-y-1">
            <Label className="text-xs">Share this link (valid 30 days)</Label>
            <div className="flex gap-2">
              <Input readOnly value={link} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="outline" size="icon" aria-label="Copy invite link" title="Copy invite link" onClick={() => { navigator.clipboard.writeText(link); toast({ title: 'Copied' }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
