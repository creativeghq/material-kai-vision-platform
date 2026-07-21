/**
 * Filter definitions for the appointments list.
 *
 * The page had one status `Select` and nothing else, so a professional with a busy calendar
 * could not narrow to a date window, a service, or a returning client.
 */
import { CalendarDays, Users, CalendarCheck } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import type { Appointment } from './AppointmentsPage';

const STATUSES: Array<Appointment['status']> = ['pending', 'confirmed', 'completed', 'cancelled'];

export function buildAppointmentFilters(rows: Appointment[]): FilterGroupDef[] {
  const counts = new Map<string, number>();
  for (const a of rows) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);

  return [
    {
      key: 'general', label: 'General', icon: CalendarCheck,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search client / service…',
          accessor: (a: Appointment) => [a.client_name, a.client_email, a.service_name, a.client_message],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: counts.get(s) ?? 0 })),
          accessor: (a: Appointment) => a.status,
        },
        {
          key: 'service', type: 'multi', label: 'Service',
          options: [{ value: NONE_VALUE, label: 'No service' }, ...optionsFromRows(rows, (a) => a.service_name ?? undefined)],
          accessor: (a: Appointment) => a.service_name ?? undefined,
        },
      ],
    },
    {
      key: 'client', label: 'Client', icon: Users,
      fields: [
        {
          key: 'client_name', type: 'multi', label: 'Client',
          description: 'Bookings are keyed by the name the client typed, not a CRM contact.',
          options: optionsFromRows(rows, (a) => a.client_name),
          accessor: (a: Appointment) => a.client_name,
        },
        {
          key: 'registered', type: 'bool', label: 'Account',
          description: 'Whether the booking came from a signed-in client.',
          trueLabel: 'Registered client', falseLabel: 'Guest booking',
          accessor: (a: Appointment) => !!a.client_user_id,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'appointment_date', type: 'dateRange', label: 'Appointment date', accessor: (a: Appointment) => a.appointment_date },
        { key: 'created_at', type: 'dateRange', label: 'Requested', accessor: (a: Appointment) => a.created_at },
      ],
    },
  ];
}
