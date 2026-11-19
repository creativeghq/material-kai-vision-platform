import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { SignalValuePicker } from './SignalValuePicker';
import { DescribedSignalFields } from './DescribedSignalFields';
import {
  signalsService, SIGNAL_FILTER_KEY, SIGNAL_KIND_LABEL, isListKind,
  type DescribedSpec, type SavedSignal, type SignalFilter, type SignalKind, type SignalsDictionary,
} from '@/services/signalsService';

export interface SignalDraft {
  id?: string | null;
  kind: SignalKind;
  name: string;
  filter: SignalFilter;
  notify?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  availableKinds: SignalKind[];
  dictionary: SignalsDictionary | null;
  initial?: SignalDraft | SavedSignal | null;
  onSaved: () => void;
}

export function SignalEditorDialog({ open, onOpenChange, workspaceId, availableKinds, dictionary, initial, onSaved }: Props) {
  const { toast } = useToast();
  const [kind, setKind] = useState<SignalKind>(availableKinds[0] ?? 'hiring');
  const [name, setName] = useState('');
  const [values, setValues] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [crmOnly, setCrmOnly] = useState(false);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState('');
  const [spec, setSpec] = useState<DescribedSpec | null>(null);
  const [tested, setTested] = useState(false);

  useEffect(() => {
    if (!open) return;
    const k = initial?.kind && availableKinds.includes(initial.kind) ? initial.kind : (availableKinds[0] ?? 'hiring');
    setKind(k);
    setName(initial?.name ?? '');
    setValues(isListKind(k) ? initial?.filter?.[SIGNAL_FILTER_KEY[k]] ?? [] : []);
    setDescription(initial?.filter?.description ?? '');
    setSpec(initial?.filter?.spec ?? null);
    setTested(Boolean(initial?.id && initial?.filter?.spec));
    setLocation(initial?.filter?.location_contains ?? '');
    setCrmOnly(Boolean(initial?.filter?.crm_only));
    setNotify(initial?.notify ?? true);
  }, [open, initial, availableKinds]);

  const changeKind = (k: SignalKind) => { setKind(k); setValues([]); };

  const submit = async () => {
    if (kind === 'described') {
      if (!spec) {
        toast({ title: 'Draft the rules first', description: 'Press Draft Rules, check them, then save.', variant: 'destructive' });
        return;
      }
      if (!tested) {
        toast({ title: 'Test the rules first', description: 'Test on the last 30 days to see what it matches and what it will cost, then save.', variant: 'destructive' });
        return;
      }
      setSaving(true);
      try {
        await signalsService.save(workspaceId, {
          id: initial?.id ?? null, kind, notify,
          filter: { description: description.trim(), crm_only: crmOnly, spec },
          name: name.trim() || description.trim().slice(0, 80),
        });
        toast({ title: initial?.id ? 'Signal updated' : 'Signal saved', description: 'New items are checked every hour; each AI check costs 1 credit.' });
        onSaved();
        onOpenChange(false);
      } catch (e) {
        toast({ title: 'Could not save the signal', description: (e as Error).message, variant: 'destructive' });
      } finally {
        setSaving(false);
      }
      return;
    }
    if (values.length === 0) {
      toast({ title: 'Nothing to watch yet', description: 'Add at least one keyword, technology or use case.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const filter: SignalFilter = {
        [SIGNAL_FILTER_KEY[kind]]: values,
        crm_only: crmOnly,
        ...(kind === 'hiring' && location.trim() ? { location_contains: location.trim() } : {}),
      };
      await signalsService.save(workspaceId, {
        id: initial?.id ?? null, kind, filter, notify,
        name: name.trim() || `${SIGNAL_KIND_LABEL[kind]}: ${values.slice(0, 3).join(', ')}`,
      });
      toast({ title: initial?.id ? 'Signal updated' : 'Signal saved', description: 'It is checked against the corpus every hour.' });
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save the signal', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={kind === 'described' ? 'max-w-2xl' : 'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{initial?.id ? 'Edit signal' : 'New signal'}</DialogTitle>
          <DialogDescription>A saved signal watches the company corpus and records every new match.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <FormSection title="What to watch">
            <FormGrid cols={2}>
              <FormField label="Kind">
                <Select value={kind} onValueChange={(v) => changeKind(v as SignalKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {availableKinds.map((k) => <SelectItem key={k} value={k}>{SIGNAL_KIND_LABEL[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Name" optional>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ERP buyers in Greece" />
              </FormField>
            </FormGrid>
            {isListKind(kind) ? (
              <FormField
                label={kind === 'hiring' ? 'Roles, skills or keywords' : kind === 'technology' ? 'Technologies' : 'Use cases'}
                hint={kind === 'hiring' ? 'Comma-separated. Matched against the posting title and body.' : undefined}
              >
                <SignalValuePicker kind={kind} dictionary={dictionary} value={values} onChange={setValues} />
              </FormField>
            ) : null}
            {kind === 'hiring' ? (
              <FormField label="Location Contains" optional>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Athens" />
              </FormField>
            ) : null}
          </FormSection>

          {kind === 'described' ? (
            <DescribedSignalFields
              description={description} onDescriptionChange={setDescription}
              spec={spec} onSpecChange={setSpec} crmOnly={crmOnly}
              onNameSuggested={(n) => { if (!name.trim()) setName(n); }}
              onTestedChange={setTested}
            />
          ) : null}

          <FormSection title="Scope and Alerts">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={crmOnly} onCheckedChange={(v) => setCrmOnly(v === true)} />
              Only companies already in my CRM
            </label>
            <label className="flex items-center justify-between gap-2 text-sm">
              <span>Notify me when it finds something new</span>
              <Switch checked={notify} onCheckedChange={setNotify} />
            </label>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {initial?.id ? 'Save changes' : 'Save signal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
