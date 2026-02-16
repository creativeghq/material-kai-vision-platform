import React, { useState, useMemo } from 'react';
import {
  Calculator,
  MessageSquare,
  FileText,
  Paintbrush,
  Building2,
  Search,
  Globe,
  BookOpen,
  ArrowDown,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Separator } from '@/components/core/ui/separator';
import {
  ACTION_CATEGORIES,
  ACTION_PRICING,
  getActionsForCategory,
  type ActionCategory,
} from '@/config/creditPricing';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  agent_chat: <MessageSquare className="h-4 w-4" />,
  seo_pipeline: <FileText className="h-4 w-4" />,
  interior_design: <Paintbrush className="h-4 w-4" />,
  b2b_research: <Building2 className="h-4 w-4" />,
  visual_search: <Search className="h-4 w-4" />,
  vr_generation: <Globe className="h-4 w-4" />,
  knowledge_base: <BookOpen className="h-4 w-4" />,
};

interface CreditsCalculatorProps {
  onAddToPurchase: (credits: number) => void;
}

export const CreditsCalculator: React.FC<CreditsCalculatorProps> = ({ onAddToPurchase }) => {
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(ACTION_PRICING.map((a) => [a.id, 0])),
  );

  const updateQuantity = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setQuantities((prev) => ({
      ...prev,
      [id]: isNaN(num) ? 0 : Math.max(0, num),
    }));
  };

  const totalCredits = useMemo(() => {
    return ACTION_PRICING.reduce((sum, action) => {
      return sum + (quantities[action.id] || 0) * action.creditsPerAction;
    }, 0);
  }, [quantities]);

  const estimatedEur = useMemo(() => {
    // At standard rate: 1 credit = €0.01
    return totalCredits * 0.01;
  }, [totalCredits]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const cat of ACTION_CATEGORIES) {
      const actions = getActionsForCategory(cat.id);
      totals[cat.id] = actions.reduce((sum, a) => sum + (quantities[a.id] || 0) * a.creditsPerAction, 0);
    }
    return totals;
  }, [quantities]);

  const resetAll = () => {
    setQuantities(Object.fromEntries(ACTION_PRICING.map((a) => [a.id, 0])));
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5 text-primary" />
          Estimate Your Credits
        </CardTitle>
        <CardDescription>
          Enter the number of actions you plan to use, then add the total to your purchase
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {ACTION_CATEGORIES.map((category, catIndex) => {
          const actions = getActionsForCategory(category.id);
          const catTotal = categoryTotals[category.id] || 0;

          return (
            <div key={category.id}>
              {catIndex > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {CATEGORY_ICONS[category.id]}
                  <h4 className="font-semibold text-sm">{category.label}</h4>
                </div>
                {catTotal > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {Math.ceil(catTotal)} credits
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-2.5"
                  >
                    <Input
                      type="number"
                      min={0}
                      value={quantities[action.id] || ''}
                      onChange={(e) => updateQuantity(action.id, e.target.value)}
                      placeholder="0"
                      className="w-16 h-8 text-center text-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight truncate">{action.label}</p>
                      <p className="text-xs text-muted-foreground">
                        ~{action.creditsPerAction} credits/{action.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Total + Add to Purchase */}
        <div className="rounded-xl bg-muted/50 border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground">Estimated total</p>
              <p className="text-2xl font-bold text-primary">
                {Math.ceil(totalCredits).toLocaleString()} credits
              </p>
              {totalCredits > 0 && (
                <p className="text-xs text-muted-foreground">
                  ~€{estimatedEur.toFixed(2)} at standard rate
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {totalCredits > 0 && (
                <Button variant="ghost" size="sm" onClick={resetAll}>
                  Reset
                </Button>
              )}
              <Button
                onClick={() => onAddToPurchase(Math.ceil(totalCredits))}
                disabled={totalCredits <= 0}
                className="gap-1"
              >
                <ArrowDown className="h-4 w-4" />
                Add to Purchase
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
