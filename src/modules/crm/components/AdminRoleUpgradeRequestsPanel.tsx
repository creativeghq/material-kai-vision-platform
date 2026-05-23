import React, { useEffect, useState } from 'react';
import { Shield, Check, X, Loader2, Clock, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  listRoleUpgradeRequestsForUser,
  approveRoleUpgradeRequest,
  rejectRoleUpgradeRequest,
  type RoleUpgradeRequest,
} from '@/services/roleUpgradeRequestService';

interface Props {
  userId: string;
  /** Called after a successful approve/reject so the parent can refresh the user's current role. */
  onUpdated?: () => void;
}

type Action = 'approve' | 'reject';

export const AdminRoleUpgradeRequestsPanel: React.FC<Props> = ({ userId, onUpdated }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<RoleUpgradeRequest[]>([]);
  const [actionTarget, setActionTarget] = useState<{ request: RoleUpgradeRequest; action: Action } | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listRoleUpgradeRequestsForUser(userId);
      setRequests(data);
    } finally {
      setLoading(false);
    }
  };

  const openAction = (request: RoleUpgradeRequest, action: Action) => {
    setActionTarget({ request, action });
    setAdminNote('');
  };

  const submit = async () => {
    if (!actionTarget) return;
    setSubmitting(true);
    try {
      const fn = actionTarget.action === 'approve' ? approveRoleUpgradeRequest : rejectRoleUpgradeRequest;
      const { error } = await fn({ requestId: actionTarget.request.id, adminNote });
      if (error) {
        toast({ title: 'Action failed', description: error.message, variant: 'destructive' });
        return;
      }
      toast({
        title: actionTarget.action === 'approve' ? 'Application approved' : 'Application rejected',
        description: actionTarget.action === 'approve'
          ? 'The user has been promoted and notified by email.'
          : 'The user has been notified by email.',
      });
      setActionTarget(null);
      await load();
      onUpdated?.();
    } finally {
      setSubmitting(false);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const reviewed = requests.filter((r) => r.status !== 'pending');

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Role Upgrade Requests
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-2">{pending.length} pending</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upgrade requests from this user.</p>
          ) : (
            <>
              {pending.map((req) => (
                <RequestRow
                  key={req.id}
                  request={req}
                  onApprove={() => openAction(req, 'approve')}
                  onReject={() => openAction(req, 'reject')}
                />
              ))}
              {reviewed.length > 0 && (
                <div className="pt-3 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">History</p>
                  {reviewed.map((req) => (
                    <RequestRow key={req.id} request={req} />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionTarget} onOpenChange={(open) => !open && setActionTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionTarget?.action === 'approve' ? 'Approve' : 'Reject'} {actionTarget?.request.requested_role_name} application
            </DialogTitle>
            <DialogDescription>
              {actionTarget?.action === 'approve'
                ? 'The user will be promoted immediately and notified by email.'
                : 'The user will be notified by email with your note (if any).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="admin-note" className="text-xs text-muted-foreground">
              {actionTarget?.action === 'approve' ? 'Welcome note (optional)' : 'Reason (optional, sent to the user)'}
            </Label>
            <Textarea
              id="admin-note"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder={actionTarget?.action === 'approve'
                ? 'Optional welcome / onboarding note…'
                : 'Optional reason the application was not accepted…'}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionTarget(null)} disabled={submitting}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={submitting}
              variant={actionTarget?.action === 'reject' ? 'destructive' : 'default'}
            >
              {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {actionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface RequestRowProps {
  request: RoleUpgradeRequest;
  onApprove?: () => void;
  onReject?: () => void;
}

const RequestRow: React.FC<RequestRowProps> = ({ request, onApprove, onReject }) => {
  const statusBadge = () => {
    if (request.status === 'pending') return <Badge variant="secondary" className="gap-1.5"><Clock className="h-3 w-3" />Pending</Badge>;
    if (request.status === 'approved') return <Badge className="bg-green-500/20 text-green-700 border-green-500/30 gap-1.5"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
    return <Badge variant="destructive" className="gap-1.5"><XCircle className="h-3 w-3" />Rejected</Badge>;
  };

  return (
    <div className="p-3 rounded-xl border bg-muted/20 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-sm capitalize">{request.requested_role_name}</span>
          {statusBadge()}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(request.created_at).toLocaleString()}
        </span>
      </div>
      <VatStatusLine request={request} />
      {request.justification && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
          {request.justification}
        </p>
      )}
      {request.admin_note && (
        <p className="text-xs text-foreground border-l-2 border-primary/40 pl-2">
          <span className="text-muted-foreground">Admin note:</span> {request.admin_note}
        </p>
      )}
      {request.status === 'pending' && (onApprove || onReject) && (
        <div className="flex gap-2 pt-1">
          {onApprove && (
            <Button size="sm" onClick={onApprove}>
              <Check className="h-3.5 w-3.5 mr-1.5" />Approve
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="h-3.5 w-3.5 mr-1.5" />Reject
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

/** Renders the VAT verification snapshot taken at submission time. */
const VatStatusLine: React.FC<{ request: RoleUpgradeRequest }> = ({ request }) => {
  if (!request.vat_validated_at) return null;
  if (request.vat_validated === true) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
        <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          VAT verified via {request.vat_validation_source?.toUpperCase() ?? 'VIES'} at submission
          {request.vat_validated_name ? <> — registered as <strong>{request.vat_validated_name}</strong></> : ''}.
        </span>
      </div>
    );
  }
  if (request.vat_validated === false) {
    return (
      <div className="flex items-start gap-1.5 text-xs text-destructive">
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          VAT was <strong>not valid</strong> in {request.vat_validation_source?.toUpperCase() ?? 'VIES'} at submission. Double-check before approving.
        </span>
      </div>
    );
  }
  // vat_validated is null — VIES skipped (non-EU) or unreachable
  return (
    <div className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
      <ShieldQuestion className="h-3.5 w-3.5 shrink-0 mt-0.5" />
      <span>VAT was not validated automatically (non-EU country, no VAT on file, or VIES was unreachable). Manual diligence required.</span>
    </div>
  );
};

export default AdminRoleUpgradeRequestsPanel;
