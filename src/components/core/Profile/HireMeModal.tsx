import React, { useMemo, useState } from 'react';
import { Mail, Send, Loader2, CheckSquare, Square, CreditCard, Building2 } from 'lucide-react';
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
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { formatMoney } from '@/utils/decimal';
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

/**
 * What the server made of the hire. Present only when every picked service carried a price:
 * then a sales order and a draft pre-invoice exist and the visitor can pay straight away.
 * Absent for an enquiry ("on request" services, or nothing ticked) — the professional replies.
 */
interface HireOrder {
  order_id: string;
  invoice_id: string;
  internal_number: string;
  total: number;
  currency: string;
  document_type: string | null;
  pay_url: string;
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
  const [order, setOrder] = useState<HireOrder | null>(null);
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  // A business buyer states who it is up front, so the pre-invoice is born a τιμολόγιο to the
  // company rather than a retail receipt to the person filling the form. Retail is the default.
  const [asBusiness, setAsBusiness] = useState(false);
  const [business, setBusiness] = useState({ company_name: '', vat_number: '' });
  const [selectedServices, setSelectedServices] = useState<string[]>(
    preselectedServiceId ? [preselectedServiceId] : [],
  );

  // Sync preselectedServiceId when it changes (e.g. clicking different service buttons)
  React.useEffect(() => {
    if (open) {
      setSelectedServices(preselectedServiceId ? [preselectedServiceId] : []);
    }
  }, [open, preselectedServiceId]);

