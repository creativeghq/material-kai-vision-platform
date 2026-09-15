import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, ShieldCheck, Receipt, FolderKanban, Loader2, Send, Copy,
  AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import {
  workspaceManagementService, type CompanyWorkspaceStatus,
} from '@/services/workspaceManagementService';
import {
  WORKSPACE_INVITE_ROLES, WORKSPACE_ROLE_META, type WorkspaceInviteRole,
} from '@/auth/workspaceRoles';

/** Not interchangeable: `my_workspace` seats them in YOUR tenant and lets them read your CRM and
 *  costs, where `customer` is a login joined to their own CRM record and nothing else. */
type Destination = 'customer' | 'own_workspace' | 'my_workspace' | 'trade_portal' | 'project';

export interface InviteParty {
  contactId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  name?: string | null;
  email?: string | null;
  isClient?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  party: InviteParty;
  onDone?: () => void;
}

interface Option {
  key: Destination;
  icon: typeof Users;
  title: string;
  blurb: string;
  sends: boolean;
  needs?: 'contact' | 'company';
}

const OPTIONS: Option[] = [
  {
    key: 'customer', icon: Receipt, title: 'Customer account', sends: true, needs: 'contact',
    blurb: 'A login that shows them their own orders, invoices, receipts and balance. Not a member of your workspace — they see nothing else.',
  },
  {
    key: 'own_workspace', icon: Building2, title: 'Run their own workspace', sends: true, needs: 'company',
    blurb: 'A separate business on the platform, with them as owner. They see nothing of yours beyond the catalog you grant.',
  },
  {
    key: 'my_workspace', icon: Users, title: 'Join your team', sends: true,
    blurb: 'A member of your workspace. They see what that role sees — your customers, your costs, your pipeline.',
  },
  {
    key: 'trade_portal', icon: ShieldCheck, title: 'Trade portal', sends: false, needs: 'company',
    blurb: 'A B2B account for the whole company, with spend caps and their own delegated admin. Set up on the company record.',
  },
  {
    key: 'project', icon: FolderKanban, title: 'One project only', sends: false,
    blurb: 'Access to a single project, moodboard or client view. Invited on the project itself, so the access ends with it.',
  },
];

