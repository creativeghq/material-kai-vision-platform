import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Upload, Trash2, Ruler } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PlanCalibrationCanvas } from '@/components/features/plans/PlanCalibrationCanvas';
import { isCalibrated, type PlanGeometry } from '@/utils/planGeometry';
import { projectsService, type ProjectRoom } from '../services/projectsService';

/**
 * Size and scale for one room.
 *
 * Two independent things live here on purpose:
 *   • typed dimensions — exact, and enough on their own for a rectangular room;
 *   • a calibrated plan backdrop — needed when the room isn't a plain rectangle,
 *     and the only trustworthy way to measure an uploaded or AI-generated plan.
 *
 * Either can be filled without the other. Typed dimensions also give the
 * calibration something to be sanity-checked against.
 */

interface RoomGeometryModalProps {
  room: ProjectRoom | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  readOnly?: boolean;
}

export const RoomGeometryModal: React.FC<RoomGeometryModalProps> = ({
  room,
  open,
  onOpenChange,
  onSaved,
  readOnly = false,
}) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [geometry, setGeometry] = useState<PlanGeometry | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!room || !open) return;
    setWidth(room.width_mm != null ? String(room.width_mm) : '');
    setLength(room.length_mm != null ? String(room.length_mm) : '');
    setHeight(room.height_mm != null ? String(room.height_mm) : '');
    setGeometry(projectsService.roomGeometry(room));
    setPlanUrl(projectsService.roomPlanUrl(room));
  }, [room, open]);

  // Typed dimensions are the brief the calibration gets checked against. Only
  // meaningful once both floor dimensions are present.
  const expectedSqm =
    Number(width) > 0 && Number(length) > 0
      ? (Number(width) / 1000) * (Number(length) / 1000)
      : null;

  const parseDim = (v: string): number | null => {
    if (!v.trim()) return null;
    const n = Number(v);
    // The column CHECK rejects <= 0; catch it here so the user sees why.
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  const handleSave = async () => {
    if (!room) return;
    for (const [label, raw] of [['Width', width], ['Length', length], ['Height', height]] as const) {
      if (raw.trim() && parseDim(raw) === null) {
        toast({ title: `${label} must be a positive number of millimetres`, variant: 'destructive' });
        return;
      }
    }
    try {
      setSaving(true);
      await projectsService.updateRoom(room.id, {
        width_mm: parseDim(width),
        length_mm: parseDim(length),
        height_mm: parseDim(height),
      });
      if (geometry) await projectsService.updateRoomGeometry(room.id, geometry);
      toast({ title: 'Room geometry saved' });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File) => {
    if (!room) return;
    try {
      setUploading(true);
      const updated = await projectsService.uploadRoomPlan(room.id, file);
      setPlanUrl(projectsService.roomPlanUrl(updated));
      onSaved();
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleRemovePlan = async () => {
    if (!room || !geometry) return;
    if (!confirm('Remove this floor plan? The scale calibrated against it is dropped too.')) return;
    try {
      const updated = await projectsService.clearRoomPlan(room.id, geometry);
      setGeometry(projectsService.roomGeometry(updated));
      setPlanUrl(null);
      onSaved();
    } catch (_err) {
      toast({ title: 'Failed to remove the plan', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{room?.name ? `${room.name} — size & plan` : 'Room size & plan'}</DialogTitle>
          <DialogDescription>
            Dimensions and a calibrated floor plan. Both feed the MEP plans; either can be left blank.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-sm mb-2 block">Dimensions (mm)</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Width" inputMode="numeric" disabled={readOnly} />
              <Input value={length} onChange={(e) => setLength(e.target.value)} placeholder="Length" inputMode="numeric" disabled={readOnly} />
              <Input value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Height" inputMode="numeric" disabled={readOnly} />
            </div>
            {expectedSqm !== null && (
              <p className="text-xs text-muted-foreground mt-1">
                Floor area {expectedSqm.toFixed(1)} m² — used to sanity-check the plan scale below.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 gap-2">
              <Label className="text-sm">Floor plan</Label>
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
                />
                {!readOnly && (
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {planUrl ? 'Replace' : 'Upload plan'}
                  </Button>
                )}
                {planUrl && !readOnly && (
                  <Button size="sm" variant="ghost" onClick={handleRemovePlan}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>

            {planUrl && geometry ? (
              <PlanCalibrationCanvas
                imageUrl={planUrl}
                geometry={geometry}
                onChange={setGeometry}
                expectedSqm={expectedSqm}
                disabled={readOnly}
              />
            ) : (
              <div className="text-xs text-muted-foreground p-3 border border-dashed rounded flex items-start gap-2">
                <Ruler className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Upload a floor plan to place fixtures against it. An uploaded or AI-generated plan
                  carries no scale of its own, so you'll calibrate it by drawing one line of known length.
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || readOnly}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** One-line summary for the room card — plain words, never a pill. */
export function roomGeometrySummary(room: ProjectRoom): { text: string; calibrated: boolean } {
  const g = projectsService.roomGeometry(room);
  const calibrated = isCalibrated(g);
  const dims = [room.width_mm, room.length_mm].every((v) => v != null)
    ? `${(room.width_mm! / 1000).toFixed(2)} × ${(room.length_mm! / 1000).toFixed(2)} m`
    : null;
  if (dims && calibrated) return { text: `${dims} · plan calibrated`, calibrated };
  if (dims) return { text: dims, calibrated };
  if (calibrated) return { text: 'Plan calibrated', calibrated };
  return { text: 'No size set', calibrated };
}
