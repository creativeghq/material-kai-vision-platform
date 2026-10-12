/** A WhatsApp Form is a one-screen Meta WhatsApp Flow built from a field list. Mirrored to Deno. */

export const WHATSAPP_FORM_FIELD_KINDS = ['text', 'textarea', 'number', 'email', 'phone', 'date', 'dropdown'] as const;
export type WhatsAppFormFieldKind = typeof WHATSAPP_FORM_FIELD_KINDS[number];

export const WHATSAPP_FORM_PURPOSES = ['order', 'lead', 'booking', 'support', 'survey', 'other'] as const;
export type WhatsAppFormPurpose = typeof WHATSAPP_FORM_PURPOSES[number];

export const WHATSAPP_FORM_STATUSES = ['draft', 'published', 'deprecated'] as const;
export type WhatsAppFormStatus = typeof WHATSAPP_FORM_STATUSES[number];

export const WHATSAPP_FORM_FIELD_LABELS: Record<WhatsAppFormFieldKind, string> = {
  text: 'Short text',
  textarea: 'Long text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  dropdown: 'Pick one',
};

export const WHATSAPP_FORM_PURPOSE_LABELS: Record<WhatsAppFormPurpose, string> = {
  order: 'Order request',
  lead: 'Lead capture',
  booking: 'Booking request',
  support: 'Support request',
  survey: 'Survey',
  other: 'Other',
};

const META_CATEGORY: Record<WhatsAppFormPurpose, string> = {
  order: 'OTHER',
  lead: 'LEAD_GENERATION',
  booking: 'APPOINTMENT_BOOKING',
  support: 'CUSTOMER_SUPPORT',
  survey: 'SURVEY',
  other: 'OTHER',
};

export function metaFlowCategory(purpose: WhatsAppFormPurpose): string {
  return META_CATEGORY[purpose] ?? 'OTHER';
}

export interface WhatsAppFormField {
  key: string;
  label: string;
  kind: WhatsAppFormFieldKind;
  required: boolean;
  options?: string[];
  helper?: string;
}

export const WHATSAPP_FORM_LIMITS = {
  fields: 20,
  label: 20,
  dateLabel: 40,
  helper: 80,
  option: 30,
  options: 50,
  title: 30,
  cta: 20,
  submit: 30,
} as const;

export const WHATSAPP_FORM_SCREEN = 'FORM';
export const WHATSAPP_FLOW_JSON_VERSION = '6.0';

/** A field key Meta accepts: lowercase, starts with a letter, unique within the form. */
export function fieldKeyFrom(label: string, taken: ReadonlySet<string>): string {
  const base = label.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  const stem = /^[a-z]/.test(base) ? base : `field_${base}`.replace(/_+$/, '');
  let key = stem || 'field';
  for (let n = 2; taken.has(key); n++) key = `${stem || 'field'}_${n}`;
  return key;
}

/** Every reason Meta would refuse this form, in words an operator can act on. Empty = buildable. */
export function validateWhatsAppForm(form: { title: string; fields: WhatsAppFormField[] }): string[] {
  const L = WHATSAPP_FORM_LIMITS;
  const errors: string[] = [];
  if (!form.title.trim()) errors.push('The form needs a title.');
  if (form.title.length > L.title) errors.push(`The title is longer than ${L.title} characters.`);
  if (!form.fields.length) errors.push('Add at least one field.');
  if (form.fields.length > L.fields) errors.push(`A form holds at most ${L.fields} fields.`);
  const keys = new Set<string>();
  form.fields.forEach((f, i) => {
    const name = f.label.trim() || `Field ${i + 1}`;
    if (!f.label.trim()) errors.push(`Field ${i + 1} has no label.`);
    const max = f.kind === 'date' ? L.dateLabel : L.label;
    if (f.label.length > max) errors.push(`"${name}" is longer than ${max} characters — WhatsApp cuts labels there.`);
    if (!/^[a-z][a-z0-9_]{0,59}$/.test(f.key)) errors.push(`"${name}" has an invalid key.`);
    if (keys.has(f.key)) errors.push(`Two fields share the key "${f.key}".`);
    keys.add(f.key);
    if (!WHATSAPP_FORM_FIELD_KINDS.includes(f.kind)) errors.push(`"${name}" has an unknown type.`);
    if ((f.helper ?? '').length > L.helper) errors.push(`The hint on "${name}" is longer than ${L.helper} characters.`);
    if (f.kind === 'dropdown') {
      const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 1) errors.push(`"${name}" needs at least one option.`);
      if (opts.length > L.options) errors.push(`"${name}" has more than ${L.options} options.`);
      if (opts.some((o) => o.length > L.option)) errors.push(`An option of "${name}" is longer than ${L.option} characters.`);
      if (new Set(opts).size !== opts.length) errors.push(`"${name}" lists the same option twice.`);
    }
  });
  return errors;
}

