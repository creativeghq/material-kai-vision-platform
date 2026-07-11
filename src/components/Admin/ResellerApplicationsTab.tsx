import React, { useEffect, useState } from 'react';
import { Store, Check, X, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  resellerApplicationsService,
  type ResellerApplication,
  type ResellerApplicationStatus,
} from '@/services/resellerApplicationsService';

const statusColor = (s: ResellerApplicationStatus) => {
  switch (s) {
    case 'pending': return 'bg-amber-500/10 text-amber-700 border-amber-500/30';
    case 'aade_verified': return 'bg-blue-500/10 text-blue-700 border-blue-500/30';
    case 'aade_failed': return 'bg-orange-500/10 text-orange-700 border-orange-500/30';
    case 'approved': return 'bg-green-500/10 text-green-700 border-green-500/30';
    default: return 'bg-destructive/10 text-destructive border-destructive/30';
  }
};

const statusLabel = (s: ResellerApplicationStatus) => ({
  pending: 'Pending ΑΑΔΕ check',
  aade_verified: 'ΑΑΔΕ verified',
  aade_failed: 'ΑΑΔΕ failed',
  approved: 'Approved',
  rejected: 'Rejected',
}[s]);

export const ResellerApplicationsTab: React.FC = () => {
  const { toast } = useToast();
  const [apps, setApps] = useState<ResellerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [commission, setCommission] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      setApps(await resellerApplicationsService.list());
    } catch {
      toast({ title: 'Error', description: 'Could not load reseller applications.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const verify = async (app: ResellerApplication) => {
    setBusyId(app.id);
    try {
      const res = await resellerApplicationsService.verifyAade(app.id);
      setApps((prev) => prev.map((a) => a.id === app.id
        ? { ...a, status: res.status, aade_valid: res.valid_afm, aade_checked_at: new Date().toISOString(),
            aade_snapshot: res.basic_rec ? { basic_rec: res.basic_rec, activities: res.activities } : { error: res.aade_error } }
        : a));
      toast({
        title: res.valid_afm ? 'ΑΑΔΕ verified' : 'ΑΑΔΕ check failed',
        description: res.valid_afm
          ? 'Active business confirmed — you can approve this reseller.'
          : (res.aade_error || 'The VAT number is not an active Greek business.'),
        variant: res.valid_afm ? undefined : 'destructive',
      });
    } catch (e) {
      toast({ title: 'ΑΑΔΕ error', description: e instanceof Error ? e.message : 'Verification failed.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (app: ResellerApplication) => {
    setBusyId(app.id);
    try {
      const pct = Number(commission[app.id] ?? '5');
      await resellerApplicationsService.approve(app.id, Number.isFinite(pct) ? pct : 5);
      setApps((prev) => prev.map((a) => a.id === app.id ? { ...a, status: 'approved', commission_pct: pct } : a));
      toast({ title: 'Reseller approved', description: 'Their workspace is now a reseller of the operator catalog.' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Could not approve.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (app: ResellerApplication) => {
    setBusyId(app.id);
    try {
      await resellerApplicationsService.reject(app.id, rejectReason.trim() || undefined);
      setApps((prev) => prev.map((a) => a.id === app.id ? { ...a, status: 'rejected', review_notes: rejectReason.trim() || null } : a));
      setRejectingId(null);
      setRejectReason('');
      toast({ title: 'Rejected', description: 'The reseller application was rejected.' });
    } catch (e) {
      toast({ title: 'Error', description: e instanceof Error ? e.message : 'Could not reject.', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const businessName = (app: ResellerApplication): string | null => {
    const rec = (app.aade_snapshot as any)?.basic_rec;
    return rec?.commercial_title || rec?.legal_name || rec?.onomasia || null;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = apps.filter((a) => a.status === 'pending' || a.status === 'aade_verified').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Reseller Applications</h3>
          {pendingCount > 0 && <Badge variant="secondary" className="text-xs">{pendingCount} to review</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Applicants sign up with a business VAT number. Verify it with ΑΑΔΕ (runs under the operator's
        Special Access Codes), then approve to upgrade their workspace to a reseller.
      </p>

      {apps.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No reseller applications yet.</p>
      ) : (
        <div className="space-y-3">
          {apps.map((app) => {
            const decided = app.status === 'approved' || app.status === 'rejected';
            return (
              <div key={app.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">ΑΦΜ {app.vat_number}</p>
                      <Badge variant="outline" className="text-xs">{app.country_code}</Badge>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor(app.status)}`}>
                        {statusLabel(app.status)}
                      </span>
                      {app.aade_valid === true && <ShieldCheck className="h-4 w-4 text-green-600" />}
                      {app.aade_valid === false && <ShieldAlert className="h-4 w-4 text-orange-600" />}
                    </div>
                    {businessName(app) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Business: <span className="font-medium text-foreground">{businessName(app)}</span>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Applied {new Date(app.created_at).toLocaleDateString()}
                      {app.aade_checked_at && ` · ΑΑΔΕ checked ${new Date(app.aade_checked_at).toLocaleDateString()}`}
                    </p>
                    {app.status === 'aade_failed' && (app.aade_snapshot as any)?.error && (
                      <p className="text-xs text-orange-600 mt-1">{(app.aade_snapshot as any).error}</p>
                    )}
                    {app.status === 'rejected' && app.review_notes && (
                      <p className="text-xs text-muted-foreground mt-1 italic">Reason: {app.review_notes}</p>
                    )}
                  </div>

                  {!decided && (
                    <div className="flex items-center gap-2 shrink-0">
                      {(app.status === 'pending' || app.status === 'aade_failed') && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => verify(app)} disabled={busyId === app.id}>
                          {busyId === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                          <span className="ml-1.5">Verify ΑΑΔΕ</span>
                        </Button>
                      )}
                      {app.status === 'aade_verified' && (
                        <>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              value={commission[app.id] ?? '5'}
                              onChange={(e) => setCommission((c) => ({ ...c, [app.id]: e.target.value }))}
                              className="h-8 w-16 text-sm"
                              min={0}
                              max={100}
                              aria-label="Commission %"
                            />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <Button
                            size="sm"
                            className="h-8 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => approve(app)}
                            disabled={busyId === app.id}
                          >
                            {busyId === app.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span className="ml-1.5">Approve</span>
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-destructive hover:text-destructive hover:border-destructive/50"
                        onClick={() => setRejectingId(app.id)}
                        disabled={busyId === app.id}
                      >
                        <X className="h-3.5 w-3.5" />
                        <span className="ml-1.5">Reject</span>
                      </Button>
                    </div>
                  )}
                </div>

                {rejectingId === app.id && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Rejection reason (optional)"
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                      <Button size="sm" variant="destructive" onClick={() => reject(app)} disabled={busyId === app.id}>
                        {busyId === app.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
                        Confirm Reject
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
