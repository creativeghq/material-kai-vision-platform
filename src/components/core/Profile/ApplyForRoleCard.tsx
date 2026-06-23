import React, { useEffect, useState } from 'react';
import { Briefcase, Factory, Send, Loader2, Lock, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  listMyRoleUpgradeRequests,
  submitRoleUpgradeRequest,
  type RoleUpgradeRequest,
  type RoleUpgradeRequestedRole,
} from '@/services/roleUpgradeRequestService';

type EntityType = 'solo' | 'business';

export const ApplyForRoleCard: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [entityType, setEntityType] = useState<EntityType>('solo');
  const [currentRoleName, setCurrentRoleName] = useState<string>('user');
  const [requests, setRequests] = useState<RoleUpgradeRequest[]>([]);

  const [dialogRole, setDialogRole] = useState<RoleUpgradeRequestedRole | null>(null);
  const [justification, setJustification] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('entity_type, roles!user_profiles_role_id_fkey(name)')
        .eq('user_id', user.id)
        .maybeSingle();
      const roleName = (profile as { roles?: { name?: string } | null } | null)?.roles?.name;
      setEntityType((profile?.entity_type as EntityType) ?? 'solo');
      setCurrentRoleName(roleName ?? 'user');

      const myRequests = await listMyRoleUpgradeRequests(user.id);
      setRequests(myRequests);
    } finally {
      setLoading(false);
    }
  };

  // Hide the card entirely once the user IS a dealer or factory (or higher) — they don't need to apply.
  if (currentRoleName === 'supplier' || currentRoleName === 'architect' || currentRoleName === 'admin' || currentRoleName === 'super_admin' || currentRoleName === 'owner') {
    return null;
  }

  const isBusiness = entityType === 'business';
  const pendingRequest = requests.find((r) => r.status === 'pending');
  const pendingForRole = (role: RoleUpgradeRequestedRole) =>
    requests.find((r) => r.status === 'pending' && r.requested_role_name === role);
  const lastRejected = (role: RoleUpgradeRequestedRole) =>
    requests
      .filter((r) => r.status === 'rejected' && r.requested_role_name === role)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

  const openDialog = (role: RoleUpgradeRequestedRole) => {
    setDialogRole(role);
    setJustification('');
  };

  const submit = async () => {
    if (!dialogRole) return;
    setSubmitting(true);
    const result = await submitRoleUpgradeRequest({ requestedRole: dialogRole, justification });
    setSubmitting(false);
    if (result.success === true) {
      toast({
        title: 'Application submitted',
        description: 'An admin will review your request shortly.',
      });
      setDialogRole(null);
      await load();
    } else {
      toast({
        title: 'Could not submit',
        description: result.message || result.error,
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <Card className="rounded-2xl border-2 border-dashed">
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl border-2 border-primary/20 bg-primary/5">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Become a Dealer or Factory</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Operating as a registered company? Apply for one of our business roles to unlock CRM, inventory, and partner features.
            </p>
          </div>
        </div>

        {!isBusiness ? (
          <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30">
            <Lock className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="text-sm">
              <p className="font-medium">Business profile required</p>
              <p className="text-xs text-muted-foreground">
                Switch your account to a <strong>Business entity</strong> and fill in your VAT, company name and address in the Profile tab before applying.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoleApplyTile
              role="supplier"
              icon={<Factory className="h-5 w-5" />}
              title="Apply as Supplier"
              description="Supply catalog, manage materials + inventory, full CRM, and your downstream architects and clients."
              pending={pendingForRole('supplier')}
              rejected={lastRejected('supplier')}
              onApply={() => openDialog('supplier')}
              disabled={!!pendingRequest}
            />
            <RoleApplyTile
              role="architect"
              icon={<Briefcase className="h-5 w-5" />}
              title="Apply as Architect"
              description="Sell to your end clients with margin; quotes, projects, moodboards and CRM."
              pending={pendingForRole('architect')}
              rejected={lastRejected('architect')}
              onApply={() => openDialog('architect')}
              disabled={!!pendingRequest}
            />
          </div>
        )}
      </CardContent>

      <Dialog open={!!dialogRole} onOpenChange={(open) => !open && setDialogRole(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply for {dialogRole === 'architect' ? 'Architect' : 'Supplier'} role</DialogTitle>
            <DialogDescription>
              Tell the admin team a bit about your business and why you want to be a {dialogRole}. They will review and reply by email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="justification" className="text-xs text-muted-foreground">Why are you applying? (optional)</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="e.g. We have been distributing materials in Greece for 12 years and want to list our brand on Material KAI…"
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRole(null)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Submit application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

interface RoleApplyTileProps {
  role: RoleUpgradeRequestedRole;
  icon: React.ReactNode;
  title: string;
  description: string;
  pending?: RoleUpgradeRequest;
  rejected?: RoleUpgradeRequest;
  onApply: () => void;
  disabled?: boolean;
}

const RoleApplyTile: React.FC<RoleApplyTileProps> = ({ icon, title, description, pending, rejected, onApply, disabled }) => {
  return (
    <div className="p-4 rounded-xl border bg-card flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="text-primary mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      {pending ? (
        <Badge variant="secondary" className="self-start gap-1.5">
          <Clock className="h-3 w-3" />Application pending review
        </Badge>
      ) : rejected ? (
        <div className="space-y-2">
          <Badge variant="destructive" className="self-start gap-1.5">
            <XCircle className="h-3 w-3" />Last application rejected
          </Badge>
          {rejected.admin_note && (
            <p className="text-xs text-muted-foreground italic line-clamp-2">{rejected.admin_note}</p>
          )}
          <Button size="sm" variant="outline" onClick={onApply} disabled={disabled} className="self-start">
            <Send className="h-3.5 w-3.5 mr-1.5" />Re-apply
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={onApply} disabled={disabled} className="self-start">
          <Send className="h-3.5 w-3.5 mr-1.5" />Apply
        </Button>
      )}
    </div>
  );
};

export default ApplyForRoleCard;
