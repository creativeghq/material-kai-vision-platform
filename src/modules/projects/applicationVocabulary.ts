/**
 * Application-for-payment value-sets, written ONCE.
 *
 * IMPORT-FREE, like the vocabularies beside it: `applicationsService` builds a Supabase client at
 * module load, and which statuses mean "still owed" is a decision worth testing without a database.
 */

/** `project_applications_status_check`. */
export type ApplicationStatus = 'draft' | 'submitted' | 'certified' | 'paid' | 'disputed';

export const APPLICATION_STATUSES: ApplicationStatus[] = [
  'draft', 'submitted', 'certified', 'paid', 'disputed',
];

/** Applications that still represent money the project is waiting on. */
export const APPLICATION_OPEN_STATUSES: ApplicationStatus[] = [
  'draft', 'submitted', 'certified', 'disputed',
];

export const isApplicationSettled = (s: ApplicationStatus): boolean => s === 'paid';
