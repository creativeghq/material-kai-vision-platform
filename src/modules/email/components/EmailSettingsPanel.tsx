/**
 * Email Settings — panel surface for `/admin/modules/email/settings`.
 *
 * Mounts the shared EmailSettingsForm with an inline Save button. Same form
 * the legacy EmailSettingsModal uses.
 */
import React from 'react';
import { Save, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { EmailSettingsForm } from './EmailSettingsForm';

interface Props {
  embedded?: boolean;
}

export const EmailSettingsPanel: React.FC<Props> = (_props) => {
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="font-light">Default sender</CardTitle>
        <CardDescription>
          The email address + name shown to recipients of every outgoing email — alerts, digests,
          invitations, transactional confirmations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <EmailSettingsForm
          renderFooter={({ save, saving, loading }) => (
            <div className="flex justify-end pt-2">
              <Button onClick={() => save()} disabled={saving || loading}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" />Save settings</>
                )}
              </Button>
            </div>
          )}
        />
      </CardContent>
    </Card>
  );
};
