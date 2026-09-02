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

/**
 * Applications that still represent money the project is waiting on.
 *
 * `certified` is IN this list, which is the part worth stating: a certified application has been
 * agreed and NOT paid, and that gap is exactly what a contractor chases. Treating certified as
 * settled would make the outstanding figure read as zero on a job that is owed everything it has
 * ever claimed.
 *
 * `disputed` is also open — a disagreement is not a settlement, and dropping it would quietly
 * remove the applications most in need of attention.
 */
export const APPLICATION_OPEN_STATUSES: ApplicationStatus[] = [
  'draft', 'submitted', 'certified', 'disputed',
];

export const isApplicationSettled = (s: ApplicationStatus): boolean => s === 'paid';
