/**
 * Turning an assessment destination into a URL.
 *
 * Separate from `assessmentVocabulary.ts` because that file is byte-mirrored to Deno and must
 * stay import-free, and this needs `FINANCE_BASE` — the module that exists precisely because six
 * call sites each computed the finance base themselves and every one of them resolved to the
 * 404 catch-all.
 *
 * Naming a place is linking to it: an action that says "check the unmatched bank lines" without
 * a link is the dead end `appDestinations.ts` exists to close, one layer down.
 */
import { FINANCE_BASE } from '@/modules/finance/routes';
import {
  ASSESSMENT_DESTINATIONS,
  type AssessmentSubject,
} from './assessmentVocabulary';

/**
 * The route an action's `destination` points at, or `null` when there is nothing to link to.
 *
 * Returns null rather than a best-effort URL for an unknown key: a link to a tab the page does
 * not render lands the reader on a blank body, which is worse than the plain text it replaced.
 * `tests/unit/aiAssessment.test.ts` holds every key in `ASSESSMENT_DESTINATIONS` against the page
 * that renders it, so an unknown key here means somebody added one without the guard noticing.
 */
export function assessmentDestinationHref(
  subject: AssessmentSubject,
  subjectId: string,
  destination: string | null | undefined,
): string | null {
  if (!destination) return null;
  if (!ASSESSMENT_DESTINATIONS[subject].includes(destination)) return null;

  switch (subject) {
    case 'project':
      return `/projects/${subjectId}?tab=${destination}`;
    // Finance is workspace-scoped: the subject id IS the workspace, so it never appears in the
    // URL — the page reads the active workspace from the session.
    case 'finance':
      return `${FINANCE_BASE}?tab=${destination}`;
    case 'real_estate':
      return `/properties/${subjectId}?tab=${destination}`;
    default:
      return null;
  }
}

/** Where the subject's own assessment surface lives — used by agent cards to offer "open it". */
export function assessmentHomeHref(subject: AssessmentSubject, subjectId: string): string {
  switch (subject) {
    case 'project': return `/projects/${subjectId}?tab=assessment`;
    case 'finance': return `${FINANCE_BASE}?tab=assessment`;
    case 'real_estate': return `/properties/${subjectId}?tab=assessment`;
    default: return '/';
  }
}
