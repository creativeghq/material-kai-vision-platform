import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { quotesService } from '../services/QuotesService';
import { QuoteDetailPage as QuoteDetailAdminPage } from './QuoteDetailAdminPage';
import { QuoteDetailCustomerPage } from './QuoteDetailCustomerPage';

/** `/quotes/:id`: the seller's page for an admin of the quote's workspace, the customer's for anyone else. */
export const QuoteDetailRoute: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [operator, setOperator] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setOperator(null);
    if (!id) { setOperator(false); return; }
    void quotesService.isOperatorView(id).then((v) => { if (!cancelled) setOperator(v); });
    return () => { cancelled = true; };
  }, [id]);

  if (operator === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }
  return operator ? <QuoteDetailAdminPage /> : <QuoteDetailCustomerPage />;
};

export default QuoteDetailRoute;
