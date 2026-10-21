import React, { Suspense, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Play } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import type { BuildItem, GuideBuild } from '@/lib/installation/guideBuild';
import type { GuideAppearance, InstallationGuideData } from '@/lib/installation/guideSchema';
import {
  EDGE_BANDING, HOLE_COLOR, WOOD_TINT, hardwareGeometry, hardwareLook, hardwareShape, lookForPart, panelHoles, partNumber, useFinishLooks, useStudioLight, woodTexture,
  type FinishLook,
} from './partModels';

const standingHeight = (s: { x: number; y: number; z: number }) => (s.y <= s.x && s.y <= s.z ? s.z : s.y);

function StudioLight() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useStudioLight(scene, gl, 0.6);
  return null;
}

function PanelModel({ build, guide, item, look }: { build: GuideBuild; guide: InstallationGuideData; item: BuildItem; look: FinishLook | null }) {
  const holes = useMemo(
    () => panelHoles(build, build.items.indexOf(item), (h) => guide.parts[h.partIndex]?.name ?? ''),
    [build, guide.parts, item],
  );
  const wood = useMemo(() => woodTexture(), []);
  const { x, y, z } = item.size;
  const thin = x <= y && x <= z ? 0 : y <= z ? 1 : 2;
  const q = new THREE.Quaternion();
  return (
    <mesh castShadow receiveShadow rotation={thin === 1 ? [Math.PI / 2, 0, 0] : thin === 0 ? [0, Math.PI / 2, 0] : [0, 0, 0]}>
      <boxGeometry args={[x, y, z]} />
      {[0, 1, 2, 3, 4, 5].map((face) => {
        const isFace = Math.floor(face / 2) === thin;
        return (
          <meshStandardMaterial
            key={face}
            attach={`material-${face}`}
            color={look ? (isFace ? look.color : look.base) : isFace ? WOOD_TINT : EDGE_BANDING}
            map={(isFace ? (look ? look.map : wood) : null) ?? undefined}
            roughness={look ? look.roughness : isFace ? 0.6 : 0.8}
            metalness={look ? look.metalness : 0}
          />
        );
      })}
      <Edges threshold={20} color="#b38f5c" />
      {holes.map((h, i) => (
        <mesh key={i} position={h.pos} quaternion={q.clone().setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.normal)} scale={[h.radius, h.radius, 1]}>
          <circleGeometry args={[1, 24]} />
          <meshStandardMaterial color={HOLE_COLOR} roughness={1} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </mesh>
  );
}

function HardwareModel({ name, item, finish }: { name: string; item: BuildItem; finish: FinishLook | null }) {
  const shape = hardwareShape(name);
  const look = finish ? { color: finish.base, metalness: finish.metalness, roughness: finish.roughness } : hardwareLook(shape);
  const geometry = useMemo(() => hardwareGeometry(shape, item.size.x, item.size.y), [shape, item.size.x, item.size.y]);
  return (
    <mesh geometry={geometry} castShadow rotation={[0, 0, Math.PI / 5]}>
      <meshStandardMaterial color={look.color} metalness={look.metalness} roughness={look.roughness} />
    </mesh>
  );
}

/** One part on its own: turn it with a drag, zoom with a pinch or the wheel, read what it is and where it goes. */
export function PartInspector({ build, guide, item, onClose, onPlayStep, appearance = null, photoUrl = null }: {
  appearance?: GuideAppearance | null;
  photoUrl?: string | null;
  build: GuideBuild;
  guide: InstallationGuideData;
  item: BuildItem | null;
  onClose: () => void;
  onPlayStep: (step: number) => void;
}) {
  const part = item ? guide.parts[item.partIndex] : null;
  const looks = useFinishLooks(appearance, photoUrl);
  const look = part ? lookForPart(appearance, looks, part.id) : null;
  const steps = useMemo(() => (part
    ? guide.steps.map((s, i) => ({ i, s, used: s.parts_used.find((u) => u.part_id === part.id) })).filter((r) => r.i > 0 && r.used)
    : []), [guide.steps, part]);
  const holes = useMemo(
    () => (item && item.kind === 'panel' ? panelHoles(build, build.items.indexOf(item), (h) => guide.parts[h.partIndex]?.name ?? '').length : 0),
    [build, guide.parts, item],
  );
  const reach = item ? Math.max(item.size.x, item.size.y, item.size.z) : 1;
  const size = part?.size_cm;
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-3 overflow-y-auto p-3 sm:p-5">
        {item && part && (
          <>
            <DialogHeader className="text-left">
              <DialogTitle className="flex items-center gap-2 font-sans">
                <span className="grid h-7 min-w-7 place-items-center rounded-full bg-foreground px-1.5 text-sm text-background">{partNumber(item.partIndex)}</span>
                {part.name}
              </DialogTitle>
              <DialogDescription>Drag to turn it, pinch or scroll to look closer.</DialogDescription>
            </DialogHeader>
            <div className="h-[min(52dvh,420px)] w-full touch-none overflow-hidden rounded-sm bg-gradient-to-b from-neutral-200 to-neutral-400 dark:from-neutral-700 dark:to-neutral-900">
              <Suspense fallback={null}>
                <Canvas shadows dpr={[1, 2]} camera={{ position: item.kind === 'panel' ? [reach * 0.3, reach * 0.18, reach * 1.25] : [reach * 1.05, reach * 0.8, reach * 1.35], fov: 35, near: reach / 100, far: reach * 40 }}>
                  <StudioLight />
                  <hemisphereLight args={['#fff6e8', '#45403a', 0.8]} />
                  <directionalLight position={[reach * 2, reach * 3, reach * 2]} intensity={2.4} castShadow />
                  <directionalLight position={[-reach * 2, reach, -reach]} intensity={0.7} color="#bcd4ff" />
                  {item.kind === 'panel' ? <PanelModel build={build} guide={guide} item={item} look={look} /> : <HardwareModel name={part.name} item={item} finish={look} />}
                  <ContactShadows position={[0, -(item.kind === 'panel' ? standingHeight(item.size) : Math.min(item.size.x, item.size.y, item.size.z)) / 2 - reach * 0.08, 0]} scale={reach * 3} blur={2.4} opacity={0.45} far={reach * 2} />
                  <OrbitControls makeDefault enableDamping autoRotate autoRotateSpeed={1.2} minDistance={reach * 0.5} maxDistance={reach * 6} />
                </Canvas>
              </Suspense>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-muted-foreground">Part number</dt><dd className="font-mono">{part.code || '—'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">In the box</dt><dd className="tabular-nums">{part.quantity}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Size{size && !part.size_stated ? ' (approx.)' : ''}</dt>
                <dd className="tabular-nums">{size && size.x > 0 ? `${size.x} × ${size.y} × ${size.z} cm` : '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{item.kind === 'panel' ? 'Holes drilled' : 'Kind'}</dt>
                <dd className="capitalize">{item.kind === 'panel' ? holes : part.kind}</dd>
              </div>
            </dl>
            {steps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Used in</p>
                <div className="flex flex-wrap gap-1.5">
                  {steps.map(({ i, s, used }) => (
                    <Button key={i} variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => { onClose(); onPlayStep(i); }}>
                      <Play className="h-3 w-3" />Step {i}{used && used.quantity > 1 ? ` · ${used.quantity}×` : ''}<span className="max-w-[10rem] truncate text-muted-foreground">{s.title}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
