/**
 * Priced-schedule value-sets, written ONCE.
 *
 * IMPORT-FREE, like the vocabularies beside it: the service builds a Supabase client at module
 * load, and which status makes a schedule the contract sum is worth testing without a database.
 */

/** `project_schedules_status_check`. */
export type ScheduleStatus = 'draft' | 'issued' | 'accepted' | 'superseded';

export const SCHEDULE_STATUSES: ScheduleStatus[] = ['draft', 'issued', 'accepted', 'superseded'];

/**
 * The status at which a contract schedule becomes the project's contract sum.
 *
 * ONLY `accepted`. `get_project_cvr` filters on exactly that, and this is the mirror: a draft BoQ
 * being priced is not what the job is worth, and a schedule that took over the CVR while somebody
 * was still typing rates would restate the contract sum on every keystroke.
 */
export const isScheduleLive = (s: ScheduleStatus): boolean => s === 'accepted';