export const InvitePartyDialog: React.FC<Props> = ({
  open, onOpenChange, workspaceId, workspaceName, party, onDone,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();

  const hasContact = !!party.contactId;
  const hasCompany = !!party.companyId;
  const available = useMemo(
    () => OPTIONS.filter((o) => (o.needs === 'contact' ? hasContact : o.needs === 'company' ? hasCompany : true)),
    [hasContact, hasCompany],
  );
  const initial: Destination = hasContact ? 'customer' : hasCompany ? 'own_workspace' : 'my_workspace';

  const [dest, setDest] = useState<Destination>(initial);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<WorkspaceInviteRole>('member');
  const [catalogAccess, setCatalogAccess] = useState<'operator_catalog' | 'own_products_only'>('operator_catalog');
  const [discountPct, setDiscountPct] = useState('0');
  const [canSupply, setCanSupply] = useState(false);
  const [status, setStatus] = useState<CompanyWorkspaceStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const reset = useCallback(() => {
    setDest(initial);
    setEmail(party.email ?? '');
    setName(party.name ?? '');
    setRole('member');
    setLink(null);
  }, [initial, party.email, party.name]);

  useEffect(() => { if (open) reset(); }, [open, reset]);

  useEffect(() => {
    if (!open || !party.companyId) { setStatus(null); return; }
    workspaceManagementService.companyWorkspaceStatus(party.companyId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [open, party.companyId]);

  const alreadyRunning = status?.state === 'active';

  const pick = (o: Option) => {
    if (o.sends) { setDest(o.key); return; }
    onOpenChange(false);
    navigate(o.key === 'trade_portal' ? `/crm/companies/${party.companyId}?tab=work` : '/projects');
  };

  const send = async () => {
    const addr = email.trim();
    if (!addr) return;
    setBusy(true);
    try {
      let url: string;
      if (dest === 'customer') {
        ({ url } = await workspaceManagementService.inviteAsCustomer({
          workspaceId, workspaceName, crmContactId: party.contactId!,
          email: addr, name: name.trim() || undefined,
        }));
        toast({
          title: `Invitation sent to ${addr}`,
          description: 'They will see their own orders and invoices, and nothing else.',
        });
      } else if (dest === 'my_workspace') {
        ({ url } = await workspaceManagementService.inviteByEmail({
          workspaceId, workspaceName, role, email: addr,
          name: name.trim() || undefined,
          crmContactId: party.contactId ?? undefined,
        }));
        toast({
          title: `Invitation sent to ${addr}`,
          description: `They join ${workspaceName} as ${WORKSPACE_ROLE_META[role].label}.`,
        });
      } else {
        const raw = discountPct.trim();
        ({ url } = await workspaceManagementService.inviteCompanyAsWorkspace({
          companyId: party.companyId!,
          companyName: party.companyName || 'their business',
          email: addr,
          name: name.trim() || undefined,
          crmContactId: party.contactId ?? undefined,
          canSupplyProducts: canSupply,
          catalogAccess,
          discountPct: raw === '' ? 0 : Math.min(100, Math.max(0, parseInt(raw, 10) || 0)),
        }));
        toast({
          title: `Invitation sent to ${addr}`,
          description: `${party.companyName} gets its own workspace when they accept.`,
        });
      }
      setLink(url);
      onDone?.();
    } catch (err) {
      toast({ title: 'Could not send the invitation', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const teamWarning = dest === 'my_workspace' && (party.isClient || hasCompany);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invite {party.name || party.companyName || 'someone'}</DialogTitle>
          <DialogDescription>
            They get an email with a sign-up link. Nobody has an account created for them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            {available.map((o) => {
              const selected = o.sends && dest === o.key;
              const disabled = o.key === 'own_workspace' && alreadyRunning;
              return (
                <button
                  key={o.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(o)}
                  className={`w-full rounded-sm border p-3 text-left transition-colors disabled:opacity-50 ${
                    selected ? 'border-primary bg-primary/[0.06]' : 'border-hairline hover:bg-surface-sunken'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <o.icon className="h-4 w-4 text-muted-foreground" />{o.title}
                    {!o.sends && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    {disabled && <span className="text-xs font-normal text-muted-foreground">— already has one</span>}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{o.blurb}</span>
                </button>
              );
            })}
          </div>

          {teamWarning && (
            <p className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {party.name || 'This contact'} belongs to {party.companyName || 'another business'}. A
                seat in your team lets them read your CRM, your costs and your pipeline — pick
                Customer account unless they actually work for you.
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ip-email">Email *</Label>
              <Input id="ip-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ip-name">Their name</Label>
              <Input id="ip-name" value={name}
                onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
            </div>
          </div>

          {dest === 'my_workspace' && (
            <div className="space-y-1.5">
              <Label htmlFor="ip-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as WorkspaceInviteRole)}>
                <SelectTrigger id="ip-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORKSPACE_INVITE_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{WORKSPACE_ROLE_META[r].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{WORKSPACE_ROLE_META[role].description}</p>
            </div>
          )}

          {dest === 'own_workspace' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ip-catalog">Catalog access</Label>
                <Select value={catalogAccess} onValueChange={(v) => setCatalogAccess(v as typeof catalogAccess)}>
                  <SelectTrigger id="ip-catalog"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="operator_catalog">Your full catalog</SelectItem>
                    <SelectItem value="own_products_only">Their own products only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ip-discount">Their discount off retail (%)</Label>
                <Input id="ip-discount" inputMode="numeric" value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <Switch checked={canSupply} onCheckedChange={setCanSupply} />
                They may supply products of their own
              </label>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Their VAT number, tax office and address carry over from the CRM record, so they can
                issue invoices without retyping who they are.
              </p>
            </div>
          )}

          {link && (
            <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken p-3">
              <p className="text-xs text-muted-foreground">Sent. If it does not arrive, hand them this link:</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={link} className="h-8 text-xs" />
                <Button size="sm" variant="outline"
                  onClick={() => { void navigator.clipboard.writeText(link); toast({ title: 'Link copied' }); }}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{link ? 'Done' : 'Cancel'}</Button>
          <Button onClick={send} disabled={busy || !email.trim() || (dest === 'own_workspace' && alreadyRunning)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {busy ? 'Sending…' : link ? 'Send again' : 'Send invitation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvitePartyDialog;
