import React, { useState } from 'react';
import { Calendar, Clock } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { toLocalISODate } from '@/utils/datetime';

function formatSlot(slot: string) {
  const [h, m] = slot.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export const BookingModal: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  professionalUserId: string;
  professionalName: string;
  date: Date;
  timeSlot: string;
  services?: { id: string; name: string }[];
  onBooked: () => void;
}> = ({ open, onOpenChange, professionalUserId, professionalName, date, timeSlot, services = [], onBooked }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState(user?.user_metadata?.full_name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [message, setMessage] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedService = services.find((s) => s.id === serviceId);

  const submit = async () => {
    if (!name.trim() || !email.trim()) {
      toast({ title: 'Name and email are required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { data, error } = await supabase.from('appointments').insert({
      professional_user_id: professionalUserId,
      client_user_id: user?.id ?? null,
      client_name: name.trim(),
      client_email: email.trim(),
      client_message: message.trim() || null,
      service_id: serviceId || null,
      service_name: selectedService?.name ?? null,
      appointment_date: toLocalISODate(date),
      appointment_time: timeSlot,
      status: 'pending',
    }).select().single();

    setSaving(false);

    if (error) {
      toast({ title: 'Could not book appointment', description: error.message, variant: 'destructive' });
      return;
    }

    // The professional's notification is delivered by the "Appointment Booked"
    // flow; the event carries the full payload so an admin can pause/edit it.
    flowEventService.emit('appointment_booked', {
      user_id: professionalUserId, // recipient (the professional)
      type: 'appointment_booked',
      title: `New appointment request from ${name.trim()}`,
      body: `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${formatSlot(timeSlot)}${selectedService ? ` · ${selectedService.name}` : ''}`,
      action_url: '/profile?tab=appointments',
      appointment_id: data.id,
      professional_user_id: professionalUserId,
      client_name: name.trim(),
      client_email: email.trim(),
      date: toLocalISODate(date),
      time: timeSlot,
      service_name: selectedService?.name ?? null,
    });

    toast({ title: 'Appointment requested', description: `${professionalName} will confirm your booking.` });
    onBooked();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Book with {professionalName}</DialogTitle>
        </DialogHeader>

        {/* Date/time summary */}
        <div className="flex items-center gap-4 rounded-xl bg-primary/5 border border-primary/10 px-4 py-3 text-sm">
          <span className="flex items-center gap-1.5 text-primary">
            <Calendar className="h-4 w-4" />
            {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
          <span className="flex items-center gap-1.5 text-primary">
            <Clock className="h-4 w-4" />
            {formatSlot(timeSlot)}
          </span>
        </div>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Your name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          {services.length > 0 && (
            <div className="space-y-1.5">
              <Label>Service (optional)</Label>
              <Select value={serviceId || '__none__'} onValueChange={(v) => setServiceId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="— Select a service —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select a service —</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Message (optional)</Label>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={3}
              placeholder="Briefly describe what you'd like to discuss..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button className="flex-1 rounded-full" onClick={submit} disabled={saving}>
              {saving ? 'Booking…' : 'Confirm Booking'}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
