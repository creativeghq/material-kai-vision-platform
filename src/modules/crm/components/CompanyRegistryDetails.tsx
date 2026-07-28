/**
 * CompanyRegistryDetails — the "deep" ΑΑΔΕ + ΓΕΜΗ registry data for a CRM company, kept out of
 * the main form to avoid noise:
 *  - a "See all N activity codes (ΚΑΔ)" link → modal listing the full merged ΚΑΔ list.
 *  - a ΓΕΜΗ "People (from registry)" list (directors/representatives) where each person has a
 *    (+) to create a CRM contact under this company.
 *
 * Data comes from crm_companies.kad_all (normalized) + gemi_data.persons (raw ΓΕΜΗ record). Both
 * are populated by the myaade-rgwspublic2 / mygemi-opendata enrichment functions.
 */
import React, { useMemo, useState } from 'react';
import { Layers, UserPlus, Loader2, Check, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/core/ui/dialog';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { companiesAPI } from '@/services/crm.service';

// Canonical shape lives with the research routine that produces it.
export type { KadEntry } from '@/modules/crm/services/companyResearch';
import type { KadEntry } from '@/modules/crm/services/companyResearch';
interface GemiPerson { personName?: string | null; businessName?: string | null; role?: string | null; percentage?: string | null; category?: string | null }

const SourceBadge: React.FC<{ source?: string }> = ({ source }) =>
  source ? <Badge variant="outline" className="text-[9px] py-0 uppercase">{source === 'gemi' ? 'ΓΕΜΗ' : 'ΑΑΔΕ'}</Badge> : null;

export const CompanyRegistryDetails: React.FC<{
  companyId?: string;
  kadAll?: KadEntry[] | null;
  gemiData?: any;
  /** Called after a person is added as a CRM contact so the parent can refresh its contact list. */
  onContactAdded?: () => void;
}> = ({ companyId, kadAll, gemiData, onContactAdded }) => {
  const { toast } = useToast();
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const codes = useMemo<KadEntry[]>(() => {
    const list = Array.isArray(kadAll) ? kadAll.filter((k) => k && k.code) : [];
    // primary first, then by code
    return [...list].sort((a, b) => (Number(!!b.primary) - Number(!!a.primary)) || String(a.code).localeCompare(String(b.code)));
  }, [kadAll]);

  const persons = useMemo<GemiPerson[]>(() => {
    const p = gemiData?.persons;
    return Array.isArray(p) ? p.filter((x: GemiPerson) => x && (x.personName || x.businessName)) : [];
  }, [gemiData]);

  const addPerson = async (person: GemiPerson, idx: number) => {
    if (!companyId) { toast({ title: 'Save the company first', variant: 'destructive' }); return; }
    const name = (person.personName || person.businessName || '').trim();
    if (!name) return;
    const key = `${name}#${idx}`;
    setAddingKey(key);
    try {
      await companiesAPI.createAndAttachContact(
        companyId,
        { name, position: person.role ?? undefined },
        person.role ?? 'Registry contact',
        false,
        person.percentage ? `ΓΕΜΗ: ${person.role ?? ''} ${person.percentage ? `(${person.percentage})` : ''}`.trim() : 'From ΓΕΜΗ registry',
      );
      setAdded((s) => new Set(s).add(key));
      toast({ title: 'Contact added', description: `${name} added to this company.` });
      onContactAdded?.();
    } catch (e: any) {
      toast({ title: 'Could not add contact', description: e?.message, variant: 'destructive' });
    } finally {
      setAddingKey(null);
    }
  };

  if (codes.length === 0 && persons.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {codes.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Layers className="h-3.5 w-3.5" /> See all {codes.length} activity codes (ΚΑΔ)
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Activity codes (ΚΑΔ)</DialogTitle></DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
              {codes.map((k, i) => (
                <div key={`${k.code}-${i}`} className="flex items-start gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
                  {k.primary && <Star className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />}
                  <span className="font-mono text-foreground shrink-0">{k.code}</span>
                  <span className="text-muted-foreground flex-1">{k.description || '—'}</span>
                  <SourceBadge source={k.source} />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {persons.length > 0 && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <UserPlus className="h-3.5 w-3.5" /> People from ΓΕΜΗ ({persons.length})
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>People from ΓΕΜΗ registry</DialogTitle></DialogHeader>
            <p className="text-[11px] text-muted-foreground -mt-1">Add any as a contact under this company.</p>
            <div className="max-h-[60vh] overflow-y-auto space-y-1.5">
              {persons.map((p, i) => {
                const name = (p.personName || p.businessName || '').trim();
                const key = `${name}#${i}`;
                const isAdded = added.has(key);
                return (
                  <div key={key} className="flex items-center gap-2 rounded-md border border-border/50 px-2.5 py-1.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground truncate">{name}</div>
                      <div className="text-muted-foreground text-[11px] truncate">
                        {[p.role, p.percentage].filter(Boolean).join(' · ') || 'Registry person'}
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                      title={isAdded ? 'Added' : 'Add to CRM under this company'}
                      disabled={isAdded || addingKey === key}
                      onClick={() => addPerson(p, i)}
                    >
                      {addingKey === key ? <Loader2 className="h-4 w-4 animate-spin" />
                        : isAdded ? <Check className="h-4 w-4 text-green-500" />
                        : <UserPlus className="h-4 w-4" />}
                    </Button>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
