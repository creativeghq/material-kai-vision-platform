import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { platformSecretsService, type PlatformSecretView } from '@/services/platformSecretsService';

export type SecretScope = { mode: 'platform' } | { mode: 'module'; moduleSlug: string } | { mode: 'all' };

interface Props {
  scope: SecretScope;
  title?: string;
  description?: string;
  /** Optional render-prop slot under each secret row — used by a module to inject extra controls under its keys. */
  renderExtraRow?: (secret: PlatformSecretView, refresh: () => Promise<void>) => React.ReactNode;
  /** Optional footer slot (e.g. a Test-connection button). Gets the current secret list + a refresh helper. */
  renderFooter?: (secrets: PlatformSecretView[], refresh: () => Promise<void>) => React.ReactNode;
}

const UNCHANGED = '__UNCHANGED__';

export const SecretsManagerCard: React.FC<Props> = ({ scope, title, description, renderExtraRow, renderFooter }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState<PlatformSecretView[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // key -> staged value (UNCHANGED if untouched)
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [savingAll, setSavingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = scope.mode === 'platform'
        ? await platformSecretsService.listPlatform()
        : scope.mode === 'module'
          ? await platformSecretsService.listForModule(scope.moduleSlug)
          : await platformSecretsService.list();
      setSecrets(list);
      const next: Record<string, string> = {};
      for (const s of list) next[s.key] = UNCHANGED;
      setDrafts(next);
    } catch (err) {
      toast({ title: 'Failed to load secrets', description: errMsg(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope.mode, (scope as any).moduleSlug]);

  const dirtyKeys = useMemo(
    () => Object.entries(drafts).filter(([, v]) => v !== UNCHANGED).map(([k]) => k),
    [drafts],
  );

  const handleChange = (key: string, value: string) => {
    setDrafts(d => ({ ...d, [key]: value }));
  };

  const handleClear = (key: string) => {
    setDrafts(d => ({ ...d, [key]: '' })); // empty string => clear value on save
  };

  const handleSaveAll = async () => {
    if (dirtyKeys.length === 0) return;
    setSavingAll(true);
    try {
      const entries = dirtyKeys.map(k => ({ key: k, value: drafts[k] }));
      await platformSecretsService.saveMany(entries, scope.mode === 'module' ? scope.moduleSlug : undefined);
      toast({ title: 'Saved', description: `${dirtyKeys.length} secret${dirtyKeys.length === 1 ? '' : 's'} updated.` });
      await load();
    } catch (err) {
      toast({ title: 'Save failed', description: errMsg(err), variant: 'destructive' });
    } finally {
      setSavingAll(false);
    }
  };

  if (loading) {
    return <div className="py-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> {title ?? 'Secret keys'}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
            <CardDescription className="text-xs mt-1">
              Environment variables take priority. When set, the env value is used at runtime even if a database value exists below.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {secrets.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">No secrets in this scope.</div>
        )}
        {secrets.map(secret => {
          const draft = drafts[secret.key] ?? UNCHANGED;
          const isReveal = !!revealed[secret.key];
          const isDirty = draft !== UNCHANGED;
          return (
            <div key={secret.key} className="space-y-2 pb-4 border-b border-white/5 last:border-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label htmlFor={`secret-${secret.key}`} className="font-mono text-sm">{secret.key}</Label>
                  {secret.description && <p className="text-xs text-muted-foreground mt-0.5">{secret.description}</p>}
                </div>
                <SourceBadge source={secret.effective.source} present={secret.effective.value_present} />
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    id={`secret-${secret.key}`}
                    type={isReveal || !secret.is_sensitive ? 'text' : 'password'}
                    placeholder={
                      secret.effective.source === 'env' ? 'Set via env var — DB value ignored at runtime'
                        : secret.value_present ? (secret.value_masked ?? 'Leave unchanged') : (secret.default_value ?? 'Not configured')
                    }
                    value={draft === UNCHANGED ? '' : draft}
                    onChange={e => handleChange(secret.key, e.target.value)}
                    className={`font-mono pr-9 ${secret.effective.source === 'env' ? 'opacity-60' : ''}`}
                  />
                  {secret.is_sensitive && (
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="absolute right-1 top-1 h-7 w-7 p-0"
                      onClick={() => setRevealed(r => ({ ...r, [secret.key]: !r[secret.key] }))}
                      title={isReveal ? 'Hide' : 'Reveal'}
                    >
                      {isReveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                {secret.value_present && !isDirty && (
                  <Button variant="outline" size="sm" onClick={() => handleClear(secret.key)} className="rounded-full">Clear</Button>
                )}
                {isDirty && (
                  <Button variant="ghost" size="sm" onClick={() => setDrafts(d => ({ ...d, [secret.key]: UNCHANGED }))} className="rounded-full">Reset</Button>
                )}
              </div>

              {secret.modules.length > 0 && (
                <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1">
                  Used by:
                  {secret.modules.map(m => (
                    <Badge key={m} variant="outline" className="text-[10px] uppercase tracking-wide">{m}</Badge>
                  ))}
                </div>
              )}

              {secret.last_verified_at && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {secret.last_verified_status === 'ok'
                    ? <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    : <AlertCircle className="h-3 w-3 text-amber-500" />}
                  Last verified {new Date(secret.last_verified_at).toLocaleString()}
                  {secret.last_verified_error && <span className="text-amber-500 truncate"> — {secret.last_verified_error}</span>}
                </div>
              )}

              {renderExtraRow?.(secret, load)}
            </div>
          );
        })}

        {renderFooter?.(secrets, load)}

        {dirtyKeys.length > 0 && (
          <div className="flex items-center justify-end pt-3 border-t border-white/10">
            <Button onClick={handleSaveAll} disabled={savingAll} className="rounded-full">
              {savingAll
                ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</>
                : <><Save className="h-4 w-4 mr-1" /> Save {dirtyKeys.length} change{dirtyKeys.length === 1 ? '' : 's'}</>}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const SourceBadge: React.FC<{ source: 'env' | 'db' | 'default' | 'missing'; present: boolean }> = ({ source, present }) => {
  if (!present) return <Badge variant="destructive">Missing</Badge>;
  if (source === 'env') return <Badge className="bg-indigo-700 hover:bg-indigo-700 text-white" title="Set via env var — DB value is ignored at runtime">env</Badge>;
  if (source === 'db') return <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white">db</Badge>;
  if (source === 'default') return <Badge variant="outline">default</Badge>;
  return <Badge variant="outline">{source}</Badge>;
};

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}
