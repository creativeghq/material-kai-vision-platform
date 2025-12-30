/**
 * Test Email Dialog
 * Send test emails to verify configuration
 */

import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { emailService } from '@/services/email/emailService';
import { useToast } from '@/hooks/use-toast';

interface TestEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const TestEmailDialog: React.FC<TestEmailDialogProps> = ({ open, onOpenChange }) => {
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    to: '',
    subject: 'Test Email from Material Kai',
    message: 'This is a test email to verify your email configuration is working correctly.',
  });
  const { toast } = useToast();

  const handleSend = async () => {
    if (!formData.to || !formData.subject || !formData.message) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSending(true);

      const result = await emailService.sendEmail({
        to: formData.to,
        subject: formData.subject,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1a1a1a; margin-bottom: 20px;">Test Email</h2>
            <p style="color: #525252; line-height: 1.6; margin-bottom: 20px;">
              ${formData.message}
            </p>
            <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 20px 0;" />
            <p style="color: #8898aa; font-size: 12px; margin: 0;">
              This is an automated test email from Material Kai Vision Platform.
            </p>
          </div>
        `,
        text: formData.message,
        emailType: 'transactional',
        tags: { type: 'test' },
      });

      toast({
        title: 'Email Sent',
        description: `Test email sent successfully. Message ID: ${result.messageId}`,
      });

      onOpenChange(false);
      setFormData({
        to: '',
        subject: 'Test Email from Material Kai',
        message: 'This is a test email to verify your email configuration is working correctly.',
      });
    } catch (error: any) {
      console.error('Error sending test email:', error);

      // Extract detailed error message
      let errorMessage = 'Failed to send test email';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      // Check for common edge function errors
      if (errorMessage.includes('FunctionsRelayError') || errorMessage.includes('FunctionsHttpError')) {
        errorMessage = 'Email service is not configured. Please check AWS SES credentials in Supabase Edge Function settings.';
      }

      toast({
        title: 'Error Sending Test Email',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Send Test Email</DialogTitle>
          <DialogDescription>
            Send a test email to verify your email configuration is working correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="to">To Email Address</Label>
            <Input
              id="to"
              type="email"
              placeholder="recipient@example.com"
              value={formData.to}
              onChange={(e) => setFormData({ ...formData, to: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              placeholder="Email subject"
              value={formData.subject}
              onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <Textarea
              id="message"
              placeholder="Email message"
              rows={5}
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={sending}>
            {sending ? (
              <>Sending...</>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Test Email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TestEmailDialog;