  const toggleService = (id: string) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  };

  const picked = useMemo(() => services.filter((s) => selectedServices.includes(s.id)), [services, selectedServices]);
  const allPriced = picked.length > 0 && picked.every((s) => s.list_price != null);
  const currency = picked.find((s) => s.currency)?.currency ?? 'EUR';
  // Displayed net of VAT and said so: the pre-invoice adds the rate the seller has classified
  // each service at, and the pay page shows the gross the buyer actually pays.
  const netTotal = picked.reduce((sum, s) => sum + (s.list_price ?? 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) return;
    if (asBusiness && !business.vat_number.trim()) {
      toast({ title: 'VAT number required', description: 'A business invoice needs the company VAT number.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const selectedNames = picked.map((s) => s.name);

      // Goes through inbox-api, never a direct insert: this modal renders on a PUBLIC profile
      // page, so a client-side write fails for every logged-out visitor — the exact audience the
      // form is for. The function is Turnstile-gated + rate-limited, and it files the enquiry as
      // an ordinary Inbox conversation tagged `Public profile`, which is what gives the
      // recipient a reply that actually reaches this sender. When every picked service is
      // priced it ALSO opens a sales order with a draft pre-invoice and returns the pay link.
      const { data, error } = await supabase.functions.invoke('inbox-api', {
        body: {
          action: 'profile_contact',
          to_user_id: toUserId,
          from_name: form.name.trim(),
          from_email: form.email.trim(),
          message: form.message.trim(),
          services_requested: selectedNames.length > 0 ? selectedNames : null,
          service_ids: picked.length > 0 ? picked.map((s) => s.id) : null,
          ...(asBusiness
            ? { company_name: business.company_name.trim() || null, vat_number: business.vat_number.trim() }
            : {}),
        },
      });
      if (error) throw await edgeError(error);

      setOrder(((data as { order?: HireOrder } | null)?.order) ?? null);
      setSent(true);
      toast({
        title: 'Message sent!',
        description: `Your message has been sent to ${toUserName}.`,
      });

      // The `hire_me_received` flow event is emitted SERVER-SIDE by inbox-api now. Emitting it
      // here too would double-notify the recipient — and an anonymous visitor can't emit it
      // anyway, which is half of why this form never worked logged-out.
      supabase.from('analytics_events').insert({
        event_type: 'hire_me_submitted',
        user_id: null,
        event_data: { to_user_id: toUserId, services_requested: selectedNames, has_services: selectedNames.length > 0, ordered: !!(data as { order?: unknown } | null)?.order },
        created_at: new Date().toISOString(),
      }).then(() => {});
    } catch (err) {
      // Show the real reason (rate limit, bot check, unknown profile) — a blanket
      // "Something went wrong" is what let this form fail silently for logged-out visitors.
      toast({
        title: 'Failed to send',
        description: (err as Error)?.message || 'Something went wrong. Please try again.',
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
      setOrder(null);
      setForm({ name: '', email: '', message: '' });
      setAsBusiness(false);
      setBusiness({ company_name: '', vat_number: '' });
      setSelectedServices(preselectedServiceId ? [preselectedServiceId] : []);
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            Hire {toUserName}
          </DialogTitle>
          <DialogDescription>
            Pick the services you need and send a message. Priced services can be paid right away.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="h-12 w-12 rounded-full bg-success/15 flex items-center justify-center">
              <Send className="h-6 w-6 text-success" />
            </div>
            {order ? (
              <>
                <div>
                  <p className="font-semibold">Order {order.internal_number} is ready to pay</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatMoney(order.total, order.currency)} incl. VAT. {toUserName} has the details in their inbox and can
                    resend this link if you need it.
                  </p>
                </div>
                <Button className="mt-2" onClick={() => { window.location.href = order.pay_url; }}>
                  <CreditCard className="h-4 w-4 mr-2" />Pay {formatMoney(order.total, order.currency)} now
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClose}>Pay later</Button>
              </>
            ) : (
              <>
                <div>
                  <p className="font-semibold">Message sent!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {toUserName} will get back to you at {form.email}.
                  </p>
                </div>
                <Button onClick={handleClose} className="mt-2">Close</Button>
              </>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Service selection — only shown when profile has services */}
            {services.length > 0 && (
              <div className="space-y-2">
                <span id="hireme-services-label" className="block text-xs text-muted-foreground font-medium">
                  Which service(s) are you interested in?
                </span>
                <div role="group" aria-labelledby="hireme-services-label" className="space-y-2">
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
                            <Badge variant="secondary" className="mt-1 text-xs gap-1 tabular-nums">
                              {svc.list_price != null
                                ? `${formatMoney(svc.list_price, svc.currency)}${svc.unit ? ` / ${svc.unit}` : ''} + VAT`
                                : 'Price on request'}
                            </Badge>
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
                {picked.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {allPriced
                      ? <>Selected: <span className="tabular-nums font-medium text-foreground">{formatMoney(netTotal, currency)}</span> + VAT. You will get a pay link once you send.</>
                      : 'At least one selected service is priced on request — this will be sent as an enquiry.'}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="hirememodal-your-name" className="text-xs text-muted-foreground">Your Name</label>
              <Input id="hirememodal-your-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Smith"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="hirememodal-your-email" className="text-xs text-muted-foreground">Your Email</label>
              <Input id="hirememodal-your-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@example.com"
                required
              />
            </div>

            {/* Business buyer: decides whether the document is an invoice or a receipt. */}
            <div className="rounded-lg border border-border p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="hirememodal-business" className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />I am buying as a business
                </label>
                <Switch id="hirememodal-business" checked={asBusiness} onCheckedChange={setAsBusiness} />
              </div>
              {asBusiness && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="hirememodal-company" className="text-xs text-muted-foreground">Company name</label>
                    <Input id="hirememodal-company" value={business.company_name}
                      onChange={(e) => setBusiness({ ...business, company_name: e.target.value })} placeholder="Acme Ltd" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="hirememodal-vat" className="text-xs text-muted-foreground">VAT number *</label>
                    <Input id="hirememodal-vat" value={business.vat_number}
                      onChange={(e) => setBusiness({ ...business, vat_number: e.target.value })} placeholder="EL123456789" />
                  </div>
                  <p className="text-[11px] text-muted-foreground sm:col-span-2">
                    With a VAT number the document is an invoice to the company; without one it is a retail receipt.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="hirememodal-message" className="text-xs text-muted-foreground">Message</label>
              <Textarea id="hirememodal-message"
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
                {allPriced ? 'Send & get pay link' : 'Send Message'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
