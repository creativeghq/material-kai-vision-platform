import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Label } from '@/components/core/ui/label';
import { FormSection } from '@/components/core/ui/form-layout';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '../services/projectsService';
import { PROJECT_SECTION_LABELS, PROJECT_TABS } from '../projectSections';
import {
  KIND_DEFAULT_PARTS, PROJECT_FEATURES, PROJECT_FEATURE_LABELS, PROJECT_KINDS, PROJECT_KIND_DESCRIPTIONS,
  PROJECT_KIND_LABELS, isProjectKind, projectParts, type ProjectKind, type ProjectPart,
} from '../projectKinds';

const FIXED: readonly ProjectPart[] = ['overview', 'timeline'];

export const ProjectSectionsDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; kind: string; sections: string[] | null };
  /** Parts holding data — always shown, so they cannot be switched off here. */
  withData: ReadonlySet<string>;
  onSaved: (patch: { kind: ProjectKind; sections: ProjectPart[] | null }) => void;
}> = ({ open, onOpenChange, project, withData, onSaved }) => {
  const { toast } = useToast();
  const [kind, setKind] = useState<ProjectKind>(isProjectKind(project.kind) ? project.kind : 'fit_out');
  const [parts, setParts] = useState<Set<ProjectPart>>(() => projectParts(project));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(isProjectKind(project.kind) ? project.kind : 'fit_out');
    setParts(projectParts(project));
  }, [open, project]);

  const changeKind = (k: ProjectKind) => {
    setKind(k);
    setParts(new Set(KIND_DEFAULT_PARTS[k]));
  };

  const toggle = (p: ProjectPart, on: boolean) => setParts((prev) => {
    const next = new Set(prev);
    if (on) next.add(p); else next.delete(p);
    return next;
  });

  const save = async () => {
    setSaving(true);
    try {
      const defaults = new Set(KIND_DEFAULT_PARTS[kind]);
      const same = defaults.size === parts.size && [...parts].every((p) => defaults.has(p));
      const sections = same ? null : [...parts];
      await projectsService.updateProject(project.id, { kind, sections });
      onSaved({ kind, sections });
      toast({ title: 'Sections updated' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not save the sections', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const row = (p: ProjectPart, label: string) => {
    const locked = FIXED.includes(p) || withData.has(p);
    const id = `part-${p}`;
    return (
      <div key={p} className="flex items-center gap-2">
        <Checkbox id={id} checked={locked || parts.has(p)} disabled={locked || saving} onCheckedChange={(v) => toggle(p, v === true)} />
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
          {withData.has(p) && !FIXED.includes(p) && <span className="ml-1 text-xs text-muted-foreground">(has data)</span>}
        </Label>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Project Sections</DialogTitle>
          <DialogDescription>Show only what this job needs. A section that already holds records stays on.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <FormSection title="Kind of Project" description={PROJECT_KIND_DESCRIPTIONS[kind]}>
            <Select value={kind} onValueChange={(v) => changeKind(v as ProjectKind)} disabled={saving}>
              <SelectTrigger aria-label="Kind of project"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROJECT_KINDS.map((k) => <SelectItem key={k} value={k}>{PROJECT_KIND_LABELS[k]}</SelectItem>)}
              </SelectContent>
            </Select>
          </FormSection>
          <FormSection title="Sections">
            <div className="grid gap-2 sm:grid-cols-2">
              {PROJECT_TABS.map((t) => row(t, PROJECT_SECTION_LABELS[t]))}
            </div>
          </FormSection>
          <FormSection title="Construction Features">
            <div className="grid gap-2 sm:grid-cols-2">
              {PROJECT_FEATURES.map((f) => row(f, PROJECT_FEATURE_LABELS[f]))}
            </div>
          </FormSection>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
