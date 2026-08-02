/**
 * Category → TARIC heading rules.
 *
 * This screen is where the human decision for customs classification now lives. Tariff position
 * follows the MATERIAL and the FORM of an article, which the category carries and the product
 * name does not — "AMALFI GRIS 80X80" says nothing, "a ceramic tile" says 6907.
 *
 * So confirmation moved from the product to the rule. Sign off "Tiles → 6907" once and every
 * tile in the catalog inherits it, for free and identically. The alternative — a paid model
 * guess per product, confirmed one product at a time — is both more expensive and less
 * consistent, and a wrong answer has to be corrected in hundreds of places instead of one.
 *
 * Seeded rules arrive UNCONFIRMED on purpose: a heading is a legal position, and the platform
 * proposing one is not the same as a person taking responsibility for it.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, Scale, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { taricService, headingToCode, formatTaricCode, type TaricCategoryRule } from '@/services/taricService';

export const TaricRulesPanel: React.FC = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState<TaricCategoryRule[]>([]);
  const [headings, setHeadings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await taricService.listCategoryRules();
      setRules(list);
      setHeadings(await taricService.headingDescriptions(list.map((r) => r.code_prefix)).catch(() => ({})));
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (rule: TaricCategoryRule) => {
    setBusyId(rule.id);
    try {
      await taricService.setRuleConfirmed(rule.id, !rule.is_confirmed);
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const unconfirmed = rules.filter((r) => !r.is_confirmed).length;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          Customs classification rules
        </CardTitle>
        <CardDescription>
          {loading
            ? 'Loading…'
            : rules.length === 0
              ? 'No rules yet.'
              : unconfirmed > 0
                ? `${rules.length} rules · ${unconfirmed} awaiting your confirmation. Until a rule is confirmed its code is only ever suggested, never applied.`
                : `${rules.length} rules, all confirmed. Products in these categories are classified without a model and without credits.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No category rules are defined.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>When material is</TableHead>
                <TableHead>Heading</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((r) => {
                const descr = headings[headingToCode(r.code_prefix)];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.category_key}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {/* A material qualifier is not decoration: a washbasin is 6910 in ceramic,
                          3922 in plastic and 7324 in steel. */}
                      {r.material_match
                        ? <span className="font-mono text-[11px]">{r.material_match.replace(/\|/g, ' / ')}</span>
                        : <span className="text-xs">any</span>}
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{formatTaricCode(headingToCode(r.code_prefix))}</div>
                      {descr && <div className="text-[11px] text-muted-foreground max-w-md truncate">{descr}</div>}
                      {r.notes && <div className="text-[11px] text-amber-500 max-w-md">{r.notes}</div>}
                    </TableCell>
                    {/* Plain coloured words, never a pill — house style for status columns. */}
                    <TableCell className={r.is_confirmed ? 'text-emerald-500' : 'text-amber-500'}>
                      {r.is_confirmed ? 'Confirmed' : 'Proposed'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={r.is_confirmed ? 'ghost' : 'outline'}
                        className="rounded-full h-7 text-xs"
                        disabled={busyId === r.id}
                        onClick={() => toggle(r)}
                      >
                        {busyId === r.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : r.is_confirmed ? 'Withdraw' : <><Check className="h-3 w-3 mr-1" /> Confirm</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {!loading && unconfirmed > 0 && (
          <p className="flex items-start gap-2 text-xs text-amber-500 px-4 py-3 border-t border-border/50">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            A tariff heading is a legal position. These were read off the published nomenclature,
            but confirming one is you taking responsibility for it — after which every product in
            that category is classified from it automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TaricRulesPanel;
