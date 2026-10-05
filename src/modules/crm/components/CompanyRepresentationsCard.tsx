import React, { useCallback, useEffect, useState } from 'react';
import { HubCellLink } from '@/components/core/hub';
import { Factory, Handshake, Loader2, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { formatDate } from '@/utils/datetime';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { REPRESENTATION_KINDS, type RepresentationKind } from '@/modules/crm/supplierTypes';

interface PartyRef {
  id: string; name: string; commercial_title: string | null; country_code?: string | null; industry?: string | null;
  people?: { is_primary: boolean | null; contact: PersonRef | null }[];
}
interface PersonRef { id: string; name: string; email: string | null; phone: string | null; mobile: string | null; position: string | null }
interface Representation {
  id: string;
  kind: RepresentationKind;
  territory: string | null;
  last_contact_on: string | null;
  notes: string | null;
  agent_company_id: string;
  principal_company_id: string;
  agent: PartyRef | null;
  principal: PartyRef | null;
  contact: PersonRef | null;
}

const SELECT = `id, kind, territory, last_contact_on, notes, agent_company_id, principal_company_id,
  agent:crm_companies!crm_company_representations_agent_company_id_fkey(id, name, commercial_title, country_code, industry,
    people:crm_company_contacts(is_primary, contact:crm_contacts(id, name, email, phone, mobile, position))),
  principal:crm_companies!crm_company_representations_principal_company_id_fkey(id, name, commercial_title, country_code, industry),
  contact:crm_contacts(id, name, email, phone, mobile, position)`;

const kindLabel = (k: RepresentationKind) => REPRESENTATION_KINDS.find((x) => x.value === k)?.label ?? k;
const display = (p: PartyRef | null) => (p ? p.commercial_title || p.name : '—');
const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, '')}`;
/** The agency's other people, after the link's lead contact. */
const agencyPeople = (r: Representation): PersonRef[] =>
  (r.agent?.people ?? []).map((x) => x.contact).filter((c): c is PersonRef => !!c && c.id !== r.contact?.id);

function PersonCell({ person }: { person: PersonRef | null }) {
  if (!person) return <span className="text-muted-foreground">—</span>;
  const phone = person.mobile || person.phone;
  return (
    <div className="space-y-0.5">
      <div className="font-medium"><HubCellLink to={`/crm/contacts/${person.id}`}>{person.name}</HubCellLink>{person.position ? <span className="font-normal text-muted-foreground"> · {person.position}</span> : null}</div>
      <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        {phone && <a href={telHref(phone)} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" />{phone}</a>}
        {person.email && <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" />{person.email}</a>}
      </div>
    </div>
  );
}

function AddRepresentationDialog({ open, onOpenChange, side, companyId, workspaceId, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side: 'principal' | 'agent';
  companyId: string;
  workspaceId: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PartyRef[]>([]);
  const [picked, setPicked] = useState<PartyRef | null>(null);
  const [people, setPeople] = useState<PersonRef[]>([]);
  const [contactId, setContactId] = useState<string>('');
  const [kind, setKind] = useState<RepresentationKind>('agent');
  const [saving, setSaving] = useState(false);
  const agencyId = side === 'principal' ? companyId : picked?.id;

  useEffect(() => {
    if (!open) { setQuery(''); setHits([]); setPicked(null); setContactId(''); setKind('agent'); }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || picked) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      void supabase.from('crm_companies').select('id, name, commercial_title, country_code, industry')
        .eq('workspace_id', workspaceId).neq('id', companyId).ilike(CRM_SEARCH_COLUMN, foldedLike(q)).limit(8)
        .then(({ data }) => { if (live) setHits((data ?? []) as PartyRef[]); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, picked, workspaceId, companyId]);

  useEffect(() => {
    if (!agencyId) { setPeople([]); return; }
    let live = true;
    void supabase.from('crm_company_contacts').select('is_primary, contact:crm_contacts(id, name, email, phone, mobile, position)')
      .eq('company_id', agencyId).order('is_primary', { ascending: false })
      .then(({ data }) => {
        if (!live) return;
        const list = ((data ?? []) as unknown as { contact: PersonRef | null }[]).map((r) => r.contact).filter((c): c is PersonRef => !!c);
        setPeople(list);
        setContactId(list[0]?.id ?? '');
      });
    return () => { live = false; };
  }, [agencyId]);

  const save = async () => {
    if (!picked) return;
    setSaving(true);
    const { error } = await supabase.from('crm_company_representations').insert({
      workspace_id: workspaceId,
      agent_company_id: side === 'principal' ? companyId : picked.id,
      principal_company_id: side === 'principal' ? picked.id : companyId,
      contact_id: contactId || null,
      kind,
      territory: 'Greece',
      source: 'operator',
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the link', description: error.code === '23505' ? 'These two are already linked.' : getErrorMessage(error), variant: 'destructive' });
      return;
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{side === 'principal' ? 'Add a factory this agency represents' : 'Add the agency that represents this factory'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rep-search">{side === 'principal' ? 'Factory' : 'Agency'}</Label>
            {picked ? (
              <div className="flex items-center justify-between rounded-sm border border-hairline px-3 py-2 text-sm">
                <span>{display(picked)}</span>
                <Button variant="ghost" size="sm" onClick={() => { setPicked(null); setQuery(''); }}>Change</Button>
              </div>
            ) : (
              <>
                <Input id="rep-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the CRM by name" autoFocus />
                {hits.length > 0 && (
                  <div className="rounded-sm border border-hairline">
                    {hits.map((h) => (
                      <button key={h.id} type="button" onClick={() => setPicked(h)} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-sunken">
                        {display(h)}{h.country_code ? <span className="text-muted-foreground"> · {h.country_code}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Not in the CRM yet? Create the business first, then link it here.</p>
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label>Arrangement</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as RepresentationKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REPRESENTATION_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {agencyId && (
            <div className="space-y-2">
              <Label>Person at the agency</Label>
              {people.length === 0 ? (
                <p className="text-xs text-muted-foreground">The agency has no contacts yet. Add one on its Contacts tab.</p>
              ) : (
                <Select value={contactId} onValueChange={setContactId}>
                  <SelectTrigger><SelectValue placeholder="Choose a person" /></SelectTrigger>
                  <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!picked || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Link</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** People reachable through an agency link on this company — they count as its contacts. */
export function useRepresentationContactIds(companyId: string | undefined, refreshKey = 0): { ids: string[]; representedBy: number } {
  const [state, setState] = useState<{ ids: string[]; representedBy: number }>({ ids: [], representedBy: 0 });
  useEffect(() => {
    if (!companyId) return;
    let live = true;
    void supabase.from('crm_company_representations').select('contact_id, principal_company_id')
      .or(`agent_company_id.eq.${companyId},principal_company_id.eq.${companyId}`)
      .then(({ data }) => {
        if (!live) return;
        const rows = (data ?? []) as { contact_id: string | null; principal_company_id: string }[];
        setState({
          ids: [...new Set(rows.map((r) => r.contact_id).filter((x): x is string => !!x))],
          representedBy: rows.filter((r) => r.principal_company_id === companyId).length,
        });
      });
    return () => { live = false; };
  }, [companyId, refreshKey]);
  return state;
}

export const CompanyRepresentationsCard: React.FC<{ companyId: string; workspaceId: string; isAgency: boolean; onChange?: () => void }> = ({ companyId, workspaceId, isAgency, onChange }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Representation[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<'principal' | 'agent' | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('crm_company_representations').select(SELECT)
      .or(`agent_company_id.eq.${companyId},principal_company_id.eq.${companyId}`);
    if (error) toast({ title: 'Could not load agency links', description: getErrorMessage(error), variant: 'destructive' });
    setRows((data ?? []) as unknown as Representation[]);
    setLoading(false);
  }, [companyId, toast]);

  useEffect(() => { void load(); }, [load]);

  const remove = async (id: string) => {
    const { error } = await supabase.from('crm_company_representations').delete().eq('id', id);
    if (error) { toast({ title: 'Could not remove the link', description: getErrorMessage(error), variant: 'destructive' }); return; }
    setRows((r) => r.filter((x) => x.id !== id));
    onChange?.();
  };

  const represents = rows.filter((r) => r.agent_company_id === companyId)
    .sort((a, b) => display(a.principal).localeCompare(display(b.principal)));
  const representedBy = rows.filter((r) => r.principal_company_id === companyId);

  if (loading) return null;

  return (
    <>
      {(isAgency || represents.length > 0) && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><Factory className="h-4 w-4" />Factories represented</CardTitle>
              <CardDescription>The factories this business sells for, and the person here to ask about each one.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAdding('principal')}><Plus className="mr-2 h-4 w-4" />Add factory</Button>
          </CardHeader>
          <CardContent className="p-0">
            {represents.length === 0 ? (
              <HubEmptyState icon={Factory} title="No factories linked yet" description="Link each factory this agency represents, so its page shows who to call."
                action={<Button size="sm" onClick={() => setAdding('principal')}><Plus className="mr-2 h-4 w-4" />Add factory</Button>} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Factory</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Makes</TableHead>
                    <TableHead>Ask</TableHead>
                    <TableHead>Last contact</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {represents.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <HubCellLink to={`/crm/companies/${r.principal_company_id}`}>{display(r.principal)}</HubCellLink>
                        {r.kind !== 'agent' && <Badge variant="neutral" className="ml-2">{kindLabel(r.kind)}</Badge>}
                      </TableCell>
                      <TableCell>{r.principal?.country_code ?? '—'}</TableCell>
                      <TableCell className="max-w-[16rem] text-muted-foreground">{r.principal?.industry ?? '—'}</TableCell>
                      <TableCell><PersonCell person={r.contact} /></TableCell>
                      <TableCell className="whitespace-nowrap">{r.last_contact_on ? formatDate(r.last_contact_on) : '—'}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" aria-label={`Unlink ${display(r.principal)}`} onClick={() => void remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {(!isAgency || representedBy.length > 0) && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2"><Handshake className="h-4 w-4" />Represented by</CardTitle>
              <CardDescription>The agencies that sell this factory in Greece. Orders and prices go through them.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setAdding('agent')}><Plus className="mr-2 h-4 w-4" />Add agency</Button>
          </CardHeader>
          <CardContent className={representedBy.length ? 'space-y-3' : 'p-0'}>
            {representedBy.length === 0 ? (
              <HubEmptyState icon={Handshake} title="No agency linked" description="If a Greek agency sells this factory, link it so you know who to call."
                action={<Button size="sm" onClick={() => setAdding('agent')}><Plus className="mr-2 h-4 w-4" />Add agency</Button>} />
            ) : representedBy.map((r) => (
              <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline pb-3 last:border-0 last:pb-0">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <HubCellLink to={`/crm/companies/${r.agent_company_id}`}>{display(r.agent)}</HubCellLink>
                    <Badge variant="neutral">{kindLabel(r.kind)}{r.territory ? ` · ${r.territory}` : ''}</Badge>
                  </div>
                  <PersonCell person={r.contact} />
                  {agencyPeople(r).map((p) => <PersonCell key={p.id} person={p} />)}
                  {r.notes && <p className="max-w-prose text-xs text-muted-foreground">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {r.last_contact_on && <span>Last contact {formatDate(r.last_contact_on)}</span>}
                  <Button variant="ghost" size="icon" aria-label={`Unlink ${display(r.agent)}`} onClick={() => void remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddRepresentationDialog open={adding !== null} onOpenChange={(o) => { if (!o) setAdding(null); }} side={adding ?? 'principal'}
        companyId={companyId} workspaceId={workspaceId} onSaved={() => { void load(); onChange?.(); }} />
    </>
  );
};
