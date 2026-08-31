import React from 'react';
import { Building2, Loader2, User } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { companiesAPI, contactsAPI } from '@/services/crm.service';

export type QuickPartyKind = 'contact' | 'company';

interface Props {
  kind: QuickPartyKind;
  /** Prefills the name — the term the user already searched for and did not find. */
  initialName?: string;
  onClose: () => void;
  /** Called with the new row's id once it exists. */
  onCreated: (id: string, name: string) => void;
}

/**
 * QUICK CREATE — the smallest party a deal can be attached to, made without leaving the deal.
 *
 * Why this exists: a deal must be linked to a contact or a company (the DB enforces it via
 * `crm_deals_party_check`), so a salesperson taking a call about a company that is not in the CRM
 * yet had to abandon the half-filled deal, go to CRM, create the party, come back and start over.
 * In practice that means the deal does not get logged.
 *
 * Why it is reachable ONLY from a search that returned nothing (see `allowCreate` on the
 * contact/company dropdowns), and never as a bare "add" button:
 *
 *   A CRM's value collapses when the same customer exists three times. This platform's rule is
 *   that a party is searched for before it is created — including in Greek script, where
 *   "Παπαδόπουλος" and "Papadopoulos" are the same person and a naive create makes two of them.
 *   Routing every quick-create through the dropdown means the duplicate search has already run,
 *   against the folded `search_fold` column, and the user has already seen the misses.
 *
 * The company endpoint enforces this a second time server-side: `crm-api` refuses a create whose
 * folded name already exists and returns the row it found, which is surfaced here as "use the
 * existing one" rather than an error the user has to work around.
 */
export const QuickCreatePartyDialog: React.FC<Props> = ({ kind, initialName = '', onClose, onCreated }) => {
  const { toast } = useToast();
  const [name, setName] = React.useState(initialName);
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [duplicate, setDuplicate] = React.useState<{ id: string; name: string } | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    setDuplicate(null);
    try {
      if (kind === 'contact') {
        const res = await contactsAPI.createContact({
          name: trimmed,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        const row = (res as { data?: { id?: string; name?: string } }).data;
        if (!row?.id) throw new Error('The contact was created but came back without an id.');
        toast({ title: 'Contact created', description: trimmed });
        onCreated(row.id, row.name ?? trimmed);
      } else {
        const res = await companiesAPI.createCompany({
          name: trimmed,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        });
        const row = (res as { data?: { id?: string; name?: string } }).data;
        if (!row?.id) throw new Error('The company was created but came back without an id.');
        toast({ title: 'Company created', description: trimmed });
        onCreated(row.id, row.name ?? trimmed);
      }
    } catch (err) {
      // crm-api returns the row it matched rather than a bare failure, so the answer to "this
      // already exists" is a button that uses it — not a dead end the user solves by adding a
      // digit to the name.
      const e = err as { code?: string; existing?: { id: string; name: string }; message?: string };
      // Both kinds, since the contact endpoint gained the same guarantee (#378 F2). Keyed on the
      // kind being created rather than on "either code", so a company create that somehow answered
      // `duplicate_contact` is reported rather than quietly offering the wrong row.
      const expected = kind === 'contact' ? 'duplicate_contact' : 'duplicate_company';
      if (e.code === expected && e.existing) {
        setDuplicate(e.existing);
      } else {
        toast({ title: 'Could not create', description: e.message, variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const Icon = kind === 'contact' ? User : Building2;
  const label = kind === 'contact' ? 'contact' : 'company';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" /> New {label}
          </DialogTitle>
          <DialogDescription>
            Created in this workspace and linked to the deal straight away. You can fill in the
            rest on the {label}&rsquo;s own page later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="quick-party-name">Name</Label>
            <Input
              id="quick-party-name"
              value={name}
              autoFocus
              onChange={(e) => { setName(e.target.value); setDuplicate(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void submit(); }}
              placeholder={kind === 'contact' ? 'Elena Papadopoulou' : 'Aegean Interiors'}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-party-email">Email</Label>
              <Input
                id="quick-party-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="quick-party-phone">Phone</Label>
              <Input
                id="quick-party-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          {duplicate && (
            <div className="rounded-sm border border-hairline bg-surface-sunken p-2.5 text-xs">
              <p className="font-semibold text-foreground">
                &ldquo;{duplicate.name}&rdquo; already exists here.
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Link the deal to that one instead of making a second copy.
              </p>
              <Button
                size="sm"
                className="mt-2"
                onClick={() => onCreated(duplicate.id, duplicate.name)}
              >
                Use the existing {label}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" />}
            Create {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
