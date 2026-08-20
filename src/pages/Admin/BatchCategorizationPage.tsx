import { useState, useEffect } from 'react';
import { Tags, Play, CheckCircle, XCircle, SkipForward, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { MIVAA_API_URL } from '@/config/mivaa';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

interface CategorizeResult {
  id: string;
  name: string;
  status: 'categorized' | 'failed' | 'skipped';
  material_category?: string;
  zone_intent?: string;
  reason?: string;
}

interface BatchRunResult {
  success: boolean;
  total_found: number;
  categorized: number;
  failed: number;
  skipped: number;
  results: CategorizeResult[];
  message: string;
}

export const BatchCategorizationPage = ({ embedded = false }: { embedded?: boolean }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [uncategorizedCount, setUncategorizedCount] = useState<number | null>(null);
  const [onlyUncategorized, setOnlyUncategorized] = useState(true);
  const [limit, setLimit] = useState(200);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<BatchRunResult | null>(null);
  const [apiUrl, setApiUrl] = useState('');

  useEffect(() => {
    setApiUrl(MIVAA_API_URL);
  }, []);

  // Fetch workspace and uncategorized count
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: wm } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!wm) return;
      setWorkspaceId(wm.workspace_id);

      // Count products missing material_category
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', wm.workspace_id)
        .or('metadata->material_category.is.null,metadata->>material_category.eq.');

      setUncategorizedCount(count ?? 0);
    };
    load();
  }, [user]);

  const runBatch = async () => {
    if (!workspaceId || !apiUrl) {
      toast({ title: 'Not ready', description: 'Workspace or API URL not available', variant: 'destructive' });
      return;
    }
    setRunning(true);
    setLastRun(null);
    try {
      const res = await fetch(`${apiUrl}/api/products/batch-categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          only_uncategorized: onlyUncategorized,
          limit,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const data: BatchRunResult = await res.json();
      setLastRun(data);

      // Refresh uncategorized count
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .or('metadata->material_category.is.null,metadata->>material_category.eq.');
      setUncategorizedCount(count ?? 0);

      toast({
        title: 'Batch Complete',
        description: `${data.categorized} products categorized out of ${data.total_found} found`,
      });
    } catch (err) {
      toast({
        title: 'Batch Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className={embedded ? 'space-y-6' : 'p-3 sm:p-8 space-y-6'}>
      {/* Header — hidden when embedded as a tab (host page supplies the header) */}
      {!embedded && (
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-light flex items-center gap-2">
              <Tags className="h-6 w-6 text-primary" />
              Batch AI Categorization
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Bulk assign material_category and zone_intent to products using Claude Haiku
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="dashboard-card">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">Uncategorized Products</p>
            <p className="text-3xl font-light text-amber-600">
              {uncategorizedCount === null ? '—' : uncategorizedCount}
            </p>
          </CardContent>
        </Card>
        {lastRun && (
          <>
            <Card className="dashboard-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Last Run — Categorized</p>
                <p className="text-3xl font-light text-green-600">{lastRun.categorized}</p>
              </CardContent>
            </Card>
            <Card className="dashboard-card">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground mb-1">Last Run — Failed / Skipped</p>
                <p className="text-3xl font-light text-destructive">
                  {lastRun.failed + lastRun.skipped}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Controls */}
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="font-normal">Run Configuration</CardTitle>
          <CardDescription>Configure and trigger a batch categorization run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Switch
              id="only-uncategorized"
              checked={onlyUncategorized}
              onCheckedChange={setOnlyUncategorized}
            />
            <Label htmlFor="only-uncategorized" className="cursor-pointer">
              Only process products without a category
            </Label>
          </div>

          <div className="flex items-center gap-3">
            <Label className="w-32 shrink-0">Max products</Label>
            <div className="flex gap-2">
              {[50, 100, 200, 500].map((n) => (
                <Button
                  key={n}
                  variant={limit === n ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLimit(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={runBatch}
            disabled={running || !workspaceId}
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Batch Categorization
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {lastRun && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="font-normal">Results</CardTitle>
            <CardDescription>{lastRun.message}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[480px] overflow-y-auto divide-y">
              {lastRun.results.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3 hover:bg-accent/30">
                  {r.status === 'categorized' && <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />}
                  {r.status === 'failed'      && <XCircle     className="h-4 w-4 text-destructive shrink-0" />}
                  {r.status === 'skipped'     && <SkipForward className="h-4 w-4 text-amber-500 shrink-0" />}

                  <span className="flex-1 text-sm truncate">{r.name || r.id}</span>

                  {r.material_category && (
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {r.material_category}
                    </span>
                  )}
                  {r.zone_intent && (
                    <span className="text-xs text-muted-foreground capitalize shrink-0">
                      {r.zone_intent}
                    </span>
                  )}
                  {r.reason && (
                    <span className="text-xs text-muted-foreground truncate max-w-48" title={r.reason}>
                      {r.reason}
                    </span>
                  )}
                  <span className={`text-xs capitalize shrink-0 ${r.status === 'categorized' ? 'text-emerald-600 dark:text-emerald-400' : r.status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
