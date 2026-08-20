import React, { useEffect, useState, useCallback } from 'react';
import { MIVAA_API_URL } from '@/config/mivaa';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

/**
 * ImageEmbeddingsInspector — admin diagnostic panel for the 6 image
 * embedding collections on a single image (visual SLIG + understanding +
 * 4 aspect collections post-2026-05-04).
 *
 * Reads from MIVAA `/api/admin/images/{id}/embeddings-status` (the read
 * side of the v2 aspect-embeddings rollout) and surfaces:
 *   - VisionAnalysis JSON + parse status
 *   - Per-aspect: model, schema_version, presence flag, the EXACT
 *     source text the aspect was Voyage-embedded from
 *   - SLIG visual + understanding embedding presence
 *   - Per-aspect "Rebuild" buttons that POST to
 *     /api/admin/images/{id}/rerun-aspect-embeddings
 *
 * The source-text panel is the killer feature — when an image returns
 * wrong matches in search, an admin opens this and IMMEDIATELY sees
 * whether the input string Voyage embedded was right (e.g. color="warm
 * white, grey veining" for a marble image) or wrong (color=[]). They
 * then either rerun aspect embeddings (cheap, ~$0.0001) or rerun the
 * full vision_analysis pass (Opus, more expensive, repopulates VA
 * before re-embedding everything).
 */

interface AspectState {
  present: boolean;
  model: string | null;
  schema_version: number | null;
  is_v2: boolean;
  stale: boolean;
  source_text: string | null;
  storage: string;
}

interface NonAspectState {
  present: boolean;
  model: string | null;
  schema_version?: number | null;
  dimension: number;
  storage: string;
}

interface EmbeddingsStatus {
  image_id: string;
  image_url: string | null;
  current_schema_version: number;
  vision_analysis: {
    present: boolean;
    parse_error: string | null;
    data: Record<string, any> | null;
  };
  embeddings: {
    slig_visual: NonAspectState;
    understanding: NonAspectState;
    color: AspectState;
    texture: AspectState;
    style: AspectState;
    material: AspectState;
  };
  stale_aspects: string[];
}

interface ImageEmbeddingsInspectorProps {
  imageId: string;
  /** Called after a rebuild completes so the parent can refresh anything stale (e.g. row badges). */
  onRebuilt?: () => void;
}

const ASPECTS: Array<keyof EmbeddingsStatus['embeddings']> = ['color', 'texture', 'style', 'material'];

