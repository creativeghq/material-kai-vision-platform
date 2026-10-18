import React, { useEffect, useState } from 'react';
import { Globe2, Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { userWebsitesService } from '@/services/userWebsitesService';
import { loadVocabulary, SOURCING_MARKETS, type VocabularyTerm } from '@/services/vocabularies';
import { useWebsiteMarket } from './useWebsiteKeywords';

const SOURCE_LABEL: Record<string, string> = {
  website: 'set on this website',
  tracked_keywords: 'from the tracked keywords',
  search_console: 'from Search Console',
  tracked_subject: 'from the AI-visibility subject',
  business_country: 'from the business country',
};

/** The site's search market: every tracker, research run and article reads this one answer. */
export const WebsiteMarketControl: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const { toast } = useToast();
  const { market, loading, reload } = useWebsiteMarket(websiteId);
  const [open, setOpen] = useState(false);
  const [countries, setCountries] = useState<VocabularyTerm[]>([]);
  const [languages, setLanguages] = useState<Map<string, string>>(new Map());
  const [country, setCountry] = useState('');
  const [language, setLanguage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadVocabulary('seo_markets').then(setCountries).catch(() => setCountries([]));
    void loadVocabulary(SOURCING_MARKETS).then((terms) => setLanguages(new Map(terms
      .filter((t) => t.metadata?.iso_code && t.metadata?.language_code)
      .map((t) => [String(t.metadata!.iso_code).toUpperCase(), String(t.metadata!.language_code).toLowerCase()])))).catch(() => undefined);
    setCountry(market?.country_code ?? '');
    setLanguage(market?.language_code ?? '');
  }, [open, market]);

  const save = async (clear = false) => {
    setBusy(true);
    try {
      await userWebsitesService.setMarket(websiteId, clear ? null : country, clear ? null : language.trim().toLowerCase());
      setOpen(false);
      reload();
      toast({ title: clear ? 'Market follows the site data again' : `Market set to ${country} · ${language}` });
    } catch (e) {
      toast({ title: 'Not saved', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const known = !!market?.country_code;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Globe2 className="h-3.5 w-3.5" />
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : known ? (
        <span>
          Search market: <span className="font-medium text-foreground">{market!.country_code} · {market!.language_code}</span>
          {market!.source ? ` (${SOURCE_LABEL[market!.source] ?? market!.source})` : ''}
        </span>
      ) : (
        <span className="text-amber-700 dark:text-amber-300">No search market yet: trackers and research will not run until it is set.</span>
      )}
      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOpen(true)}>{known ? 'Change' : 'Set market'}</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search market</DialogTitle>
            <DialogDescription>The country and language Google results are read in for this site: rank tracking, research and articles all use it.</DialogDescription>
          </DialogHeader>
          <FormGrid>
            <FormField label="Country">
              <Select value={country} onValueChange={(v) => { setCountry(v); setLanguage(languages.get(v) ?? ''); }}>
                <SelectTrigger><SelectValue placeholder="Choose a country" /></SelectTrigger>
                <SelectContent>
                  {countries.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Language (2-letter code)">
              <Input value={language} maxLength={3} onChange={(e) => setLanguage(e.target.value)} placeholder="el" />
            </FormField>
          </FormGrid>
          <DialogFooter>
            {market?.source === 'website' && <Button variant="ghost" disabled={busy} onClick={() => void save(true)}>Use the site data instead</Button>}
            <Button disabled={busy || !/^[A-Z]{2}$/.test(country) || !/^[a-z]{2,3}$/i.test(language.trim())} onClick={() => void save()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
