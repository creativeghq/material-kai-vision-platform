/** The first steps of a new project, each ticked off by the data itself and linking to where it is done. */
import React, { useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, Loader2, Rocket } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { projectsService, type ProjectSetup, type ProjectWithClient } from '../services/projectsService';
import { ClientPicker, type ClientPickerValue } from './ClientPicker';
import type { ProjectTab } from '../projectSections';
import { isProjectKind, projectParts, type ProjectKind } from '../projectKinds';

interface Step {
  id: string;
  label: string;
  done: boolean;
  action: string;
  run: () => void;
}

const DESIGN_STEP: Record<ProjectKind, { tab: ProjectTab; label: string } | null> = {
  general: null,
  design_supply: { tab: 'moodboards', label: 'Start a moodboard' },
  fit_out: { tab: 'plan', label: 'Build the estimate' },
  construction: { tab: 'plan', label: 'Build the estimate' },
};

export const GetStartedCard: React.FC<{
  project: ProjectWithClient;
  setup: ProjectSetup;
  onOpenSection: (tab: ProjectTab) => void;
  onInvite: () => void;
  onClientSet: (patch: Partial<ProjectWithClient>) => void;
}> = ({ project, setup, onOpenSection, onInvite, onClientSet }) => {
  const kind: ProjectKind = isProjectKind(project.kind) ? project.kind : 'fit_out';
  const parts = projectParts(project);
  const [pickingClient, setPickingClient] = useState(false);

  const design = DESIGN_STEP[kind];
  const steps: Step[] = [
    { id: 'client', label: 'Add the client', done: setup.has_client, action: 'Add client', run: () => setPickingClient(true) },
    ...(parts.has('rooms') ? [{ id: 'rooms', label: 'Add the rooms', done: setup.rooms > 0, action: 'Open Rooms', run: () => onOpenSection('rooms') }] : []),
    ...(design ? [{
      id: 'design',
      label: design.label,
      done: design.tab === 'plan' ? setup.plans > 0 || setup.takeoff_drawings > 0 : setup.moodboards > 0,
      action: 'Open',
      run: () => onOpenSection(design.tab),
    }] : []),
    ...(parts.has('quotes') ? [{ id: 'quote', label: 'Send the client a quote', done: setup.quotes > 0, action: 'Open Quotes', run: () => onOpenSection('quotes') }] : []),
    { id: 'tasks', label: 'Plan the work', done: setup.tasks > 0, action: 'Open Tasks', run: () => onOpenSection('tasks') },
    { id: 'invite', label: 'Invite the client to follow along', done: setup.collaborators > 0, action: 'Invite', run: onInvite },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 font-medium"><Rocket className="h-4 w-4 text-primary" />Get Started</CardTitle>
        <span className="text-xs tabular-nums text-muted-foreground">{done} of {steps.length} done</span>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-hairline">
          {steps.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
              {s.done
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-label="Done" />
                : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="To do" />}
              <span className={s.done ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{s.label}</span>
              {!s.done && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={s.run}>
                  {s.action}<ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
      <SetClientDialog
        open={pickingClient}
        onOpenChange={setPickingClient}
        projectId={project.id}
        onSaved={onClientSet}
      />
    </Card>
  );
};

const SetClientDialog: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projectId: string;
  onSaved: (patch: Partial<ProjectWithClient>) => void;
}> = ({ open, onOpenChange, projectId, onSaved }) => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [value, setValue] = useState<ClientPickerValue>({ client_company_id: null, client_contact_id: null });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await projectsService.updateProject(projectId, {
        client_company_id: value.client_company_id,
        client_contact_id: value.client_contact_id,
      });
      const fresh = await projectsService.getProject(projectId);
      if (fresh) onSaved({
        client_company_id: fresh.client_company_id,
        client_contact_id: fresh.client_contact_id,
        client_company: fresh.client_company,
        client_contact: fresh.client_contact,
      });
      toast({ title: 'Client added' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not set the client', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add the Client</DialogTitle>
          <DialogDescription>Who this project is for. Quotes, invoices and the client invite use it.</DialogDescription>
        </DialogHeader>
        <ClientPicker value={value} onChange={setValue} disabled={saving} mode={isAdmin ? 'admin' : 'simple'} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || (!value.client_company_id && !value.client_contact_id)}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
