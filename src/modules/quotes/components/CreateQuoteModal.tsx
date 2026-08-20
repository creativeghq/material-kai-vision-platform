import React, { useEffect, useState } from 'react';
import { Plus, Loader2, Layers } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { quotesService } from '../services/QuotesService';
import { ProjectPickerInline } from '@/modules/projects/components/ProjectPickerInline';
import { CustomerPicker, type QuoteCustomer } from '@/modules/quotes/components/CustomerPicker';
import { TemplatePickerDialog } from '@/components/features/templates/TemplatePickerDialog';
import { entityTemplatesService } from '@/services/entityTemplatesService';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { useAuth } from '@/contexts/AuthContext';

interface CreateQuoteModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (quoteId: string, quoteName: string) => void;
  /** Optional pre-selected project (e.g. when invoked from a project detail page) */
  defaultProjectId?: string | null;
}

export const CreateQuoteModal: React.FC<CreateQuoteModalProps> = ({
  open,
  onClose,
  onSuccess,
  defaultProjectId = null,
}) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [quoteName, setQuoteName] = useState('');
  const [notes, setNotes] = useState('');
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [customer, setCustomer] = useState<QuoteCustomer | null>(null);
  const [processing, setProcessing] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  /**
   * Start from a saved quote shape (#322). The template brings its own line items, so it creates
   * the draft outright rather than filling this form — the project + customer chosen here are
   * carried onto it.
   */
  const createFromTemplate = async (templateId: string) => {
    const workspaceId = getActiveWorkspaceId(user?.id);
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    try {
      setProcessing(true);
      const result = await entityTemplatesService.apply(templateId, {
        workspaceId,
        title: quoteName.trim() || undefined,
        projectId,
        customer: {
          companyId: customer?.type === 'company' ? customer.id : null,
          contactId: customer?.type === 'contact' ? customer.id : null,
        },
      });
      if (result.kind !== 'created') return;
      toast({ title: 'Quote created from template' });
      onSuccess(result.id, quoteName.trim() || 'Quote');
      setQuoteName(''); setNotes(''); setCustomer(null);
      onClose();
    } catch (error) {
      toast({ title: 'Error', description: String((error as Error)?.message ?? error), variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  // When a project is picked and no customer is set yet, inherit the project's client so pricing +
  // email + invoicing all resolve against the right party.
  useEffect(() => {
    if (!projectId || customer) return;
    let cancelled = false;
    void supabase.from('projects').select('client_company_id, client_contact_id').eq('id', projectId).single()
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        const companyId = (data as any).client_company_id as string | null;
        const contactId = (data as any).client_contact_id as string | null;
        if (companyId) {
          const { data: c } = await supabase.from('crm_companies').select('name').eq('id', companyId).maybeSingle();
          if (!cancelled) setCustomer({ type: 'company', id: companyId, label: `${(c as any)?.name ?? 'Customer'} (company)` });
        } else if (contactId) {
          const { data: c } = await supabase.from('crm_contacts').select('name').eq('id', contactId).maybeSingle();
          if (!cancelled) setCustomer({ type: 'contact', id: contactId, label: (c as any)?.name ?? 'Customer' });
        }
      });
    return () => { cancelled = true; };
  }, [projectId, customer]);

  const handleCreate = async () => {
    if (!quoteName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a quote name',
        variant: 'destructive',
      });
      return;
    }

    try {
      setProcessing(true);
      const newQuote = await quotesService.createQuote({
        name: quoteName,
        notes: notes || undefined,
        project_id: projectId,
        customer_company_id: customer?.type === 'company' ? customer.id : null,
        customer_contact_id: customer?.type === 'contact' ? customer.id : null,
      });

      toast({
        title: 'Success',
        description: 'Quote created successfully',
      });

      onSuccess(newQuote.id, quoteName);
      setQuoteName('');
      setNotes('');
      setCustomer(null);
      onClose();
    } catch (error) {
      console.error('Error creating quote:', error);
      toast({
        title: 'Error',
        description: 'Failed to create quote',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Quote</DialogTitle>
          <DialogDescription>
            Create a new quote request. You can add products or a custom request after creation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <Button
            variant="outline"
            className="w-full"
            disabled={processing}
            onClick={() => setTemplatePickerOpen(true)}
          >
            <Layers className="h-4 w-4 mr-2" /> Start from a template
          </Button>

          <div>
            <Label>Quote Name *</Label>
            <Input
              value={quoteName}
              onChange={(e) => setQuoteName(e.target.value)}
              placeholder="e.g., Office Renovation Materials"
              className="mt-1"
              disabled={processing}
            />
          </div>

          <div>
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes about this quote..."
              className="mt-1"
              rows={3}
              disabled={processing}
            />
          </div>

          <ProjectPickerInline
            projectId={projectId}
            onChange={({ project_id }) => setProjectId(project_id)}
            hideRoomPicker
            disabled={processing}
          />

          <CustomerPicker value={customer} onChange={setCustomer} disabled={processing} />
          <p className="-mt-2 text-[11px] text-muted-foreground">Sets customer-level pricing, the email recipient, and the bill-to on invoicing.</p>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              className="flex-1"
              disabled={processing}
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Quote
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Sibling, not a child — nesting two Radix dialogs fights over the focus trap and Esc. */}
    <TemplatePickerDialog
      entityType="quote"
      open={templatePickerOpen}
      onOpenChange={setTemplatePickerOpen}
      onSelect={(tpl) => createFromTemplate(tpl.id)}
    />
    </>
  );
};