export const ImageEmbeddingsInspector: React.FC<ImageEmbeddingsInspectorProps> = ({
  imageId,
  onRebuilt,
}) => {
  const [status, setStatus] = useState<EmbeddingsStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [rebuildingAspect, setRebuildingAspect] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(
        `${MIVAA_API_URL}/api/admin/images/${imageId}/embeddings-status`,
        { headers },
      );
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      setStatus(await res.json());
    } catch (e: any) {
      toast({
        title: 'Failed to load embeddings status',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [imageId, toast]);

  useEffect(() => {
    if (imageId) void fetchStatus();
  }, [imageId, fetchStatus]);

  const rebuildAspects = async (aspects: string[], reason: string) => {
    setRebuildingAspect(aspects.join(','));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(
        `${MIVAA_API_URL}/api/admin/images/${imageId}/rerun-aspect-embeddings`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ aspects, reason }),
        },
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail?.error || detail?.detail || `HTTP ${res.status}`);
      }
      const result = await res.json();
      toast({
        title: 'Rebuild complete',
        description: `Embedded: ${(result.aspects_embedded ?? []).join(', ') || 'none'}. Skipped (empty source): ${(result.aspects_skipped_empty_text ?? []).join(', ') || 'none'}.`,
      });
      await fetchStatus();
      onRebuilt?.();
    } catch (e: any) {
      toast({
        title: 'Rebuild failed',
        description: e?.message ?? 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRebuildingAspect(null);
    }
  };

  if (isLoading && !status) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No embeddings status available.
      </div>
    );
  }

  const va = status.vision_analysis;

  return (
    <div className="space-y-4">
      {/* Vision Analysis status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Vision Analysis
            {va.present ? (
              <Badge variant="default" className="text-xs">Present</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">Missing</Badge>
            )}
            {va.parse_error && (
              <Badge variant="outline" className="text-xs text-amber-700 border-amber-500">
                Parse error
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {va.parse_error && (
            <div className="p-2 rounded bg-amber-50 text-amber-900 border border-amber-200">
              {va.parse_error}
            </div>
          )}
          {va.data && (
            <div className="grid grid-cols-2 gap-2">
              {va.data.material_type && (
                <Field label="Material type" value={va.data.material_type} />
              )}
              {va.data.category && <Field label="Category" value={va.data.category} />}
              {va.data.subcategory && <Field label="Subcategory" value={va.data.subcategory} />}
              {va.data.finish && <Field label="Finish" value={va.data.finish} />}
              {va.data.surface_pattern && (
                <Field label="Pattern" value={va.data.surface_pattern} />
              )}
              {va.data.style && <Field label="Style" value={va.data.style} />}
              {Array.isArray(va.data.colors) && va.data.colors.length > 0 && (
                <Field label="Colors" value={va.data.colors.join(', ')} />
              )}
              {Array.isArray(va.data.textures) && va.data.textures.length > 0 && (
                <Field label="Textures" value={va.data.textures.join(', ')} />
              )}
              {Array.isArray(va.data.applications) && va.data.applications.length > 0 && (
                <Field label="Applications" value={va.data.applications.join(', ')} />
              )}
              {va.data.confidence != null && (
                <Field
                  label="Confidence"
                  value={`${(Number(va.data.confidence) * 100).toFixed(1)}%`}
                />
              )}
            </div>
          )}
          {!va.present && (
            <div className="text-muted-foreground">
              No vision_analysis cached. Run{' '}
              <code>/admin/understanding-embeddings/backfill</code> with this image_id
              first to repopulate VA before rebuilding aspects.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Non-aspect embeddings — visual SLIG + understanding */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Primary Embeddings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <NonAspectRow
            name="Visual (SLIG SigLIP2)"
            state={status.embeddings.slig_visual}
          />
          <NonAspectRow
            name="Understanding (Voyage)"
            state={status.embeddings.understanding}
          />
        </CardContent>
      </Card>

      {/* Aspect embeddings — color/texture/style/material */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            Aspect embeddings
            {status.stale_aspects.length > 0 && (
              <Badge variant="outline" className="ml-2 text-amber-700 border-amber-500 text-xs">
                {status.stale_aspects.length} stale
              </Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => rebuildAspects(['color', 'texture', 'style', 'material'], 'admin manual rebuild — all aspects')}
            disabled={rebuildingAspect !== null || !va.present}
          >
            {rebuildingAspect === 'color,texture,style,material' ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Rebuild all
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {ASPECTS.map((aspect) => (
            <AspectRow
              key={aspect}
              aspect={aspect}
              state={status.embeddings[aspect] as AspectState}
              currentSchemaVersion={status.current_schema_version}
              isRebuilding={rebuildingAspect === aspect}
              disabled={rebuildingAspect !== null || !va.present}
              onRebuild={() => rebuildAspects([aspect], `admin manual rebuild — ${aspect}`)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-muted-foreground">{label}</div>
    <div className="font-medium break-words">{value}</div>
  </div>
);

const NonAspectRow: React.FC<{ name: string; state: NonAspectState }> = ({ name, state }) => (
  <div className="flex items-center justify-between border-b last:border-0 pb-2 last:pb-0">
    <div className="flex items-center gap-2">
      {state.present ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{name}</span>
    </div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{state.dimension}D</span>
      {state.model && <Badge variant="outline" className="text-xs">{state.model}</Badge>}
      {state.schema_version != null && <span>schema v{state.schema_version}</span>}
    </div>
  </div>
);

const AspectRow: React.FC<{
  aspect: string;
  state: AspectState;
  currentSchemaVersion: number;
  isRebuilding: boolean;
  disabled: boolean;
  onRebuild: () => void;
}> = ({ aspect, state, isRebuilding, disabled, onRebuild }) => {
  const statusIcon = !state.present
    ? <XCircle className="h-4 w-4 text-muted-foreground" aria-label="missing" />
    : state.stale
      ? <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="stale" />
      : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="ok" />;

  return (
    <div className="space-y-2 border-b last:border-0 pb-3 last:pb-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {statusIcon}
          <span className="text-sm font-medium capitalize">{aspect}</span>
          {state.is_v2 && (
            <Badge variant="default" className="text-xs">v2</Badge>
          )}
          {state.present && !state.is_v2 && (
            <Badge variant="outline" className="text-xs text-amber-700 border-amber-500">
              legacy
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRebuild}
          disabled={disabled}
          className="h-7 px-2"
        >
          {isRebuilding ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Rebuild
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pl-6">
        <div>
          <span className="block">Model</span>
          <span className="text-foreground font-medium">{state.model ?? '—'}</span>
        </div>
        <div>
          <span className="block">Schema</span>
          <span className="text-foreground font-medium">
            {state.schema_version != null ? `v${state.schema_version}` : '—'}
          </span>
        </div>
        <div>
          <span className="block">Storage</span>
          <span className="text-foreground font-medium font-mono text-[10px] break-all">
            {state.storage}
          </span>
        </div>
      </div>

      {/* The killer feature: source text. Lets operators eyeball whether
          the string Voyage embedded for this aspect is plausible BEFORE
          deciding to rebuild. e.g. color='black' on a clearly white
          marble image → bad VA → rerun vision_analysis. */}
      <div className="pl-6">
        <div className="text-xs text-muted-foreground">Source text (Voyage input)</div>
        <div
          className={`text-xs px-2 py-1 rounded font-mono break-words ${
            state.source_text
              ? 'bg-muted text-foreground'
              : 'bg-amber-50 text-amber-900 border border-amber-200'
          }`}
        >
          {state.source_text ?? '<empty — aspect skipped>'}
        </div>
      </div>
    </div>
  );
};
