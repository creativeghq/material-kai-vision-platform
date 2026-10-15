import React from 'react';

import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  LEAD_SOURCES, LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, type LeadSource, type LeadStatus,
} from '@/modules/crm/leadVocabulary';
import type { Lead, LeadInput } from '@/services/crmLeadsService';

export type EditableLeadStatus = Exclude<LeadStatus, 'converted'>;
export const EDITABLE_LEAD_STATUSES = LEAD_STATUSES.filter((s): s is EditableLeadStatus => s !== 'converted');

export interface LeadFormState {
  name: string; email: string; phone: string; company_name: string; source: LeadSource;
  title: string; request: string; notes: string; estimated_value: string; status: EditableLeadStatus;
  lost_reason: string; follow_up_on: string; source_ref: string;
}

export const EMPTY_LEAD_FORM: LeadFormState = {
  name: '', email: '', phone: '', company_name: '', source: 'email', title: '', request: '', notes: '',
  estimated_value: '', status: 'new', lost_reason: '', follow_up_on: '', source_ref: '',
};

export function leadToForm(l: Lead): LeadFormState {
  return {
    name: l.name, email: l.email ?? '', phone: l.phone ?? '', company_name: l.company_name ?? '',
    source: l.source, title: l.title ?? '', request: l.request ?? '', notes: l.notes ?? '',
    estimated_value: l.estimated_value == null ? '' : String(l.estimated_value),
    status: l.status === 'converted' ? 'quoted' : l.status, lost_reason: l.lost_reason ?? '',
    follow_up_on: l.follow_up_on ?? '', source_ref: l.source_ref ?? '',
  };
}

export function formToLeadInput(f: LeadFormState): LeadInput {
  const value = f.estimated_value.trim() ? Number(f.estimated_value.replace(',', '.')) : null;
  return {
    name: f.name, email: f.email, phone: f.phone, company_name: f.company_name, source: f.source,
    title: f.title, request: f.request, notes: f.notes,
    estimated_value: value != null && Number.isFinite(value) ? value : null,
    status: f.status, lost_reason: f.lost_reason, follow_up_on: f.follow_up_on, source_ref: f.source_ref,
  };
}

interface Props {
  form: LeadFormState;
  onChange: (next: LeadFormState) => void;
  disabled?: boolean;
}

export const LeadFormFields: React.FC<Props> = ({ form, onChange, disabled }) => {
  const set = <K extends keyof LeadFormState>(k: K, v: LeadFormState[K]) => onChange({ ...form, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="lead-name">Name *</Label>
        <Input id="lead-name" disabled={disabled} value={form.name} onChange={(e) => set('name', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-email">Email</Label>
        <Input id="lead-email" type="email" disabled={disabled} value={form.email} onChange={(e) => set('email', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-phone">Phone</Label>
        <Input id="lead-phone" disabled={disabled} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-company">Company</Label>
        <Input id="lead-company" disabled={disabled} value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Source</Label>
        <Select disabled={disabled} value={form.source} onValueChange={(v) => set('source', v as LeadSource)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAD_SOURCES.map((s) => <SelectItem key={s} value={s}>{LEAD_SOURCE_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="lead-title">Interested in</Label>
        <Input id="lead-title" disabled={disabled} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Floor tiles ~70m²" />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="lead-request">Request</Label>
        <Textarea id="lead-request" rows={3} disabled={disabled} value={form.request} onChange={(e) => set('request', e.target.value)} />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" rows={5} disabled={disabled} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Status</Label>
        <Select disabled={disabled} value={form.status} onValueChange={(v) => set('status', v as EditableLeadStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {EDITABLE_LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-value">Est. value (EUR)</Label>
        <Input id="lead-value" inputMode="decimal" disabled={disabled} value={form.estimated_value} onChange={(e) => set('estimated_value', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-follow">Follow-up on</Label>
        <Input id="lead-follow" type="date" disabled={disabled} value={form.follow_up_on} onChange={(e) => set('follow_up_on', e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="lead-ref">Reference</Label>
        <Input id="lead-ref" disabled={disabled} value={form.source_ref} onChange={(e) => set('source_ref', e.target.value)} placeholder="Email subject, link…" />
      </div>
      {form.status === 'lost' && (
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="lead-lost">Lost reason</Label>
          <Input id="lead-lost" disabled={disabled} value={form.lost_reason} onChange={(e) => set('lost_reason', e.target.value)} />
        </div>
      )}
    </div>
  );
};
