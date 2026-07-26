import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Home, Loader2, Search, ShieldCheck, ShieldAlert, ExternalLink, Package, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { aadeService, type AadeLookupResult } from '../services/aadeService';

// "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" — the separate credentials you create specifically for
// software access to ΑΑΔΕ web services. The app redirects through TAXISnet login.
const TOKEN_SERVICES_APP_URL = 'https://www1.gsis.gr/sgsisapps/tokenservices/';
const EXPLAINER_URL_EN = 'https://www.aade.gr/en/special-iapr-access-codes';
const EXPLAINER_URL_EL = 'https://www.aade.gr/eidikoi-kodikoi-prosbasis-aade';
const FAQ_PDF_URL = 'https://www.aade.gr/sites/default/files/2018-07/eidikoi_kwdikoi_FAQs.pdf';

const MyAadeModulePage: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [afm, setAfm] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AadeLookupResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const runLookup = async () => {
    const clean = afm.replace(/[^0-9]/g, '');
    if (clean.length !== 9) {
      toast({ title: 'Invalid VAT number', description: 'Greek VAT number must be exactly 9 digits.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setResult(null);
    setErrMsg(null);
    const res = await aadeService.lookup({ afm: clean, workspaceId: activeWorkspaceId ?? undefined });
    setLoading(false);
    if ('error' in res && res.error) {
      setErrMsg(res.message || res.error);
    } else if ('ok' in res && res.ok) {
      setResult(res);
    }
  };

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="myAADE — Greek business lookup"
        subtitle="AADE RgWsPublic2 (TAXISnet). Looks up Greek businesses by VAT number and auto-fills the Business profile."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="gap-2" title="Module Settings (API credentials)">
              <Link to="/admin/modules/myaade/settings"><KeyRound className="h-4 w-4" />Keys</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/admin/modules"><Package className="h-4 w-4" />All Modules</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/admin"><Home className="h-4 w-4" />Back to Admin</Link>
            </Button>
          </div>
        }
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {/* Per-workspace credentials live in Profile → Keys */}
        <Card>
          <CardContent className="flex items-start gap-2 p-4 text-sm text-muted-foreground">
            <KeyRound className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Your ΑΑΔΕ Special Access Codes are managed in{' '}
              <Link to="/profile?tab=keys" className="text-primary underline">Profile → Keys</Link>. Set them there, then use the test lookup below.
            </span>
          </CardContent>
        </Card>

        {/* Registration hint */}
        <Card>
          <CardHeader>
            <CardTitle>Don't have credentials yet?</CardTitle>
            <CardDescription>
              AADE requires a separate <strong>Special Access Codes</strong> credential pair — distinct from your regular TAXISnet login — created specifically for software to use on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ol className="list-decimal pl-5 space-y-2">
              <li>
                Open <a href={TOKEN_SERVICES_APP_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                  AADE Special Access Codes portal <ExternalLink className="h-3 w-3" />
                </a> and sign in with your <strong>regular TAXISnet</strong> credentials.
              </li>
              <li>
                Inside the app, create a new username + password pair and authorize it for the <strong>RgWsPublic2</strong> service (business details by VAT number).
              </li>
              <li>
                Paste the new pair into the <strong>credentials card above</strong>. (Optional: also set your own company VAT as the caller VAT so the lookup audit trail names it.)
              </li>
              <li>
                Click <strong>Look up</strong> below with any 9-digit VAT number to confirm the credentials work end-to-end.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground pt-2">
              📖 Background reading:{' '}
              <a href={EXPLAINER_URL_EN} target="_blank" rel="noopener noreferrer" className="text-primary underline">What special access codes are (EN)</a>{' · '}
              <a href={EXPLAINER_URL_EL} target="_blank" rel="noopener noreferrer" className="text-primary underline">Greek version</a>{' · '}
              <a href={FAQ_PDF_URL} target="_blank" rel="noopener noreferrer" className="text-primary underline">Official FAQ (PDF, Greek)</a>
            </p>
            <p className="text-xs text-muted-foreground">
              Heads-up: every successful lookup writes an audit entry into the looked-up VAT number's TAXISnet inbox. This is expected and per AADE policy — we only call the service when a user verifies their <strong>own</strong> business.
            </p>
          </CardContent>
        </Card>

        {/* Connection test */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Search className="h-4 w-4" />Test lookup</CardTitle>
            <CardDescription>
              Live call to AADE. Confirms the credentials work and shows you the data shape. Counts against your monthly TAXISnet quota.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={afm}
                onChange={(e) => setAfm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runLookup()}
                placeholder="9-digit VAT number, e.g. 802349569"
                maxLength={9}
                className="flex-1 font-mono"
              />
              <Button onClick={runLookup} disabled={loading} className="rounded-full">
                {loading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
                Look up
              </Button>
            </div>

            {errMsg && (
              <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{errMsg}</span>
              </div>
            )}

            {result && (
              <div className="p-3 rounded-lg border border-green-500/30 bg-green-500/5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-green-700 dark:text-green-400" />
                  <span className="text-sm font-medium">{result.basic_rec.onomasia ?? '(no name)'}</span>
                  {result.valid_afm ? (
                    <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                  {result.source === 'cache' && (
                    <Badge variant="secondary">cache</Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <KV label="Trade name" value={result.basic_rec.commer_title} />
                  <KV label="Legal form" value={result.basic_rec.legal_status_descr} />
                  <KV label="Tax office" value={result.basic_rec.doy_descr ? `${result.basic_rec.doy_descr} (${result.basic_rec.doy ?? '—'})` : null} />
                  <KV label="Start date" value={result.basic_rec.regist_date} />
                  <KV
                    label="Address"
                    value={result.basic_rec.postal_address
                      ? `${result.basic_rec.postal_address} ${result.basic_rec.postal_address_no ?? ''}, ${result.basic_rec.postal_zip_code ?? ''} ${result.basic_rec.postal_area_description ?? ''}`.replace(/\s+/g, ' ').trim()
                      : null}
                  />
                  <KV label="VAT system" value={result.basic_rec.i_ni_flag_descr} />
                </div>
                {result.activities.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Activities (KAD)</p>
                    <div className="space-y-1">
                      {result.activities.map((act, i) => (
                        <div key={i} className="text-xs flex items-start gap-2">
                          <span className="font-mono shrink-0">{act.code}</span>
                          <span className="text-muted-foreground">·</span>
                          <span className="flex-1">{act.description}</span>
                          {act.kind_description && (
                            <span className="text-[10px] text-muted-foreground capitalize shrink-0">{act.kind_description}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.secret_sources && (
                  <p className="text-[10px] text-muted-foreground pt-1 border-t">
                    Creds resolved from: username={result.secret_sources.username} · password={result.secret_sources.password} · afm_called_by={result.secret_sources.afm_called_by}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const KV: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
  <div>
    <p className="text-muted-foreground">{label}</p>
    <p className="break-words">{value || <span className="text-muted-foreground italic">—</span>}</p>
  </div>
);

export default MyAadeModulePage;
