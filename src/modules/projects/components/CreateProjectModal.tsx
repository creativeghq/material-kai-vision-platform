import React, { useEffect, useState } from 'react';
import { ChevronDown, Home, Layers, Loader2, Plus, Tags, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUserRole } from '@/hooks/useUserRole';
import { projectsService, type RoomType } from '../services/projectsService';
import { ClientPicker, type ClientPickerValue } from './ClientPicker';
import { AddressUnitSelect } from '@/modules/crm/components/AddressUnitSelect';
import { TemplatePickerDialog } from '@/components/features/templates/TemplatePickerDialog';
import { entityTemplatesService, type EntityTemplate } from '@/services/entityTemplatesService';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { useAuth } from '@/contexts/AuthContext';
import { projectCategoriesService, type ProjectCategory } from '../services/projectCategoriesService';
import { ProjectCategoryManager } from './ProjectCategoryManager';
import {
  PROJECT_KINDS,
  PROJECT_KIND_DESCRIPTIONS,
  PROJECT_KIND_LABELS,
  isProjectKind,
  type ProjectKind,
} from '../projectKinds';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (projectId: string, projectName: string) => void;
  /** Pre-bind the client — set when opening from a CRM record. */
  initialClient?: ClientPickerValue & { name?: string | null };
  /** Hide the client picker entirely (implied by `initialClient`). */
  lockClient?: boolean;
  initialCategoryId?: string;
  initialKind?: ProjectKind;
}

interface RoomDraft {
  name: string;
  room_type: RoomType | '';
}

