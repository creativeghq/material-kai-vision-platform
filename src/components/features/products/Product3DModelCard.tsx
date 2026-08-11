/**
 * 3D model management for one product (#321 asset foundation).
 *
 * Upload/replace/remove the product's real 3D assets: glb/gltf drives the web
 * viewer (ARPreviewModal), usdz drives iOS AR Quick Look. Also captures the
 * real-world footprint in meters — AR true-to-scale and the future room
 * planner read it; the free-form `metadata.dimensions` string cannot serve
 * that. The caller gates this on own-workspace product ownership; RLS
 * enforces workspace membership regardless.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Box, Trash2, Upload, Ruler } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  product3dService,
  modelFormatFromFilename,
  type ModelDimensions,
  type Product3DModel,
} from '@/services/product3dService';

interface Product3DModelCardProps {
  productId: string;
  workspaceId: string;
}

function formatBytes(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const Product3DModelCard: React.FC<Product3DModelCardProps> = ({ productId, workspaceId }) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [models, setModels] = useState<Product3DModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [dims, setDims] = useState<{ width: string; height: string; depth: string }>({
    width: '', height: '', depth: '',
  });

  useEffect(() => {
    let live = true;
    product3dService
      .listModels(productId)
      .then((rows) => {
        if (!live) return;
        setModels(rows);
        const withDims = rows.find((m) => m.width_m != null || m.height_m != null || m.depth_m != null);
        if (withDims) {
          setDims({
            width: withDims.width_m != null ? String(withDims.width_m) : '',
            height: withDims.height_m != null ? String(withDims.height_m) : '',
            depth: withDims.depth_m != null ? String(withDims.depth_m) : '',
          });
        }
      })
      .catch(() => { /* card stays empty; upload still works */ });
    return () => { live = false; };
  }, [productId]);

  const parsedDims = (): ModelDimensions => {
    const num = (s: string) => {
      const n = parseFloat(s.replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    return { width_m: num(dims.width), height_m: num(dims.height), depth_m: num(dims.depth) };
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        if (!modelFormatFromFilename(file.name)) {
          toast({
            title: 'Unsupported file',
            description: `${file.name} — use .glb, .gltf or .usdz`,
            variant: 'destructive',
          });
          continue;
        }
        const row = await product3dService.uploadModel(workspaceId, productId, file, parsedDims());
        setModels((prev) => [...prev.filter((m) => m.format !== row.format), row]);
        toast({ title: 'Model uploaded', description: `${file.name} (${row.format})` });
      }
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (model: Product3DModel) => {
    try {
      await product3dService.deleteModel(model);
      setModels((prev) => prev.filter((m) => m.id !== model.id));
      toast({ title: 'Model removed' });
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleSaveDims = async () => {
    try {
      await product3dService.updateDimensions(productId, parsedDims());
      toast({ title: 'Dimensions saved' });
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Box className="h-4 w-4" />
            3D Model
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1">
            glb/gltf powers the 3D viewer; usdz powers AR on iPhone. Uploading a
            format again replaces it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* The planner draws this product's MEASURED footprint, so the way in belongs where the
              measurement is. Offered only once a model exists: without one the planner falls back
              to a 60 × 60 cm placeholder, and inviting someone to "place it to scale" at a size
              nobody measured is the opposite of what the feature promises. */}
          {models.length > 0 && (
            <Button asChild variant="outline" size="sm" className="rounded-full text-xs">
              <Link to={`/room-planner?product=${productId}`}>
                <Ruler className="mr-1.5 h-3.5 w-3.5" />
                Place in a room
              </Link>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {busy ? 'Uploading…' : 'Upload model'}
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf,.usdz"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {models.length > 0 && (
        <div className="space-y-2">
          {models.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium uppercase">{m.format}</span>
                {formatBytes(m.file_size_bytes) && (
                  <span className="text-muted-foreground">{formatBytes(m.file_size_bytes)}</span>
                )}
                {m.status === 'ready' && <span className="text-green-600">ready</span>}
                {m.status === 'processing' && <span className="text-amber-600">processing</span>}
                {m.status === 'failed' && <span className="text-destructive">failed</span>}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-full"
                onClick={() => handleDelete(m)}
                title="Remove model"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Real-world size (meters) — drives true-to-scale AR
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={dims.width}
            onChange={(e) => setDims((d) => ({ ...d, width: e.target.value }))}
            placeholder="Width"
            inputMode="decimal"
            className="h-8 w-24 text-xs"
          />
          <Input
            value={dims.height}
            onChange={(e) => setDims((d) => ({ ...d, height: e.target.value }))}
            placeholder="Height"
            inputMode="decimal"
            className="h-8 w-24 text-xs"
          />
          <Input
            value={dims.depth}
            onChange={(e) => setDims((d) => ({ ...d, depth: e.target.value }))}
            placeholder="Depth"
            inputMode="decimal"
            className="h-8 w-24 text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-full text-xs"
            disabled={models.length === 0}
            onClick={handleSaveDims}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
};
