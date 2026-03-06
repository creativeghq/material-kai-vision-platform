import React, { useState } from 'react';
import { Mail, Send, Loader2, CheckSquare, Square, DollarSign } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import type { ServiceItem } from './ProfileTab';

interface HireMeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toUserId: string;
  toUserName: string;
  services?: ServiceItem[];
  /** Pre-select a specific service by id when opening */
  preselectedServiceId?: string;
}

export const HireMeModal: React.FC<HireMeModalProps> = ({
  open,
  onOpenChange,
  toUserId,
  toUserName,
  services = [],
  preselectedServiceId,
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [selectedServices, setSelectedServices] = useState<string[]>(
    preselectedServiceId ? [preselectedServiceId] : []
  );

  // Sync preselectedServiceId when it changes (e.g. clicking different service buttons)
  React.useEffect(() => {
    if (open) {
      setSelectedServices(preselectedServiceId ? [preselectedServiceId] : []);
    }
  }, [open, preselectedServiceId]);

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;

    setLoading(true);
    try {
      const selectedNames = services
        .filter((s) => selectedServices.includes(s.id))
        .map((s) => s.name);

      const { error } = await supabase.from('profile_contact_requests').insert({
        to_user_id: toUserId,
        from_name: form.name.trim(),
        from_email: form.email.trim(),
        message: form.message.trim(),
        services_requested: selectedNames.length > 0 ? selectedNames : null,
      });

      if (error) throw error;

      setSent(true);
      toast({
        title: 'Message sent!',
        description: `Your message has been sent to ${toUserName}.`,
      });
      flowEventService.emit('hire_me_received', {
        to_user_id: toUserId,
        from_name: form.name.trim(),
        from_email: form.email.trim(),
        services_requested: selectedNames,
        sent_at: new Date().toISOString(),
      });
      supabase.from('analytics_events').insert({
        event_type: 'hire_me_submitted',
        user_id: null,
        metadata: { to_user_id: toUserId, services_requested: selectedNames, has_services: selectedNames.length > 0 },
        created_at: new Date().toISOString(),
      }).then(() => {});
    } catch {
      toast({
        title: 'Failed to send',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setSent(false);
      setForm({ name: '', email: '', message: '' });
      setSelectedServices(preselectedServiceId ? [preselectedServiceId] : []);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Contact {toUserName}
          </DialogTitle>
          <DialogDescription>
            Send a message to inquire about their services.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <Send className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">Message sent!</p>
              <p className="text-sm text-muted-foreground mt-1">
                {toUserName} will get back to you at {form.email}.
              </p>
            </div>
            <Button onClick={handleClose} className="mt-2">Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Service selection — only shown when profile has services */}
            {services.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground font-medium">
                  Which service(s) are you interested in?
                </label>
                <div className="space-y-2">
                  {services.map((svc) => {
                    const selected = selectedServices.includes(svc.id);
                    return (
                      <button
                        key={svc.id}
                        type="button"
                        onClick={() => toggleService(svc.id)}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-primary">
                            {selected ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4 text-muted-foreground" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{svc.name}</p>
                            {svc.price && (
                              <Badge variant="secondary" className="mt-1 text-xs gap-1">
                                <DollarSign className="h-2.5 w-2.5" />
                                {svc.price}
                              </Badge>
                            )}
                            {svc.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {svc.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Your Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Your Email</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Message</label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder={`Hi ${toUserName}, I'd like to discuss...`}
                rows={4}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Message
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