const ROOM_TYPE_OPTIONS: Array<{ value: RoomType; label: string }> = [
  { value: 'living', label: 'Living' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'dining', label: 'Dining' },
  { value: 'office', label: 'Office' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'hallway', label: 'Hallway' },
  { value: 'other', label: 'Other' },
];

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  open,
  onClose,
  onSuccess,
  initialClient,
  lockClient,
  initialCategoryId,
  initialKind,
}) => {
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const [processing, setProcessing] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [template, setTemplate] = useState<EntityTemplate | null>(null);
  const [showMore, setShowMore] = useState(false);
  const clientLocked = lockClient ?? !!initialClient;

  const [kind, setKind] = useState<ProjectKind>(initialKind ?? 'fit_out');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState<ClientPickerValue>({
    client_company_id: initialClient?.client_company_id ?? null,
    client_contact_id: initialClient?.client_contact_id ?? null,
    display_name: initialClient?.name ?? undefined,
  });

  // The modal instance is reused, so opening from a different CRM record must re-bind.
  React.useEffect(() => {
    if (!open || !initialClient) return;
    setClient({
      client_company_id: initialClient.client_company_id ?? null,
      client_contact_id: initialClient.client_contact_id ?? null,
      display_name: initialClient.name ?? undefined,
    });
  }, [open, initialClient?.client_company_id, initialClient?.client_contact_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const workspaceId = user ? getActiveWorkspaceId(user.id) : null;
  const [categories, setCategories] = useState<ProjectCategory[]>([]);
  const loadCategories = React.useCallback(() => {
    projectCategoriesService.list(workspaceId)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [workspaceId]);
  useEffect(() => { if (open) loadCategories(); }, [open, loadCategories]);

  const [addrUnitId, setAddrUnitId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string>(initialCategoryId ?? '');
  const [managingCategories, setManagingCategories] = useState(false);
  const [rooms, setRooms] = useState<RoomDraft[]>([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<RoomType | ''>('');
  const [deadline, setDeadline] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('EUR');

  const reset = () => {
    setKind(initialKind ?? 'fit_out');
    setTemplate(null);
    setShowMore(false);
    setName('');
    setDescription('');
    setClient({
      client_company_id: initialClient?.client_company_id ?? null,
      client_contact_id: initialClient?.client_contact_id ?? null,
      display_name: initialClient?.name ?? undefined,
    });
    setAddrUnitId(null);
    setCategoryId(initialCategoryId ?? '');
    setRooms([]);
    setNewRoomName('');
    setNewRoomType('');
    setDeadline('');
    setBudgetAmount('');
    setBudgetCurrency('EUR');
  };

  const handleAddRoom = () => {
    if (!newRoomName.trim()) return;
    setRooms(prev => [...prev, { name: newRoomName.trim(), room_type: newRoomType }]);
    setNewRoomName('');
    setNewRoomType('');
  };

  const pickTemplate = (tpl: EntityTemplate) => {
    setTemplate(tpl);
    const k = tpl.payload?.kind;
    if (isProjectKind(k)) setKind(k);
    if (!name.trim() && typeof tpl.payload?.name === 'string') setName(tpl.payload.name);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      toast({ title: 'Project name required', variant: 'destructive' });
      return;
    }
    if (!isAdmin && !client.client_company_id && !client.client_contact_id) {
      toast({ title: 'Pick or add a client to continue', variant: 'destructive' });
      return;
    }

    const fields = {
      description: description.trim() || null,
      kind,
      category_id: categoryId || null,
      client_address_unit_id: addrUnitId,
      deadline: deadline || null,
      budget_amount: budgetAmount ? parseFloat(budgetAmount) : null,
      budget_currency: budgetCurrency,
      rooms: rooms.map(r => ({ name: r.name, room_type: r.room_type || null })),
    };

    try {
      setProcessing(true);
      let id: string;
      if (template) {
        if (!workspaceId) throw new Error('No active workspace');
        const result = await entityTemplatesService.apply(template.id, {
          workspaceId,
          title: name.trim(),
          customer: { companyId: client.client_company_id, contactId: client.client_contact_id },
          project: fields,
        });
        if (result.kind !== 'created') throw new Error('The template did not create a project');
        id = result.id;
      } else {
        const project = await projectsService.createProject({
          name: name.trim(),
          description: fields.description ?? undefined,
          kind,
          client_company_id: client.client_company_id,
          client_contact_id: client.client_contact_id,
          client_address_unit_id: addrUnitId,
          category_id: fields.category_id,
          deadline: fields.deadline,
          budget_amount: fields.budget_amount,
          budget_currency: budgetCurrency,
          rooms: rooms.map(r => ({ name: r.name, room_type: r.room_type || null })),
        });
        id = project.id;
      }
      toast({ title: 'Project created', description: name.trim() });
      const created = name.trim();
      reset();
      onSuccess(id, created);
      onClose();
    } catch (err) {
      console.error('Error creating project:', err);
      toast({
        title: 'Could not create the project',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Project</DialogTitle>
          <DialogDescription>
            Pick what sort of job it is — the project only shows the sections that kind of job needs.
            You can switch sections on or off later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <FormSection title="Kind of Project">
            <div role="radiogroup" aria-label="Kind of project" className="grid gap-2 sm:grid-cols-2">
              {PROJECT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  disabled={processing}
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-sm border p-3 text-left transition-colors',
                    kind === k ? 'border-primary bg-primary/[0.08]' : 'border-hairline hover:bg-surface-sunken',
                  )}
                >
                  <span className="block text-sm font-medium">{PROJECT_KIND_LABELS[k]}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{PROJECT_KIND_DESCRIPTIONS[k]}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {template ? (
                <span className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken px-2 py-1">
                  <Layers className="h-3.5 w-3.5" />
                  Template: {template.title}
                  <button type="button" aria-label="Remove template" onClick={() => setTemplate(null)} disabled={processing}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <Button type="button" variant="ghost" size="sm" disabled={processing} onClick={() => setTemplatePickerOpen(true)}>
                  <Layers className="h-4 w-4 mr-1.5" /> Start from a template
                </Button>
              )}
              {template && <span className="text-muted-foreground">Its rooms and task list are added when you create.</span>}
            </div>
          </FormSection>

          <FormSection title="Basics">
            <FormGrid cols={1}>
              <FormField label="Project Name">
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g., Kavouri Villa Renovation"
                  disabled={processing}
                  autoFocus
                />
              </FormField>
              <FormField label="Client" optional={isAdmin && !clientLocked} htmlFor="project-client">
                {clientLocked ? (
                  <div id="project-client" className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm">
                    {initialClient?.name || 'This record'}
                  </div>
                ) : (
                  <ClientPicker
                    value={client}
                    onChange={(next) => { setClient(next); setAddrUnitId(null); }}
                    disabled={processing}
                    mode={isAdmin ? 'admin' : 'simple'}
                  />
                )}
              </FormField>
              <AddressUnitSelect
                companyId={client.client_company_id}
                contactId={client.client_contact_id}
                value={addrUnitId}
                onChange={(id) => setAddrUnitId(id)}
                label="Project Address"
                disabled={processing}
              />
            </FormGrid>
          </FormSection>

          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            aria-expanded={showMore}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showMore && 'rotate-180')} />
            {showMore ? 'Fewer details' : 'More details — description, category, rooms, deadline, budget'}
          </button>

          {showMore && (
            <>
              <FormSection title="Details">
                <FormGrid cols={1}>
                  <FormField label="Description" optional>
                    <Textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Scope, briefing notes, anything you want to remember..."
                      rows={2}
                      disabled={processing}
                    />
                  </FormField>
                  <FormField
                    label="Category"
                    optional
                    htmlFor="project-category"
                    hint={workspaceId && (
                      <button
                        type="button"
                        onClick={() => setManagingCategories(true)}
                        disabled={processing}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <Tags className="h-3 w-3" /> Manage categories
                      </button>
                    )}
                  >
                    <Select
                      value={categoryId || 'none'}
                      onValueChange={v => setCategoryId(v === 'none' ? '' : v)}
                      disabled={processing}
                    >
                      <SelectTrigger id="project-category"><SelectValue placeholder="No category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No category</SelectItem>
                        {categories.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                </FormGrid>
              </FormSection>

              {kind !== 'general' && (
                <FormSection title="Rooms" description="Single-space projects can skip this. You can add rooms later.">
                  <div className="flex gap-2">
                    <Input
                      value={newRoomName}
                      onChange={e => setNewRoomName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRoom(); } }}
                      placeholder="Room name (e.g. Master Bath)"
                      aria-label="Room name"
                      disabled={processing}
                      className="flex-1"
                    />
                    <Select value={newRoomType} onValueChange={(v) => setNewRoomType(v as RoomType)} disabled={processing}>
                      <SelectTrigger className="w-32" aria-label="Room type"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        {ROOM_TYPE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={handleAddRoom} disabled={processing || !newRoomName.trim()} aria-label="Add room">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {rooms.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rooms.map((r, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken py-1 pl-2.5 pr-1.5 text-sm">
                          <Home className="h-3 w-3" />
                          {r.name}
                          {r.room_type && <span className="text-xs text-muted-foreground capitalize">· {r.room_type}</span>}
                          <button
                            type="button"
                            aria-label={`Remove ${r.name}`}
                            onClick={() => setRooms(prev => prev.filter((_, i) => i !== idx))}
                            disabled={processing}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </FormSection>
              )}

              <FormSection title="Deadline & Budget">
                <FormGrid cols={2}>
                  <FormField label="Deadline" optional>
                    <Input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} disabled={processing} />
                  </FormField>
                  <FormField label="Budget" optional htmlFor="project-budget">
                    <div className="flex gap-2">
                      <Input
                        id="project-budget"
                        type="number"
                        min="0"
                        step="100"
                        value={budgetAmount}
                        onChange={e => setBudgetAmount(e.target.value)}
                        disabled={processing}
                        className="flex-1"
                      />
                      <Select value={budgetCurrency} onValueChange={setBudgetCurrency} disabled={processing}>
                        <SelectTrigger className="w-24" aria-label="Currency"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </FormField>
                </FormGrid>
              </FormSection>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={processing}>Cancel</Button>
          <Button onClick={handleCreate} disabled={processing}>
            {processing
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</>
              : <><Plus className="h-4 w-4 mr-2" />Create project</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Sibling, not a child — nesting two Radix dialogs fights over the focus trap and Esc. */}
    <TemplatePickerDialog
      entityType="project"
      open={templatePickerOpen}
      onOpenChange={setTemplatePickerOpen}
      onSelect={(tpl) => { pickTemplate(tpl); setTemplatePickerOpen(false); }}
    />

    {managingCategories && workspaceId && (
      <ProjectCategoryManager
        workspaceId={workspaceId}
        onClose={() => setManagingCategories(false)}
        onChanged={loadCategories}
      />
    )}
    </>
  );
};