function optionId(index: number): string {
  return `opt_${index + 1}`;
}

function component(f: WhatsAppFormField): Record<string, unknown> {
  const common: Record<string, unknown> = { name: f.key, label: f.label.trim(), required: f.required };
  if (f.helper?.trim()) common['helper-text'] = f.helper.trim();
  switch (f.kind) {
    case 'textarea':
      return { type: 'TextArea', ...common };
    case 'date':
      return { type: 'DatePicker', ...common };
    case 'dropdown':
      return {
        type: 'Dropdown', ...common,
        'data-source': (f.options ?? []).map((o) => o.trim()).filter(Boolean).map((title, i) => ({ id: optionId(i), title })),
      };
    default:
      return { type: 'TextInput', ...common, 'input-type': f.kind };
  }
}

/** The Flow JSON Meta stores for this form: one terminal screen whose footer completes with every field. */
export function buildWhatsAppFlowJson(form: { title: string; fields: WhatsAppFormField[]; submitLabel?: string }): Record<string, unknown> {
  const payload = Object.fromEntries(form.fields.map((f) => [f.key, `\${form.${f.key}}`]));
  return {
    version: WHATSAPP_FLOW_JSON_VERSION,
    screens: [{
      id: WHATSAPP_FORM_SCREEN,
      title: form.title.trim().slice(0, WHATSAPP_FORM_LIMITS.title),
      terminal: true,
      success: true,
      layout: {
        type: 'SingleColumnLayout',
        children: [
          ...form.fields.map(component),
          {
            type: 'Footer',
            label: (form.submitLabel?.trim() || 'Send').slice(0, WHATSAPP_FORM_LIMITS.submit),
            'on-click-action': { name: 'complete', payload },
          },
        ],
      },
    }],
  };
}

/** The flow_token we send, so a submission names its form. Meta caps it at 200 characters. */
export function whatsAppFormToken(zernioFlowId: string, formId: string): string {
  return `${zernioFlowId}:${formId}`;
}

export function formIdFromToken(token: unknown): string | null {
  const m = /^[^:]+:([0-9a-f-]{36})$/i.exec(String(token ?? ''));
  return m ? m[1].toLowerCase() : null;
}

function display(f: WhatsAppFormField | undefined, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (f?.kind === 'dropdown') {
    const m = /^opt_(\d+)$/.exec(String(value));
    const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (m && opts[Number(m[1]) - 1]) return opts[Number(m[1]) - 1];
  }
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** A submission as the message the conversation shows — and the text order intake reads. */
export function renderWhatsAppFormSubmission(
  form: { name: string; fields: WhatsAppFormField[] } | null,
  data: Record<string, unknown>,
): string {
  const entries = Object.entries(data).filter(([k]) => k !== 'flow_token');
  const byKey = new Map((form?.fields ?? []).map((f) => [f.key, f]));
  const ordered = form
    ? [
        ...form.fields.filter((f) => f.key in data).map((f) => [f.key, data[f.key]] as const),
        ...entries.filter(([k]) => !byKey.has(k)),
      ]
    : entries;
  const lines = ordered.map(([k, v]) => `${byKey.get(k)?.label ?? k.replace(/_/g, ' ')}: ${display(byKey.get(k), v)}`);
  return [`📋 ${form?.name ?? 'Form'} — submitted`, ...lines].join('\n');
}
