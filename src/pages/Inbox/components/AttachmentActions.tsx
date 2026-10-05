import React, { createContext, useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Loader2, MoreHorizontal, ReceiptText, ShoppingCart, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { NewOrderDialog, type CustomerOption } from '@/modules/quotes/components/NewOrderDialog';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { PayViaRevolutDialog } from '@/modules/banking-revolut/components/PayViaRevolutDialog';

export interface AttachmentActionScope { workspaceId: string; customer: CustomerOption | null; subject: string | null }

const Scope = createContext<AttachmentActionScope | null>(null);
export const AttachmentActionsProvider = Scope.Provider;

async function fetchAsFile(href: string, name: string, type: string): Promise<File> {
  const res = await fetch(href);
  if (!res.ok) throw new Error(`The file could not be read (${res.status})`);
  return new File([await res.blob()], name, { type: type || res.headers.get('content-type') || 'application/octet-stream' });
}

/** What can be done with a document someone sent: turn it into an order, book it as a bill, pay it. */
export const AttachmentActionsMenu: React.FC<{
  href?: string | null;
  name: string;
  contentType?: string | null;
  loadFile?: () => Promise<File>;
  className?: string;
}> = ({ href, name, contentType, loadFile, className }) => {
  const scope = useContext(Scope);
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orderOpen, setOrderOpen] = useState(false);
  const [expenseFile, setExpenseFile] = useState<File | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [payBill, setPayBill] = useState<string | null>(null);
  const [revolutBill, setRevolutBill] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!scope) return null;

  const getFile = async () => (loadFile ? loadFile() : href ? fetchAsFile(href, name, contentType ?? '') : null);

  const book = async () => {
    setLoading(true);
    try {
      setExpenseFile(await getFile());
      setExpenseOpen(true);
    } catch (e) {
      toast({ title: 'Could not open the document', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const download = async () => {
    try {
      const file = await getFile();
      if (!file) return;
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      toast({ title: 'Could not download', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const baseName = name.replace(/\.[^.]+$/, '');
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className ?? 'h-6 w-6'} title="Actions for this file" aria-label={`Actions for ${name}`}>
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreHorizontal className="w-3.5 h-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setOrderOpen(true)}><ShoppingCart className="w-3.5 h-3.5 mr-2" />Create an order</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void book(); }}><ReceiptText className="w-3.5 h-3.5 mr-2" />Book as a supplier bill</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { void book(); }}><Wallet className="w-3.5 h-3.5 mr-2" />Pay this invoice</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => { void download(); }}><Download className="w-3.5 h-3.5 mr-2" />Download</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewOrderDialog
        open={orderOpen}
        onOpenChange={setOrderOpen}
        workspaceId={scope.workspaceId}
        initialCustomer={scope.customer}
        initialName={scope.subject ? `${scope.subject} — ${baseName}` : baseName}
        onCreated={(quoteId) => { setOrderOpen(false); navigate(`/quotes/${quoteId}`); }}
      />
      {expenseOpen && (
        <NewExpenseDialog
          workspaceId={scope.workspaceId}
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          prefill={{ description: baseName, receiptFile: expenseFile }}
          onCreated={(result) => {
            setExpenseOpen(false);
            if (result?.billId && !result.paymentId) setPayBill(result.billId);
            else toast({ title: result?.paymentId ? 'Bill booked and marked paid' : 'Bill booked' });
          }}
        />
      )}
      <Dialog open={!!payBill} onOpenChange={(o) => !o && setPayBill(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay This Bill</DialogTitle>
            <DialogDescription>The bill is booked and unpaid. Pay it now from your connected bank, or leave it in Finance → Spend to pay later.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayBill(null)}>Pay later</Button>
            <Button onClick={() => { setRevolutBill(payBill); setPayBill(null); }}><Wallet className="w-4 h-4 mr-1.5" />Pay via Revolut</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {revolutBill && <PayViaRevolutDialog workspaceId={scope.workspaceId} billId={revolutBill} onClose={() => setRevolutBill(null)} />}
    </>
  );
};
