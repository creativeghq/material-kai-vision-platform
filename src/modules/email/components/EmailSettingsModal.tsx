/**
 * Email Settings Modal — legacy entrance point. Wraps the shared
 * `EmailSettingsForm` in a Dialog. The same form is also mounted on
 * `/admin/modules/email/settings` via the module's `settingsPanels` —
 * both consumers share one source of truth.
 */

import React, { useRef } from 'react';
import { Settings, Save, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { EmailSettingsForm, type EmailSettingsFormHandle } from './EmailSettingsForm';

interface EmailSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EmailSettingsModal: React.FC<EmailSettingsModalProps> = ({ open, onOpenChange }) => {
  const formRef = useRef<EmailSettingsFormHandle>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Email Settings
          </DialogTitle>
          <DialogDescription>
            Configure default sender information for outgoing emails
          </DialogDescription>
        </DialogHeader>

        {open && <EmailSettingsForm ref={formRef} onSaved={() => onOpenChange(false)} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            onClick={() => formRef.current?.save()}
            disabled={formRef.current?.isSaving || formRef.current?.isLoading}
          >
            <Save className="mr-2 h-4 w-4" />
            {formRef.current?.isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EmailSettingsModal;
