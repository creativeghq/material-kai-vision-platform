/**
 * Appointments Tools — agent-chat surface over the existing CRM Meetings infra (#275 rail 4).
 *
 * ONE tool, actions:
 *   - list     — upcoming appointments (crm_meetings, meeting_at >= now), workspace-scoped
 *   - schedule — create an appointment with optional email/WhatsApp reminders to yourself
 *
 * Deliberately NOT a net-new booking module: crm_meetings already has the table, the reminder cron
 * (crm-meeting-reminders), the reminder_at trigger, and clean RLS (insert = owner, read = workspace),
 * so a USER-JWT client IS the validated contract — like manage_reviews / manage_finance. Scheduling is
 * a self-calendar entry (reminders fire to the OWNER, not the customer), so it is NOT confirm-gated —
 * same risk class as create_project. Module `crm` + workspace entitlement gated. 0 credits.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'crm';

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The CRM module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
    if (entitled !== true) return { ok: false, error: 'This workspace has not activated CRM. Enable it under Profile → Modules.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Appointments availability check failed: ${(e as Error).message}` };
  }
}

export const createManageAppointmentsTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, subject, meeting_at, location, notes, remind_email, remind_whatsapp, reminder_minutes_before, company_id, contact_id, party_name, days = 30, limit = 20 }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      if (!userId) return JSON.stringify({ success: false, error: 'No signed-in user.' });
      const sb = userClient(jwt);

      if (action === 'list') {
        const nowIso = new Date().toISOString();
        const horizon = new Date(Date.now() + Math.max(1, days) * 86400000).toISOString();
        const { data, error } = await sb.from('crm_meetings')
          .select('id, subject, meeting_at, location, notes, status, remind_email, remind_whatsapp, reminder_minutes_before, target_kind, target_id')
          .eq('workspace_id', workspaceId)
          .gte('meeting_at', nowIso)
          .lte('meeting_at', horizon)
          .neq('status', 'cancelled')
          .order('meeting_at', { ascending: true })
          .limit(Math.min(limit, 50));
        if (error) return JSON.stringify({ success: false, error: error.message });
        const rows = data ?? [];
        onChunk?.({ type: 'appointments_list', workspace_id: workspaceId, days, appointments: rows, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: rows.length, appointments: rows.slice(0, 15) });
      }

      if (action === 'schedule') {
        if (!subject || !meeting_at) return JSON.stringify({ success: false, error: 'schedule needs subject and meeting_at (ISO datetime).' });
        const when = new Date(meeting_at);
        if (isNaN(when.getTime())) return JSON.stringify({ success: false, error: 'meeting_at is not a valid datetime.' });

        // Resolve the CRM party the meeting is WITH, so it isn't orphaned (the page links the row to
        // the contact/company and the list can say who it's with). Company XOR contact.
        let companyId = company_id ?? null;
        let contactId = contact_id ?? null;
        if (companyId && contactId) return JSON.stringify({ success: false, error: 'Give a company OR a contact, not both.' });
        if (!companyId && !contactId && party_name) {
          const { data: co } = await sb.from('crm_companies').select('id').eq('workspace_id', workspaceId).ilike('name', party_name).limit(1).maybeSingle();
          if (co) companyId = (co as any).id;
          else {
            const { data: ct } = await sb.from('crm_contacts').select('id').eq('workspace_id', workspaceId).ilike('name', party_name).limit(1).maybeSingle();
            if (ct) contactId = (ct as any).id;
          }
        }
        const targetKind = companyId ? 'company' : contactId ? 'contact' : null;
        const targetId = companyId ?? contactId ?? null;

        // owner_user_id + workspace_id are set server-side from identity (never trusted from input).
        // status defaults to 'scheduled'; reminder_at is computed by the crm_meetings trigger.
        const { data, error } = await sb.from('crm_meetings').insert({
          owner_user_id: userId,
          workspace_id: workspaceId,
          subject,
          meeting_at: when.toISOString(),
          location: location || null,
          notes: notes || null,
          remind_email: remind_email ?? false,
          remind_whatsapp: remind_whatsapp ?? false,
          reminder_minutes_before: reminder_minutes_before ?? 60,
          target_kind: targetKind,
          target_id: targetId,
        }).select('id, subject, meeting_at, location, target_kind, target_id').maybeSingle();
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'appointment_scheduled', appointment: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, scheduled: true, appointment: data });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_appointments',
      description:
        'Appointments / meetings on your calendar: list upcoming ones, or schedule a new one (subject '
        + '+ meeting_at ISO datetime, optional location/notes, the CRM party it is with '
        + '(company_id/contact_id or party_name to resolve), and email/WhatsApp reminders to yourself). '
        + 'Reminders go to you, not the customer, so scheduling runs directly (no approval needed). 0 credits.',
      schema: z.object({
        action: z.enum(['list', 'schedule']).default('list'),
        subject: z.string().optional().describe('schedule: what the appointment is about.'),
        meeting_at: z.string().optional().describe('schedule: ISO 8601 datetime, e.g. 2026-07-25T15:00:00Z.'),
        location: z.string().optional(),
        notes: z.string().optional(),
        company_id: z.string().uuid().optional().describe('schedule: CRM company the meeting is with (company XOR contact).'),
        contact_id: z.string().uuid().optional().describe('schedule: CRM contact the meeting is with.'),
        party_name: z.string().optional().describe('schedule: name of the customer/company to resolve when you don\'t have the id.'),
        remind_email: z.boolean().optional().describe('schedule: send yourself an email reminder.'),
        remind_whatsapp: z.boolean().optional().describe('schedule: send yourself a WhatsApp reminder.'),
        reminder_minutes_before: z.number().int().min(0).max(20160).optional().describe('schedule: minutes before to remind (default 60).'),
        days: z.number().int().min(1).max(365).default(30).describe('list: look-ahead window in days.'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    },
  );
};
