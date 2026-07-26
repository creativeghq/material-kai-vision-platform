/**
 * CrmRecordActivity — the single activity surface shared by the CRM contact and
 * company records. It bundles the unified timeline (notes / calls / meetings +
 * tracked actions) with the Send-email dialog and email logging, so both records
 * render ONE element. The only differentiator is `people` — who this record can
 * email / add as meeting attendees (a contact = itself; a company = its inbox +
 * attached contacts).
 *
 * Quick-action buttons elsewhere on the page (sidebar / details field) open the
 * composer via the imperative `composeEmail()` handle — render this with
 * `forceMount` on the tab so the ref (and its portalled dialog) stay reachable
 * from any tab.
 */
import React, { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { CrmActivityTimeline, type TimelinePerson } from './CrmActivityTimeline';
import { SendEmailDialog } from './SendEmailDialog';
import { crmActivitiesService, type CrmActivityTarget } from '@/services/crmActivitiesService';

export interface CrmRecordActivityHandle {
  /** Open the email composer. Optionally preselect a specific recipient. */
  composeEmail: (recipient?: { email: string; name: string | null }) => void;
}

interface Props {
  target: CrmActivityTarget;
  workspaceId: string | null;
  /** Who this record can email / meet with. Contact = [self]; company = [inbox] + contacts. */
  people: TimelinePerson[];
  /** Shown in the email dialog header (the party name). */
  recordLabel?: string | null;
  /** Bumped by the page to force a reload after IT logs an activity (company attach, lead change…). */
  refreshKey?: number;
}

export const CrmRecordActivity = forwardRef<CrmRecordActivityHandle, Props>(
  ({ target, workspaceId, people, recordLabel, refreshKey = 0 }, ref) => {
    const emailableRecipients = useMemo(() => people.filter((p) => (p.email ?? '').trim()), [people]);
    const [internalBump, setInternalBump] = useState(0);
    const [emailOpen, setEmailOpen] = useState(false);
    const [emailInitialSelected, setEmailInitialSelected] = useState<string[]>([]);

    const openEmail = (recipient?: { email: string; name: string | null }) => {
      // Default preselect: the given recipient, else the first emailable person
      // (the company inbox is listed first) — never auto-select the whole list.
      const preselect = recipient?.email
        ? [recipient.email]
        : emailableRecipients[0]
          ? [emailableRecipients[0].email!.trim()]
          : [];
      setEmailInitialSelected(preselect);
      setEmailOpen(true);
    };

    useImperativeHandle(ref, () => ({ composeEmail: openEmail }), [emailableRecipients]);

    return (
      <>
        <CrmActivityTimeline
          target={target}
          refreshKey={refreshKey + internalBump}
          people={people}
          canEmail={emailableRecipients.length > 0}
          onComposeEmail={() => openEmail()}
        />
        <SendEmailDialog
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          recipients={emailableRecipients.map((p) => ({ email: p.email!.trim(), name: p.name, kind: p.kind }))}
          initialSelected={emailInitialSelected}
          recipientLabel={recordLabel}
          workspaceId={workspaceId}
          onSent={({ subject, recipients }) => {
            crmActivitiesService
              .log(target, {
                activity_type: 'email_sent',
                title: recipients.length === 1 ? `Email sent to ${recipients[0]}` : `Email sent to ${recipients.length} recipients`,
                description: subject,
                metadata: { recipients },
                workspace_id: workspaceId,
              })
              .then(() => setInternalBump((n) => n + 1));
          }}
        />
      </>
    );
  },
);
CrmRecordActivity.displayName = 'CrmRecordActivity';

export default CrmRecordActivity;
